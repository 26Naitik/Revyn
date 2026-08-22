import { Header } from "@/components/layout/Header";
import { EmptyState, ErrorPanel } from "@/components/dashboard/states";
import { listRecentRisks, type RiskRow } from "@/lib/dashboard/data";
import { formatINR, formatDateTime, labelRiskType } from "@/lib/format";
import { statusBadgeClass } from "@/lib/format";

export const dynamic = "force-dynamic";

const RISK_COLUMNS = ["Type", "Amount", "Status", "Root cause", "Confidence", "Detected"];

function RisksTable({ rows }: { rows: RiskRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            {RISK_COLUMNS.map((col) => (
              <th key={col} className="px-4 py-3 text-left font-medium text-gray-500">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 text-gray-900">{labelRiskType(row.type)}</td>
              <td className="px-4 py-3 font-medium text-gray-900">
                {formatINR(row.amountAtRisk)}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statusBadgeClass(row.status)}`}
                >
                  {row.status}
                </span>
              </td>
              <td className="px-4 py-3 font-mono text-xs text-gray-500">
                {row.rootCause ?? "—"}
              </td>
              <td className="px-4 py-3 text-gray-600">
                {row.confidenceScore > 0 ? `${Math.round(row.confidenceScore * 100)}%` : "—"}
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
        <div className="p-6">
          <ErrorPanel message="Check that PostgreSQL is running and DATABASE_URL is configured, then refresh this page." />
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Revenue at Risk" />
      <div className="p-6">
        {rows.length === 0 ? (
          <EmptyState
            title="No revenue at risk detected yet"
            hint='Use the "Run detection pipeline" button on the dashboard to scan for failed payments, abandoned checkouts, failed subscriptions and overdue receivables.'
          />
        ) : (
          <RisksTable rows={rows} />
        )}
      </div>
    </>
  );
}
