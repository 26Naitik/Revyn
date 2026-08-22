import { NextResponse } from "next/server";
import { runFullPipeline } from "@/lib/engine/orchestrator";

export async function POST() {
  try {
    const result = await runFullPipeline();

    return NextResponse.json({
      ok: true,
      detected: result.detected,
      diagnosed: result.diagnosed,
      decided: result.decided,
      measured: result.measured,
    });
  } catch (err) {
    console.error(
      "Recovery pipeline failed:",
      err instanceof Error ? err.message : err
    );
    return NextResponse.json(
      { ok: false, error: "pipeline_failed" },
      { status: 500 }
    );
  }
}
