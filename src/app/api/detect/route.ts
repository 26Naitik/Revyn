import { NextResponse } from "next/server";
import { detectAll } from "@/lib/engine/detect";

/**
 * POST /api/detect (Phase 6)
 *
 * Runs one detection scan across failed payments, abandoned checkouts,
 * failed subscriptions and overdue receivables. Read-only scan: creates
 * RevenueAtRisk rows but never decides or executes anything.
 */
export async function POST() {
  try {
    const result = await detectAll();

    return NextResponse.json({
      ok: true,
      detected: {
        risksFound: result.risksFound,
        totalAtRisk: result.totalAtRisk,
        items: result.items.map((item) => ({
          id: item.id,
          type: item.type,
          amountAtRisk: item.amountAtRisk,
          customerName: item.customerName,
        })),
      },
    });
  } catch (err) {
    console.error(
      "Detection scan failed:",
      err instanceof Error ? err.message : err
    );
    return NextResponse.json(
      { ok: false, error: "detection_failed" },
      { status: 500 }
    );
  }
}
