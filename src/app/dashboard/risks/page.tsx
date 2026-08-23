import { Header } from "@/components/layout/Header";
import {
  RisksExplorer,
  type RiskViewRow,
} from "@/components/dashboard/RisksExplorer";
import { ErrorState } from "@/components/ui/states";
import { listRecentRisks, type RiskRow } from "@/lib/dashboard/data";
import {
  formatDateTime,
  formatINR,
  formatRelativeTime,
  labelRiskType,
} from "@/lib/format";

export const dynamic = "force-dynamic";

function severityOf(row: RiskRow): RiskViewRow["severity"] {
  if (row.confidenceScore >= 0.75 || row.amountAtRisk >= 5_000_000) {
    return "high";
  }
  if (row.confidenceScore >= 0.4 || row.amountAtRisk >= 1_000_000) {
    return "medium";
  }
  return "low";
}

function toDecisionInfo(
  decision: RiskRow["decision"]
): RiskViewRow["decision"] {
  if (!decision) return null;
  return {
    recoveryId: decision.recoveryId,
    strategy: decision.strategy,
    workflowStatus: decision.workflowStatus,
    reasoning: decision.reasoning,
    confidencePercent: Math.round(decision.confidence * 100),
    recoveryScore: decision.recoveryScore,
    priority: decision.priority,
    nextStep: decision.nextStep,
    source: decision.source,
    factors: [...decision.factors]
      .sort((a, b) => b.contribution - a.contribution)
      .map((factor) => ({
        label: factor.label,
        contribution: factor.contribution,
        detail: factor.detail,
      })),
  };
}

function toViewRow(row: RiskRow, now: Date): RiskViewRow {
  return {
    id: row.id,
    type: row.type,
    typeLabel: labelRiskType(row.type),
    amountLabel: formatINR(row.amountAtRisk),
    detectedLabel: formatRelativeTime(row.createdAt, now),
    detectedFull: formatDateTime(row.createdAt),
    confidencePercent:
      row.confidenceScore > 0
        ? Math.round(row.confidenceScore * 100)
        : 0,
    status: row.status,
    rootCause: row.rootCause,
    customerName: row.customerName,
    customerEmail: row.customerEmail,
    severity: severityOf(row),
    decision: toDecisionInfo(row.decision),
  };
}

export default async function RisksPage() {
  let rows: RiskRow[];

  try {
    rows = await listRecentRisks(100);
  } catch (err) {
    console.error(
      "Risks page load failed:",
      err instanceof Error ? err.message : err
    );
    return (
      <>
        <Header title="Revenue at Risk" />
        <div className="px-4 py-6 sm:px-6 lg:px-8">
          <ErrorState message="Revyn couldn't reach the recovery database. Check that PostgreSQL is running and DATABASE_URL is configured." />
        </div>
      </>
    );
  }

  const now = new Date();

  return (
    <>
      <Header
        title="Revenue at Risk"
        description="Every detected risk across failed payments, checkouts, subscriptions and receivables."
      />
      <div className="animate-fade-in px-4 pb-10 pt-6 sm:px-6 lg:px-8">
        <RisksExplorer rows={rows.map((row) => toViewRow(row, now))} />
      </div>
    </>
  );
}
