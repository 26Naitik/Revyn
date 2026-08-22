"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface PipelineSummary {
  detected: number;
  diagnosed: number;
  decided: number;
  totalAtRiskPaise: number;
}

type RunState =
  | { phase: "idle" }
  | { phase: "running" }
  | { phase: "done"; summary: PipelineSummary }
  | { phase: "error"; message: string };

export function RunPipelineButton() {
  const router = useRouter();
  const [state, setState] = useState<RunState>({ phase: "idle" });
  const [isPending, startTransition] = useTransition();

  async function runPipeline() {
    setState({ phase: "running" });

    try {
      const res = await fetch("/api/pipeline", { method: "POST" });
      const body = await res.json().catch(() => null);

      if (!res.ok || !body?.ok) {
        setState({
          phase: "error",
          message: "Pipeline failed. Check server logs and try again.",
        });
        return;
      }

      const summary: PipelineSummary = {
        detected: body.detected?.risksFound ?? 0,
        diagnosed: body.diagnosed?.count ?? 0,
        decided: body.decided?.count ?? 0,
        totalAtRiskPaise: body.measured?.totalAtRisk ?? 0,
      };
      setState({ phase: "done", summary });
      startTransition(() => router.refresh());
    } catch {
      setState({
        phase: "error",
        message: "Could not reach the pipeline endpoint.",
      });
    }
  }

  return (
    <div className="flex items-center gap-3">
      {state.phase === "running" && (
        <span className="text-sm text-gray-500">Scanning for revenue at risk…</span>
      )}
      {state.phase === "done" && (
        <span
          className="text-sm text-emerald-700"
          role="status"
        >
          Detected {state.summary.detected} · diagnosed{" "}
          {state.summary.diagnosed} · decided {state.summary.decided}
        </span>
      )}
      {state.phase === "error" && (
        <span className="text-sm text-red-600" role="alert">
          {state.message}
        </span>
      )}
      <button
        type="button"
        onClick={runPipeline}
        disabled={state.phase === "running" || isPending}
        className="inline-flex items-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-emerald-300"
      >
        {state.phase === "running" || isPending ? "Running…" : "Run detection pipeline"}
      </button>
    </div>
  );
}
