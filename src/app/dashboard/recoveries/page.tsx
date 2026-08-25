import { Header } from "@/components/layout/Header";
import {
  RecoveriesExplorer,
  type RecoveryViewRow,
} from "@/components/dashboard/RecoveriesExplorer";
import { ErrorState } from "@/components/ui/states";
import { listRecentRecoveries, type RecoveryRow } from "@/lib/dashboard/data";
import { formatDateTime, formatINR, formatRelativeTime, labelStrategy } from "@/lib/format";
import { RETRY_POLICY } from "@/lib/recovery/retry-policy";

export const dynamic = "force-dynamic";

const FAILURE_CATEGORY_LABELS: Record<string, string> = {
  temporary: "temporary failure",
  permanent: "permanent failure",
};

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
    attemptCount: row.attemptCount,
    maxAttempts: RETRY_POLICY.maxAttempts,
    lastAttemptLabel:
      row.lastAttemptAt !== null
        ? formatRelativeTime(row.lastAttemptAt, now)
        : null,
    lastAttemptFull:
      row.lastAttemptAt !== null ? formatDateTime(row.lastAttemptAt) : null,
    nextRetryLabel:
      row.nextRetryAt !== null
        ? formatRelativeTime(row.nextRetryAt, now)
        : null,
    nextRetryFull:
      row.nextRetryAt !== null ? formatDateTime(row.nextRetryAt) : null,
    nextRetryAtRaw: row.nextRetryAt?.toISOString() ?? null,
    amountAtRiskRaw: row.amountAtRisk,
    failureReason: row.lastFailureReason,
    failureCategoryLabel: row.lastFailureCategory
      ? FAILURE_CATEGORY_LABELS[row.lastFailureCategory] ?? row.lastFailureCategory
      : null,
    retryable: canRetry(row, now),
  };
}

function canRetry(row: RecoveryRow, now: Date): boolean {
  if (row.attemptCount >= RETRY_POLICY.maxAttempts) return false;
  if (!["pending", "retry_scheduled", "failed"].includes(row.status)) return false;
  // Scheduled retries surface as retryable once their back-off has elapsed.
  if (
    row.status === "retry_scheduled" &&
    row.nextRetryAt &&
    row.nextRetryAt.getTime() > now.getTime()
  ) {
    return false;
  }
  return true;
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
