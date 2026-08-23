import { prisma } from "@/lib/prisma";
import { parseStoredFactors } from "@/lib/engine/scoring";
import type { RecoveryFactor } from "@/lib/types";

export {
  PAYMENT_LINK_ELIGIBLE_STRATEGIES,
  isPaymentLinkEligible,
} from "@/lib/recovery-eligibility";

export interface RecoveryRow {
  recoveryId: string;
  strategy: string;
  status: string;
  riskId: string;
  riskType: string;
  amountAtRisk: number;
  currency: string;
  rootCause: string | null;
  razorpayActionId: string | null;
  amountRecovered: number;
  createdAt: Date;
  customerName: string | null;
  customerEmail: string | null;
}

export interface RiskDecisionView {
  recoveryId: string;
  strategy: string;
  workflowStatus: string;
  reasoning: string;
  confidence: number;
  recoveryScore: number;
  priority: string;
  discountPercent: number;
  retryDelay: string | null;
  nextStep: string | null;
  factors: RecoveryFactor[];
  source: string;
}

export interface RiskRow {
  id: string;
  type: string;
  amountAtRisk: number;
  currency: string;
  status: string;
  rootCause: string | null;
  confidenceScore: number;
  createdAt: Date;
  customerName: string | null;
  customerEmail: string | null;
  decision: RiskDecisionView | null;
}

export interface ActivityRow {
  id: string;
  action: string;
  actor: string;
  status: string;
  details: Record<string, unknown>;
  createdAt: Date;
}

export function parseAuditDetails(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

const ENTITY_WITH_CUSTOMER_SELECT = {
  select: {
    customer: {
      select: {
        name: true,
        email: true,
      },
    },
  },
} as const;

type CustomerRef = { name: string; email: string } | null;

function firstCustomer(
  payment: { customer: CustomerRef } | null,
  order: { customer: CustomerRef } | null,
  subscription: { customer: CustomerRef } | null
): CustomerRef {
  return payment?.customer ?? order?.customer ?? subscription?.customer ?? null;
}

export async function listRecentRecoveries(
  limit = 25
): Promise<RecoveryRow[]> {
  const workflows = await prisma.recoveryWorkflow.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      revenueRisk: {
        select: {
          id: true,
          type: true,
          amountAtRisk: true,
          currency: true,
          rootCause: true,
          payment: ENTITY_WITH_CUSTOMER_SELECT,
          order: ENTITY_WITH_CUSTOMER_SELECT,
          subscription: ENTITY_WITH_CUSTOMER_SELECT,
        },
      },
    },
  });

  return workflows.map((wf) => {
    const customer = firstCustomer(
      wf.revenueRisk.payment,
      wf.revenueRisk.order,
      wf.revenueRisk.subscription
    );

    return {
      recoveryId: wf.id,
      strategy: wf.strategy,
      status: wf.status,
      riskId: wf.revenueRisk.id,
      riskType: wf.revenueRisk.type,
      amountAtRisk: wf.revenueRisk.amountAtRisk,
      currency: wf.revenueRisk.currency,
      rootCause: wf.revenueRisk.rootCause,
      razorpayActionId: wf.razorpayActionId,
      amountRecovered: wf.amountRecovered,
      createdAt: wf.createdAt,
      customerName: customer?.name ?? null,
      customerEmail: customer?.email ?? null,
    };
  });
}

export async function listRecentRisks(limit = 50): Promise<RiskRow[]> {
  const risks = await prisma.revenueAtRisk.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      payment: ENTITY_WITH_CUSTOMER_SELECT,
      order: ENTITY_WITH_CUSTOMER_SELECT,
      subscription: ENTITY_WITH_CUSTOMER_SELECT,
      recovery: {
        select: {
          id: true,
          strategy: true,
          status: true,
          aiDecisionReason: true,
          confidence: true,
          recoveryScore: true,
          priority: true,
          discountPercent: true,
          retryDelay: true,
          nextStep: true,
          factors: true,
          decisionSource: true,
        },
      },
    },
  });

  return risks.map((risk) => {
    const customer = firstCustomer(
      risk.payment,
      risk.order,
      risk.subscription
    );

    return {
      id: risk.id,
      type: risk.type,
      amountAtRisk: risk.amountAtRisk,
      currency: risk.currency,
      status: risk.status,
      rootCause: risk.rootCause,
      confidenceScore: risk.confidenceScore,
      createdAt: risk.createdAt,
      customerName: customer?.name ?? null,
      customerEmail: customer?.email ?? null,
      decision: risk.recovery
        ? {
            recoveryId: risk.recovery.id,
            strategy: risk.recovery.strategy,
            workflowStatus: risk.recovery.status,
            reasoning: risk.recovery.aiDecisionReason,
            confidence: risk.recovery.confidence,
            recoveryScore: risk.recovery.recoveryScore,
            priority: risk.recovery.priority,
            discountPercent: risk.recovery.discountPercent,
            retryDelay: risk.recovery.retryDelay,
            nextStep: risk.recovery.nextStep,
            factors: parseStoredFactors(risk.recovery.factors),
            source: risk.recovery.decisionSource,
          }
        : null,
    };
  });
}

export async function getRecentActivity(limit = 10): Promise<ActivityRow[]> {
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      action: true,
      actor: true,
      status: true,
      details: true,
      createdAt: true,
    },
  });

  return logs.map((log) => ({
    id: log.id,
    action: log.action,
    actor: log.actor,
    status: log.status,
    details: parseAuditDetails(log.details),
    createdAt: log.createdAt,
  }));
}
