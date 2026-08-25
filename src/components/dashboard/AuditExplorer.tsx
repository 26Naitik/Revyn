"use client";

import { useState } from "react";
import { TableShell, Td, Th, Tr } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/states";
import { formatDateTime, formatRelativeTime, shortRef } from "@/lib/format";
import type { ActivityRow } from "@/lib/dashboard/data";

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

const STATUS_FILTERS = ["all", "success", "warning", "failure"] as const;

function selectClasses() {
  return "h-8 rounded-lg border border-line bg-surface px-2 text-xs font-medium text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20";
}

function labelFor(options: string[], value: string): string {
  return options.includes(value)
    ? (EVENT_LABELS[value] ?? ACTOR_LABELS[value] ?? value)
    : value;
}

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

function humanDetails(row: ActivityRow): string {
  const d = row.details;
  const parts: string[] = [];
  if (typeof d.event === "string" && d.event) parts.push(d.event);
  if (typeof d.from === "string" && typeof d.to === "string") {
    parts.push(`${d.from} → ${d.to}`);
  }
  if (d.kind === "duplicate_suppressed") parts.push("duplicate suppressed");
  const reason =
    typeof d.reason === "string"
      ? d.reason
      : typeof d.reasoning === "string"
        ? (d.reasoning as string).slice(0, 120)
        : null;
  if (reason) parts.push(reason);
  return parts.length > 0 ? parts.join(" · ") : JSON.stringify(row.details);
}

function matchesQuery(row: ActivityRow, q: string): boolean {
  if (!q) return true;
  const d = row.details;
  const ids = [
    d.recoveryId,
    d.riskId,
    typeof d.linkId === "string" ? d.linkId : null,
    typeof d.paymentLinkId === "string" ? d.paymentLinkId : null,
  ];
  return (
    row.id.toLowerCase().includes(q) ||
    ids.some((id) => typeof id === "string" && id.toLowerCase().includes(q)) ||
    row.action.toLowerCase().includes(q) ||
    row.actor.toLowerCase().includes(q) ||
    JSON.stringify(row.details).toLowerCase().includes(q)
  );
}

export function AuditExplorer({ rows }: { rows: ActivityRow[] }) {
  const [eventFilter, setEventFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [actorFilter, setActorFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [query, setQuery] = useState("");
  const now = new Date();

  const eventOptions = Array.from(new Set(rows.map((r) => r.action))).sort();
  const actorOptions = Array.from(new Set(rows.map((r) => r.actor))).sort();

  const q = query.trim().toLowerCase();
  const fromMs = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : null;
  const toMs = toDate ? new Date(`${toDate}T23:59:59`).getTime() : null;

  const visible = rows.filter((row) => {
    if (eventFilter !== "all" && row.action !== eventFilter) return false;
    if (
      statusFilter !== "all" &&
      (statusFilter === "failure"
        ? !["success", "warning"].includes(row.status)
        : row.status !== statusFilter)
    ) {
      return false;
    }
    if (actorFilter !== "all" && row.actor !== actorFilter) return false;
    const t = row.createdAt.getTime();
    if (fromMs !== null && t < fromMs) return false;
    if (toMs !== null && t > toMs) return false;
    return matchesQuery(row, q);
  });

  const activeFilters =
    Number(eventFilter !== "all") +
    Number(statusFilter !== "all") +
    Number(actorFilter !== "all") +
    Number(Boolean(fromDate)) +
    Number(Boolean(toDate)) +
    Number(query.trim().length > 0);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line-strong bg-surface">
        <EmptyState
          title="No audit events yet"
          hint="Run the pipeline - every detection, decision and webhook lands here automatically."
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5">
        <select
          aria-label="Filter by event"
          className={selectClasses()}
          value={eventFilter}
          onChange={(e) => setEventFilter(e.target.value)}
        >
          <option value="all">All events</option>
          {eventOptions.map((a) => (
            <option key={a} value={a}>
              {labelFor(eventOptions, a)}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by status"
          className={selectClasses()}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>
              {s === "all"
                ? "Any status"
                : s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by actor"
          className={selectClasses()}
          value={actorFilter}
          onChange={(e) => setActorFilter(e.target.value)}
        >
          <option value="all">Any actor</option>
          {actorOptions.map((a) => (
            <option key={a} value={a}>
              {ACTOR_LABELS[a] ?? a}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-1 text-xs text-muted">
          From
          <input
            type="date"
            aria-label="From date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className={selectClasses()}
          />
        </label>
        <label className="flex items-center gap-1 text-xs text-muted">
          To
          <input
            type="date"
            aria-label="To date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className={selectClasses()}
          />
        </label>

        <input
          type="search"
          aria-label="Search case or details"
          placeholder="Search case id or details…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={`${selectClasses()} w-52`}
        />

        {activeFilters > 0 && (
          <button
            type="button"
            onClick={() => {
              setEventFilter("all");
              setStatusFilter("all");
              setActorFilter("all");
              setFromDate("");
              setToDate("");
              setQuery("");
            }}
            className="ml-auto text-xs font-medium text-brand hover:text-brand-dark"
          >
            Clear filters ({activeFilters})
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong bg-surface">
          <EmptyState
            title="No entries match these filters"
            hint="Try widening the date range or clearing a filter."
          />
        </div>
      ) : (
        <>
          <TableShell minWidth={880}>
            <thead>
              <tr>
                <Th>Time</Th>
                <Th>Event</Th>
                <Th>Entity</Th>
                <Th>Actor</Th>
                <Th>Status</Th>
                <Th>What happened</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
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
                    <span className="mt-0.5 block font-mono text-[11px] text-faint">
                      {row.action}
                    </span>
                  </Td>
                  <Td className="font-mono text-xs text-muted">
                    {entityOf(row)}
                  </Td>
                  <Td>
                    <span className="rounded-md border border-line bg-canvas px-1.5 py-0.5 font-mono text-[11px] text-muted">
                      {ACTOR_LABELS[row.actor] ?? row.actor}
                    </span>
                  </Td>
                  <Td>
                    {row.status === "success" ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                        success
                      </span>
                    ) : (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                          row.status === "warning"
                            ? "border border-warning-soft bg-warning-soft text-warning"
                            : "border border-danger-soft bg-danger-soft text-danger"
                        }`}
                        title={
                          row.status === "warning"
                            ? "Operation succeeded with a policy note"
                            : "Underlying operation failed - never reported as success"
                        }
                      >
                        {row.status}
                      </span>
                    )}
                  </Td>
                  <Td className="max-w-[380px]">
                    <p
                      className="truncate text-[12px] leading-5 text-muted"
                      title={JSON.stringify(row.details)}
                    >
                      {humanDetails(row)}
                    </p>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableShell>
          <p className="text-xs text-faint">
            Showing {visible.length} of {rows.length} audit entries.
          </p>
        </>
      )}
    </div>
  );
}
