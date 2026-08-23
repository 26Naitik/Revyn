import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { runAllGuardrails } from "@/lib/guardrails/rules";
import { DEFAULT_LIMITS } from "@/lib/guardrails/limits";
import { getAIConfig } from "@/lib/ai/config";
import { refineDecisionWithAI } from "@/lib/ai/reasoning";
import type {
  DecisionSource,
  RecoveryDecisionResult,
  RecoveryStrategy,
} from "@/lib/types";
import {
  buildRecoveryContext,
  loadRisk,
  resolveCustomerId,
} from "./context";
import {
  applyLowScoreRule,
  derivePriority,
  nextStepFor,
  selectBaseStrategy,
  type RootCauseDecision,
} from "./decision-rules";
import { computeRecoveryScore } from "./scoring";

/**
 * Phase 1 - AI Recovery Decision Engine (orchestration layer).
 *
 * Flow:
 *   load case -> build context -> deterministic recovery score
 *     -> rule-based strategy -> low-score override -> guardrails
 *     -> optional AI reasoning refinement -> compose final decision
 *     -> persist (idempotently) -> audit log
 *
 * Safety invariants:
 *   - This engine only ever RECOMMENDS actions; it never moves money.
 *   - A guardrail block always forces escalate_human, even if AI disagrees.
 *   - Amounts are never taken from AI output; recovery estimates are derived
 *     from the risk amount with discounts capped by DEFAULT_LIMITS.
 */

export interface DecideOutcome extends RecoveryDecisionResult {
  riskId: string;
  recoveryId: string | null;
  persisted: boolean;
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(0.99, Math.max(0.05, value));
}

function capDiscount(percent: number): number {
  return Math.max(0, Math.min(DEFAULT_LIMITS.maxDiscountPercent, Math.round(percent)));
}

function estimatedRecoveryFor(amountAtRisk: number, discountPercent: number): number {
  return Math.round(amountAtRisk * (1 - discountPercent / 100));
}

async function persistDecision(
  riskId: string,
  decision: RecoveryDecisionResult
): Promise<{ recoveryId: string | null; persisted: boolean }> {
  const existing = await prisma.recoveryWorkflow.findUnique({
    where: { revenueRiskId: riskId },
    select: { id: true, status: true },
  });

  const sharedData = {
    strategy: decision.strategy,
    aiDecisionReason: decision.reasoning,
    recoveryScore: decision.recoveryScore,
    confidence: decision.confidence,
    priority: decision.priority,
    discountPercent: decision.discountPercent,
    retryDelay: decision.retryDelay,
    nextStep: decision.nextStep,
    factors: decision.factors as unknown as Prisma.InputJsonValue,
    decisionSource: decision.source,
  };

  if (!existing) {
    const created = await prisma.recoveryWorkflow.create({
      data: { revenueRiskId: riskId, ...sharedData },
      select: { id: true },
    });
    return { recoveryId: created.id, persisted: true };
  }

  // Refresh decisions that have not entered (or completed) financial
  // execution - executing/succeeded workflows are owned by the recovery
  // executor, but a failed attempt may legitimately be re-decided.
  if (existing.status === "pending" || existing.status === "failed") {
    await prisma.recoveryWorkflow.update({
      where: { id: existing.id },
      data: sharedData,
    });
    return { recoveryId: existing.id, persisted: true };
  }

  return { recoveryId: existing.id, persisted: false };
}

