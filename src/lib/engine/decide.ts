import { prisma } from "@/lib/prisma";
import { runAllGuardrails } from "@/lib/guardrails/rules";
import type { RecoveryStrategy, RecoveryDecision } from "@/lib/types";

interface RootCauseDecision {
  strategy: RecoveryStrategy;
  reasoning: string;
  confidence: number;
  discountPercent: number;
  retryDelay: string | null;
}

const ROOT_CAUSE_DECISIONS: Record<string, (amount: number, failCount: number) => RootCauseDecision> = {
  expired_card: (_amount, _failCount) => ({
    strategy: "send_payment_link",
    reasoning: "Customer has an expired card. Send payment link to prompt card update.",
    confidence: 0.9,
    discountPercent: 0,
    retryDelay: null,
  }),
  insufficient_funds: (_amount, _failCount) => ({
    strategy: "schedule_retry",
    reasoning: "Insufficient funds. Schedule retry in 24-48 hours when funds may be available.",
    confidence: 0.8,
    discountPercent: 0,
    retryDelay: "48h",
  }),
  card_declined: (_amount, failCount) => {
    if (failCount >= 2) {
      return {
        strategy: "escalate_human",
        reasoning: `Card declined ${failCount} times. Escalating to human for manual review.`,
        confidence: 0.6,
        discountPercent: 0,
        retryDelay: null,
      };
    }
    return {
      strategy: "retry_payment",
      reasoning: "Card declined (possibly transient). Retry payment immediately.",
      confidence: 0.7,
      discountPercent: 0,
      retryDelay: null,
    };
  },
  network_timeout: (_amount, _failCount) => ({
    strategy: "retry_payment",
    reasoning: "Network timeout is likely transient. Retry payment immediately.",
    confidence: 0.85,
    discountPercent: 0,
    retryDelay: null,
  }),
  authentication_failure: (_amount, _failCount) => ({
    strategy: "send_payment_link",
    reasoning: "Authentication failed. Send payment link for customer to retry with correct credentials.",
    confidence: 0.8,
    discountPercent: 0,
    retryDelay: null,
  }),
  "3ds_authentication_failure": (_amount, _failCount) => ({
    strategy: "send_payment_link",
    reasoning: "3DS authentication failed. Send payment link for retry.",
    confidence: 0.8,
    discountPercent: 0,
    retryDelay: null,
  }),
  payment_processing_error: (_amount, failCount) => {
    if (failCount >= 2) {
      return {
        strategy: "escalate_human",
        reasoning: `Processing error persisted after ${failCount} attempts. Escalating.`,
        confidence: 0.5,
        discountPercent: 0,
        retryDelay: null,
      };
    }
    return {
      strategy: "send_payment_link",
      reasoning: "General processing error. Send payment link for retry.",
      confidence: 0.6,
      discountPercent: 0,
      retryDelay: null,
    };
  },
  abandoned_checkout: (amount, _failCount) => {
    if (amount > 500000) {
      return {
        strategy: "send_payment_link",
        reasoning: "High-value abandoned checkout (INR 5,000+). Send payment link without discount.",
        confidence: 0.7,
        discountPercent: 0,
        retryDelay: null,
      };
    }
    return {
      strategy: "send_payment_link",
      reasoning: "Checkout abandoned. Send payment link with small discount to incentivize completion.",
      confidence: 0.65,
      discountPercent: 5,
      retryDelay: null,
    };
  },
  subscription_mandate_failed: (_amount, _failCount) => ({
    strategy: "send_payment_link",
    reasoning: "Subscription mandate failed. Send payment link for manual authorization.",
    confidence: 0.8,
    discountPercent: 0,
    retryDelay: null,
  }),
  subscription_halted: (amount, failCount) => ({
    strategy: "schedule_retry",
    reasoning: "Subscription halted. Schedule retry after 24 hours.",
    confidence: 0.7,
    discountPercent: 0,
    retryDelay: "24h",
  }),
  subscription_first_payment_failed: (amount, failCount) => ({
    strategy: "send_payment_link",
    reasoning: "First subscription payment failed. Send payment link to complete onboarding.",
    confidence: 0.7,
    discountPercent: 0,
    retryDelay: null,
  }),
  subscription_recurring_failure: (amount, failCount) => {
    if (failCount >= 2) {
      return {
        strategy: "escalate_human",
        reasoning: `Recurring subscription failure after ${failCount} attempts. Escalating.`,
        confidence: 0.6,
        discountPercent: 0,
        retryDelay: null,
      };
    }
    return {
      strategy: "schedule_retry",
      reasoning: "Recurring subscription failure. Schedule retry in 24 hours.",
      confidence: 0.65,
      discountPercent: 0,
      retryDelay: "24h",
    };
  },
  overdue_receivable: (amount, failCount) => ({
    strategy: "send_payment_link",
    reasoning: "Overdue receivable. Send payment link for follow-up.",
    confidence: 0.6,
    discountPercent: 0,
    retryDelay: null,
  }),
  overdue_receivable_stale: (amount, failCount) => ({
    strategy: "escalate_human",
    reasoning: "Overdue receivable is stale (>3 days). Escalate for manual follow-up.",
    confidence: 0.5,
    discountPercent: 0,
    retryDelay: null,
  }),
};

