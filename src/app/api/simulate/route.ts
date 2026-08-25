import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { detectAll } from "@/lib/engine/detect";
import { diagnoseAll } from "@/lib/engine/diagnose";
import { decideAll } from "@/lib/engine/decide";
import { measureStats } from "@/lib/engine/measure";
import {
  RecoveryExecutionError,
  executeRecoveryPaymentLink,
} from "@/lib/recovery/execute";
import {
  PAYMENT_LINK_ELIGIBLE_STRATEGIES,
} from "@/lib/recovery-eligibility";

/**
 * POST /api/simulate (Phase 6)
 *
 * Runs the complete recovery loop end-to-end:
 *   detect -> diagnose -> decide -> execute -> measure
 *
 * The execution leg only attempts workflows that are pending and
 * link-eligible; retry_scheduled cases are attempted only once their
 * scheduled time is due. Every attempt goes through the atomic executor,
 * so guardrails, state-machine rules and idempotency apply unchanged.
 */
export async function POST() {
  try {
    const detection = await detectAll();
    const diagnoses = await diagnoseAll();
    const decisions = await decideAll();

    // Execution sweep over currently-actionable link-eligible workflows.
    const dueRetryCutoff = new Date();
    const actionable = await prisma.recoveryWorkflow.findMany({
      where: {
        status: "pending",
        strategy: { in: [...PAYMENT_LINK_ELIGIBLE_STRATEGIES] },
      },
      select: { id: true },
      take: 50,
    });
    const dueRetries = await prisma.recoveryWorkflow.findMany({
      where: {
        status: "retry_scheduled",
        nextRetryAt: { lte: dueRetryCutoff },
        strategy: { in: [...PAYMENT_LINK_ELIGIBLE_STRATEGIES] },
      },
      select: { id: true },
      take: 50,
    });

    let executed = 0;
    const failures: Array<{ recoveryId: string; error: string }> = [];

    for (const workflow of [...actionable, ...dueRetries]) {
      try {
        await executeRecoveryPaymentLink(workflow.id);
        executed += 1;
      } catch (err) {
        if (err instanceof RecoveryExecutionError) {
          failures.push({ recoveryId: workflow.id, error: err.code });
          continue;
        }
        throw err;
      }
    }

    const measured = await measureStats();

    await prisma.auditLog.create({
      data: {
        action: "measure",
        actor: "system",
        details: JSON.stringify({
          simulationRun: true,
          detected: detection.risksFound,
          diagnosed: diagnoses.length,
          decided: decisions.length,
          executed,
          executionFailures: failures.length,
          totalAtRisk: measured.totalAtRisk,
          totalRecovered: measured.totalRecovered,
        }),
        status: "success",
      },
    });

    return NextResponse.json({
      ok: true,
      detected: {
        risksFound: detection.risksFound,
        totalAtRisk: detection.totalAtRisk,
      },
      diagnosed: { count: diagnoses.length },
      decided: { count: decisions.length },
      executed: {
        count: executed,
        failures,
      },
      measured: {
        totalAtRisk: measured.totalAtRisk,
        totalRecovered: measured.totalRecovered,
        recoveryRate: measured.recoveryRate,
        byType: measured.byType,
        byStatus: measured.byStatus,
      },
    });
  } catch (err) {
    console.error(
      "Simulation failed:",
      err instanceof Error ? err.message : err
    );
    return NextResponse.json(
      { ok: false, error: "simulation_failed" },
      { status: 500 }
    );
  }
}
