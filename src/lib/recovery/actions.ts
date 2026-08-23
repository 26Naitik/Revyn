import { prisma } from "@/lib/prisma";
import {
  RecoveryExecutionError,
  type ExecutionErrorCode,
} from "./execute";
import { canTransition } from "./state-machine";
import { recordLifecycleEvent } from "./audit";
import type { RecoveryStatus } from "@/lib/types";

/**
 * Operator-driven terminal transitions for recovery workflows.
 * Both are idempotent-safe: they use compare-and-set updates and reject
 * workflows whose current state does not permit the transition.
 */

async function applyTerminalTransition(input: {
  recoveryId: string;
  target: Extract<RecoveryStatus, "cancelled" | "escalated">;
}): Promise<{ recoveryId: string; riskId: string; status: RecoveryStatus }> {
  const workflow = await prisma.recoveryWorkflow.findUnique({
    where: { id: input.recoveryId },
    select: {
      id: true,
      status: true,
      revenueRiskId: true,
    },
  });

  if (!workflow) {
    throw new RecoveryExecutionError(
      "recovery_not_found",
      "Recovery workflow not found"
    );
  }

  if (!canTransition(workflow.status, input.target)) {
    throw new RecoveryExecutionError(
      "recovery_not_executable",
      `Cannot move workflow from "${workflow.status}" to "${input.target}"`,
      { status: workflow.status }
    );
  }

  const updated = await prisma.recoveryWorkflow.updateMany({
    where: { id: workflow.id, status: workflow.status },
    data:
      input.target === "cancelled"
        ? { status: "cancelled", completedAt: new Date(), nextRetryAt: null }
        : { status: "escalated", nextRetryAt: null },
  });

  if (updated.count === 0) {
    throw new RecoveryExecutionError(
      "duplicate_claim",
      "Workflow changed state concurrently",
      { previousStatus: workflow.status }
    );
  }

  await recordLifecycleEvent(prisma, {
    riskId: workflow.revenueRiskId,
    recoveryId: workflow.id,
    event:
      input.target === "cancelled" ? "recovery_cancelled" : "recovery_escalated",
    actor: "user",
    from: workflow.status,
    to: input.target,
  });

  return {
    recoveryId: workflow.id,
    riskId: workflow.revenueRiskId,
    status: input.target,
  };
}

export async function cancelRecovery(
  recoveryId: string
): Promise<{ recoveryId: string; riskId: string; status: RecoveryStatus }> {
  try {
    return await applyTerminalTransition({
      recoveryId,
      target: "cancelled",
    });
  } catch (err) {
    throw normalizeActionError(err);
  }
}

export async function escalateRecovery(
  recoveryId: string
): Promise<{ recoveryId: string; riskId: string; status: RecoveryStatus }> {
  try {
    return await applyTerminalTransition({
      recoveryId,
      target: "escalated",
    });
  } catch (err) {
    throw normalizeActionError(err);
  }
}

function normalizeActionError(err: unknown): never {
  if (err instanceof RecoveryExecutionError) {
    throw err;
  }
  const code: ExecutionErrorCode = "recovery_execution_failed";
  throw new RecoveryExecutionError(
    code,
    err instanceof Error ? err.message : "Unknown action failure"
  );
}
