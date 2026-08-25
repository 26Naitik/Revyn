import { prisma } from "@/lib/prisma";
import { DEFAULT_LIMITS, type GuardrailLimit } from "./limits";

export interface GuardrailResult {
  allowed: boolean;
  rule: string;
  reason: string;
}

const limits = DEFAULT_LIMITS;

export async function checkMaxAttemptsPerRisk(
  riskId: string,
  overrides?: Partial<GuardrailLimit>
): Promise<GuardrailResult> {
  const max = overrides?.maxAttemptsPerRisk ?? limits.maxAttemptsPerRisk;
  const risk = await prisma.revenueAtRisk.findUnique({
    where: { id: riskId },
    include: {
      recovery: { select: { attemptCount: true } },
      auditLogs: true,
    },
  });

  if (!risk) {
    return { allowed: false, rule: "risk_not_found", reason: "Risk record not found" };
  }

  // Prefer the authoritative attempt counter persisted on the workflow;
  // fall back to audit-log counting for legacy risks without a workflow.
  const attemptCount =
    risk.recovery?.attemptCount ??
    risk.auditLogs.filter(
      (log) => log.action === "recover" || log.action === "decide"
    ).length;

  if (attemptCount >= max) {
    return {
      allowed: false,
      rule: "max_attempts_per_risk",
      reason: `Risk ${riskId} has ${attemptCount} attempts (max: ${max})`,
    };
  }

  return { allowed: true, rule: "max_attempts_per_risk", reason: "OK" };
}

/** A customer owns risks via any linked payment, subscription or order. */
function customerRiskScope(customerId: string) {
  return {
    OR: [
      { payment: { customerId } },
      { subscription: { customerId } },
      { order: { customerId } },
    ],
  };
}

export async function checkMaxRetriesPerCustomer(
  customerId: string,
  overrides?: Partial<GuardrailLimit>
): Promise<GuardrailResult> {
  const max = overrides?.maxRetriesPerCustomer ?? limits.maxRetriesPerCustomer;

  const retryCount = await prisma.auditLog.count({
    where: {
      action: "recover",
      revenueRisk: customerRiskScope(customerId),
    },
  });

  if (retryCount >= max) {
    return {
      allowed: false,
      rule: "max_retries_per_customer",
      reason: `Customer ${customerId} has ${retryCount} retries (max: ${max})`,
    };
  }

  return { allowed: true, rule: "max_retries_per_customer", reason: "OK" };
}

/**
 * Rate limit: at most N payment links per customer per rolling 7-day window.
 * Counts real execution events from the audit trail.
 */
export async function checkMaxPaymentLinksPerWeek(
  customerId: string,
  overrides?: Partial<GuardrailLimit>
): Promise<GuardrailResult> {
  const max =
    overrides?.maxPaymentLinksPerWeek ?? limits.maxPaymentLinksPerWeek;
  const since = new Date(Date.now() - 7 * 86_400_000);

  const recentLinks = await prisma.auditLog.count({
    where: {
      action: "recover",
      createdAt: { gte: since },
      details: { contains: "payment_link_created" },
      revenueRisk: customerRiskScope(customerId),
    },
  });

  if (recentLinks >= max) {
    return {
      allowed: false,
      rule: "max_payment_links_per_week",
      reason: `Customer ${customerId} received ${recentLinks} payment links in the last 7 days (max: ${max})`,
    };
  }

  return { allowed: true, rule: "max_payment_links_per_week", reason: "OK" };
}

/**
 * Rate limit: at most N discounted decisions per customer per rolling 30-day
 * window. Counts persisted workflows whose decision actually included a
 * discount - no invented data.
 */
export async function checkMaxDiscountsPerCustomerPerMonth(
  customerId: string,
  overrides?: Partial<GuardrailLimit>
): Promise<GuardrailResult> {
  const max =
    overrides?.maxDiscountPerCustomerPerMonth ??
    limits.maxDiscountPerCustomerPerMonth;
  const since = new Date(Date.now() - 30 * 86_400_000);

  const recentDiscounts = await prisma.recoveryWorkflow.count({
    where: {
      discountPercent: { gt: 0 },
      createdAt: { gte: since },
      revenueRisk: customerRiskScope(customerId),
    },
  });

  if (recentDiscounts >= max) {
    return {
      allowed: false,
      rule: "max_discount_per_customer_per_month",
      reason: `Customer ${customerId} already received ${recentDiscounts} discount decision(s) in the last 30 days (max: ${max})`,
    };
  }

  return {
    allowed: true,
    rule: "max_discount_per_customer_per_month",
    reason: "OK",
  };
}

