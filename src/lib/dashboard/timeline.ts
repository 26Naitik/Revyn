import type { ActivityRow } from "@/lib/dashboard/data";

/**
 * Recovery timeline mapping (Phase 3).
 *
 * Converts real AuditLog rows into an ordered timeline. Events are NEVER
 * fabricated: rows that cannot be parsed still render with their raw action,
 * so the timeline always reflects the audit trail 1:1.
 */

export interface TimelineDecisionMeta {
  strategy: string | null;
  recoveryScore: number | null;
  confidence: number | null;
  /** "ai" | "rules" - derived exactly as the engine labelled it. */
  source: "ai" | "rules" | null;
  priority: string | null;
  nextStep: string | null;
}

export interface TimelineEvent {
  id: string;
  /** ISO timestamp of the underlying audit row. */
  at: string;
  /** Short human title, e.g. "Payment link created". */
  title: string;
  /** Optional longer explanation (failure reasons, escalation notes). */
  detail: string | null;
  from: string | null;
  to: string | null;
  attemptNumber: number | null;
  actor: string;
  kind: "lifecycle" | "decision" | "execution" | "webhook" | "guardrail" | "system";
  status: "success" | "warning" | "failure";
  /**
   * Explainability payload present only on decision events, extracted from
   * what decide.ts actually persisted. Never synthesised.
   */
  decision?: TimelineDecisionMeta;
}

const EVENT_TITLES: Record<string, string> = {
  risk_detected: "Risk detected",
  diagnosis_completed: "Diagnosis completed",
  decision_generated: "Recovery decision generated",
  execution_started: "Execution started",
  payment_link_created: "Payment link created",
  payment_link_paid: "Customer paid via link",
  payment_link_expired: "Payment link expired",
  execution_failed_retry_scheduled: "Retry scheduled after failure",
  execution_failed_permanent: "Failed permanently",
  execution_failed_exhausted: "Retry limit exhausted",
  recovery_cancelled: "Recovery cancelled",
  recovery_escalated: "Escalated to operator",
};

function titleFor(details: Record<string, unknown>, action: string): string {
  const event = typeof details.event === "string" ? details.event : null;

  if (event && EVENT_TITLES[event]) return EVENT_TITLES[event];

  switch (action) {
    case "detect":
      return "Risk detected";
    case "diagnose":
      return "Diagnosis completed";
    case "decide":
      return "Recovery decision generated";
    case "recover":
      if (details.kind === "duplicate_suppressed") {
        return "Duplicate webhook suppressed";
      }
      return "Execution updated";
    case "webhook":
      return event === "payment_link.paid"
        ? "Customer paid via link"
        : "Webhook received";
    case "guardrail_block":
      return "Guardrail blocked action";
    case "guardrail_warn":
      return "Guardrail warning";
    default:
      return "System event";
  }
}

function kindFor(action: string, actor: string): TimelineEvent["kind"] {
  if (actor === "razorpay_webhook") return "webhook";
  switch (action) {
    case "decide":
      return "decision";
    case "recover":
      return "execution";
    case "guardrail_block":
    case "guardrail_warn":
      return "guardrail";
    default:
      return "system";
  }
}

function decisionMetaFor(details: Record<string, unknown>): TimelineDecisionMeta | undefined {
  const hasAny =
    "strategy" in details ||
    "recoveryScore" in details ||
    "confidence" in details;
  if (!hasAny) return undefined;

  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;

  return {
    strategy: typeof details.strategy === "string" ? details.strategy : null,
    recoveryScore: num(details.recoveryScore),
    confidence: num(details.confidence),
    source: details.source === "ai" ? "ai" : details.source === "rules" ? "rules" : null,
    priority: typeof details.priority === "string" ? details.priority : null,
    nextStep: typeof details.nextStep === "string" ? details.nextStep : null,
  };
}

/**
 * Orders audit rows oldest-first and maps them to display events.
 * Accepts the shared ActivityRow shape so it composes with dashboard/data.ts.
 */
export function buildRecoveryTimeline(rows: ActivityRow[]): TimelineEvent[] {
  const ordered = [...rows].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );

  return ordered.map((row) => {
    const details = row.details ?? {};

    const detail =
      typeof details.reason === "string"
        ? details.reason
        : typeof details.reasoning === "string"
          ? (details.reasoning as string)
          : row.action === "guardrail_block" || row.action === "guardrail_warn"
            ? "Guardrail policy triggered"
            : null;

    const attemptRaw = details.attemptNumber ?? details.attemptCount;
    const attemptNumber =
      typeof attemptRaw === "number" && Number.isFinite(attemptRaw)
        ? attemptRaw
        : null;

    return {
      id: row.id,
      at: row.createdAt.toISOString(),
      title: titleFor(details, row.action),
      detail,
      from: typeof details.from === "string" ? (details.from as string) : null,
      to: typeof details.to === "string" ? (details.to as string) : null,
      attemptNumber,
      actor: row.actor,
      kind: kindFor(row.action, row.actor),
      status:
        row.status === "success" || row.status === "warning"
          ? row.status
          : ("failure" as const),
      ...(row.action === "decide"
        ? { decision: decisionMetaFor(details) }
        : {}),
    } satisfies TimelineEvent;
  });
}

/* ------------------------------------------------------------------ */
/* Trust signals (Phase 4)                                             */
/* ------------------------------------------------------------------ */

export interface TimelineTrustSignals {
  /** Decision provenance of the latest decide event, if any. */
  decisionSource: "ai" | "rules" | null;
  guardrailBlocks: number;
  guardrailWarnings: number;
  duplicateWebhooksSuppressed: number;
  failedEvents: number;
  warningEvents: number;
  maxAttemptNumber: number | null;
  hasSuccessfulOutcome: boolean;
}

/**
 * Aggregates trust indicators straight from mapped timeline events - no
 * extra queries. Operators see guardrail pressure, duplicate webhook noise
 * and outcome health at a glance.
 */
export function extractTrustSignals(events: TimelineEvent[]): TimelineTrustSignals {
  let decisionSource: TimelineTrustSignals["decisionSource"] = null;
  let guardrailBlocks = 0;
  let guardrailWarnings = 0;
  let duplicateWebhooksSuppressed = 0;
  let failedEvents = 0;
  let warningEvents = 0;
  let maxAttemptNumber: number | null = null;
  let hasSuccessfulOutcome = false;

  for (const event of events) {
    if (event.kind === "decision" && event.decision?.source) {
      // Later decide events override earlier ones (re-decisions).
      decisionSource = event.decision.source;
    }
    if (event.kind === "guardrail") {
      if (event.title === "Guardrail blocked action") guardrailBlocks += 1;
      else guardrailWarnings += 1;
    }
    if (event.title === "Duplicate webhook suppressed") {
      duplicateWebhooksSuppressed += 1;
    }
    if (event.status === "failure") failedEvents += 1;
    if (event.status === "warning") warningEvents += 1;
    if (
      event.attemptNumber !== null &&
      (maxAttemptNumber === null || event.attemptNumber > maxAttemptNumber)
    ) {
      maxAttemptNumber = event.attemptNumber;
    }
    if (event.title === "Customer paid via link") hasSuccessfulOutcome = true;
  }

  return {
    decisionSource,
    guardrailBlocks,
    guardrailWarnings,
    duplicateWebhooksSuppressed,
    failedEvents,
    warningEvents,
    maxAttemptNumber,
    hasSuccessfulOutcome,
  };
}