export async function decideRisk(riskId: string): Promise<DecideOutcome> {
  const risk = await loadRisk(riskId);
  if (!risk) {
    throw new Error(`RevenueAtRisk ${riskId} not found`);
  }
  if (!risk.rootCause) {
    throw new Error(`RevenueAtRisk ${riskId} has not been diagnosed yet`);
  }

  const customerId = await resolveCustomerId(risk);
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

  const context = await buildRecoveryContext(risk, customerId);
  const score = computeRecoveryScore(context);

  let base: RootCauseDecision = selectBaseStrategy(
    risk.rootCause,
    risk.amountAtRisk,
    failCount
  );
  base = applyLowScoreRule(base, score.score);

  const guardrailResult = await runAllGuardrails(
    riskId,
    customerId,
    risk.merchantId,
    risk.amountAtRisk
  );

  let strategy: RecoveryStrategy = base.strategy;
  let reasoning = base.reasoning;
  let confidence = base.confidence;
  let escalationReason: string | null = null;

  if (!guardrailResult.allowed) {
    strategy = "escalate_human";
    escalationReason =
      guardrailResult.blockedBy?.reason ?? "Guardrail blocked action";
    reasoning = `Guardrail blocked "${base.strategy}": ${escalationReason}. Escalating to human.`;
    confidence = Math.min(base.confidence, 0.5);
  }

  // AI refinement only runs when the deterministic path is still allowed -
  // guardrail escalations are non-negotiable and need no AI opinion.
  let source: DecisionSource = "rules";
  let nextStep = nextStepFor(strategy, {
    discountPercent: base.discountPercent,
    retryDelay: base.retryDelay,
  });

  if (guardrailResult.allowed) {
    const aiConfig = getAIConfig();
    if (aiConfig) {
      const refinement = await refineDecisionWithAI(aiConfig, {
        risk: {
          type: risk.type,
          rootCause: risk.rootCause,
          amountInr: Math.round(risk.amountAtRisk / 100),
          recoveryAttemptsOnCase: failCount,
        },
        score,
        customer: {
          successfulPayments: context.successfulPayments,
          totalPayments: context.totalPayments,
          recentFailedPayments: context.recentFailedPayments,
          recoveryAttempts: context.recoveryAttempts,
          recoverySuccesses: context.recoverySuccesses,
          tenureDays: Math.floor(
            Math.max(
              0,
              (Date.now() - context.customerCreatedAt.getTime()) / 86_400_000
            )
          ),
        },
        baseRecommendation: {
          strategy: base.strategy,
          reasoning: base.reasoning,
          confidence: base.confidence,
        },
      });

      if (refinement) {
        source = "ai";
        strategy = refinement.action;
        confidence = clampConfidence(refinement.confidence);
        reasoning = refinement.reasoning;
        nextStep = refinement.nextStep;
      }
    }
  }

  // Discounts are always system-capped regardless of who suggested them.
  const discountPercent = capDiscount(base.discountPercent);
  const priority = derivePriority(
    score.score,
    risk.amountAtRisk,
    strategy === "escalate_human"
  );

  const decision: RecoveryDecisionResult = {
    strategy,
    reasoning,
    confidence: clampConfidence(confidence),
    estimatedRecovery:
      strategy === "no_action"
        ? 0
        : estimatedRecoveryFor(risk.amountAtRisk, discountPercent),
    discountPercent,
    retryDelay: strategy === "schedule_retry" ? (base.retryDelay ?? null) : null,
    escalationReason,
    recoveryScore: score.score,
    scoreBand: score.band,
    priority,
    nextStep,
    factors: score.factors,
    source,
  };

  const { recoveryId, persisted } = await persistDecision(riskId, decision);

  await prisma.revenueAtRisk.update({
    where: { id: riskId },
    data: { status: "decided" },
  });

  await prisma.auditLog.create({
    data: {
      revenueRiskId: riskId,
      recoveryId: recoveryId ?? undefined,
      action: "decide",
      actor: source === "ai" ? "ai_agent" : "system",
      details: JSON.stringify({
        strategy: decision.strategy,
        reasoning: decision.reasoning,
        confidence: decision.confidence,
        recoveryScore: decision.recoveryScore,
        scoreBand: decision.scoreBand,
        priority: decision.priority,
        nextStep: decision.nextStep,
        estimatedRecovery: decision.estimatedRecovery,
        discountPercent: decision.discountPercent,
        retryDelay: decision.retryDelay,
        topFactors: [...decision.factors]
          .sort((a, b) => b.contribution - a.contribution)
          .slice(0, 3)
          .map((factor) => ({
            key: factor.key,
            contribution: factor.contribution,
          })),
        source: decision.source,
        escalationReason: decision.escalationReason,
        guardrailBlocked: !guardrailResult.allowed,
        persisted,
      }),
      status: "success",
    },
  });

  return {
    ...decision,
    riskId,
    recoveryId,
    persisted,
  };
}

export async function decideAll(): Promise<DecideOutcome[]> {
  const undecided = await prisma.revenueAtRisk.findMany({
    where: {
      status: "diagnosing",
      rootCause: { not: null },
    },
    select: { id: true },
  });

  const results: DecideOutcome[] = [];

  for (const risk of undecided) {
    const result = await decideRisk(risk.id);
    results.push(result);
  }

  return results;
}
