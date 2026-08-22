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
    include: { auditLogs: true },
  });

  if (!risk) {
    return { allowed: false, rule: "risk_not_found", reason: "Risk record not found" };
  }

  const attemptCount = risk.auditLogs.filter(
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

export async function checkMaxRetriesPerCustomer(
  customerId: string,
  overrides?: Partial<GuardrailLimit>
): Promise<GuardrailResult> {
  const max = overrides?.maxRetriesPerCustomer ?? limits.maxRetriesPerCustomer;

  const retryCount = await prisma.auditLog.count({
    where: {
      action: "recover",
      revenueRisk: {
        OR: [
          { payment: { customerId } },
          { subscription: { customerId } },
          { order: { customerId } },
        ],
      },
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
