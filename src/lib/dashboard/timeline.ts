import type { ActivityRow } from "@/lib/dashboard/data";

/**
 * Recovery timeline mapping (Phase 3).
 *
 * Converts real AuditLog rows into an ordered timeline. Events are NEVER
 * fabricated: rows that cannot be parsed still render with their raw action,
 * so the timeline always reflects the audit trail 1:1.
 */

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
    const event =
      typeof details.event === "string" ? details.event : null;

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
      status: row.status === "success" || row.status === "warning" ? row.status : "failure",
    } satisfies TimelineEvent;
  });
}
