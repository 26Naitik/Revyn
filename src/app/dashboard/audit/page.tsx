import { Header } from "@/components/layout/Header";
import { ErrorState } from "@/components/ui/states";
import { TableShell, Td, Th, Tr } from "@/components/ui/Table";
import { getRecentActivity, type ActivityRow } from "@/lib/dashboard/data";
import { formatDateTime, formatRelativeTime, shortRef } from "@/lib/format";

export const dynamic = "force-dynamic";

const EVENT_LABELS: Record<string, string> = {
  detect: "Risk detected",
  diagnose: "Diagnosis completed",
  decide: "Recovery strategy selected",
  recover: "Recovery action executed",
  measure: "Recovery measured",
  guardrail_block: "Guardrail triggered",
  guardrail_warn: "Guardrail warning",
  webhook: "Razorpay webhook",
  error: "System error",
};

const EVENT_DOT_CLASSES: Record<string, string> = {
  detect: "bg-warning",
  diagnose: "bg-sky-500",
  decide: "bg-indigo-500",
  recover: "bg-brand",
  measure: "bg-faint",
  guardrail_block: "bg-danger",
  guardrail_warn: "bg-orange-400",
  webhook: "bg-brand-dark",
  error: "bg-red-600",
};

const ACTOR_LABELS: Record<string, string> = {
  system: "system",
  ai_agent: "ai_agent",
  razorpay_webhook: "razorpay_webhook",
  user: "operator",
};

function entityOf(row: ActivityRow): string {
  const d = row.details;
  const candidate =
    d.recoveryId ??
    d.riskId ??
    d.paymentLinkId ??
    d.linkId ??
    null;
  return typeof candidate === "string" && candidate
    ? shortRef(candidate)
    : "—";
}

function AuditTable({ rows }: { rows: ActivityRow[] }) {
  const now = new Date();

  return (
    <TableShell minWidth={880}>
      <thead>
        <tr>
          <Th>Time</Th>
          <Th>Event</Th>
          <Th>Entity</Th>
          <Th>Actor</Th>
          <Th>Details</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <Tr key={row.id}>
            <Td className="whitespace-nowrap">
              <p className="text-[13px] font-medium leading-5 text-ink">
                {formatRelativeTime(row.createdAt, now)}
              </p>
              <p className="text-[11px] leading-4 text-faint">
                {formatDateTime(row.createdAt)}
              </p>
            </Td>
            <Td>
              <span className="flex items-center gap-2 font-medium text-ink">
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    EVENT_DOT_CLASSES[row.action] ?? "bg-faint"
                  }`}
                />
                {EVENT_LABELS[row.action] ?? row.action}
              </span>
              {row.status !== "success" && (
                <span
                  className={`mt-0.5 block text-[11px] font-medium ${
                    row.status === "warning" ? "text-warning" : "text-danger"
                  }`}
                >
                  {row.status}
                </span>
              )}
            </Td>
            <Td className="font-mono text-xs text-muted">{entityOf(row)}</Td>
            <Td>
              <span className="rounded-md border border-line bg-canvas px-1.5 py-0.5 font-mono text-[11px] text-muted">
                {ACTOR_LABELS[row.actor] ?? row.actor}
              </span>
            </Td>
            <Td className="max-w-[420px]">
              <p
                className="truncate font-mono text-[11px] leading-5 text-muted"
                title={JSON.stringify(row.details)}
              >
                {JSON.stringify(row.details)}
              </p>
            </Td>
          </Tr>
        ))}
      </tbody>
    </TableShell>
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
        <div className="px-4 py-6 sm:px-6 lg:px-8">
          <ErrorState message="Revyn couldn't reach the recovery database. Check that PostgreSQL is running and DATABASE_URL is configured." />
        </div>
      </>
    );
  }

  const failures = rows.filter((r) => r.status !== "success").length;

  return (
    <>
      <Header
        title="Audit Trail"
        description="Immutable record of every engine decision, action and webhook."
      />
      <div className="animate-fade-in px-4 pb-10 pt-6 sm:px-6 lg:px-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted">
            Showing the {rows.length} most recent entries · newest first
          </p>
          {failures > 0 && (
            <p className="text-xs text-danger">
              {failures} entr{failures === 1 ? "y" : "ies"} need attention
            </p>
          )}
        </div>
        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
            <p className="text-[15px] font-semibold text-ink">
              No audit entries yet
            </p>
            <p className="mx-auto mt-1 max-w-sm text-[13px] leading-5 text-muted">
              Every detect, diagnose, decide, recover, guardrail and webhook
              event is recorded here with a full trail.
            </p>
          </div>
        ) : (
          <AuditTable rows={rows} />
        )}
      </div>
    </>
  );
}
