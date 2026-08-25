import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseStoredFactors } from "@/lib/engine/scoring";
import { parseAuditDetails, type ActivityRow } from "@/lib/dashboard/data";
import {
  buildRecoveryTimeline,
  extractTrustSignals,
} from "@/lib/dashboard/timeline";
import type { RecoveryFactor } from "@/lib/types";

/**
 * Case detail for the operator drawer: answers WHO / WHAT / WHY /
 * WHAT DOES REVYN THINK / WHAT HAPPENED / WHAT NEXT from real rows.
 * The `events` array is a 1:1 projection of AuditLog records.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  if (!id || id.length > 64) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const workflow = await prisma.recoveryWorkflow.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      strategy: true,
      attemptCount: true,
      amountRecovered: true,
      recoveryScore: true,
      confidence: true,
      priority: true,
      discountPercent: true,
      retryDelay: true,
      nextStep: true,
      aiDecisionReason: true,
      decisionSource: true,
      factors: true,
      startedAt: true,
      completedAt: true,
      nextRetryAt: true,
      lastAttemptAt: true,
      lastFailureCategory: true,
      lastFailureReason: true,
      razorpayActionId: true,
      createdAt: true,
      revenueRiskId: true,
      revenueRisk: {
        select: {
          id: true,
          type: true,
          status: true,
          amountAtRisk: true,
          currency: true,
          rootCause: true,
          createdAt: true,
          payment: { select: { customer: { select: { name: true, email: true } } } },
          order: { select: { customer: { select: { name: true, email: true } } } },
          subscription: {
            select: { customer: { select: { name: true, email: true } } },
          },
        },
      },
    },
  });

  if (!workflow) {
    return NextResponse.json({ error: "recovery_not_found" }, { status: 404 });
  }

  const auditRows = await prisma.auditLog.findMany({
    where: {
      OR: [
        { recoveryId: workflow.id },
        { revenueRiskId: workflow.revenueRiskId },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: {
      id: true,
      action: true,
      actor: true,
      status: true,
      details: true,
      createdAt: true,
    },
  });

  const activityRows: ActivityRow[] = auditRows.map((row) => ({
    id: row.id,
    action: row.action,
    actor: row.actor,
    status: row.status,
    details: parseAuditDetails(row.details),
    createdAt: row.createdAt,
  }));

  const customers = [
    workflow.revenueRisk.payment?.customer,
    workflow.revenueRisk.order?.customer,
    workflow.revenueRisk.subscription?.customer,
  ].filter(Boolean) as Array<{ name: string; email: string }>;

  let factors: RecoveryFactor[] = [];
  if (workflow.factors !== null && workflow.factors !== undefined) {
    try {
      factors = parseStoredFactors(
        typeof workflow.factors === "string"
          ? workflow.factors
          : JSON.stringify(workflow.factors)
      );
    } catch {
      factors = [];
    }
  }

  const timelineEvents = buildRecoveryTimeline(activityRows);

  return NextResponse.json({
    ok: true,
    trust: extractTrustSignals(timelineEvents),
    case: {
      recoveryId: workflow.id,
      riskId: workflow.revenueRiskId,
      status: workflow.status,
      strategy: workflow.strategy,
      attemptCount: workflow.attemptCount,
      amountAtRisk: workflow.revenueRisk.amountAtRisk,
      currency: workflow.revenueRisk.currency,
      amountRecovered: workflow.amountRecovered,
      riskType: workflow.revenueRisk.type,
      rootCause: workflow.revenueRisk.rootCause,
      riskStatus: workflow.revenueRisk.status,
      createdAt: workflow.createdAt.toISOString(),
      completedAt: workflow.completedAt?.toISOString() ?? null,
      nextRetryAt: workflow.nextRetryAt?.toISOString() ?? null,
      razorpayActionId: workflow.razorpayActionId,
      customer: customers[0]
        ? { name: customers[0].name, email: customers[0].email }
        : null,
      decision: {
        reasoning: workflow.aiDecisionReason,
        confidence: workflow.confidence,
        recoveryScore: workflow.recoveryScore,
        priority: workflow.priority,
        discountPercent: workflow.discountPercent,
        retryDelay: workflow.retryDelay,
        nextStep: workflow.nextStep,
        source: workflow.decisionSource ?? "rules",
        factors,
      },
      failure:
        workflow.lastFailureReason === null
          ? null
          : {
              reason: workflow.lastFailureReason,
              category: workflow.lastFailureCategory,
            },
    },
    events: timelineEvents,
  });
}
