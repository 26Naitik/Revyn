"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buttonClasses } from "@/components/ui/Button";
import { IconDecide, IconXCircle } from "@/components/ui/icons";
import { labelStrategy } from "@/lib/format";

interface DecisionPayload {
  recoveryScore: number;
  scoreBand?: string;
  strategy: string;
  confidence: number;
  priority: string;
  reasoning: string;
  nextStep: string | null;
  source: string;
}

type DecideState =
  | { phase: "idle" }
  | { phase: "deciding" }
  | { phase: "done"; decision: DecisionPayload }
  | { phase: "error"; message: string };

function humanizeError(code: string): string {
  switch (code) {
    case "risk_not_found":
      return "This risk no longer exists.";
    case "recovery_already_active":
      return "A recovery is already in progress for this case.";
    case "decision_failed":
      return "The decision engine could not process this case.";
    default:
      return "Could not compute a recovery decision.";
  }
}

export function DecideButton({ riskId }: { riskId: string }) {
  const router = useRouter();
  const [state, setState] = useState<DecideState>({ phase: "idle" });
  const [isPending, startTransition] = useTransition();

  async function decide() {
    setState({ phase: "deciding" });

    try {
      const res = await fetch("/api/recover/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ riskId }),
      });
      const body = await res.json().catch(() => null);

      if (!res.ok || !body?.ok || !body?.decision) {
        const reason =
          typeof body?.error === "string"
            ? humanizeError(body.error)
            : "Could not compute a recovery decision.";
        setState({ phase: "error", message: reason });
        return;
      }

      setState({
        phase: "done",
        decision: {
          recoveryScore: body.decision.recoveryScore,
          scoreBand: body.decision.scoreBand,
          strategy: body.decision.strategy,
          confidence: body.decision.confidence,
          priority: body.decision.priority,
          reasoning: body.decision.reasoning,
          nextStep: body.decision.nextStep,
          source: body.decision.source,
        },
      });
      startTransition(() => router.refresh());
    } catch {
      setState({
        phase: "error",
        message: "Could not reach the decision endpoint.",
      });
    }
  }

  if (state.phase === "done") {
    return (
      <div className="flex flex-col items-end gap-1 text-right">
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-brand-soft px-2.5 py-1.5 text-[13px] font-medium text-brand-dark ring-1 ring-inset ring-brand/20">
          <IconDecide className="h-3.5 w-3.5" />
          {labelStrategy(state.decision.strategy)} ·{" "}
          {Math.round(state.decision.recoveryScore)}
        </span>
        <span className="max-w-[220px] text-[11px] leading-4 text-faint">
          {state.decision.source === "ai" ? "AI-reviewed" : "Rule-based"} ·{" "}
          {Math.round(state.decision.confidence * 100)}% confidence
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        className={buttonClasses("secondary", "sm")}
        onClick={decide}
        disabled={state.phase === "deciding" || isPending}
      >
        <IconDecide
          className={`h-3.5 w-3.5 ${state.phase === "deciding" ? "animate-pulse" : ""}`}
        />
        {state.phase === "deciding" || isPending ? "Deciding…" : "Get AI decision"}
      </button>
      {state.phase === "error" && (
        <span
          className="flex max-w-[220px] items-start gap-1 text-xs leading-4 text-danger"
          role="alert"
        >
          <IconXCircle className="mt-px h-3.5 w-3.5 shrink-0" />
          {state.message}
        </span>
      )}
    </div>
  );
}
