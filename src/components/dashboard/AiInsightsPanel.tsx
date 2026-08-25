import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/states";
import { IconBolt, IconDecide, IconShieldCheck } from "@/components/ui/icons";
import { formatPercent, labelStrategy } from "@/lib/format";
import type { IntelligenceStats } from "@/lib/dashboard/intelligence";

const SOURCE_LABELS: Record<string, string> = {
  ai: "AI-assisted",
  rules: "Rule-based engine",
};

/**
 * Honest decision-quality panel. Reports what exists (counts, average
 * confidence/score per source) and only shows outcome rates when the sample
 * size makes them meaningful. No invented accuracy claims.
 */
export function AiInsightsPanel({ aiStats }: { aiStats: IntelligenceStats }) {
  if (aiStats.totalDecisions === 0) {
    return (
      <Card className="h-full">
        <CardHeader
          title="Decision intelligence"
          description="How Revyn decides - and how confident it is."
        />
        <EmptyState
          icon={<IconDecide className="h-5 w-5" />}
          title="No decisions recorded yet"
          hint="Run the pipeline to generate recovery decisions."
        />
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader
        title="Decision intelligence"
        description={`${aiStats.totalDecisions} decision${aiStats.totalDecisions === 1 ? "" : "s"} made · labelled exactly as produced`}
        action={
          <span className="flex items-center gap-1.5 text-xs text-faint">
            <IconShieldCheck className="h-3.5 w-3.5" />
            explainable scoring
          </span>
        }
      />
      <div className="flex flex-col gap-4 px-5 py-5">
        {aiStats.sources.map((source) => (
          <div
            key={source.source}
            className="rounded-lg border border-line bg-canvas/50 px-4 py-3"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                {source.source === "ai" ? (
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-soft text-brand-dark">
                    <IconBolt className="h-3.5 w-3.5" />
                  </span>
                ) : (
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-slate-600">
                    <IconDecide className="h-3.5 w-3.5" />
                  </span>
                )}
                {SOURCE_LABELS[source.source] ?? source.source}
              </p>
              <span className="text-xs font-medium tabular-nums text-muted">
                {source.decisions} decision{source.decisions === 1 ? "" : "s"}
              </span>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <div className="flex justify-between">
                <dt className="text-faint">Avg confidence</dt>
                <dd className="font-semibold tabular-nums text-ink">
                  {formatPercent(source.avgConfidence)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-faint">Avg recovery score</dt>
                <dd className="font-semibold tabular-nums text-ink">
                  {Math.round(source.avgRecoveryScore)}
                </dd>
              </div>
            </dl>
          </div>
        ))}

        {aiStats.hasOutcomeData ? (
          <section aria-label="Recovery outcome by strategy">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">
              Outcome by strategy (min. 3 settled cases)
            </h4>
            <ul className="flex flex-col gap-1.5">
              {aiStats.outcomeByStrategy.map((outcome) => (
                <li
                  key={outcome.strategy}
                  className="flex items-center justify-between rounded-md border border-line px-3 py-2 text-xs"
                >
                  <span className="font-medium text-ink">
                    {labelStrategy(outcome.strategy)}
                  </span>
                  <span className="tabular-nums text-muted">
                    {outcome.succeeded}/{outcome.terminalCases} recovered
                    <span className="ml-2 font-semibold text-ink">
                      {formatPercent(outcome.successRate)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <p className="rounded-md border border-dashed border-line px-3 py-2 text-xs leading-5 text-faint">
            Strategy success rates appear once at least 3 workflows of a strategy reach a final outcome.
          </p>
        )}
      </div>
    </Card>
  );
}
