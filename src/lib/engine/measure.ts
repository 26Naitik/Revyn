import { prisma } from "@/lib/prisma";
import type { DashboardStats, RevenueRiskType, RevenueRiskStatus } from "@/lib/types";

export interface MeasurementResult extends DashboardStats {
  pendingRecoveryAmount: number;
  failedRecoveryAmount: number;
  escalatedCount: number;
  totalRiskItems: number;
  totalRecoveryWorkflows: number;
}

export async function measureStats(): Promise<MeasurementResult> {
  const [
    allRisks,
    statusCounts,
    typeCounts,
    recoveredSum,
    pendingSum,
    failedSum,
    activeRecoveries,
    escalatedCount,
    totalRecoveryWorkflows,
  ] = await Promise.all([
    prisma.revenueAtRisk.findMany({
      select: { id: true, type: true, status: true, amountAtRisk: true },
    }),
    prisma.revenueAtRisk.groupBy({
      by: ["status"],
      _count: true,
    }),
    prisma.revenueAtRisk.groupBy({
      by: ["type"],
      _count: true,
    }),
    prisma.recoveryWorkflow.aggregate({
      where: { status: "succeeded" },
      _sum: { amountRecovered: true },
    }),
    prisma.recoveryWorkflow.aggregate({
      where: { status: "pending" },
      _sum: { amountRecovered: true },
    }),
    prisma.recoveryWorkflow.aggregate({
      where: { status: "failed" },
      _sum: { amountRecovered: true },
    }),
    prisma.recoveryWorkflow.count({
      where: { status: { in: ["pending", "executing"] } },
    }),
    prisma.recoveryWorkflow.count({
      where: { strategy: "escalate_human" },
    }),
    prisma.recoveryWorkflow.count(),
  ]);

  const totalAtRisk = allRisks.reduce((sum, r) => sum + r.amountAtRisk, 0);
  const totalRecovered = recoveredSum._sum.amountRecovered ?? 0;
  const recoveryRate = totalAtRisk > 0 ? totalRecovered / totalAtRisk : 0;

  const byType: Record<RevenueRiskType, number> = {
    failed_payment: 0,
    abandoned_checkout: 0,
    failed_subscription: 0,
    overdue_receivable: 0,
  };
  for (const group of typeCounts) {
    if (group.type in byType) {
      byType[group.type as RevenueRiskType] = group._count;
    }
  }

  const byStatus: Record<RevenueRiskStatus, number> = {
    detected: 0,
    diagnosing: 0,
    decided: 0,
    recovering: 0,
    recovered: 0,
    failed: 0,
    abandoned: 0,
    expired: 0,
  };
  for (const group of statusCounts) {
    if (group.status in byStatus) {
      byStatus[group.status as RevenueRiskStatus] = group._count;
    }
  }

  return {
    totalAtRisk,
    totalRecovered,
    recoveryRate,
    activeRecoveries,
    byType,
    byStatus,
    pendingRecoveryAmount: pendingSum._sum.amountRecovered ?? 0,
    failedRecoveryAmount: failedSum._sum.amountRecovered ?? 0,
    escalatedCount,
    totalRiskItems: allRisks.length,
    totalRecoveryWorkflows,
  };
}