"use client";

import { useMemo, useState } from "react";
import { CreatePaymentLinkButton } from "@/components/dashboard/CreatePaymentLinkButton";
import { Badge } from "@/components/ui/Badge";
import {
  TableShell,
  Td,
  Th,
  Tr,
} from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/states";
import { buttonClasses } from "@/components/ui/Button";
import { IconSearch, IconSend } from "@/components/ui/icons";
import { isPaymentLinkEligible } from "@/lib/recovery-eligibility";

export interface RecoveryViewRow {
  recoveryId: string;
  strategy: string;
  strategyLabel: string;
  amountLabel: string;
  recoveredLabel: string | null;
  status: string;
  createdLabel: string;
  createdFull: string;
  customerName: string | null;
  customerEmail: string | null;
}

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "executing", label: "Executing" },
  { key: "succeeded", label: "Succeeded" },
  { key: "failed", label: "Failed" },
  { key: "cancelled", label: "Cancelled" },
] as const;

export function RecoveriesExplorer({
  rows,
}: {
  rows: RecoveryViewRow[];
}) {
  const [filter, setFilter] = useState<string>("all");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(row.status, (map.get(row.status) ?? 0) + 1);
    }
    return map;
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter !== "all" && row.status !== filter) return false;
      if (!q) return true;
      return (
        row.customerName?.toLowerCase().includes(q) ||
        row.customerEmail?.toLowerCase().includes(q) ||
        row.strategyLabel.toLowerCase().includes(q) ||
        row.status.toLowerCase().includes(q)
      );
    });
  }, [rows, filter, query]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div
          role="tablist"
          aria-label="Filter by status"
          className="flex flex-wrap items-center gap-1"
        >
          {STATUS_FILTERS.map((f) => {
            const active = filter === f.key;
            const count =
              f.key === "all" ? rows.length : (counts.get(f.key) ?? 0);
            return (
              <button
                key={f.key}
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(f.key)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
                  active
                    ? "bg-navy text-white"
                    : "text-muted hover:bg-surface hover:text-ink"
                }`}
              >
                {f.label}
                <span
                  className={`rounded-full px-1.5 text-[11px] tabular-nums ${
                    active
                      ? "bg-white/15 text-white"
                      : "bg-line/70 text-muted"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <label className="relative block lg:w-72">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search customer or strategy…"
            className="h-9 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-[13px] text-ink placeholder:text-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
        </label>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong bg-surface">
          <EmptyState
            icon={<IconSend className="h-5 w-5" />}
            title="No recovery workflows yet"
            hint="Run a recovery scan to find revenue at risk. Decided risks appear here and eligible ones can be executed as Razorpay payment links."
          />
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong bg-surface">
          <EmptyState
            title="No matching recoveries"
            hint="Try a different status filter or clear the search query."
            action={
              <button
                className={buttonClasses("secondary", "sm")}
                onClick={() => {
                  setFilter("all");
                  setQuery("");
                }}
              >
                Clear filters
              </button>
            }
          />
        </div>
      ) : (
        <TableShell minWidth={960}>
          <thead>
            <tr>
              <Th>Customer</Th>
              <Th>Strategy</Th>
              <Th>Amount</Th>
              <Th>Status</Th>
              <Th>Created</Th>
              <Th align="right">Action</Th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <Tr key={row.recoveryId}>
                <Td>
                  {row.customerName ? (
                    <>
                      <p className="font-medium leading-5 text-ink">
                        {row.customerName}
                      </p>
                      <p className="truncate text-xs leading-4 text-faint">
                        {row.customerEmail}
                      </p>
                    </>
                  ) : (
                    <span className="text-xs text-faint">Unlinked</span>
                  )}
                </Td>
                <Td>
                  <span className="inline-flex items-center gap-1.5 text-muted">
                    {row.strategyLabel}
                    {row.strategy === "escalate_human" && (
                      <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700 ring-1 ring-inset ring-violet-600/20">
                        manual
                      </span>
                    )}
                  </span>
                </Td>
                <Td className="font-semibold text-ink tabular-nums">
                  {row.amountLabel}
                  {row.recoveredLabel ? (
                    <span className="mt-0.5 block text-[11px] font-medium leading-4 text-brand-dark tabular-nums">
                      {row.recoveredLabel} recovered
                    </span>
                  ) : null}
                </Td>
                <Td>
                  <Badge status={row.status} />
                </Td>
                <Td
                  className="whitespace-nowrap text-[13px] text-muted"
                  title={row.createdFull}
                >
                  {row.createdLabel}
                </Td>
                <Td align="right">
                  {isPaymentLinkEligible(row) ? (
                    <CreatePaymentLinkButton recoveryId={row.recoveryId} />
                  ) : row.status === "executing" ? (
                    <span className="text-xs text-faint">Awaiting payment…</span>
                  ) : row.status === "succeeded" ? (
                    <span className="text-xs font-medium text-brand-dark">
                      Completed
                    </span>
                  ) : (
                    <span className="text-xs text-faint">—</span>
                  )}
                </Td>
              </Tr>
            ))}
          </tbody>
        </TableShell>
      )}

      {rows.length > 0 && visible.length > 0 && (
        <p className="text-xs text-faint">
          Showing {visible.length} of {rows.length} recovery workflows.
        </p>
      )}
    </div>
  );
}
