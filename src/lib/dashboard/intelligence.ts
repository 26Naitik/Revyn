import type { RecoveryStatus } from "@/lib/types";

/**
 * Recovery Intelligence computations (Phase 3).
 *
 * Pure, deterministic functions over typed row shapes. No database access,
 * no randomness, no invented metrics - every number here is derived from
 * rows the caller loaded from Prisma. Unit-tested in intelligence.test.ts.
 *
 * Design rules:
 *  - Opportunity scores use explainable factors (value x likelihood x urgency).
 *  - Trends are only produced when real history exists; otherwise null.
 *  - Nothing fabricates percentages or ML-style predictions.
 */

/* ------------------------------------------------------------------ */
/* Row shapes (structural - satisfied by dashboard/data.ts selects)    */
/* ------------------------------------------------------------------ */

export interface IntelDecision {
  recoveryId: string;
  strategy: string;
  workflowStatus: string;
  reasoning: string;
  confidence: number;
  recoveryScore: number;
  priority: string;
  discountPercent: number;
  retryDelay: string | null;
  nextStep: string | null;
  source: string;
}

export interface IntelRisk {
  id: string;
  type: string;
  status: string;
  amountAtRisk: number;
  currency: string;
  rootCause: string | null;
  createdAt: Date;
  customerName: string | null;
  customerEmail: string | null;
  decision: IntelDecision | null;
}

export interface IntelWorkflow {
  id: string;
  revenueRiskId: string;
  status: string;
  strategy: string;
  attemptCount: number;
  amountRecovered: number;
  amountAtRisk: number;
  recoveryScore: number;
  confidence: number;
  decisionSource: string;
  priority: string;
  startedAt: Date | null;
  completedAt: Date | null;
  nextRetryAt: Date | null;
  lastAttemptAt: Date | null;
  lastFailureCategory: string | null;
  lastFailureReason: string | null;
  createdAt: Date;
}

/* ------------------------------------------------------------------ */
/* Funnel                                                              */
/* ------------------------------------------------------------------ */

export interface FunnelStage {
  key: string;
  label: string;
  count: number;
  amountPaise: number | null;
  /** Count drop-off versus the previous stage (null for the first stage). */
  droppedFromPrevious: number | null;
}

const ACTIVE_WORKFLOW_STATUSES: readonly string[] = [
  "pending",
  "executing",
  "retry_scheduled",
];

export function isActiveWorkflow(status: string): boolean {
  return ACTIVE_WORKFLOW_STATUSES.includes(status);
}

/**
 * Builds the detection -> recovery funnel from real rows.
 * `failedPayments` must come from a Payment table aggregate.
 */
export function computeFunnel(input: {
  failedPaymentCount: number;
  failedPaymentAmountPaise: number;
  risks: IntelRisk[];
  workflows: IntelWorkflow[];
}): FunnelStage[] {
  const distinctRiskIds = new Set(input.workflows.map((wf) => wf.revenueRiskId));
  const diagnosed = input.risks.filter((r) => r.rootCause !== null);
  const attempted = input.workflows.filter(
    (wf) => wf.attemptCount > 0 || wf.status === "succeeded"
  );
  const succeeded = input.workflows.filter((wf) => wf.status === "succeeded");

  const rawStages: Array<Omit<FunnelStage, "droppedFromPrevious">> = [
    {
      key: "failed_payments",
      label: "Failed payments",
      count: input.failedPaymentCount,
      amountPaise: input.failedPaymentAmountPaise,
    },
    {
      key: "detected",
      label: "Risks detected",
      count: input.risks.length,
      amountPaise: input.risks.reduce((sum, r) => sum + r.amountAtRisk, 0),
    },
    {
      key: "diagnosed",
      label: "Diagnosed",
      count: diagnosed.length,
      amountPaise: diagnosed.reduce((sum, r) => sum + r.amountAtRisk, 0),
    },
    {
      key: "decided",
      label: "Decision made",
      count: distinctRiskIds.size,
      amountPaise: null,
    },
    {
      key: "attempted",
      label: "Recovery attempted",
      count: attempted.length,
      amountPaise: attempted.reduce((sum, wf) => sum + wf.amountAtRisk, 0),
    },
    {
      key: "recovered",
      label: "Recovered",
      count: succeeded.length,
      amountPaise: succeeded.reduce((sum, wf) => sum + wf.amountRecovered, 0),
    },
  ];

  return rawStages.map((stage, i) => ({
    ...stage,
    droppedFromPrevious: i === 0 ? null : rawStages[i - 1].count - stage.count,
  }));
}

