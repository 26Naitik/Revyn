import { Header } from "@/components/layout/Header";
import {
  RecoveriesExplorer,
  type RecoveryViewRow,
} from "@/components/dashboard/RecoveriesExplorer";
import { ErrorState } from "@/components/ui/states";
import { listRecentRecoveries, type RecoveryRow } from "@/lib/dashboard/data";
import { formatDateTime, formatINR, formatRelativeTime, labelStrategy } from "@/lib/format";

export const dynamic = "force-dynamic";

function toViewRow(row: RecoveryRow, now: Date): RecoveryViewRow {
  return {
    recoveryId: row.recoveryId,
    strategy: row.strategy,
    strategyLabel: labelStrategy(row.strategy),
    amountLabel: formatINR(row.amountAtRisk),
    recoveredLabel: row.amountRecovered > 0 ? formatINR(row.amountRecovered) : null,
    status: row.status,
    createdLabel: formatRelativeTime(row.createdAt, now),
    createdFull: formatDateTime(row.createdAt),
    customerName: row.customerName,
    customerEmail: row.customerEmail,
  };
}

export default async function RecoveriesPage() {
  let rows: RecoveryRow[];

  try {
    rows = await listRecentRecoveries(100);
  } catch (err) {
    console.error(
      "Recoveries page load failed:",
      err instanceof Error ? err.message : err
    );
    return (
      <>
        <Header title="Recoveries" />
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
        title="Recoveries"
        description="Every decided recovery strategy and whether it's been resolved."
      />
      <div className="animate-fade-in px-4 pb-10 pt-6 sm:px-6 lg:px-8">
        <RecoveriesExplorer rows={rows.map((row) => toViewRow(row, now))} />
      </div>
    </>
  );
}
