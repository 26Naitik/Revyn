import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { diagnoseAll, diagnoseRisk } from "@/lib/engine/diagnose";

/**
 * POST /api/diagnose (Phase 6)
 *
 * Rule-based root-cause diagnosis (the deterministic engine - there is no
 * separate AI diagnosis path in this codebase). With {riskId} diagnoses a
 * single risk; with an empty body diagnoses every undiagnosed risk.
 */
const requestSchema = z
  .object({
    riskId: z.string().min(1).max(64).optional(),
  })
  .strict();

function errorResponse(status: number, error: string, details?: unknown) {
  return NextResponse.json(
    details === undefined ? { error } : { error, details },
    { status }
  );
}

export async function POST(request: Request) {
  // Read the raw body once: an absent body means "diagnose all".
  const text = await request.text().catch(() => "");
  let rawBody: unknown;

  if (text.trim().length === 0) {
    rawBody = {};
  } else {
    try {
      rawBody = JSON.parse(text);
    } catch {
      return errorResponse(400, "invalid_json");
    }
  }

  const parsed = requestSchema.safeParse(rawBody);

  if (!parsed.success) {
    return errorResponse(400, "invalid_request", parsed.error.issues);
  }

  const { riskId } = parsed.data;

  try {
    if (riskId) {
      const exists = await prisma.revenueAtRisk.findUnique({
        where: { id: riskId },
        select: { id: true },
      });
      if (!exists) {
        return errorResponse(404, "risk_not_found");
      }
      const diagnosis = await diagnoseRisk(riskId);
      return NextResponse.json({ ok: true, diagnoses: [diagnosis] });
    }

    const diagnoses = await diagnoseAll();
    return NextResponse.json({
      ok: true,
      diagnosed: { count: diagnoses.length },
      diagnoses,
    });
  } catch (err) {
    console.error(
      "Diagnosis failed:",
      err instanceof Error ? err.message : err
    );
    return errorResponse(500, "diagnosis_failed");
  }
}
