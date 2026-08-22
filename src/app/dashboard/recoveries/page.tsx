import { Header } from "@/components/layout/Header";
import { EmptyState, ErrorPanel } from "@/components/dashboard/states";
import { listRecentRecoveries, type RecoveryRow } from "@/lib/dashboard/data";
import {
  formatDateTime,
  formatINR,
  labelStrategy,
  statusBadgeClass,
} from "@/lib/format";

export const dynamic = "force-dynamic";

const RECOVERY_COLUMNS = [
  "Strategy",
  "Amount at risk",
  "Recovered",
  "Status",
  "Razorpay link",
  "Created",
];

function RecoveriesPageTable({ rows }: { rows: RecoveryRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            {RECOVERY_COLUMNS.map((col) => (
              <th key={col} className="px-4 py-3 text-left font-medium text-gray-500">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row) => (
            <tr key={row.recoveryId} className="hover:bg-gray-50">
              <td className="px-4 py-3 text-gray-900">{labelStrategy(row.strategy)}</td>
              <td className="px-4 py-3 text-gray-900">{formatINR(row.amountAtRisk)}</td>
              <td
                className={`px-4 py-3 font-medium ${
                  row.amountRecovered > 0 ? "text-emerald-700" : "text-gray-400"
                }`}
              >
                {formatINR(row.amountRecovered)}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statusBadgeClass(row.status)}`}
                >
                  {row.status}
                </span>
              </td>
              <td className="px-4 py-3 font-mono text-xs text-gray-500">
                {row.razorpayActionId ?? "—"}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                {formatDateTime(row.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
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
        <div className="p-6">
          <ErrorPanel message="Check that PostgreSQL is running and DATABASE_URL is configured, then refresh this page." />
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Recoveries" />
      <div className="p-6">
        {rows.length === 0 ? (
          <EmptyState
            title="No recovery workflows yet"
            hint='Run the detection pipeline on the dashboard. Decided risks appear here and eligible ones can be executed as Razorpay payment links.'
          />
        ) : (
          <RecoveriesPageTable rows={rows} />
        )}
      </div>
    </>
  );
}
