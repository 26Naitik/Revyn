import { CreatePaymentLinkButton } from "@/components/dashboard/CreatePaymentLinkButton";
import { isPaymentLinkEligible, type RecoveryRow } from "@/lib/dashboard/data";
import { Badge } from "@/components/ui/Badge";
import {
  TableShell,
  Td,
  Th,
  Tr,
} from "@/components/ui/Table";
import { formatINR, labelRiskType, labelStrategy } from "@/lib/format";
import { EmptyState } from "@/components/ui/states";
import { IconSend } from "@/components/ui/icons";

export function RecoveriesTable({ rows }: { rows: RecoveryRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line-strong bg-surface">
        <EmptyState
          icon={<IconSend className="h-5 w-5" />}
          title="No recovery workflows yet"
          hint="Run a recovery scan to find revenue at risk. Decided risks appear here and eligible ones can be executed as Razorpay payment links."
        />
      </div>
    );
  }

  return (
    <TableShell minWidth={860}>
      <thead>
        <tr>
          <Th>Type</Th>
          <Th>Root cause</Th>
          <Th>Strategy</Th>
          <Th>Amount</Th>
          <Th>Status</Th>
          <Th align="right">Action</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const eligible = isPaymentLinkEligible(row);

          return (
            <Tr key={row.recoveryId}>
              <Td className="font-medium text-ink">
                {labelRiskType(row.riskType)}
              </Td>
              <Td className="max-w-[220px] truncate font-mono text-xs text-muted" title={row.rootCause ?? undefined}>
                {row.rootCause ?? "—"}
              </Td>
              <Td>
                <span className="inline-flex items-center gap-1.5 text-muted">
                  {labelStrategy(row.strategy)}
                  {row.strategy === "escalate_human" && (
                    <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700 ring-1 ring-inset ring-violet-600/20">
                      manual
                    </span>
                  )}
                </span>
              </Td>
              <Td className="font-semibold text-ink tabular-nums">
                {formatINR(row.amountAtRisk)}
              </Td>
              <Td>
                <Badge status={row.status} />
              </Td>
              <Td align="right">
                {eligible ? (
                  <CreatePaymentLinkButton recoveryId={row.recoveryId} />
                ) : row.status === "executing" && row.razorpayActionId ? (
                  <span
                    className="text-xs text-faint"
                    title={row.razorpayActionId}
                  >
                    Awaiting payment…
                  </span>
                ) : row.status === "succeeded" ? (
                  <span className="text-xs font-medium text-brand-dark">
                    {formatINR(row.amountRecovered)} recovered
                  </span>
                ) : (
                  <span className="text-xs text-faint">—</span>
                )}
              </Td>
            </Tr>
          );
        })}
      </tbody>
    </TableShell>
  );
}
