import { prisma } from "@/lib/prisma";

export interface DiagnosisResult {
  riskId: string;
  rootCause: string;
  confidenceScore: number;
  explanation: string;
  recommendedNextStep: string;
}

interface RootCauseMapping {
  pattern: (errorCode: string | null, errorReason: string | null, errorSource: string | null, errorStep: string | null) => boolean;
  rootCause: string;
  confidence: number;
  explanation: string;
  recommendedNextStep: string;
}

const PAYMENT_ROOT_CAUSES: RootCauseMapping[] = [
  {
    pattern: (_ec, reason, _es, _est) => reason === "expired_card",
    rootCause: "expired_card",
    confidence: 0.95,
    explanation: "Customer's card has expired and needs to be updated.",
    recommendedNextStep: "send_payment_link",
  },
  {
    pattern: (_ec, reason, _es, _est) => reason === "insufficient_funds",
    rootCause: "insufficient_funds",
    confidence: 0.9,
    explanation: "Customer has insufficient funds. Retry in 24-48 hours.",
    recommendedNextStep: "schedule_retry",
  },
  {
    pattern: (_ec, reason, _es, _est) => reason === "card_declined",
    rootCause: "card_declined",
    confidence: 0.8,
    explanation: "Card was declined by the issuing bank. May be transient.",
    recommendedNextStep: "retry_payment",
  },
  {
    pattern: (_ec, reason, _es, _est) => reason === "network_timeout",
    rootCause: "network_timeout",
    confidence: 0.85,
    explanation: "Payment timed out due to network issues. Likely transient.",
    recommendedNextStep: "retry_payment",
  },
  {
    pattern: (_ec, reason, _es, _est) => reason === "incorrect_otp" || reason === "authentication_failed",
    rootCause: "authentication_failure",
    confidence: 0.85,
    explanation: "Customer failed authentication (OTP/3DS). Needs retry with correct credentials.",
    recommendedNextStep: "send_payment_link",
  },
  {
    pattern: (_ec, reason, _es, est) => est === "payer_authentication" && reason === "authentication_failed",
    rootCause: "3ds_authentication_failure",
    confidence: 0.85,
    explanation: "3D Secure authentication failed. Customer may need to retry.",
    recommendedNextStep: "send_payment_link",
  },
  {
    pattern: (_ec, _reason, _es, _est) => true,
    rootCause: "payment_processing_error",
    confidence: 0.5,
    explanation: "Payment failed due to a general processing error.",
    recommendedNextStep: "send_payment_link",
  },
];

function diagnosePaymentFailure(
  errorCode: string | null,
  errorReason: string | null,
  errorSource: string | null,
  errorStep: string | null
): Omit<DiagnosisResult, "riskId"> {
  for (const mapping of PAYMENT_ROOT_CAUSES) {
    if (mapping.pattern(errorCode, errorReason, errorSource, errorStep)) {
      return {
        rootCause: mapping.rootCause,
        confidenceScore: mapping.confidence,
        explanation: mapping.explanation,
        recommendedNextStep: mapping.recommendedNextStep,
      };
    }
  }

  return {
    rootCause: "unknown",
    confidenceScore: 0.3,
    explanation: "Could not determine root cause from available error data.",
    recommendedNextStep: "escalate_human",
  };
}

function diagnoseAbandonedCheckout(): Omit<DiagnosisResult, "riskId"> {
  return {
    rootCause: "abandoned_checkout",
    confidenceScore: 0.7,
    explanation: "Customer started checkout but did not complete payment within 30 minutes.",
    recommendedNextStep: "send_payment_link",
  };
}

function diagnoseFailedSubscription(
  subStatus: string,
  paidCount: number,
  remainingCount: number
): Omit<DiagnosisResult, "riskId"> {
  if (subStatus === "activation_failed") {
    return {
      rootCause: "subscription_mandate_failed",
      confidenceScore: 0.85,
      explanation: "Subscription mandate could not be activated. Customer needs to re-authorize.",
      recommendedNextStep: "send_payment_link",
    };
  }

  if (subStatus === "halted") {
    return {
      rootCause: "subscription_halted",
      confidenceScore: 0.8,
      explanation: "Subscription has been halted, possibly due to payment failures.",
      recommendedNextStep: "schedule_retry",
    };
  }

  if (paidCount === 0) {
    return {
      rootCause: "subscription_first_payment_failed",
      confidenceScore: 0.75,
      explanation: "First subscription payment failed. Customer never completed onboarding.",
      recommendedNextStep: "send_payment_link",
    };
  }

  return {
    rootCause: "subscription_recurring_failure",
    confidenceScore: 0.7,
    explanation: `Subscription failed after ${paidCount} successful payments. ${remainingCount} cycles remaining.`,
    recommendedNextStep: "schedule_retry",
  };
}

