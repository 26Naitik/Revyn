import type { ActivityRow } from "@/lib/dashboard/data";

const ACTION_LABELS: Record<string, string> = {
  detect: "Detected",
  diagnose: "Diagnosed",
  decide: "Decided",
  recover: "Recovery action",
  measure: "Measured",
  guardrail_block: "Guardrail block",
  guardrail_warn: "Guardrail warning",
  webhook: "Razorpay webhook",
  error: "Error",
};

const ACTION_STYLES: Record<string, string> = {
  detect: "bg-amber-500",
  diagnose: "bg-blue-500",
  decide: "bg-indigo-500",
  recover: "bg-emerald-500",
  measure: "bg-gray-400",
  guardrail_block: "bg-red-500",
  guardrail_warn: "bg-orange-400",
  webhook: "bg-emerald-600",
  error: "bg-red-600",
};

function describeActivity(row: ActivityRow): string {
  const d = row.details;
  switch (row.action) {
    case "detect":
      return `Found revenue at risk via ${String(d.source ?? "scan")}`;
    case "diagnose":
      return `Root cause: ${String(d.rootCause ?? "unknown")} (confidence ${String(
        d.confidence ?? "?"
      )})`;
    case "decide":
      return `Strategy: ${String(d.strategy ?? "?")}`;
    case "recover":
      return row.status === "failure"
        ? `Failed: ${String(d.failureReason ?? "unknown reason")}`
        : `Payment link ${String(d.paymentLinkId ?? "created")}`;
    case "webhook":
      return `payment_link.paid confirmed · ₹${(
        Number(d.amountRecorded ?? 0) / 100
      ).toLocaleString("en-IN")}`;
    case "guardrail_block":
      return String(d.reason ?? "Action blocked by guardrail");
    default:
      return "";
  }
}

export function RecentActivity({ rows }: { rows: ActivityRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
        <p className="text-sm text-gray-500">
          No activity yet. Run the detection pipeline to get started.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white shadow-sm">
      {rows.map((row) => (
        <li key={row.id} className="flex items-start gap-3 px-4 py-3">
          <span
            className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
              ACTION_STYLES[row.action] ?? "bg-gray-400"
            }`}
          />
          <div className="min-w-0">
            <p className="text-sm text-gray-900">
              <span className="font-medium">{ACTION_LABELS[row.action] ?? row.action}</span>
              <span className="ml-2 text-xs text-gray-400">{row.actor}</span>
              {row.status !== "success" && (
                <span
                  className={`ml-2 text-xs font-medium ${
                    row.status === "warning" ? "text-amber-600" : "text-red-600"
                  }`}
                >
                  {row.status}
                </span>
              )}
            </p>
            {describeActivity(row) && (
              <p className="truncate text-xs text-gray-500">{describeActivity(row)}</p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