/* ------------------------------------------------------------------ */
/* Opportunity ranking                                                 */
/* ------------------------------------------------------------------ */

export interface OpportunityItem {
  recoveryId: string;
  riskId: string;
  customerName: string | null;
  riskType: string;
  amountAtRisk: number;
  recoveryScore: number;
  confidence: number;
  priority: string;
  strategy: string;
  recommendedAction: string;
  /** amountAtRisk x recoveryScore - the realistic recoverable rupees. */
  expectedValuePaise: number;
  /** 0-100 explainable composite; see scoring notes below. */
  opportunityScore: number;
  urgencyLabel: "critical" | "high" | "medium" | "low";
  workflowStatus: string;
}

const OPPORTUNITY_ELIGIBLE_WORKFLOW_STATUSES: ReadonlySet<string> = new Set([
  "pending",
  "executing",
  "retry_scheduled",
]);

const PRIORITY_URGENCY: Record<string, number> = {
  critical: 1,
  high: 0.85,
  medium: 0.6,
  low: 0.35,
};

function urgencyLabelFor(priority: string): OpportunityItem["urgencyLabel"] {
  if (priority === "critical" || priority === "high") return priority;
  if (priority === "medium") return "medium";
  return "low";
}

/**
 * Explainable opportunity score:
 *   valueFactor   = log-normalised amount vs the largest active amount
 *   likelihood    = recoveryScore / 100 (deterministic engine output)
 *   urgency       = priority weight x recency weight (fresh cases matter more)
 *   score         = round(100 x valueFactor x likelihood x urgency)
 * expectedValue  = round(amount x likelihood) - no invented conversion rates.
 */
