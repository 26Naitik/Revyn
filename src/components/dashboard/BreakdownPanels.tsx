import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/states";
import { labelStrategy } from "@/lib/format";
import type { BreakdownBucket, IntelWorkflow } from "@/lib/dashboard/intelligence";

function BucketBars({
  buckets,
  total,
  formatLabel,
}: {
  buckets: BreakdownBucket[];
  total: number;
  formatLabel?: (bucket: BreakdownBucket) => string;
}) {
  const max = Math.max(...buckets.map((b) => b.count), 1);

  return (
    <ul className="flex flex-col gap-2.5">
      {buckets.map((bucket) => (
        <li key={bucket.key}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[13px] text-ink">
              {formatLabel ? formatLabel(bucket) : bucket.label}
            </span>
            <span className="shrink-0 text-[13px] font-semibold tabular-nums text-ink">
              {bucket.count}
              <span className="ml-1.5 text-[11px] font-normal text-faint">
                {total > 0 ? `${Math.round((bucket.count / total) * 100)}%` : ""}
              </span>
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-canvas">
            <div
              className="h-full rounded-full bg-brand/70"
              style={{ width: `${Math.max(2, Math.round((bucket.count / max) * 100))}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Real distribution breakdowns over the same workflow rows that power the
 * KPIs - one query, three lenses.
 */
export function BreakdownPanels({
  byStatus,
  byStrategy,
  byFailureCategory,
  byScoreBand,
  workflows,
}: {
  byStatus: BreakdownBucket[];
  byStrategy: BreakdownBucket[];
  byFailureCategory: BreakdownBucket[];
  byScoreBand: BreakdownBucket[];
  workflows: IntelWorkflow[];
}) {
  const total = workflows.length;

  if (total === 0) {
    return (
      <Card>
        <CardHeader
          title="Recovery breakdown"
          description="Where workflows sit across status, strategy and failure type."
        />
        <EmptyState
          title="No workflows to break down yet"
          hint="Status, strategy, failure-type and score-band distributions appear as recovery workflows are created."
        />
      </Card>
    );
  }

  const hasFailures = byFailureCategory.some((b) => b.count > 0);

  return (
    <Card>
      <CardHeader
        title="Recovery breakdown"
        description={`${total} workflow${total === 1 ? "" : "s"} across all states.`}
      />
      <div className="grid grid-cols-1 gap-6 px-5 py-5 sm:grid-cols-2 xl:grid-cols-4">
        <section aria-label="Breakdown by status">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-faint">
            By status
          </h4>
          <BucketBars buckets={byStatus} total={total} />
        </section>
        <section aria-label="Breakdown by strategy">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-faint">
            By strategy
          </h4>
          {byStrategy.length > 0 ? (
            <BucketBars
              buckets={byStrategy}
              total={total}
              formatLabel={(b) => labelStrategy(b.key)}
            />
          ) : (
            <p className="text-sm text-faint">—</p>
          )}
        </section>
        <section aria-label="Breakdown by failure category">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-faint">
            Failure type
          </h4>
          {hasFailures ? (
            <BucketBars buckets={byFailureCategory} total={total} />
          ) : (
            <p className="text-sm leading-5 text-faint">
              No failed attempts recorded yet - temporary vs permanent splits appear once failures happen.
            </p>
          )}
        </section>
        <section aria-label="Breakdown by recovery score band">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-faint">
            By score band
          </h4>
          <BucketBars buckets={byScoreBand} total={total} />
        </section>
      </div>
    </Card>
  );
}
