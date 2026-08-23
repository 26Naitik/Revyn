import type { ActivityRow } from "@/lib/dashboard/data";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/states";
import { formatRelativeTime } from "@/lib/format";
import { IconActivity } from "@/components/ui/icons";

const ACTION_LABELS: Record<string, string> = {
  detect: "Risk detected",
  diagnose: "Diagnosis completed",
  decide: "Recovery strategy selected",
  recover: "Recovery action",
  measure: "Measured",
  guardrail_block: "Guardrail triggered",
  guardrail_warn: "Guardrail warning",
  webhook: "Razorpay webhook",
  error: "Error",
};

const DOT_COLORS: Record<string, string> = {
  detect: "bg-warning",
  diagnose: "bg-sky-500",
  decide: "bg-indigo-500",
  recover: "bg-brand",
  measure: "bg-faint",
  guardrail_block: "bg-danger",
  guardrail_warn: "bg-orange-400",
  webhook: "bg-brand-dark",
  error: "bg-red-600",
};

const ACTOR_LABELS: Record<string, string> = {
  system: "System",
  ai_agent: "AI agent",
  razorpay_webhook: "Razorpay",
  user: "Operator",
};

function describeActivity(row: ActivityRow): string {
  const d = row.details;
  switch (row.action) {
    case "detect":
      return `Found revenue at risk via ${String(d.source ?? "scan")}`;
    case "diagnose":
      return `Root cause: ${String(d.rootCause ?? "unknown")} (confidence ${String(
        d.confidence ?? "?"
      )})`;
    case "decide":
      return `Strategy: ${String(d.strategy ?? "?")}`;
    case "recover":
      return row.status === "failure"
        ? `Failed: ${String(d.failureReason ?? "unknown reason")}`
        : `Payment link ${String(d.paymentLinkId ?? "created")}`;
    case "webhook":
      return `payment_link.paid confirmed · ₹${(
        Number(d.amountRecorded ?? 0) / 100
      ).toLocaleString("en-IN")}`;
    case "guardrail_block":
      return String(d.reason ?? "Action blocked by guardrail");
    default:
      return "";
  }
}

export function ActivityTimeline({
  rows,
  className = "",
}: {
  rows: ActivityRow[];
  className?: string;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<IconActivity className="h-5 w-5" />}
        title="No recovery activity yet"
        hint="Run a recovery scan to identify revenue at risk. Engine events will appear here."
      />
    );
  }

  return (
    <ol className={`relative ${className}`}>
      <span
        aria-hidden="true"
        className="absolute bottom-3 left-[7px] top-3 w-px bg-line"
      />
      {rows.map((row) => (
        <li key={row.id} className="relative flex gap-4 py-3 pl-8 pr-1">
          <span
            aria-hidden="true"
            className={`absolute left-0 top-[17px] h-[15px] w-[15px] rounded-full border-[3px] border-surface ${
              DOT_COLORS[row.action] ?? "bg-faint"
            }`}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-[13px] font-semibold text-ink">
                {ACTION_LABELS[row.action] ?? row.action}
              </p>
              <span className="rounded-full border border-line bg-canvas px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-faint">
                {ACTOR_LABELS[row.actor] ?? row.actor}
              </span>
              {row.status !== "success" && (
                <span
                  className={`text-[11px] font-medium ${
                    row.status === "warning" ? "text-warning" : "text-danger"
                  }`}
                >
                  {row.status}
                </span>
              )}
            </div>
            {describeActivity(row) && (
              <p className="mt-0.5 truncate text-[13px] leading-5 text-muted">
                {describeActivity(row)}
              </p>
            )}
          </div>
          <time className="shrink-0 pt-0.5 text-[11px] leading-5 text-faint">
            {formatRelativeTime(row.createdAt)}
          </time>
        </li>
      ))}
    </ol>
  );
}

export function RecentActivityCard({ rows }: { rows: ActivityRow[] }) {
  return (
    <Card>
      <CardHeader
        title="Recent activity"
        description="Engine events from the last runs, newest first."
      />
      <div className="px-5 py-2">
        <ActivityTimeline rows={rows} />
      </div>
    </Card>
  );
}
