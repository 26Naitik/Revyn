import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/states";
import { formatINRCompact } from "@/lib/format";
import type { FunnelStage } from "@/lib/dashboard/intelligence";
import { IconArrowRight } from "@/components/ui/icons";

const STAGE_BAR_TONES = [
  "bg-slate-400/70",
  "bg-amber-400/80",
  "bg-orange-400/80",
  "bg-brand/80",
  "bg-sky-500/80",
  "bg-emerald-500/90",
];

/**
 * Detection-to-recovery funnel. Bars scale to the widest stage; the delta
 * chips show real count drop-off between consecutive stages.
 */
export function RecoveryFunnelCard({ stages }: { stages: FunnelStage[] }) {
  const hasAnyCases = stages.some((s) => s.count > 0);
  const maxCount = Math.max(...stages.map((s) => s.count), 1);

  if (!hasAnyCases) {
    return (
      <Card>
        <CardHeader
          title="Recovery funnel"
          description="How revenue moves from failure to recovery."
        />
        <EmptyState
          title="No cases in the funnel yet"
          hint="Once Revyn detects failed payments, each stage of detection, decision and recovery appears here."
        />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Recovery funnel"
        description="Where cases move forward - and where they drop off."
        action={
          <span className="hidden items-center gap-1.5 text-xs text-faint sm:flex">
            <IconArrowRight className="h-3.5 w-3.5" />
            counts drop-off vs previous stage
          </span>
        }
      />
      <ol className="flex flex-col gap-2.5 px-5 py-5">
        {stages.map((stage, i) => {
          const widthPct = Math.max(6, Math.round((stage.count / maxCount) * 100));
          return (
            <li key={stage.key} className="group">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[13px] font-medium text-ink">{stage.label}</p>
                <div className="flex items-baseline gap-2 tabular-nums">
                  {stage.amountPaise !== null && stage.amountPaise > 0 && (
                    <span className="text-xs text-faint">
                      {formatINRCompact(stage.amountPaise)}
                    </span>
                  )}
                  <span className="text-sm font-semibold text-ink">{stage.count}</span>
                </div>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-5 flex-1 overflow-hidden rounded-md bg-canvas">
                  <div
                    className={`h-full rounded-md ${STAGE_BAR_TONES[i % STAGE_BAR_TONES.length]} transition-[width] duration-500`}
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
                {stage.droppedFromPrevious !== null && (
                  <span
                    className={`w-16 shrink-0 text-right text-[11px] font-medium tabular-nums ${
                      stage.droppedFromPrevious > 0 ? "text-danger" : "text-faint"
                    }`}
                    title={
                      stage.droppedFromPrevious > 0
                        ? `${stage.droppedFromPrevious} case(s) did not advance from "${stages[i - 1]?.label}"`
                        : "No drop-off"
                    }
                  >
                    {stage.droppedFromPrevious > 0
                      ? `−${stage.droppedFromPrevious}`
                      : "—"}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
