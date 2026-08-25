import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/states";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconCheckCircle,
  IconClock,
  IconUsers,
} from "@/components/ui/icons";
import { formatINRCompact } from "@/lib/format";
import type { AttentionItem } from "@/lib/dashboard/intelligence";

const ACTION_LABELS: Record<AttentionItem["action"], string> = {
  execute: "Execute now",
  retry: "Retry now",
  review: "Review case",
  escalate: "Escalate",
  contact: "Follow up",
};

function attentionHref(
  action: AttentionItem["action"],
  recoveryId: string | null
): string {
  if (action === "review") return "/dashboard/risks";
  const suffix = recoveryId ? `?case=${recoveryId}` : "";
  return `/dashboard/recoveries${suffix}`;
}

function severityTone(severity: number): { ring: string; icon: typeof IconClock; label: string } {
  if (severity >= 90)
    return { ring: "border-danger-soft bg-danger-soft", icon: IconAlertTriangle, label: "Critical" };
  if (severity >= 70)
    return { ring: "border-warning-soft bg-warning-soft", icon: IconAlertTriangle, label: "High" };
  if (severity >= 50)
    return { ring: "border-sky-100 bg-sky-50", icon: IconClock, label: "Medium" };
  return { ring: "border-line bg-canvas", icon: IconUsers, label: "Low" };
}

/**
 * Operator attention queue. Every entry explains what happened, why it
 * matters and what to do next - no page-hopping required.
 */
export function AttentionQueue({ items }: { items: AttentionItem[] }) {
  const criticalCount = items.filter((i) => i.severity >= 90).length;

  return (
    <Card>
      <CardHeader
        title="Needs attention"
        description={
          criticalCount > 0
            ? `${criticalCount} critical case${criticalCount === 1 ? "" : "s"} need a human decision.`
            : "Ranked by severity - the top row deserves your focus first."
        }
        action={
          <span className="flex items-center gap-1.5 rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-semibold text-danger">
            {items.length} open
          </span>
        }
      />
      {items.length === 0 ? (
        <EmptyState
          icon={<IconCheckCircle className="h-5 w-5" />}
          title="Nothing needs your attention"
          hint="Every active recovery is progressing on its own. Revyn will surface cases here the moment they stall."
        />
      ) : (
        <ul className="divide-y divide-line">
          {items.map((item) => {
            const tone = severityTone(item.severity);
            const ToneIcon = tone.icon;
            const href = attentionHref(item.action, item.recoveryId);

            return (
              <li key={item.key} className="px-5 py-4 transition-colors hover:bg-canvas/60">
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${tone.ring}`}
                    title={`Severity: ${tone.label}`}
                  >
                    <ToneIcon className="h-4 w-4 text-muted" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                      <p className="text-[13px] font-semibold text-ink">
                        {item.customerName ?? "Unknown customer"}
                        <span className="ml-2 font-normal tabular-nums text-faint">
                          {formatINRCompact(item.amountAtRisk)}
                        </span>
                      </p>
                      <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-medium text-muted ring-1 ring-inset ring-line">
                        {item.reason}
                      </span>
                    </div>
                    <p className="mt-1 text-[13px] leading-5 text-muted">
                      {item.whatHappened}
                    </p>
                    <p className="mt-0.5 text-xs leading-5 text-faint">
                      {item.whyItMatters}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-medium text-brand-dark">
                        Revyn recommends: {item.recommendation}
                      </p>
                      <Link href={href} className="flex items-center gap-1 text-xs font-semibold text-brand hover:text-brand-dark">
                        {ACTION_LABELS[item.action]}
                        <IconArrowRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