function diagnoseOverdueReceivable(orderAge: number): Omit<DiagnosisResult, "riskId"> {
  if (orderAge > 72 * 60 * 60 * 1000) {
    return {
      rootCause: "overdue_receivable_stale",
      confidenceScore: 0.9,
      explanation: "Order is over 3 days old with no payment. Likely abandoned or forgotten.",
      recommendedNextStep: "escalate_human",
    };
  }

  return {
    rootCause: "overdue_receivable",
    confidenceScore: 0.65,
    explanation: "Order is overdue with no payment captured. May need follow-up.",
    recommendedNextStep: "send_payment_link",
  };
}

export async function diagnoseRisk(riskId: string): Promise<DiagnosisResult> {
  const risk = await prisma.revenueAtRisk.findUnique({
    where: { id: riskId },
    include: {
      payment: true,
      subscription: { include: { plan: true } },
      order: true,
    },
  });

  if (!risk) {
    throw new Error(`RevenueAtRisk ${riskId} not found`);
  }

  await prisma.revenueAtRisk.update({
    where: { id: riskId },
    data: { status: "diagnosing" },
  });

  let diagnosis: Omit<DiagnosisResult, "riskId">;

  switch (risk.type) {
    case "failed_payment": {
      if (!risk.payment) {
        diagnosis = {
          rootCause: "payment_record_missing",
          confidenceScore: 0.3,
          explanation: "Payment record not found for this risk item.",
          recommendedNextStep: "escalate_human",
        };
      } else {
        diagnosis = diagnosePaymentFailure(
          risk.payment.errorCode,
          risk.payment.errorReason,
          risk.payment.errorSource,
          risk.payment.errorStep
        );
      }
      break;
    }

    case "abandoned_checkout":
      diagnosis = diagnoseAbandonedCheckout();
      break;

    case "failed_subscription": {
      if (!risk.subscription) {
        diagnosis = {
          rootCause: "subscription_record_missing",
          confidenceScore: 0.3,
          explanation: "Subscription record not found for this risk item.",
          recommendedNextStep: "escalate_human",
        };
      } else {
        diagnosis = diagnoseFailedSubscription(
          risk.subscription.status,
          risk.subscription.paidCount,
          risk.subscription.remainingCount
        );
      }
      break;
    }

    case "overdue_receivable": {
      if (!risk.order) {
        diagnosis = {
          rootCause: "order_record_missing",
          confidenceScore: 0.3,
          explanation: "Order record not found for this risk item.",
          recommendedNextStep: "escalate_human",
        };
      } else {
        const orderAge = Date.now() - risk.order.createdAt.getTime();
        diagnosis = diagnoseOverdueReceivable(orderAge);
      }
      break;
    }

    default:
      diagnosis = {
        rootCause: "unknown_risk_type",
        confidenceScore: 0.2,
        explanation: `Unknown risk type: ${risk.type}`,
        recommendedNextStep: "escalate_human",
      };
  }

  await prisma.revenueAtRisk.update({
    where: { id: riskId },
    data: {
      rootCause: diagnosis.rootCause,
      confidenceScore: diagnosis.confidenceScore,
      status: "diagnosing",
    },
  });

  await prisma.auditLog.create({
    data: {
      revenueRiskId: riskId,
      action: "diagnose",
      actor: "system",
      details: JSON.stringify({
        rootCause: diagnosis.rootCause,
        confidence: diagnosis.confidenceScore,
        explanation: diagnosis.explanation,
        recommendedNextStep: diagnosis.recommendedNextStep,
      }),
      status: "success",
    },
  });

  return {
    riskId,
    ...diagnosis,
  };
}

export async function diagnoseAll(): Promise<DiagnosisResult[]> {
  const undiagnosed = await prisma.revenueAtRisk.findMany({
    where: {
      status: "detected",
      rootCause: null,
    },
  });

  const results: DiagnosisResult[] = [];

  for (const risk of undiagnosed) {
    const result = await diagnoseRisk(risk.id);
    results.push(result);
  }

  return results;
}
