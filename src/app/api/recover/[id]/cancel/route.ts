import { NextResponse } from "next/server";
import { RecoveryExecutionError } from "@/lib/recovery/execute";
import { cancelRecovery } from "@/lib/recovery/actions";

function errorResponse(status: number, error: string, details?: unknown) {
  return NextResponse.json(
    details === undefined ? { error } : { error, details },
    { status }
  );
}

const ERROR_STATUS_BY_CODE: Record<string, number> = {
  recovery_not_found: 404,
  recovery_not_executable: 409,
  duplicate_claim: 409,
  recovery_execution_failed: 500,
};

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  if (!id || id.length > 64) {
    return errorResponse(400, "invalid_request");
  }

  try {
    const result = await cancelRecovery(id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof RecoveryExecutionError) {
      return errorResponse(ERROR_STATUS_BY_CODE[err.code] ?? 500, err.code, err.details);
    }
    console.error("Cancel failed:", err instanceof Error ? err.message : err);
    return errorResponse(500, "recovery_execution_failed");
  }
}
