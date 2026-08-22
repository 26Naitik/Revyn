import { NextResponse } from "next/server";
import { measureStats } from "@/lib/engine/measure";

export async function GET() {
  try {
    const stats = await measureStats();
    return NextResponse.json({ ok: true, stats });
  } catch (err) {
    console.error(
      "Failed to load recovery statistics:",
      err instanceof Error ? err.message : err
    );
    return NextResponse.json(
      { ok: false, error: "stats_unavailable" },
      { status: 500 }
    );
  }
}
