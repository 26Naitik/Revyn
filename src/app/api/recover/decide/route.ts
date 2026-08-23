import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { decideRisk } from "@/lib/engine/decide";
import { diagnoseRisk } from "@/lib/engine/diagnose";
import { parseStoredFactors, scoreBandFor } from "@/lib/engine/scoring";

const requestSchema = z.object({
  riskId: z.string().min(1).max(64),
});

function errorResponse(status: number, error: string, details?: unknown) {
  return NextResponse.json(
    details === undefined ? { error } : { error, details },
    { status }
  );
}

export async function POST(request: Request) {
  let rawBody: unknown;

  try {
    rawBody = await request.json();
  } catch {
    return errorResponse(400, "invalid_json");
  }

  const parsed = requestSchema.safeParse(rawBody);

  if (!parsed.success) {
    return errorResponse(400, "invalid_request", parsed.error.issues);
  }

  const { riskId } = parsed.data;

  try {
    const risk = await prisma.revenueAtRisk.findUnique({
      where: { id: riskId },
      select: { id: true, rootCause: true, amountAtRisk: true },
    });

    if (!risk) {
      return errorResponse(404, "risk_not_found");
    }

    // Auto-advance diagnosis so a single case can be decided end-to-end.
    if (!risk.rootCause) {
      await diagnoseRisk(riskId);
    }

    const existing = await prisma.recoveryWorkflow.findUnique({
      where: { revenueRiskId: riskId },
    });

    if (existing && (existing.status === "executing" || existing.status === "succeeded")) {
      return errorResponse(409, "recovery_already_active", {
        status: existing.status,
        recoveryId: existing.id,
      });
    }

    if (existing && existing.status === "pending") {
      return NextResponse.json({
        ok: true,
        cached: true,
        recoveryId: existing.id,
        riskId,
        decision: {
          strategy: existing.strategy,
          reasoning: existing.aiDecisionReason,
          confidence: existing.confidence,
          estimatedRecovery: Math.round(
            risk.amountAtRisk * (1 - existing.discountPercent / 100)
          ),
          discountPercent: existing.discountPercent,
          retryDelay: existing.retryDelay,
          escalationReason: null,
          recoveryScore: existing.recoveryScore,
          scoreBand: scoreBandFor(existing.recoveryScore),
          priority: existing.priority,
          nextStep: existing.nextStep,
          factors: parseStoredFactors(existing.factors),
          source: existing.decisionSource,
        },
      });
    }

    const outcome = await decideRisk(riskId);

    return NextResponse.json({
      ok: true,
      cached: false,
      recoveryId: outcome.recoveryId,
      riskId,
      persisted: outcome.persisted,
      decision: {
        strategy: outcome.strategy,
        reasoning: outcome.reasoning,
        confidence: outcome.confidence,
        estimatedRecovery: outcome.estimatedRecovery,
        discountPercent: outcome.discountPercent,
        retryDelay: outcome.retryDelay,
        escalationReason: outcome.escalationReason,
        recoveryScore: outcome.recoveryScore,
        scoreBand: outcome.scoreBand,
        priority: outcome.priority,
        nextStep: outcome.nextStep,
        factors: outcome.factors,
        source: outcome.source,
      },
    });
  } catch (err) {
    console.error(
      "Recovery decision failed:",
      err instanceof Error ? err.message : err
    );

    // Graceful duplicate handling: a concurrent decide may have created the
    // workflow row between our check and write - surface it as cached.
    if (
      err instanceof Error &&
      err.message.includes("Unique constraint") &&
      (err as { code?: string }).code === "P2002"
    ) {
      const raced = await prisma.recoveryWorkflow.findUnique({
        where: { revenueRiskId: riskId },
        select: { id: true },
      });
      if (raced) {
        return NextResponse.json({
          ok: true,
          cached: true,
          recoveryId: raced.id,
          riskId,
        });
      }
    }

    return errorResponse(500, "decision_failed");
  }
}
