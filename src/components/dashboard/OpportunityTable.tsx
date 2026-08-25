import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import {
  TableShell,
  Td,
  Th,
  Tr,
} from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/states";
import { buttonClasses } from "@/components/ui/Button";
import {
  IconArrowUpRight,
  IconBolt,
  IconGauge,
} from "@/components/ui/icons";
import { formatINRCompact, formatPercent, labelRiskType } from "@/lib/format";
import type { OpportunityItem } from "@/lib/dashboard/intelligence";

function scoreTone(score: number): string {
  if (score >= 60) return "bg-emerald-50 text-emerald-700 ring-emerald-600/20";
  if (score >= 35) return "bg-amber-50 text-amber-700 ring-amber-600/20";
  return "bg-gray-100 text-gray-600 ring-gray-500/20";
}

/**
 * Ranked by explainable Opportunity Score = value × likelihood × urgency.
 * Expected value = amount × recovery score - a deterministic estimate, not an ML prediction.
 */
export function OpportunityTable({
  opportunities,
}: {
  opportunities: OpportunityItem[];
}) {
  return (
    <Card>
      <CardHeader
        title="Biggest recovery opportunities"
        description="Opportunity Score = value × recovery likelihood × urgency (explainable, no black box)."
        action={
          <span className="flex items-center gap-1.5 text-xs text-faint">
            <IconBolt className="h-3.5 w-3.5" />
            expected value is score-weighted
          </span>
        }
      />
      {opportunities.length === 0 ? (
        <EmptyState
          icon={<IconGauge className="h-5 w-5" />}
          title="No open opportunities right now"
          hint="Active recoveries with meaningful value and healthy scores will be ranked here."
        />
      ) : (
        <TableShell minWidth={760}>
          <thead>
            <tr>
              <Th>Case</Th>
              <Th>Amount</Th>
              <Th>Score</Th>
              <Th>Expected value</Th>
              <Th>Recommended action</Th>
              <Th align="right">Open</Th>
            </tr>
          </thead>
          <tbody>
            {opportunities.map((op) => (
              <Tr key={op.recoveryId}>
                <Td>
                  <p className="font-medium text-ink">
                    {op.customerName ?? labelRiskType(op.riskType)}
                  </p>
                  <p className="text-xs text-faint">
                    {labelRiskType(op.riskType)} · {op.strategy.replace(/_/g, " ")}
                  </p>
                </Td>
                <Td className="font-semibold text-ink tabular-nums">
                  {formatINRCompact(op.amountAtRisk)}
                </Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset tabular-nums ${scoreTone(
                        op.opportunityScore
                      )}`}
                    >
                      {op.opportunityScore}
                    </span>
                    <span className="text-[11px] text-faint tabular-nums">
                      {Math.round(op.recoveryScore)} rec ·{" "}
                      {formatPercent(op.confidence)} conf · {op.urgencyLabel}
                    </span>
                  </div>
                </Td>
                <Td className="font-medium text-brand-dark tabular-nums">
                  {formatINRCompact(op.expectedValuePaise)}
                </Td>
                <Td>
                  <Badge status={undefined}>{op.recommendedAction}</Badge>
                </Td>
                <Td align="right">
                  <Link
                    href={`/dashboard/recoveries?case=${op.recoveryId}`}
                    className={buttonClasses("ghost", "sm")}
                  >
                    Review
                    <IconArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </Td>
              </Tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </Card>
  );
}
