import { prisma } from "@/lib/prisma";
import {
  listRecentRisks,
  type RiskRow,
} from "@/lib/dashboard/data";
import { measureStats, type MeasurementResult } from "@/lib/engine/measure";
import {
  computeAttentionQueue,
  computeBreakdowns,
  computeDailySeries,
  computeFinancialKpis,
  computeFunnel,
  computeIntelligenceKpis,
  computeIntelligenceStats,
  computeOperationalKpis,
  computeOpportunities,
  computeWeeklyTrend,
  type AttentionItem,
  type BreakdownBucket,
  type DailyPoint,
  type FinancialKpis,
  type FunnelStage,
  type IntelligenceKpis,
  type IntelligenceStats,
  type IntelRisk,
  type IntelWorkflow,
  type OpportunityItem,
  type OperationalKpis,
  type WeeklyTrend,
} from "@/lib/dashboard/intelligence";

/**
 * Command-center data layer (Phase 3).
 *
 * One parallel query batch per page load; all intelligence is computed
 * server-side from those rows via the pure functions in intelligence.ts.
 * No client-side financial math, no N+1 loops.
 */

export interface CommandCenterIntel {
  stats: MeasurementResult;
  financial: FinancialKpis;
  operational: OperationalKpis;
  intelligence: IntelligenceKpis;
  funnel: FunnelStage[];
  opportunities: OpportunityItem[];
  attention: AttentionItem[];
  breakdowns: {
    byStatus: BreakdownBucket[];
    byStrategy: BreakdownBucket[];
    byFailureCategory: BreakdownBucket[];
    byScoreBand: BreakdownBucket[];
  };
  aiStats: IntelligenceStats;
  dailySeries: DailyPoint[];
  weeklyTrend: WeeklyTrend | null;
  /** Raw workflow rows for downstream breakdowns (server-side only). */
  workflows: IntelWorkflow[];
}

function toIntelRisk(row: RiskRow): IntelRisk {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    amountAtRisk: row.amountAtRisk,
    currency: row.currency,
    rootCause: row.rootCause,
    createdAt: row.createdAt,
    customerName: row.customerName,
    customerEmail: row.customerEmail,
    decision: row.decision,
  };
}

export async function getCommandCenterIntel(): Promise<CommandCenterIntel> {
  const RISK_WINDOW = 200;

  const [stats, risksRaw, workflowRows, failedPayments] = await Promise.all([
    measureStats(),
    listRecentRisks(RISK_WINDOW),
    prisma.recoveryWorkflow.findMany({
      select: {
        id: true,
        revenueRiskId: true,
        status: true,
        strategy: true,
        attemptCount: true,
        amountRecovered: true,
        recoveryScore: true,
        confidence: true,
        decisionSource: true,
        priority: true,
        startedAt: true,
        completedAt: true,
        nextRetryAt: true,
        lastAttemptAt: true,
        lastFailureCategory: true,
        lastFailureReason: true,
        createdAt: true,
        revenueRisk: { select: { amountAtRisk: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.payment.aggregate({
      where: { status: "failed" },
      _count: true,
      _sum: { amount: true },
    }),
  ]);

  const risks = risksRaw.map(toIntelRisk);

  const workflows: IntelWorkflow[] = workflowRows.map((wf) => ({
    id: wf.id,
    revenueRiskId: wf.revenueRiskId,
    status: wf.status,
    strategy: wf.strategy,
    attemptCount: wf.attemptCount,
    amountRecovered: wf.amountRecovered,
    amountAtRisk: wf.revenueRisk.amountAtRisk,
    recoveryScore: Math.round(wf.recoveryScore),
    confidence: wf.confidence,
    decisionSource: wf.decisionSource ?? "rules",
    priority: wf.priority,
    startedAt: wf.startedAt,
    completedAt: wf.completedAt,
    nextRetryAt: wf.nextRetryAt,
    lastAttemptAt: wf.lastAttemptAt,
    lastFailureCategory: wf.lastFailureCategory,
    lastFailureReason: wf.lastFailureReason,
    createdAt: wf.createdAt,
  }));

  const now = new Date();

  // Pair each risk with its (at most one) workflow for attention ranking.
  const workflowByRiskId = new Map(workflows.map((wf) => [wf.revenueRiskId, wf]));
  const cases = risks.map((risk) => ({
    risk,
    workflow: workflowByRiskId.get(risk.id) ?? null,
  }));

  const dailySeries = computeDailySeries(workflows, risks, { days: 14, now });

  return {
    stats,
    financial: computeFinancialKpis(stats, workflows),
    operational: computeOperationalKpis(workflows),
    intelligence: computeIntelligenceKpis(workflows),
    funnel: computeFunnel({
      failedPaymentCount: failedPayments._count,
      failedPaymentAmountPaise: failedPayments._sum.amount ?? 0,
      risks,
      workflows,
    }),
    opportunities: attachCustomerNames(
      computeOpportunities(workflows, { now, limit: 5 }),
      risks
    ),
    attention: computeAttentionQueue(cases, { now, limit: 8 }),
    breakdowns: computeBreakdowns(workflows),
    aiStats: computeIntelligenceStats(workflows),
    dailySeries,
    weeklyTrend: computeWeeklyTrend(dailySeries),
    workflows,
  };
}

function attachCustomerNames(
  opportunities: OpportunityItem[],
  risks: IntelRisk[]
): OpportunityItem[] {
  const byId = new Map(risks.map((r) => [r.id, r]));
  return opportunities.map((op) => ({
    ...op,
    riskType: byId.get(op.riskId)?.type ?? "",
    customerName: byId.get(op.riskId)?.customerName ?? null,
  }));
}