function selectDecision(
  rootCause: string,
  amount: number,
  failCount: number
): RootCauseDecision {
  const decisionFn = ROOT_CAUSE_DECISIONS[rootCause];

  if (decisionFn) {
    return decisionFn(amount, failCount);
  }

  if (failCount >= 3) {
    return {
      strategy: "escalate_human",
      reasoning: `Unknown root cause "${rootCause}" with ${failCount} failures. Escalating.`,
      confidence: 0.3,
      discountPercent: 0,
      retryDelay: null,
    };
  }

  return {
    strategy: "send_payment_link",
    reasoning: `No specific decision rule for "${rootCause}". Defaulting to payment link.`,
    confidence: 0.4,
    discountPercent: 0,
    retryDelay: null,
  };
}

export async function decideRisk(riskId: string): Promise<RecoveryDecision> {
  const risk = await prisma.revenueAtRisk.findUnique({
    where: { id: riskId },
    include: {
      payment: true,
      subscription: { include: { plan: true } },
      order: true,
      merchant: true,
    },
  });

  if (!risk) {
    throw new Error(`RevenueAtRisk ${riskId} not found`);
  }

  if (!risk.rootCause) {
    throw new Error(`RevenueAtRisk ${riskId} has not been diagnosed yet`);
  }

  const customerId =
    risk.payment?.customerId ??
    risk.subscription?.customerId ??
    risk.order?.customerId;

  if (!customerId) {
    throw new Error(`RevenueAtRisk ${riskId} has no associated customer`);
  }

  const failCount = await prisma.auditLog.count({
    where: {
      revenueRiskId: riskId,
      action: "recover",
      status: "failure",
    },
  });

  const decision = selectDecision(risk.rootCause, risk.amountAtRisk, failCount);

  const guardrailResult = await runAllGuardrails(
    riskId,
    customerId,
    risk.merchantId,
    risk.amountAtRisk
  );

  let finalStrategy = decision.strategy;
  let finalReasoning = decision.reasoning;
  let escalationReason: string | null = null;

  if (!guardrailResult.allowed) {
    finalStrategy = "escalate_human";
    escalationReason = guardrailResult.blockedBy?.reason ?? "Guardrail blocked action";
    finalReasoning = `Guardrail blocked "${decision.strategy}": ${escalationReason}. Escalating to human.`;
  }

  const estimatedRecovery =
    finalStrategy === "no_action"
      ? 0
      : Math.round(risk.amountAtRisk * (1 - decision.discountPercent / 100));

  const recovery = await prisma.recoveryWorkflow.create({
    data: {
      revenueRiskId: riskId,
      strategy: finalStrategy,
      aiDecisionReason: finalReasoning,
      status: "pending",
    },
  });

  await prisma.revenueAtRisk.update({
    where: { id: riskId },
    data: { status: "decided" },
  });

  await prisma.auditLog.create({
    data: {
      revenueRiskId: riskId,
      recoveryId: recovery.id,
      action: "decide",
      actor: "system",
      details: JSON.stringify({
        strategy: finalStrategy,
        reasoning: finalReasoning,
        confidence: decision.confidence,
        estimatedRecovery,
        discountPercent: decision.discountPercent,
        retryDelay: decision.retryDelay,
        escalationReason,
        guardrailBlocked: !guardrailResult.allowed,
      }),
      status: "success",
    },
  });

  return {
    strategy: finalStrategy,
    reasoning: finalReasoning,
    confidence: decision.confidence,
    estimatedRecovery,
    discountPercent: decision.discountPercent,
    retryDelay: decision.retryDelay,
    escalationReason,
  };
}

export async function decideAll(): Promise<RecoveryDecision[]> {
  const undecided = await prisma.revenueAtRisk.findMany({
    where: {
      status: "diagnosing",
      rootCause: { not: null },
    },
  });

  const results: RecoveryDecision[] = [];

  for (const risk of undecided) {
    const result = await decideRisk(risk.id);
    results.push(result);
  }

  return results;
}
