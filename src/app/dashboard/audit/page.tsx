import { Header } from "@/components/layout/Header";
import { ErrorState } from "@/components/ui/states";
import { AuditExplorer } from "@/components/dashboard/AuditExplorer";
import { getRecentActivity } from "@/lib/dashboard/data";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  let rows;
  let failures = 0;

  try {
    rows = await getRecentActivity(200);
    // Data integrity signal: count entries whose underlying operation failed.
    for (const row of rows) {
      if (!["success", "warning"].includes(row.status)) failures += 1;
    }
  } catch (err) {
    console.error(
      "Audit page load failed:",
      err instanceof Error ? err.message : err
    );
    return (
      <>
        <Header title="Audit Trail" />
        <div className="px-4 py-6 sm:px-6 lg:px-8">
          <ErrorState message="Revyn couldn't reach the recovery database. Check that PostgreSQL is running and DATABASE_URL is configured." />
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        title="Audit Trail"
        description="Chronological record of every engine decision, action and webhook - never edited after the fact."
      />
      <div className="animate-fade-in px-4 pb-10 pt-6 sm:px-6 lg:px-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted">
            Showing the {rows.length} most recent entries · newest first · filter
            by event, status, actor, date or case.
          </p>
          {failures > 0 && (
            <p className="text-xs font-medium text-danger">
              {failures} entr{failures === 1 ? "y" : "ies"} recorded a failure -
              no success was claimed for them
            </p>
          )}
        </div>
        <AuditExplorer rows={rows} />
      </div>
    </>
  );
}
