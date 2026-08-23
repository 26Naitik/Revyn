"use client";

import { useEffect } from "react";
import { IconClose } from "@/components/ui/icons";

export interface DecisionFactorView {
  label: string;
  contribution: number;
  detail: string;
}

export interface DecisionDetailView {
  strategyLabel: string;
  reasoning: string;
  confidencePercent: number;
  recoveryScore: number;
  priority: string;
  nextStep: string | null;
  source: string;
  factors: DecisionFactorView[];
}

const PRIORITY_CLASSES: Record<string, string> = {
  critical: "bg-red-50 text-red-700 ring-red-600/20",
  high: "bg-amber-50 text-amber-700 ring-amber-600/20",
  medium: "bg-blue-50 text-blue-700 ring-blue-600/20",
  low: "bg-gray-100 text-gray-600 ring-gray-500/20",
};

function factorBarClass(contribution: number): string {
  if (contribution >= 18) return "bg-brand";
  if (contribution >= 10) return "bg-warning";
  return "bg-line-strong";
}

export function DecisionDrawer({
  title,
  subtitle,
  decision,
  onClose,
}: {
  title: string;
  subtitle: string;
  decision: DecisionDetailView;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const topFactors = [...decision.factors]
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 6);

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <button
        aria-label="Close decision details"
        className="absolute inset-0 h-full w-full cursor-default bg-navy/30 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col overflow-y-auto border-l border-line bg-surface shadow-xl">
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">
              AI Recovery Decision
            </p>
            <h2 className="mt-1 text-base font-semibold leading-6 text-ink">
              {title}
            </h2>
            <p className="mt-0.5 text-xs leading-4 text-muted">{subtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-canvas hover:text-ink"
            aria-label="Close"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-5 px-5 py-5">
          {/* Score summary */}
          <section className="rounded-xl border border-line bg-canvas px-4 py-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-faint">
                  Recovery score
                </p>
                <p className="mt-1 text-3xl font-semibold leading-none text-ink tabular-nums">
                  {Math.round(decision.recoveryScore)}
                  <span className="ml-1 text-sm font-normal text-faint">/100</span>
                </p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                    PRIORITY_CLASSES[decision.priority] ?? PRIORITY_CLASSES.low
                  }`}
                >
                  {decision.priority} priority
                </span>
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 ring-1 ring-inset ring-indigo-600/20">
                  {decision.source === "ai" ? "AI-reviewed" : "Rule-based"}
                </span>
              </div>
            </div>

            <p className="mt-3 text-sm font-medium text-ink">
              Recommended action: {decision.strategyLabel}
            </p>

            <div className="mt-3">
              <div className="flex items-center justify-between text-[11px] text-muted">
                <span>Confidence</span>
                <span className="tabular-nums">{decision.confidencePercent}%</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface ring-1 ring-inset ring-line">
                <div
                  className="h-full rounded-full bg-brand"
                  style={{ width: `${Math.min(100, decision.confidencePercent)}%` }}
                />
              </div>
            </div>
          </section>

          {/* Why */}
          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-faint">
              Why this action
            </h3>
            <p className="mt-2 text-[13px] leading-5 text-muted">
              {decision.reasoning}
            </p>
          </section>

          {/* Factors */}
          {topFactors.length > 0 && (
            <section>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-faint">
                Key contributing factors
              </h3>
              <ul className="mt-2 space-y-2.5">
                {topFactors.map((factor) => (
                  <li key={factor.label}>
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="font-medium text-ink">{factor.label}</span>
                      <span className="text-muted tabular-nums">
                        +{factor.contribution.toFixed(1)} pts
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-canvas ring-1 ring-inset ring-line">
                      <div
                        className={`h-full rounded-full ${factorBarClass(factor.contribution)}`}
                        style={{
                          width: `${Math.min(100, (factor.contribution / 25) * 100)}%`,
                        }}
                      />
                    </div>
                    <p className="mt-0.5 text-xs leading-4 text-faint">
                      {factor.detail}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Next step */}
          {decision.nextStep && (
            <section className="rounded-xl border border-dashed border-line-strong bg-brand-soft/50 px-4 py-3.5">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-brand-dark">
                Suggested next step
              </h3>
              <p className="mt-1.5 text-[13px] leading-5 text-ink">
                {decision.nextStep}
              </p>
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}
