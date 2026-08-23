import { Fragment } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import {
  IconAlertTriangle,
  IconCheckCircle,
  IconDecide,
  IconDiagnose,
  IconRadar,
  IconSend,
} from "@/components/ui/icons";

export interface PipelineCounts {
  detected: number;
  diagnosing: number;
  decided: number;
  recovering: number;
  recovered: number;
}

const STAGE_ICONS = [
  IconRadar,
  IconDiagnose,
  IconDecide,
  IconSend,
  IconCheckCircle,
] as const;

const STAGE_LABELS = [
  "Detected",
  "Diagnosed",
  "Decision",
  "Recovery",
  "Recovered",
] as const;

export function RecoveryPipeline({
  counts,
}: {
  counts: PipelineCounts;
}) {
  const values = [
    counts.detected,
    counts.diagnosing,
    counts.decided,
    counts.recovering,
    counts.recovered,
  ];

  return (
    <Card>
      <CardHeader
        title="Recovery pipeline"
        description="Live count of risks at each stage of the recovery engine."
      />
      <div className="px-5 py-6">
        <ol className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-0">
          {STAGE_LABELS.map((label, i) => {
            const Icon = STAGE_ICONS[i];
            const count = values[i];
            const reached = count > 0 || i === 0;
            return (
              <Fragment key={label}>
                {i > 0 && (
                  <li aria-hidden="true" className="hidden shrink-0 px-1 sm:block">
                    <span
                      className={`block h-px w-8 ${
                        values[i] > 0 ? "bg-brand/50" : "bg-line"
                      }`}
                    />
                  </li>
                )}
                <li className="flex items-center gap-3 sm:min-w-0 sm:flex-1">
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors ${
                      reached
                        ? "border-brand/20 bg-brand-soft text-brand-dark"
                        : "border-line bg-canvas text-faint"
                    }`}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xl font-semibold leading-7 tracking-tight text-ink tabular-nums">
                      {count}
                    </span>
                    <span className="block truncate text-xs leading-4 text-muted">
                      {label}
                    </span>
                  </span>
                </li>
              </Fragment>
            );
          })}
        </ol>
      </div>
      <div className="flex items-center gap-2 border-t border-line bg-canvas/60 px-5 py-3 text-xs text-muted">
        <IconAlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
        <p>
          Every action stays inside guardrails — bounded attempts, cooldowns and
          per-risk limits.
        </p>
      </div>
    </Card>
  );
}