export async function checkMinRecoveryAmount(
  amountPaise: number,
  overrides?: Partial<GuardrailLimit>
): Promise<GuardrailResult> {
  const min = overrides?.minRecoveryAmountPaise ?? limits.minRecoveryAmountPaise;

  if (amountPaise < min) {
    return {
      allowed: false,
      rule: "min_recovery_amount",
      reason: `Amount ${amountPaise} paise is below minimum ${min} paise`,
    };
  }

  return { allowed: true, rule: "min_recovery_amount", reason: "OK" };
}

export async function checkMerchantBudget(
  merchantId: string,
  overrides?: Partial<GuardrailLimit>
): Promise<GuardrailResult> {
  const maxBudget = overrides?.maxRecoveryBudgetPaise ?? limits.maxRecoveryBudgetPaise;

  const totalSpent = await prisma.recoveryWorkflow.aggregate({
    where: {
      revenueRisk: { merchantId },
      status: "succeeded",
    },
    _sum: { amountRecovered: true },
  });

  const spent = totalSpent._sum.amountRecovered ?? 0;

  if (spent >= maxBudget) {
    return {
      allowed: false,
      rule: "merchant_budget_exceeded",
      reason: `Merchant ${merchantId} has spent ${spent}/${maxBudget} paise on recovery`,
    };
  }

  return { allowed: true, rule: "merchant_budget_exceeded", reason: "OK" };
}

export async function checkCooldown(
  riskId: string,
  overrides?: Partial<GuardrailLimit>
): Promise<GuardrailResult> {
  const cooldownMs = (overrides?.cooldownMinutes ?? limits.cooldownMinutes) * 60 * 1000;

  const lastAction = await prisma.auditLog.findFirst({
    where: {
      revenueRiskId: riskId,
      action: { in: ["recover", "decide"] },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!lastAction) {
    return { allowed: true, rule: "cooldown", reason: "No previous action" };
  }

  const elapsed = Date.now() - lastAction.createdAt.getTime();

  if (elapsed < cooldownMs) {
    const remainingMin = Math.ceil((cooldownMs - elapsed) / 60000);
    return {
      allowed: false,
      rule: "cooldown",
      reason: `Cooldown active for ${remainingMin} more minutes`,
    };
  }

  return { allowed: true, rule: "cooldown", reason: "OK" };
}

export async function checkEscalationNeeded(
  riskId: string,
  overrides?: Partial<GuardrailLimit>
): Promise<GuardrailResult> {
  const threshold = overrides?.escalateAfterFailures ?? limits.escalateAfterFailures;

  const failCount = await prisma.auditLog.count({
    where: {
      revenueRiskId: riskId,
      action: "recover",
      status: "failure",
    },
  });

  if (failCount >= threshold) {
    return {
      allowed: false,
      rule: "escalation_needed",
      reason: `Risk ${riskId} has ${failCount} failures (threshold: ${threshold}), escalate to human`,
    };
  }

  return { allowed: true, rule: "escalation_needed", reason: "OK" };
}

export async function runAllGuardrails(
  riskId: string,
  customerId: string,
  merchantId: string,
  amountPaise: number,
  overrides?: Partial<GuardrailLimit>
): Promise<{ allowed: boolean; blockedBy: GuardrailResult | null }> {
  const checks = await Promise.all([
    checkMaxAttemptsPerRisk(riskId, overrides),
    checkMaxRetriesPerCustomer(customerId, overrides),
    checkMaxPaymentLinksPerWeek(customerId, overrides),
    checkMaxDiscountsPerCustomerPerMonth(customerId, overrides),
    checkMinRecoveryAmount(amountPaise, overrides),
    checkMerchantBudget(merchantId, overrides),
    checkCooldown(riskId, overrides),
    checkEscalationNeeded(riskId, overrides),
  ]);

  const blocked = checks.find((c) => !c.allowed);

  if (blocked) {
    await prisma.auditLog.create({
      data: {
        revenueRiskId: riskId,
        action: "guardrail_block",
        actor: "system",
        details: JSON.stringify({
          rule: blocked.rule,
          reason: blocked.reason,
        }),
        status: "warning",
      },
    });

    return { allowed: false, blockedBy: blocked };
  }

  return { allowed: true, blockedBy: null };
}
