import { NextResponse } from "next/server";
import {
  RecoveryExecutionError,
  executeRecoveryPaymentLink,
} from "@/lib/recovery/execute";

const ERROR_STATUS_BY_CODE: Record<string, number> = {
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
  recovery_execution_failed: 500,
};

function errorResponse(status: number, error: string, details?: unknown) {
  return NextResponse.json(
    details === undefined ? { error } : { error, details },
    { status }
  );
}

/**
 * Manual retry of a recovery workflow. Operators may re-execute failed
 * workflows immediately (guardrails still apply); the retry policy caps
 * total attempts either way.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  if (!id || id.length > 64) {
    return errorResponse(400, "invalid_request");
  }

  try {
    const result = await executeRecoveryPaymentLink(id, { manual: true });

    return NextResponse.json({
      ok: true,
      recoveryId: result.recoveryId,
      status: result.status,
      attemptCount: result.attemptCount,
      paymentLink: result.paymentLink,
    });
  } catch (err) {
    if (err instanceof RecoveryExecutionError) {
      const status = ERROR_STATUS_BY_CODE[err.code] ?? 500;
      return errorResponse(status, err.code, err.details);
    }

    console.error(
      "Unexpected manual retry failure:",
      err instanceof Error ? err.message : err
    );
    return errorResponse(500, "recovery_execution_failed");
  }
}
