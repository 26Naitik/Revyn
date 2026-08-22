import { prisma } from "@/lib/prisma";

export const PAYMENT_LINK_ELIGIBLE_STRATEGIES: ReadonlySet<string> = new Set([
  "send_payment_link",
  "offer_discount",
]);

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
}

export interface ActivityRow {
  id: string;
  action: string;
  actor: string;
  status: string;
  details: Record<string, unknown>;
  createdAt: Date;
}

export function isPaymentLinkEligible(row: {
  status: string;
  strategy: string;
}): boolean {
  return (
    row.status === "pending" &&
    PAYMENT_LINK_ELIGIBLE_STRATEGIES.has(row.strategy)
  );
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
        },
      },
    },
  });

  return workflows.map((wf) => ({
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
  }));
}

export async function listRecentRisks(limit = 50): Promise<RiskRow[]> {
  const risks = await prisma.revenueAtRisk.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return risks.map((risk) => ({
    id: risk.id,
    type: risk.type,
    amountAtRisk: risk.amountAtRisk,
    currency: risk.currency,
    status: risk.status,
    rootCause: risk.rootCause,
    confidenceScore: risk.confidenceScore,
    createdAt: risk.createdAt,
  }));
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
