"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/states";
import {
  IconClose,
  IconCreditCard,
  IconDecide,
  IconUsers,
} from "@/components/ui/icons";
import { RetryButton } from "@/components/dashboard/RetryButton";
import { CreatePaymentLinkButton } from "@/components/dashboard/CreatePaymentLinkButton";
import { formatDateTime, formatINR, formatPercent, labelRiskType, labelStrategy } from "@/lib/format";
import type { RecoveryFactor } from "@/lib/types";
import type {
  TimelineEvent,
  TimelineTrustSignals,
} from "@/lib/dashboard/timeline";

interface CaseDetail {
  recoveryId: string;
  riskId: string;
  status: string;
  strategy: string;
  attemptCount: number;
  amountAtRisk: number;
  currency: string;
  amountRecovered: number;
  riskType: string;
  rootCause: string | null;
  riskStatus: string;
  createdAt: string;
  completedAt: string | null;
  nextRetryAt: string | null;
  razorpayActionId: string | null;
  customer: { name: string; email: string } | null;
  decision: {
    reasoning: string;
    confidence: number;
    recoveryScore: number;
    priority: string;
    discountPercent: number;
    retryDelay: string | null;
    nextStep: string | null;
    source: string;
    factors: RecoveryFactor[];
  };
  failure: { reason: string; category: string } | null;
}

interface CaseDetailPayload {
  ok: true;
  case: CaseDetail;
  events: TimelineEvent[];
  trust: TimelineTrustSignals;
}

const KIND_STYLES: Record<TimelineEvent["kind"], { dot: string; label: string }> = {
  lifecycle: { dot: "bg-brand", label: "Lifecycle" },
  decision: { dot: "bg-violet-500", label: "Decision" },
  execution: { dot: "bg-sky-500", label: "Execution" },
  webhook: { dot: "bg-emerald-500", label: "Webhook" },
  guardrail: { dot: "bg-amber-500", label: "Guardrail" },
  system: { dot: "bg-slate-400", label: "System" },
};

