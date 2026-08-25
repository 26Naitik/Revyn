import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { decideRisk } from "@/lib/engine/decide";
import {
  RecoveryExecutionError,
  executeRecoveryPaymentLink,
} from "@/lib/recovery/execute";
import { PAYMENT_LINK_ELIGIBLE_STRATEGIES } from "@/lib/recovery-eligibility";

/**
 * POST /api/recover (Phase 6)
 *
 * One-shot case recovery: decides a risk and, when the selected strategy is
 * link-executable, immediately executes it. Composes the existing decision
 * engine and atomic execution service - no duplicated logic.
 *
 * Strategies that are not link-executable (escalate_human, schedule_retry,
 * no_action) return the decision with executed:false instead of failing.
 */
const requestSchema = z
  .object({
    riskId: z.string().min(1).max(64),
  })
  .strict();

const EXECUTION_ERROR_STATUS: Record<string, number> = {
  recovery_not_found: 404,
  risk_not_linked: 409,
  customer_not_resolvable: 409,
  unsupported_currency: 409,
  amount_below_guardrail_minimum: 409,
  strategy_not_executable: 409,
  recovery_not_executable: 409,
  retry_not_due: 409,
  retry_limit_reached: 409,
  guardrail_blocked: 409,
  duplicate_claim: 409,
  payment_link_creation_failed: 502,
  recovery_execution_failed: 502,
};

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
    const exists = await prisma.revenueAtRisk.findUnique({
      where: { id: riskId },
      select: { id: true },
    });

    if (!exists) {
      return errorResponse(404, "risk_not_found");
    }

    // Reuse the full decision pipeline (guardrails included).
    const decision = await decideRisk(riskId);

    if (!decision.recoveryId) {
      return NextResponse.json({
        ok: true,
        riskId,
        decision,
        executed: false,
        execution: null,
      });
    }

    const executableStrategy =
      PAYMENT_LINK_ELIGIBLE_STRATEGIES.has(decision.strategy);

    if (!executableStrategy || !decision.persisted) {
      return NextResponse.json({
        ok: true,
        riskId,
        decision,
        executed: false,
        execution: null,
      });
    }

    try {
      const execution = await executeRecoveryPaymentLink(decision.recoveryId);
      return NextResponse.json({
        ok: true,
        riskId,
        decision,
        executed: true,
        execution,
      });
    } catch (execErr) {
      // A blocked/failed execution does not invalidate the persisted decision.
      if (execErr instanceof RecoveryExecutionError) {
        return NextResponse.json(
          {
            ok: false,
            riskId,
            decision,
            executed: false,
            error: execErr.code,
            details: execErr.details ?? undefined,
          },
          { status: EXECUTION_ERROR_STATUS[execErr.code] ?? 409 }
        );
      }
      throw execErr;
    }
  } catch (err) {
    console.error(
      "Recovery request failed:",
      err instanceof Error ? err.message : err
    );
    return errorResponse(500, "recovery_failed");
  }
}