export function computeOpportunities(
  workflows: IntelWorkflow[],
  options: { now?: Date; limit?: number } = {}
): OpportunityItem[] {
  const now = options.now ?? new Date();
  const limit = options.limit ?? 5;

  const eligible = workflows.filter(
    (wf) =>
      OPPORTUNITY_ELIGIBLE_WORKFLOW_STATUSES.has(wf.status) &&
      wf.amountAtRisk > 0 &&
      wf.recoveryScore > 0
  );

  if (eligible.length === 0) return [];

  const maxAmount = Math.max(...eligible.map((wf) => wf.amountAtRisk));
  const logMax = Math.log1p(maxAmount);

  const items = eligible.map((wf) => {
    const likelihood = clamp01(wf.recoveryScore / 100);
    const valueFactor = logMax > 0 ? Math.log1p(wf.amountAtRisk) / logMax : 0;

    const ageDays = (now.getTime() - wf.createdAt.getTime()) / 86_400_000;
    const recency =
      ageDays <= 1 ? 1 : ageDays <= 3 ? 0.85 : ageDays <= 7 ? 0.65 : 0.45;

    const resolvedPriority = PRIORITY_URGENCY[wf.priority]
      ? wf.priority
      : wf.recoveryScore >= 70
        ? "high"
        : wf.recoveryScore >= 40
          ? "medium"
          : "low";

    const urgency = (PRIORITY_URGENCY[resolvedPriority] ?? 0.5) * recency;

    return {
      recoveryId: wf.id,
      riskId: wf.revenueRiskId,
      customerName: null as string | null,
      riskType: "",
      amountAtRisk: wf.amountAtRisk,
      recoveryScore: wf.recoveryScore,
      confidence: wf.confidence,
      priority: resolvedPriority,
      strategy: wf.strategy,
      recommendedAction: recommendedActionFor(wf.strategy),
      expectedValuePaise: Math.round(wf.amountAtRisk * likelihood),
      opportunityScore: Math.round(100 * valueFactor * likelihood * urgency),
      urgencyLabel: urgencyLabelFor(resolvedPriority),
      workflowStatus: wf.status,
    };
  });

  return items
    .sort(
      (a, b) =>
        b.opportunityScore - a.opportunityScore ||
        b.expectedValuePaise - a.expectedValuePaise
    )
    .slice(0, limit);
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

export function recommendedActionFor(strategy: string): string {
  switch (strategy) {
    case "send_payment_link":
      return "Send payment link";
    case "offer_discount":
      return "Send discounted link";
    case "retry_payment":
      return "Retry charge via link";
    case "schedule_retry":
      return "Wait for scheduled retry";
    case "escalate_human":
      return "Assign to operator";
    default:
      return "Review case";
  }
}

/* ------------------------------------------------------------------ */
/* Attention queue                                                     */
/* ------------------------------------------------------------------ */

export type AttentionAction = "execute" | "retry" | "review" | "escalate" | "contact";

export interface AttentionItem {
  key: string;
  severity: number;
  reason: string;
  whatHappened: string;
  whyItMatters: string;
  recommendation: string;
  action: AttentionAction;
  recoveryId: string | null;
  riskId: string;
  customerName: string | null;
  customerEmail: string | null;
  amountAtRisk: number;
  workflowStatus: string;
  strategy: string;
}

export interface AttentionInputCase {
  risk: IntelRisk;
  workflow: IntelWorkflow | null;
}

const STALE_EXECUTING_MINUTES = 30;

/**
 * Builds the operator attention queue. Severity ordering:
 * escalated > permanent failure > exhausted retries > due/overdue retry >
 * stalled execution > high-value awaiting execution > undecided high-value risk.
 */
export function computeAttentionQueue(
  cases: AttentionInputCase[],
  options: { now?: Date; highValueThresholdPaise?: number; limit?: number } = {}
): AttentionItem[] {
  const now = options.now ?? new Date();
  const highValue = options.highValueThresholdPaise ?? 50_000_00;
  const limit = options.limit ?? 8;

  const items: AttentionItem[] = [];

  for (const { risk, workflow } of cases) {
    const base = {
      riskId: risk.id,
      customerName: risk.customerName,
      customerEmail: risk.customerEmail,
      amountAtRisk: risk.amountAtRisk,
      strategy: workflow?.strategy ?? risk.decision?.strategy ?? "unknown",
    };

    if (!workflow) {
      // Undecided risk sitting idle - matters when it carries meaningful value.
      if (risk.amountAtRisk >= highValue && !isClosedRiskStatus(risk.status)) {
        items.push({
          key: `undecided-${risk.id}`,
          severity: 40,
          reason: "High-value case has no recovery decision yet",
          whatHappened: `${risk.customerName ?? "A customer"} has ${formatPaise(risk.amountAtRisk)} at risk but Revyn hasn't generated a recovery decision.`,
          whyItMatters: "Every hour without a decision delays the best moment to re-engage the customer.",
          recommendation: "Run the decision engine to generate a strategy for this case.",
          action: "review",
          recoveryId: null,
          workflowStatus: "none",
          ...base,
        });
      }
      continue;
    }

    if (workflow.status === "escalated") {
      items.push({
        key: `escalated-${workflow.id}`,
        severity: 100,
        reason: "Escalated to humans",
        whatHappened:
          workflow.lastFailureReason
            ? `Automated attempts stopped (${workflow.lastFailureReason}).`
            : "The automation handed this case to an operator.",
        whyItMatters: `₹${Math.round(risk.amountAtRisk / 100).toLocaleString("en-IN")} stays unrecovered until someone follows up personally.`,
        recommendation: "Assign an owner and reach out to the customer directly.",
        action: "contact",
        recoveryId: workflow.id,
        workflowStatus: workflow.status,
        ...base,
      });
      continue;
    }

    if (
      workflow.status === "failed" &&
      workflow.lastFailureCategory === "permanent"
    ) {
      items.push({
        key: `permanent-failure-${workflow.id}`,
        severity: 90,
        reason: "Permanent failure",
        whatHappened: `Execution failed permanently: ${workflow.lastFailureReason ?? "provider rejected the attempt"}.`,
        whyItMatters: "Automated retries cannot fix this - it needs a human decision.",
        recommendation: "Investigate the failure cause, then retry manually or escalate.",
        action: "review",
        recoveryId: workflow.id,
        workflowStatus: workflow.status,
        ...base,
      });
      continue;
    }

    if (
      workflow.status === "failed" &&
      workflow.attemptCount >= RETRY_LIMIT_FOR_ATTENTION
    ) {
      items.push({
        key: `exhausted-${workflow.id}`,
        severity: 80,
        reason: "Retries exhausted",
        whatHappened: `All ${workflow.attemptCount} automated attempts failed${workflow.lastFailureReason ? ` (last: ${workflow.lastFailureReason})` : ""}.`,
        whyItMatters: "The retry loop has given up - without intervention this revenue is written off.",
        recommendation: "Escalate to a human owner or try a different channel.",
        action: "escalate",
        recoveryId: workflow.id,
        workflowStatus: workflow.status,
        ...base,
      });
      continue;
    }

    if (workflow.status === "retry_scheduled" && workflow.nextRetryAt) {
      const overdue = workflow.nextRetryAt.getTime() <= now.getTime();
      items.push({
        key: `retry-due-${workflow.id}`,
        severity: overdue ? 70 : 55,
        reason: overdue ? "Retry overdue" : "Retry scheduled",
        whatHappened: overdue
          ? `Scheduled retry is past due (${workflow.nextRetryAt.toISOString()}).`
          : `Next automatic retry ${workflow.nextRetryAt.toLocaleString("en-IN")}.`,
        whyItMatters: overdue
          ? "The retry engine is waiting - executing now captures the customer while intent is warm."
          : "Revenue stays at risk until the retry runs.",
        recommendation: overdue
          ? "Trigger the retry now."
          : "Monitor, or execute early if the customer signals intent.",
        action: "retry",
        recoveryId: workflow.id,
        workflowStatus: workflow.status,
        ...base,
      });
      continue;
    }

    if (
      workflow.status === "executing" &&
      workflow.startedAt &&
      now.getTime() - workflow.startedAt.getTime() >
        STALE_EXECUTING_MINUTES * 60_000 &&
      !workflow.completedAt
    ) {
      items.push({
        key: `stale-executing-${workflow.id}`,
        severity: 60,
        reason: "Awaiting payment too long",
        whatHappened: `A payment link has been open for over ${STALE_EXECUTING_MINUTES} minutes without settlement.`,
        whyItMatters: "Payment links convert best within the first hours - silence suggests the customer is stuck.",
        recommendation: "Send a reminder or offer a discount variant.",
        action: "contact",
        recoveryId: workflow.id,
        workflowStatus: workflow.status,
        ...base,
      });
      continue;
    }

    if (
      workflow.status === "pending" &&
      workflow.attemptCount === 0 &&
      workflow.amountAtRisk >= highValue
    ) {
      items.push({
        key: `awaiting-execution-${workflow.id}`,
        severity: 50,
        reason: "Decision ready, not executed",
        whatHappened: `Revyn recommends "${recommendedActionFor(workflow.strategy)}" but nothing has been sent yet.`,
        whyItMatters: `${formatPaise(risk.amountAtRisk)} remains unactioned.`,
        recommendation: `Execute the recommended action: ${recommendedActionFor(workflow.strategy)}.`,
        action: "execute",
        recoveryId: workflow.id,
        workflowStatus: workflow.status,
        ...base,
      });
    }
  }

  return items
    .sort(
      (a, b) =>
        b.severity - a.severity || b.amountAtRisk - a.amountAtRisk
    )
    .slice(0, limit);
}

/** Retry policy cap mirrored here so attention logic matches execution limits. */
const RETRY_LIMIT_FOR_ATTENTION = 3;

function isClosedRiskStatus(status: string): boolean {
  return ["recovered", "abandoned", "expired", "failed"].includes(status);
}

function formatPaise(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

/* ------------------------------------------------------------------ */
/* Breakdowns                                                          */
/* ------------------------------------------------------------------ */

export interface BreakdownBucket {
  key: string;
  label: string;
  count: number;
}

const WORKFLOW_STATUS_ORDER: Array<{ key: string; label: string }> = [
  { key: "pending", label: "Pending" },
  { key: "executing", label: "Executing" },
  { key: "retry_scheduled", label: "Retry scheduled" },
  { key: "succeeded", label: "Succeeded" },
  { key: "failed", label: "Failed" },
  { key: "escalated", label: "Escalated" },
  { key: "cancelled", label: "Cancelled" },
];

const FAILURE_CATEGORY_ORDER: Array<{ key: string; label: string }> = [
  { key: "temporary", label: "Temporary" },
  { key: "permanent", label: "Permanent" },
];

export const SCORE_BANDS = {
  high: { min: 70, label: "High opportunity" },
  medium: { min: 40, label: "Medium" },
  low: { min: 0, label: "Low" },
} as const;

export function scoreBand(score: number): keyof typeof SCORE_BANDS {
  if (score >= SCORE_BANDS.high.min) return "high";
  if (score >= SCORE_BANDS.medium.min) return "medium";
  return "low";
}

export function computeBreakdowns(workflows: IntelWorkflow[]): {
  byStatus: BreakdownBucket[];
  byStrategy: BreakdownBucket[];
  byFailureCategory: BreakdownBucket[];
  byScoreBand: BreakdownBucket[];
} {
  const statusCounts = new Map<string, number>();
  const strategyCounts = new Map<string, number>();
  const failureCounts = new Map<string, number>();
  const bandCounts = new Map<string, number>([
    ["high", 0],
    ["medium", 0],
    ["low", 0],
  ]);

  for (const wf of workflows) {
    statusCounts.set(wf.status, (statusCounts.get(wf.status) ?? 0) + 1);
    strategyCounts.set(wf.strategy, (strategyCounts.get(wf.strategy) ?? 0) + 1);

    if (wf.lastFailureCategory === "temporary" || wf.lastFailureCategory === "permanent") {
      failureCounts.set(
        wf.lastFailureCategory,
        (failureCounts.get(wf.lastFailureCategory) ?? 0) + 1
      );
    }

    const band = scoreBand(wf.recoveryScore);
    bandCounts.set(band, (bandCounts.get(band) ?? 0) + 1);
  }

  const byStrategy: BreakdownBucket[] = [...strategyCounts.entries()]
    .map(([key, count]) => ({ key, label: key, count }))
    .sort((a, b) => b.count - a.count);

  return {
    byStatus: WORKFLOW_STATUS_ORDER.map(({ key, label }) => ({
      key,
      label,
      count: statusCounts.get(key) ?? 0,
    })),
    byStrategy,
    byFailureCategory: FAILURE_CATEGORY_ORDER.map(({ key, label }) => ({
      key,
      label,
      count: failureCounts.get(key) ?? 0,
    })),
    byScoreBand: (["high", "medium", "low"] as const).map((band) => ({
      key: band,
      label: SCORE_BANDS[band].label,
      count: bandCounts.get(band) ?? 0,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Intelligence quality                                                */
/* ------------------------------------------------------------------ */

export interface SourceQualityStats {
  source: string;
  decisions: number;
  avgConfidence: number;
  avgRecoveryScore: number;
}

export interface StrategyOutcome {
  strategy: string;
  terminalCases: number;
  succeeded: number;
  successRate: number;
}

export interface IntelligenceStats {
  totalDecisions: number;
  sources: SourceQualityStats[];
  /** Strategies with at least MIN_SAMPLE terminal outcomes; empty when insufficient data. */
  outcomeByStrategy: StrategyOutcome[];
  hasOutcomeData: boolean;
}

const MIN_SAMPLE_FOR_OUTCOME_RATE = 3;

export function computeIntelligenceStats(
  workflows: IntelWorkflow[]
): IntelligenceStats {
  const bySource = new Map<string, { n: number; confSum: number; scoreSum: number }>();
  const byStrategy = new Map<string, { terminal: number; succeeded: number }>();

  for (const wf of workflows) {
    const src = wf.decisionSource === "ai" ? "ai" : "rules";
    const agg = bySource.get(src) ?? { n: 0, confSum: 0, scoreSum: 0 };
    agg.n += 1;
    agg.confSum += wf.confidence;
    agg.scoreSum += wf.recoveryScore;
    bySource.set(src, agg);

    const terminal = wf.status === "succeeded" || wf.status === "failed";
    if (terminal) {
      const sAgg = byStrategy.get(wf.strategy) ?? { terminal: 0, succeeded: 0 };
      sAgg.terminal += 1;
      if (wf.status === "succeeded") sAgg.succeeded += 1;
      byStrategy.set(wf.strategy, sAgg);
    }
  }

  const sources: SourceQualityStats[] = [...bySource.entries()]
    .map(([source, agg]) => ({
      source,
      decisions: agg.n,
      avgConfidence: agg.n > 0 ? agg.confSum / agg.n : 0,
      avgRecoveryScore: agg.n > 0 ? agg.scoreSum / agg.n : 0,
    }))
    .sort((a, b) => b.decisions - a.decisions);

  const outcomeByStrategy: StrategyOutcome[] = [...byStrategy.entries()]
    .filter(([, agg]) => agg.terminal >= MIN_SAMPLE_FOR_OUTCOME_RATE)
    .map(([strategy, agg]) => ({
      strategy,
      terminalCases: agg.terminal,
      succeeded: agg.succeeded,
      successRate: agg.succeeded / agg.terminal,
    }))
    .sort((a, b) => b.terminalCases - a.terminalCases);

  return {
    totalDecisions: workflows.length,
    sources,
    outcomeByStrategy,
    hasOutcomeData: outcomeByStrategy.length > 0,
  };
}

/* ------------------------------------------------------------------ */
/* Daily performance series                                            */
/* ------------------------------------------------------------------ */

export interface DailyPoint {
  dateKey: string; // YYYY-MM-DD (UTC day bucket)
  label: string; // e.g. "Aug 18"
  detectedPaise: number;
  recoveredPaise: number;
}

/**
 * Buckets newly-detected risk value and confirmed recovered value per UTC day
 * for the trailing `days` window ending today. Returns null-trend-friendly
 * raw points; callers decide how to present sparse history.
 */
export function computeDailySeries(
  workflows: IntelWorkflow[],
  risks: IntelRisk[],
  options: { days?: number; now?: Date } = {}
): DailyPoint[] {
  const days = options.days ?? 14;
  const now = options.now ?? new Date();

  const start = startOfUtcDay(now);
  start.setUTCDate(start.getUTCDate() - (days - 1));

  const buckets = new Map<string, DailyPoint>();
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    const key = utcDateKey(d);
    buckets.set(key, {
      dateKey: key,
      label: formatDayLabel(d),
      detectedPaise: 0,
      recoveredPaise: 0,
    });
  }

  for (const risk of risks) {
    const key = utcDateKey(risk.createdAt);
    const bucket = buckets.get(key);
    if (bucket) bucket.detectedPaise += risk.amountAtRisk;
  }

  for (const wf of workflows) {
    if (wf.status !== "succeeded" || !wf.completedAt) continue;
    const key = utcDateKey(wf.completedAt);
    const bucket = buckets.get(key);
    if (bucket) bucket.recoveredPaise += wf.amountRecovered;
  }

  return [...buckets.values()];
}

export interface WeeklyTrend {
  currentRecoveredPaise: number;
  previousRecoveredPaise: number;
  deltaPaise: number;
  direction: "up" | "down" | "flat";
  /** False when either week has zero recovered revenue - no honest trend then. */
  meaningful: boolean;
}

export function computeWeeklyTrend(points: DailyPoint[]): WeeklyTrend | null {
  if (points.length < 8) return null;

  const current = points.slice(-7).reduce((s, p) => s + p.recoveredPaise, 0);
  const previous = points.slice(-14, -7).reduce((s, p) => s + p.recoveredPaise, 0);

  // A trend needs actual recovered revenue in both windows; comparing ₹0 to
  // ₹0 would manufacture insight out of nothing.
  const meaningful = current > 0 && previous > 0;

  return {
    currentRecoveredPaise: current,
    previousRecoveredPaise: previous,
    deltaPaise: current - previous,
    direction:
      current === previous ? "flat" : current > previous ? "up" : "down",
    meaningful,
  };
}

function startOfUtcDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatDayLabel(date: Date): string {
  return date.toLocaleDateString("en-IN", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
  });
}

/* ------------------------------------------------------------------ */
/* KPI assembly                                                        */
/* ------------------------------------------------------------------ */

export interface FinancialKpis {
  totalAtRiskPaise: number;
  recoveredPaise: number;
  currentlyRecoverablePaise: number;
  lostPaise: number;
  recoveryRate: number;
}

/**
 * Currently recoverable = open amount on active workflows (not yet recovered,
 * still automatable). Lost = closed-without-recovery amount (failed +
 * cancelled workflows that never recovered anything).
 */
export function computeFinancialKpis(
  stats: {
    totalAtRisk: number;
    totalRecovered: number;
    recoveryRate: number;
  },
  workflows: IntelWorkflow[]
): FinancialKpis {
  let currentlyRecoverable = 0;
  let lost = 0;

  for (const wf of workflows) {
    const remaining = Math.max(0, wf.amountAtRisk - wf.amountRecovered);
    if (isActiveWorkflow(wf.status)) {
      currentlyRecoverable += remaining;
    } else if (wf.status === "failed" || wf.status === "cancelled") {
      lost += remaining;
    }
  }

  return {
    totalAtRiskPaise: stats.totalAtRisk,
    recoveredPaise: stats.totalRecovered,
    currentlyRecoverablePaise: currentlyRecoverable,
    lostPaise: lost,
    recoveryRate: stats.recoveryRate,
  };
}

export interface OperationalKpis {
  activeRecoveries: number;
  pendingDecisions: number;
  retryScheduled: number;
  escalated: number;
  failedRecoveries: number;
  successfulRecoveries: number;
}

export function computeOperationalKpis(workflows: IntelWorkflow[]): OperationalKpis {
  const count = (predicate: (wf: IntelWorkflow) => boolean) =>
    workflows.filter(predicate).length;

  return {
    activeRecoveries: count((wf) => isActiveWorkflow(wf.status)),
    pendingDecisions: count((wf) => wf.status === "pending" && wf.attemptCount === 0),
    retryScheduled: count((wf) => wf.status === "retry_scheduled"),
    escalated: count((wf) => wf.status === "escalated"),
    failedRecoveries: count((wf) => wf.status === "failed"),
    successfulRecoveries: count((wf) => wf.status === "succeeded"),
  };
}

export interface IntelligenceKpis {
  avgRecoveryScore: number;
  highOpportunityCases: number;
  aiAssistedDecisions: number;
  ruleBasedDecisions: number;
}

export function computeIntelligenceKpis(workflows: IntelWorkflow[]): IntelligenceKpis {
  if (workflows.length === 0) {
    return {
      avgRecoveryScore: 0,
      highOpportunityCases: 0,
      aiAssistedDecisions: 0,
      ruleBasedDecisions: 0,
    };
  }

  const scoreSum = workflows.reduce((sum, wf) => sum + wf.recoveryScore, 0);

  return {
    avgRecoveryScore: Math.round(scoreSum / workflows.length),
    highOpportunityCases: workflows.filter((wf) => scoreBand(wf.recoveryScore) === "high").length,
    aiAssistedDecisions: workflows.filter((wf) => wf.decisionSource === "ai").length,
    ruleBasedDecisions: workflows.filter((wf) => wf.decisionSource !== "ai").length,
  };
}

/* Re-export so UI layers can share one import path. */
export type { RecoveryStatus };
