"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import {
  TableShell,
  Td,
  Th,
  Tr,
} from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/states";
import { buttonClasses } from "@/components/ui/Button";
import {
  IconAlertTriangle,
  IconSearch,
} from "@/components/ui/icons";
import { labelStrategy } from "@/lib/format";
import { DecideButton } from "@/components/dashboard/DecideButton";
import {
  DecisionDrawer,
  type DecisionDetailView,
} from "@/components/dashboard/DecisionDrawer";

export interface RiskDecisionInfo {
  recoveryId: string;
  strategy: string;
  workflowStatus: string;
  reasoning: string;
  confidencePercent: number;
  recoveryScore: number;
  priority: string;
  nextStep: string | null;
  source: string;
  factors: Array<{
    label: string;
    contribution: number;
    detail: string;
  }>;
}

export interface RiskViewRow {
  id: string;
  type: string;
  typeLabel: string;
  amountLabel: string;
  detectedLabel: string;
  detectedFull: string;
  confidencePercent: number;
  status: string;
  rootCause: string | null;
  customerName: string | null;
  customerEmail: string | null;
  severity: "high" | "medium" | "low";
  decision: RiskDecisionInfo | null;
}

function scoreChipClass(score: number): string {
  if (score >= 70) return "bg-brand-soft text-brand-dark ring-brand/20";
  if (score >= 40) return "bg-amber-50 text-amber-700 ring-amber-600/20";
  return "bg-red-50 text-red-700 ring-red-600/20";
}

const FILTERS = [
  { key: "all", label: "All" },
  { key: "failed_payment", label: "Failed Payments" },
  { key: "abandoned_checkout", label: "Abandoned Checkouts" },
  { key: "failed_subscription", label: "Subscriptions" },
  { key: "overdue_receivable", label: "Receivables" },
] as const;

function SeverityDot({ level }: { level: "high" | "medium" | "low" }) {
  const color =
    level === "high"
      ? "bg-danger"
      : level === "medium"
        ? "bg-warning"
        : "bg-line-strong";
  return (
    <span
      aria-label={`${level} severity`}
      className={`h-1.5 w-1.5 shrink-0 rounded-full ${color}`}
    />
  );
}

export function RisksExplorer({ rows }: { rows: RiskViewRow[] }) {
  const [filter, setFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [drawerRiskId, setDrawerRiskId] = useState<string | null>(null);

  const drawerRow = useMemo(
    () => rows.find((row) => row.id === drawerRiskId && row.decision) ?? null,
    [rows, drawerRiskId]
  );

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(row.type, (map.get(row.type) ?? 0) + 1);
    }
    return map;
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter !== "all" && row.type !== filter) return false;
      if (!q) return true;
      return (
        row.customerName?.toLowerCase().includes(q) ||
        row.customerEmail?.toLowerCase().includes(q) ||
        row.typeLabel.toLowerCase().includes(q) ||
        row.rootCause?.toLowerCase().includes(q) ||
        row.status.toLowerCase().includes(q)
      );
    });
  }, [rows, filter, query]);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div
          role="tablist"
          aria-label="Filter by risk type"
          className="flex flex-wrap items-center gap-1"
        >
          {FILTERS.map((f) => {
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
            placeholder="Search customer, cause, status…"
            className="h-9 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-[13px] text-ink placeholder:text-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
        </label>
      </div>

      {/* Table */}
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong bg-surface">
          <EmptyState
            icon={<IconAlertTriangle className="h-5 w-5" />}
            title="No recovery activity yet"
            hint="Run a recovery scan to identify revenue at risk."
          />
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong bg-surface">
          <EmptyState
            title="No matching risks"
            hint="Try a different filter or clear the search query."
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
              <Th>Risk</Th>
              <Th>Amount</Th>
              <Th>Detected</Th>
              <Th>Confidence</Th>
              <Th>Status</Th>
              <Th align="right">Action</Th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <Tr
                key={row.id}
                onClick={row.decision ? () => setDrawerRiskId(row.id) : undefined}
              >
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
                    <span className="flex items-center gap-2 font-medium text-ink">
                      <SeverityDot level={row.severity} />
                      {row.typeLabel}
                    </span>
                  </Td>
                  <Td className="font-semibold text-ink tabular-nums">
                    {row.amountLabel}
                  </Td>
                  <Td
                    className="whitespace-nowrap text-[13px] text-muted"
                    title={row.detectedFull}
                  >
                    {row.detectedLabel}
                  </Td>
                  <Td>
                    {row.confidencePercent > 0 ? (
                      <span className="flex items-center gap-2">
                        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-canvas ring-1 ring-inset ring-line">
                          <span
                            className={`block h-full rounded-full ${
                              row.severity === "high"
                                ? "bg-brand"
                                : row.severity === "medium"
                                  ? "bg-warning"
                                  : "bg-line-strong"
                            }`}
                            style={{ width: `${row.confidencePercent}%` }}
                          />
                        </span>
                        <span className="text-xs text-muted tabular-nums">
                          {row.confidencePercent}%
                        </span>
                      </span>
                    ) : (
                      <span className="text-xs text-faint">—</span>
                    )}
                  </Td>
                  <Td>
                    <Badge status={row.status} />
                  </Td>
                  <Td align="right">
                    {row.decision ? (
                      <div className="flex flex-col items-end gap-1">
                        <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink">
                          {labelStrategy(row.decision.strategy)}
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ring-1 ring-inset ${scoreChipClass(
                              row.decision.recoveryScore
                            )}`}
                          >
                            {Math.round(row.decision.recoveryScore)}
                          </span>
                        </span>
                        <span className="text-[11px] leading-4 text-faint">
                          {row.decision.source === "ai" ? "AI-reviewed" : "Rule-based"}{" "}
                          · {row.decision.confidencePercent}% confidence
                        </span>
                      </div>
                    ) : row.status === "detected" || row.status === "diagnosing" ? (
                      <DecideButton riskId={row.id} />
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
          Showing {visible.length} of {rows.length} tracked risks.
        </p>
      )}

      {drawerRow?.decision && (
        <DecisionDrawer
          title={drawerRow.customerName ?? "Unlinked customer"}
          subtitle={`${drawerRow.typeLabel} · ${drawerRow.amountLabel}`}
          decision={
            {
              strategyLabel: labelStrategy(drawerRow.decision.strategy),
              reasoning: drawerRow.decision.reasoning,
              confidencePercent: drawerRow.decision.confidencePercent,
              recoveryScore: drawerRow.decision.recoveryScore,
              priority: drawerRow.decision.priority,
              nextStep: drawerRow.decision.nextStep,
              source: drawerRow.decision.source,
              factors: drawerRow.decision.factors,
            } satisfies DecisionDetailView
          }
          onClose={() => setDrawerRiskId(null)}
        />
      )}
    </div>
  );
}
