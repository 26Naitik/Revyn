"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface CreatedLink {
  linkId: string;
  shortUrl: string;
  amount: number;
  referenceId: string;
}

type LinkState =
  | { phase: "idle" }
  | { phase: "creating" }
  | { phase: "created"; link: CreatedLink }
  | { phase: "error"; message: string };

export function CreatePaymentLinkButton({ recoveryId }: { recoveryId: string }) {
  const router = useRouter();
  const [state, setState] = useState<LinkState>({ phase: "idle" });
  const [isPending, startTransition] = useTransition();

  async function createLink() {
    setState({ phase: "creating" });

    try {
      const res = await fetch("/api/recover/payment-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recoveryId }),
      });
      const body = await res.json().catch(() => null);

      if (!res.ok) {
        const reason =
          typeof body?.error === "string"
            ? humanizeError(body.error)
            : "Payment link creation failed.";
        setState({ phase: "error", message: reason });
        return;
      }

      setState({
        phase: "created",
        link: {
          linkId: body.linkId,
          shortUrl: body.shortUrl,
          amount: body.amount,
          referenceId: body.referenceId,
        },
      });
      startTransition(() => router.refresh());
    } catch {
      setState({
        phase: "error",
        message: "Could not reach the recovery endpoint.",
      });
    }
  }

  if (state.phase === "created") {
    return (
      <div className="flex flex-col items-start gap-1">
        <a
          href={state.link.shortUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded-md bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20 hover:bg-emerald-100"
        >
          Open payment link ↗
        </a>
        <span className="font-mono text-xs text-gray-400">
          {state.link.linkId}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={createLink}
        disabled={state.phase === "creating" || isPending}
        className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-emerald-300"
      >
        {state.phase === "creating" || isPending ? "Creating…" : "Create payment link"}
      </button>
      {state.phase === "error" && (
        <span className="max-w-[220px] text-xs text-red-600" role="alert">
          {state.message}
        </span>
      )}
    </div>
  );
}

function humanizeError(code: string): string {
  switch (code) {
    case "recovery_not_found":
      return "Recovery no longer exists.";
    case "strategy_not_payment_link_eligible":
      return "This strategy cannot be executed as a payment link.";
    case "recovery_not_pending":
      return "Recovery is no longer pending.";
    case "amount_below_guardrail_minimum":
      return "Amount is below the guardrail minimum (₹10).";
    case "customer_not_resolvable":
      return "No customer record linked to this recovery.";
    case "payment_link_creation_failed":
      return "Razorpay rejected the request. Check credentials and try again.";
    default:
      return "Payment link creation failed.";
  }
}
