"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buttonClasses } from "@/components/ui/Button";
import { IconRefresh } from "@/components/ui/icons";

type RetryState = "idle" | "retrying" | "error";

function humanizeError(code: string): string {
  switch (code) {
    case "recovery_not_found":
      return "Recovery no longer exists.";
    case "recovery_not_executable":
      return "This recovery cannot be retried in its current state.";
    case "retry_limit_reached":
      return "Retry limit reached - escalate instead.";
    case "guardrail_blocked":
      return "Blocked by a safety guardrail.";
    case "duplicate_claim":
      return "Another action is already running.";
    case "payment_link_creation_failed":
      return "Provider error - failure recorded, retry later.";
    default:
      return "Retry failed.";
  }
}

export function RetryButton({ recoveryId }: { recoveryId: string }) {
  const router = useRouter();
  const [state, setState] = useState<RetryState>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function retry() {
    setState("retrying");
    setMessage(null);

    try {
      const res = await fetch(`/api/recover/${recoveryId}/retry`, {
        method: "POST",
      });
      const body = await res.json().catch(() => null);

      if (!res.ok || !body?.ok) {
        setState("error");
        setMessage(
          typeof body?.error === "string"
            ? humanizeError(body.error)
            : "Retry failed."
        );
        return;
      }

      setState("idle");
      router.refresh();
    } catch {
      setState("error");
      setMessage("Could not reach the retry endpoint.");
    }
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        className={buttonClasses("ghost", "sm")}
        onClick={retry}
        disabled={state === "retrying"}
      >
        <IconRefresh
          className={`h-3.5 w-3.5 ${state === "retrying" ? "animate-spin" : ""}`}
        />
        {state === "retrying" ? "Retrying…" : "Retry now"}
      </button>
      {state === "error" && message && (
        <span className="max-w-[200px] text-right text-[11px] leading-4 text-danger">
          {message}
        </span>
      )}
    </div>
  );
}