function TrustChip({
  tone,
  children,
}: {
  tone: "brand" | "warning" | "danger" | "neutral" | "success";
  children: React.ReactNode;
}) {
  const tones: Record<string, string> = {
    brand: "border-brand/25 bg-brand-soft text-brand-dark",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warning: "border-amber-200 bg-amber-50 text-amber-700",
    danger: "border-danger-soft bg-danger-soft text-danger",
    neutral: "border-line bg-canvas text-muted",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/**
 * Consolidated trust signals derived from real audit events only.
 * Answers: WHO decided (AI vs rules), were guardrails triggered, was
 * webhook traffic duplicated, and how healthy the outcome looks.
 */
function TrustStrip({ trust }: { trust: TimelineTrustSignals }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-5 py-3">
      {trust.decisionSource === "ai" && (
        <TrustChip tone="brand">
          AI-assisted decision
        </TrustChip>
      )}
      {trust.decisionSource === "rules" && (
        <TrustChip tone="neutral">Rule-based decision</TrustChip>
      )}
      {trust.hasSuccessfulOutcome && (
        <TrustChip tone="success">Recovered via link</TrustChip>
      )}
      {trust.maxAttemptNumber !== null && (
        <TrustChip tone="neutral">
          Attempt {trust.maxAttemptNumber}/3
        </TrustChip>
      )}
      {trust.guardrailBlocks > 0 && (
        <TrustChip tone="danger">
          Guardrail blocked ×{trust.guardrailBlocks}
        </TrustChip>
      )}
      {trust.guardrailWarnings > 0 && (
        <TrustChip tone="warning">
          Guardrail warnings ×{trust.guardrailWarnings}
        </TrustChip>
      )}
      {trust.duplicateWebhooksSuppressed > 0 && (
        <TrustChip tone="warning">
          Duplicate webhooks ×{trust.duplicateWebhooksSuppressed}
        </TrustChip>
      )}
      {trust.failedEvents > 0 && (
        <TrustChip tone="danger">Failures ×{trust.failedEvents}</TrustChip>
      )}
      {trust.warningEvents > 0 && trust.failedEvents === 0 && (
        <TrustChip tone="warning">Warnings ×{trust.warningEvents}</TrustChip>
      )}
    </div>
  );
}

function DetailSection({
  question,
  children,
}: {
  question: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-line px-5 py-4 first:border-t-0">
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-faint">
        {question}
      </h4>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Timeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="text-sm leading-5 text-faint">
        No audit events recorded for this case yet.
      </p>
    );
  }

  // Newest first for reading flow; the API returns oldest first (audit order).
  const ordered = [...events].reverse();

  return (
    <ol className="relative flex flex-col gap-4 border-l border-line pl-4">
      {ordered.map((event) => {
        const style = KIND_STYLES[event.kind] ?? KIND_STYLES.system;
        return (
          <li key={event.id} className="relative">
            <span
              className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-surface ${style.dot}`}
              title={style.label}
            />
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <p className="text-[13px] font-semibold text-ink">{event.title}</p>
              <time
                className="text-[11px] tabular-nums text-faint"
                dateTime={event.at}
                title={formatDateTime(new Date(event.at))}
              >
                {formatDateTime(new Date(event.at))}
              </time>
            </div>
            {(event.from || event.to) && (
              <p className="mt-0.5 text-xs text-muted">
                State: {event.from ?? "?"} → <span className="font-medium text-ink">{event.to}</span>
                {event.attemptNumber !== null && (
                  <span className="ml-1.5 text-faint">· attempt {event.attemptNumber}</span>
                )}
              </p>
            )}
            {event.detail && (
              <p className="mt-0.5 text-xs leading-5 text-faint">{event.detail}</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function RecoveryDetailDrawer({
  recoveryId,
  onClose,
}: {
  recoveryId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [data, setData] = useState<CaseDetailPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const res = await fetch(`/api/recover/${recoveryId}/timeline`);
        if (cancelled) return;
        if (!res.ok) {
          setError(
            res.status === 404
              ? "This recovery no longer exists."
              : "Could not load the case."
          );
          return;
        }
        const payload = (await res.json()) as CaseDetailPayload;
        if (!cancelled) {
          setData(payload);
          setError(null);
        }
      } catch {
        if (!cancelled) setError("Could not reach the server.");
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [recoveryId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const detail = data?.case;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-navy/40 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="Recovery case detail"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-line bg-surface shadow-raised"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-line bg-surface px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wider text-faint">
              Case detail
            </p>
            <h3 className="truncate text-[15px] font-semibold text-ink">
              {detail?.customer?.name ?? "Loading…"}
            </h3>
            {detail && (
              <div className="mt-1 flex items-center gap-2">
                <Badge status={detail.status} />
                <span className="text-xs text-muted tabular-nums">
                  {formatINR(detail.amountAtRisk)} at risk
                </span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-canvas hover:text-ink"
            aria-label="Close case detail"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div className="mx-5 mt-4 rounded-lg border border-danger-soft bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        {!data && !error && <LoadingState rows={6} />}

        {data?.trust && <TrustStrip trust={data.trust} />}

        {detail && (
          <>
            <DetailSection question="Who is affected?">
              {detail.customer ? (
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-dark">
                    <IconUsers className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">{detail.customer.name}</p>
                    <p className="truncate text-xs text-muted">{detail.customer.email}</p>
                    <p className="mt-0.5 text-xs text-faint">
                      {labelRiskType(detail.riskType)} · detected{" "}
                      {formatDateTime(new Date(detail.createdAt))}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted">Customer details unavailable.</p>
              )}
            </DetailSection>

            <DetailSection question="What is at risk?">
              <p className="text-2xl font-semibold tracking-tight text-ink tabular-nums">
                {formatINR(detail.amountAtRisk)}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {detail.amountRecovered > 0
                  ? `${formatINR(detail.amountRecovered)} already recovered · `
                  : ""}
                risk status: {detail.riskStatus}
              </p>
            </DetailSection>

            <DetailSection question="Why did it fail?">
              <p className="font-mono text-xs leading-5 text-muted">
                {detail.rootCause ?? "No diagnosis recorded."}
              </p>
            </DetailSection>

            <DetailSection question="What does Revyn think?">
              <div className="rounded-lg border border-line bg-canvas/50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                    <IconDecide className="h-3.5 w-3.5" />
                    {detail.decision.source === "ai"
                      ? "AI-assisted decision"
                      : "Rule-based decision"}
                  </span>
                  <Badge status={undefined}>{labelStrategy(detail.strategy)}</Badge>
                </div>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-md bg-surface px-2 py-1.5">
                    <dt className="text-[10px] uppercase tracking-wide text-faint">Score</dt>
                    <dd className="text-sm font-bold tabular-nums text-ink">
                      {Math.round(detail.decision.recoveryScore)}
                    </dd>
                  </div>
                  <div className="rounded-md bg-surface px-2 py-1.5">
                    <dt className="text-[10px] uppercase tracking-wide text-faint">Confidence</dt>
                    <dd className="text-sm font-bold tabular-nums text-ink">
                      {formatPercent(detail.decision.confidence)}
                    </dd>
                  </div>
                  <div className="rounded-md bg-surface px-2 py-1.5">
                    <dt className="text-[10px] uppercase tracking-wide text-faint">Priority</dt>
                    <dd className="text-sm font-bold capitalize text-ink">
                      {detail.decision.priority}
                    </dd>
                  </div>
                </dl>
                <p className="mt-2 text-xs leading-5 text-muted">
                  {detail.decision.reasoning}
                </p>
                {detail.decision.factors.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1">
                    {detail.decision.factors.slice(0, 4).map((f) => (
                      <li key={f.key} className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-faint">{f.label}</span>
                        <span className="tabular-nums text-muted">
                          {f.detail ?? `+${Math.round(f.contribution)}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {detail.failure && (
                <p className="mt-2 rounded-md border border-danger-soft bg-danger-soft px-3 py-2 text-xs leading-5 text-danger">
                  Last failure ({detail.failure.category}): {detail.failure.reason}
                </p>
              )}
            </DetailSection>

            <DetailSection question="What has happened?">
              <Timeline events={data.events} />
            </DetailSection>

            <DetailSection question="What happens next?">
              <p className="text-sm leading-5 text-muted">
                {detail.decision.nextStep ??
                  (detail.nextRetryAt
                    ? `Automatic retry scheduled for ${formatDateTime(new Date(detail.nextRetryAt))}.`
                    : "No automated step pending - operator action decides the outcome.")}
              </p>
              <p className="mt-1 text-xs text-faint">
                {detail.attemptCount}/3 attempts used
                {detail.completedAt
                  ? ` · closed ${formatDateTime(new Date(detail.completedAt))}`
                  : ""}
              </p>
            </DetailSection>

            <DetailSection question="What can I do?">
              <div className="flex flex-wrap items-center gap-2">
                {detail.status === "pending" &&
                ["send_payment_link", "offer_discount"].includes(detail.strategy) ? (
                  <CreatePaymentLinkButton recoveryId={detail.recoveryId} />
                ) : detail.status === "executing" && detail.razorpayActionId ? (
                  <a
                    href={`https://dashboard.razorpay.com/app/payment-links/${detail.razorpayActionId}`}
                    target="_blank"
                    rel="noreferrer"
                    className={buttonClasses("secondary", "sm")}
                  >
                    <IconCreditCard className="h-3.5 w-3.5" />
                    View payment link
                  </a>
                ) : null}
                {["retry_scheduled", "failed"].includes(detail.status) && (
                  <RetryButton recoveryId={detail.recoveryId} />
                )}
                <button
                  type="button"
                  className={buttonClasses("ghost", "sm")}
                  onClick={() => {
                    onClose();
                    router.refresh();
                  }}
                >
                  Refresh data
                </button>
              </div>
            </DetailSection>
          </>
        )}
      </div>
    </div>
  );
}
