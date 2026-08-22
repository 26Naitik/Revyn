import { Header } from "@/components/layout/Header";
import { EmptyState, ErrorPanel } from "@/components/dashboard/states";
import { getRecentActivity, type ActivityRow } from "@/lib/dashboard/data";
import { formatDateTime, statusBadgeClass } from "@/lib/format";

export const dynamic = "force-dynamic";

const AUDIT_COLUMNS = ["Action", "Actor", "Status", "Details", "When"];

function AuditTable({ rows }: { rows: ActivityRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            {AUDIT_COLUMNS.map((col) => (
              <th key={col} className="px-4 py-3 text-left font-medium text-gray-500">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-900">{row.action}</td>
              <td className="px-4 py-3 text-gray-600">{row.actor}</td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statusBadgeClass(row.status === "success" ? "succeeded" : row.status)}`}
                >
                  {row.status}
                </span>
              </td>
              <td className="max-w-[420px] truncate px-4 py-3 font-mono text-xs text-gray-500">
                {JSON.stringify(row.details)}
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

export default async function AuditPage() {
  let rows: ActivityRow[];

  try {
    rows = await getRecentActivity(100);
  } catch (err) {
    console.error(
      "Audit page load failed:",
      err instanceof Error ? err.message : err
    );
    return (
      <>
        <Header title="Audit Trail" />
        <div className="p-6">
          <ErrorPanel message="Check that PostgreSQL is running and DATABASE_URL is configured, then refresh this page." />
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Audit Trail" />
      <div className="p-6">
        {rows.length === 0 ? (
          <EmptyState
            title="No audit entries yet"
            hint="Every detect, diagnose, decide, recover, guardrail and webhook event is recorded here with a full trail."
          />
        ) : (
          <>
            <p className="mb-3 text-xs text-gray-500">
              Showing the {rows.length} most recent entries (newest first).
            </p>
            <AuditTable rows={rows} />
          </>
        )}
      </div>
    </>
  );
}
