"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import {
  IconBolt,
  IconCheckCircle,
  IconXCircle,
} from "@/components/ui/icons";

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

export function RunPipelineButton({ size = "md" }: { size?: "sm" | "md" }) {
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

  const running = state.phase === "running" || isPending;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      {state.phase === "running" && (
        <span className="flex items-center gap-1.5 text-[13px] text-muted">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-line border-t-brand" />
          Scanning for revenue at risk…
        </span>
      )}
      {state.phase === "done" && (
        <span className="flex items-center gap-1.5 text-[13px] text-brand-dark" role="status">
          <IconCheckCircle className="h-3.5 w-3.5 shrink-0" />
          Detected {state.summary.detected} · diagnosed{" "}
          {state.summary.diagnosed} · decided {state.summary.decided}
        </span>
      )}
      {state.phase === "error" && (
        <span
          className="flex items-center gap-1.5 text-[13px] text-danger"
          role="alert"
        >
          <IconXCircle className="h-3.5 w-3.5 shrink-0" />
          {state.message}
        </span>
      )}
      <Button onClick={runPipeline} disabled={running} size={size}>
        <IconBolt className={`h-4 w-4 ${running ? "animate-pulse" : ""}`} />
        {running ? "Running…" : "Run Recovery Scan"}
      </Button>
    </div>
  );
}
