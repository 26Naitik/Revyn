"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import {
  IconArrowUpRight,
  IconSend,
  IconXCircle,
} from "@/components/ui/icons";

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
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-soft px-2.5 py-1.5 text-[13px] font-medium text-brand-dark ring-1 ring-inset ring-brand/20 transition-colors hover:bg-green-100"
        >
          Open payment link
          <IconArrowUpRight className="h-3.5 w-3.5" />
        </a>
        <span className="max-w-[160px] truncate font-mono text-[11px] text-faint">
          {state.link.linkId}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        size="sm"
        onClick={createLink}
        disabled={state.phase === "creating" || isPending}
      >
        <IconSend
          className={`h-3.5 w-3.5 ${state.phase === "creating" ? "animate-pulse" : ""}`}
        />
        {state.phase === "creating" || isPending ? "Creating…" : "Create payment link"}
      </Button>
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
