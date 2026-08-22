import { CreatePaymentLinkButton } from "@/components/dashboard/CreatePaymentLinkButton";
import { isPaymentLinkEligible, type RecoveryRow } from "@/lib/dashboard/data";
import {
  formatINR,
  labelRiskType,
  labelStrategy,
  statusBadgeClass,
} from "@/lib/format";

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statusBadgeClass(status)}`}
    >
      {status}
    </span>
  );
}

export function RecoveriesTable({ rows }: { rows: RecoveryRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center">
        <p className="text-sm font-medium text-gray-900">No recoveries yet</p>
        <p className="mt-1 text-sm text-gray-500">
          Run the detection pipeline to find revenue at risk. Eligible risks
          will get a decided recovery strategy here.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Type</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Root cause</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Strategy</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Amount</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
            <th className="px-4 py-3 text-right font-medium text-gray-500">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row) => {
            const eligible = isPaymentLinkEligible(row);

            return (
              <tr key={row.recoveryId} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-900">
                  {labelRiskType(row.riskType)}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-gray-500">
                  {row.rootCause ?? "—"}
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {labelStrategy(row.strategy)}
                  {row.strategy === "escalate_human" && (
                    <span className="ml-2 inline-flex items-center rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700 ring-1 ring-inset ring-purple-600/20">
                      manual
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 font-medium text-gray-900">
                  {formatINR(row.amountAtRisk)}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={row.status} />
                </td>
                <td className="px-4 py-3 text-right">
                  {eligible ? (
                    <CreatePaymentLinkButton recoveryId={row.recoveryId} />
                  ) : row.status === "executing" && row.razorpayActionId ? (
                    <span className="text-xs text-gray-400" title={row.razorpayActionId}>
                      Awaiting payment…
                    </span>
                  ) : row.status === "succeeded" ? (
                    <span className="text-xs text-emerald-600">
                      {formatINR(row.amountRecovered)} recovered
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
