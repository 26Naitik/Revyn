import { describe, it, expect } from "vitest";
import {
  computeAttentionQueue,
  computeBreakdowns,
  computeDailySeries,
  computeFinancialKpis,
  computeFunnel,
  computeIntelligenceKpis,
  computeIntelligenceStats,
  computeOperationalKpis,
  computeOpportunities,
  computeWeeklyTrend,
  isActiveWorkflow,
  scoreBand,
  type IntelRisk,
  type IntelWorkflow,
} from "@/lib/dashboard/intelligence";
import { buildRecoveryTimeline } from "@/lib/dashboard/timeline";

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const NOW = new Date("2026-08-24T12:00:00Z");

function risk(overrides: Partial<IntelRisk> = {}): IntelRisk {
  return {
    id: "risk_1",
    type: "failed_payment",
    status: "decided",
    amountAtRisk: 100_000,
    currency: "INR",
    rootCause: "insufficient_funds",
    createdAt: new Date(NOW.getTime() - 6 * 3_600_000),
    customerName: "Aarav",
    customerEmail: "aarav@example.com",
    decision: null,
    ...overrides,
  };
}

function workflow(overrides: Partial<IntelWorkflow> = {}): IntelWorkflow {
  return {
    id: "wf_1",
    revenueRiskId: "risk_1",
    status: "pending",
    strategy: "send_payment_link",
    attemptCount: 0,
    amountRecovered: 0,
    amountAtRisk: 100_000,
    recoveryScore: 80,
    confidence: 0.9,
    decisionSource: "rules",
    priority: "high",
    startedAt: null,
    completedAt: null,
    nextRetryAt: null,
    lastAttemptAt: null,
    lastFailureCategory: null,
    lastFailureReason: null,
    createdAt: new Date(NOW.getTime() - 6 * 3_600_000),
    ...overrides,
  };
}

describe("financial KPI aggregation", () => {
  it("computes currently-recoverable from open workflows only", () => {
    const workflows = [
      workflow({ id: "a", status: "pending", amountAtRisk: 50_000 }),
      workflow({ id: "b", status: "executing", amountAtRisk: 30_000, amountRecovered: 10_000 }),
      workflow({ id: "c", status: "succeeded", amountAtRisk: 20_000, amountRecovered: 20_000 }),
      workflow({ id: "d", status: "failed", amountAtRisk: 40_000 }),
    ];
    const kpis = computeFinancialKpis(
      { totalAtRisk: 140_000, totalRecovered: 30_000, recoveryRate: 30_000 / 140_000 },
      workflows
    );
    expect(kpis.currentlyRecoverablePaise).toBe(50_000 + 20_000);
    // Lost = remaining value on failed/closed-without-recovery workflows.
    expect(kpis.lostPaise).toBe(40_000);
    expect(kpis.totalAtRiskPaise).toBe(140_000);
    expect(kpis.recoveredPaise).toBe(30_000);
  });

  it("recovery rate passes straight through from the measured stats", () => {
    const kpis = computeFinancialKpis(
      { totalAtRisk: 200, totalRecovered: 50, recoveryRate: 0.25 },
      []
    );
    expect(kpis.recoveryRate).toBe(0.25);
  });

  it("handles an empty dataset without producing NaN", () => {
    const kpis = computeFinancialKpis(
      { totalAtRisk: 0, totalRecovered: 0, recoveryRate: 0 },
      []
    );
    expect(kpis.currentlyRecoverablePaise).toBe(0);
    expect(kpis.lostPaise).toBe(0);
  });
});

describe("operational KPI counts", () => {
  const workflows = [
    workflow({ id: "1", status: "pending", attemptCount: 0 }),
    workflow({ id: "2", status: "pending", attemptCount: 1 }), // executed before
    workflow({ id: "3", status: "executing" }),
    workflow({ id: "4", status: "retry_scheduled" }),
    workflow({ id: "5", status: "escalated" }),
    workflow({ id: "6", status: "failed" }),
    workflow({ id: "7", status: "succeeded" }),
  ];

  it("counts each operational dimension correctly", () => {
    const ops = computeOperationalKpis(workflows);
    expect(ops.activeRecoveries).toBe(4); // pending x2 + executing + retry
    expect(ops.pendingDecisions).toBe(1); // pending AND never executed
    expect(ops.retryScheduled).toBe(1);
    expect(ops.escalated).toBe(1);
    expect(ops.failedRecoveries).toBe(1);
    expect(ops.successfulRecoveries).toBe(1);
  });

  it("returns zeros for an empty dataset", () => {
    const ops = computeOperationalKpis([]);
    expect(ops.activeRecoveries).toBe(0);
    expect(ops.successfulRecoveries).toBe(0);
  });

  it("classifies active statuses consistently with the funnel", () => {
    expect(isActiveWorkflow("pending")).toBe(true);
    expect(isActiveWorkflow("retry_scheduled")).toBe(true);
    expect(isActiveWorkflow("succeeded")).toBe(false);
  });
});

describe("funnel aggregation", () => {
  it("derives every stage from real rows and tracks drop-off", () => {
    const risks = [
      risk({ id: "r1", rootCause: "x", amountAtRisk: 100 }),
      risk({ id: "r2", rootCause: "y", amountAtRisk: 200 }),
      risk({ id: "r3", rootCause: null, amountAtRisk: 300 }),
    ];
    const workflows = [
      workflow({ revenueRiskId: "r1", attemptCount: 1, status: "executing", amountAtRisk: 100 }),
      workflow({ revenueRiskId: "r2", attemptCount: 0, status: "pending", amountAtRisk: 200 }),
      workflow({ revenueRiskId: "stale", status: "succeeded", attemptCount: 2, amountRecovered: 500, amountAtRisk: 999 }),
    ];

    const funnel = computeFunnel({
      failedPaymentCount: 7,
      failedPaymentAmountPaise: 700,
      risks,
      workflows,
    });

    expect(funnel.map((s) => s.count)).toEqual([7, 3, 2, 3, 2, 1]);
    expect(funnel[0].amountPaise).toBe(700);
    expect(funnel[1].amountPaise).toBe(600); // detected value
    // Diagnosed (2) vs detected (3): one case had no root cause yet.
    expect(funnel[2].droppedFromPrevious).toBe(1);
    // Decided counts distinct risk ids - the succeeded workflow points at a
    // stale risk id, so decided (3) exceeds diagnosed (2).
    expect(funnel[3].droppedFromPrevious).toBe(-1);
    // Attempted (2) vs decided (3).
    expect(funnel[4].droppedFromPrevious).toBe(1);
    // Recovered (1) vs attempted (2).
    expect(funnel[5].droppedFromPrevious).toBe(1);
  });

  it("counts distinct decided risks even when a workflow references an old risk", () => {
    const funnel = computeFunnel({
      failedPaymentCount: 1,
      failedPaymentAmountPaise: 100,
      risks: [risk()],
      workflows: [workflow(), workflow({ id: "w2", revenueRiskId: "old_risk" })],
    });
    // Two workflows but only one maps to a current risk row.
    expect(funnel[3].count).toBe(2);
    expect(funnel[4].count).toBe(0); // nothing attempted yet
    expect(funnel[5].count).toBe(0);
  });

  it("returns zeroed stages for an empty dataset", () => {
    const funnel = computeFunnel({
      failedPaymentCount: 0,
      failedPaymentAmountPaise: 0,
      risks: [],
      workflows: [],
    });
    expect(funnel.every((stage) => stage.count === 0)).toBe(true);
    expect(funnel[0].droppedFromPrevious).toBeNull();
  });
});

describe("opportunity ranking", () => {
  it("ranks by explainable score: value x likelihood x urgency", () => {
    const bigFreshHighScore = workflow({
      id: "big",
      amountAtRisk: 900_000,
      recoveryScore: 90,
      priority: "critical",
      createdAt: new Date(NOW.getTime() - 2 * 3_600_000),
    });
    const smallOldLowScore = workflow({
      id: "small",
      amountAtRisk: 5_000,
      recoveryScore: 30,
      priority: "low",
      createdAt: new Date(NOW.getTime() - 20 * 86_400_000),
    });

    const ranked = computeOpportunities([smallOldLowScore, bigFreshHighScore], {
      now: NOW,
      limit: 5,
    });

    expect(ranked[0].recoveryId).toBe("big");
    expect(ranked[0].expectedValuePaise).toBe(Math.round(900_000 * 0.9));
    expect(ranked[0].opportunityScore).toBeGreaterThan(
      ranked[ranked.length - 1].opportunityScore
    );
  });

  it("excludes terminal and escalated workflows", () => {
    const ranked = computeOpportunities(
      [
        workflow({ id: "done", status: "succeeded" }),
        workflow({ id: "dead", status: "failed" }),
        workflow({ id: "human", status: "escalated" }),
        workflow({ id: "axe", status: "cancelled" }),
      ],
      { now: NOW }
    );
    expect(ranked).toHaveLength(0);
  });

  it("respects the limit", () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      workflow({ id: `w${i}`, amountAtRisk: (i + 1) * 10_000 })
    );
    expect(computeOpportunities(many, { now: NOW, limit: 5 })).toHaveLength(5);
  });

  it("expected value is deterministic and never exceeds the at-risk amount", () => {
    const wf = workflow({ amountAtRisk: 123_456, recoveryScore: 66 });
    const [item] = computeOpportunities([wf], { now: NOW });
    expect(item.expectedValuePaise).toBe(Math.round(123_456 * 0.66));
    expect(item.expectedValuePaise).toBeLessThanOrEqual(123_456);
  });
});

describe("attention queue ranking", () => {
  it("orders escalated above permanent failure above retry-due", () => {
    const cases = [
      {
        risk: risk({ id: "r_retry" }),
        workflow: workflow({
          id: "wf_retry",
          revenueRiskId: "r_retry",
          status: "retry_scheduled",
          nextRetryAt: new Date(NOW.getTime() - 3_600_000),
          attemptCount: 1,
        }),
      },
      {
        risk: risk({ id: "r_perm", customerName: "B" }),
        workflow: workflow({
          id: "wf_perm",
          revenueRiskId: "r_perm",
          status: "failed",
          lastFailureCategory: "permanent",
          lastFailureReason: "invalid_customer_state",
          attemptCount: 2,
        }),
      },
      {
        risk: risk({ id: "r_esc", customerName: "C" }),
        workflow: workflow({
          id: "wf_esc",
          revenueRiskId: "r_esc",
          status: "escalated",
          attemptCount: 3,
        }),
      },
    ];

    const queue = computeAttentionQueue(cases, { now: NOW });
    expect(queue.map((q) => q.workflowStatus)).toEqual([
      "escalated",
      "failed",
      "retry_scheduled",
    ]);
  });

  it("flags undecided high-value risks but ignores low-value ones", () => {
    const cases = [
      { risk: risk({ id: "big", amountAtRisk: 999_00 }), workflow: null },
      { risk: risk({ id: "small", amountAtRisk: 100 }), workflow: null },
    ];
    const queue = computeAttentionQueue(cases, {
      now: NOW,
      highValueThresholdPaise: 50_000,
    });
    expect(queue).toHaveLength(1);
    expect(queue[0].riskId).toBe("big");
    expect(queue[0].reason).toContain("no recovery decision");
  });

  it("explains what happened, why it matters and what to do for every entry", () => {
    const queue = computeAttentionQueue(
      [
        {
          risk: risk(),
          workflow: workflow({
            status: "escalated",
            lastFailureReason: "invalid_customer_state",
            attemptCount: 3,
          }),
        },
      ],
      { now: NOW }
    );
    expect(queue[0].whatHappened).toContain("invalid_customer_state");
    expect(queue[0].whyItMatters.length).toBeGreaterThan(10);
    expect(queue[0].recommendation.length).toBeGreaterThan(10);
    expect(queue[0].action).toBe("contact");
  });

  it("shows a positive empty state when nothing needs attention", () => {
    expect(computeAttentionQueue([], { now: NOW })).toEqual([]);
  });

  it("detects stale executions past 30 minutes", () => {
    const queue = computeAttentionQueue(
      [
        {
          risk: risk(),
          workflow: workflow({
            status: "executing",
            startedAt: new Date(NOW.getTime() - 45 * 60_000),
          }),
        },
      ],
      { now: NOW }
    );
    expect(queue[0].reason).toContain("Awaiting payment");
  });
});

describe("breakdowns", () => {
  const workflows = [
    workflow({ status: "pending", strategy: "send_payment_link", recoveryScore: 85 }),
    workflow({ status: "executing", strategy: "send_payment_link", recoveryScore: 55 }),
    workflow({ status: "retry_scheduled", strategy: "retry_payment", recoveryScore: 45, lastFailureCategory: "temporary" }),
    workflow({ status: "failed", strategy: "offer_discount", recoveryScore: 20, lastFailureCategory: "permanent" }),
    workflow({ status: "succeeded", strategy: "retry_payment", recoveryScore: 72 }),
  ];

  it("buckets by ordered status", () => {
    const bd = computeBreakdowns(workflows);
    const pending = bd.byStatus.find((b) => b.key === "pending");
    const succeeded = bd.byStatus.find((b) => b.key === "succeeded");
    expect(pending?.count).toBe(1);
    expect(succeeded?.count).toBe(1);
    expect(bd.byStatus.reduce((sum, b) => sum + b.count, 0)).toBe(5);
  });

  it("buckets strategies sorted by frequency", () => {
    const bd = computeBreakdowns(workflows);
    expect(bd.byStrategy[0]).toMatchObject({ key: "send_payment_link", count: 2 });
  });

  it("buckets failure categories only when failures exist", () => {
    const bd = computeBreakdowns(workflows);
    expect(bd.byFailureCategory.find((b) => b.key === "temporary")?.count).toBe(1);
    expect(bd.byFailureCategory.find((b) => b.key === "permanent")?.count).toBe(1);

    const none = computeBreakdowns([workflow()]);
    expect(none.byFailureCategory.every((b) => b.count === 0)).toBe(true);
  });

  it("bands scores into high/medium/low", () => {
    expect(scoreBand(85)).toBe("high");
    expect(scoreBand(70)).toBe("high");
    expect(scoreBand(55)).toBe("medium");
    expect(scoreBand(40)).toBe("medium");
    expect(scoreBand(39)).toBe("low");
    const bd = computeBreakdowns(workflows);
    expect(bd.byScoreBand.find((b) => b.key === "high")?.count).toBe(2);
  });
});

describe("intelligence quality stats", () => {
  it("separates AI-assisted from rule-based decisions honestly", () => {
    const stats = computeIntelligenceStats([
      workflow({ decisionSource: "ai", confidence: 0.8, recoveryScore: 70 }),
      workflow({ decisionSource: "ai", confidence: 0.6, recoveryScore: 50 }),
      workflow({ decisionSource: "rules", confidence: 0.9, recoveryScore: 90 }),
      workflow({ decisionSource: "unknown-ish", confidence: 0.5, recoveryScore: 30 }),
    ]);

    const ai = stats.sources.find((s) => s.source === "ai")!;
    const rules = stats.sources.find((s) => s.source === "rules")!;
    expect(ai.decisions).toBe(2);
    expect(ai.avgConfidence).toBeCloseTo(0.7);
    expect(rules.decisions).toBe(2); // unknown sources count as rules fallback
    expect(rules.avgRecoveryScore).toBe(60);
  });

  it("hides strategy success rates below the minimum sample size", () => {
    const stats = computeIntelligenceStats([
      workflow({ strategy: "send_payment_link", status: "succeeded" }),
      workflow({ strategy: "send_payment_link", status: "failed" }),
      // A non-terminal workflow must not count towards the sample.
      workflow({ strategy: "send_payment_link", status: "pending" }),
    ]);
    expect(stats.hasOutcomeData).toBe(false);
    expect(stats.outcomeByStrategy).toEqual([]);
  });

  it("publishes outcome rates only at sufficient sample size", () => {
    const stats = computeIntelligenceStats([
      workflow({ strategy: "retry_payment", status: "succeeded" }),
      workflow({ strategy: "retry_payment", status: "succeeded" }),
      workflow({ strategy: "retry_payment", status: "failed" }),
      workflow({ strategy: "retry_payment", status: "succeeded", decisionSource: "ai" }),
    ]);
    expect(stats.hasOutcomeData).toBe(true);
    expect(stats.outcomeByStrategy[0]).toMatchObject({
      strategy: "retry_payment",
      terminalCases: 4,
      succeeded: 3,
      successRate: 0.75,
    });
  });
});

describe("daily performance series and weekly trend", () => {
  it("buckets recovered amounts on completion days only", () => {
    const workflows = [
      workflow({
        status: "succeeded",
        amountRecovered: 500,
        completedAt: new Date("2026-08-24T09:00:00Z"),
      }),
      workflow({
        id: "w2",
        status: "succeeded",
        amountRecovered: 250,
        completedAt: new Date("2026-08-23T18:00:00Z"),
      }),
      workflow({ id: "w3", status: "failed", amountRecovered: 0 }),
    ];
    const series = computeDailySeries(workflows, [], {
      days: 14,
      now: new Date("2026-08-24T12:00:00Z"),
    });

    expect(series).toHaveLength(14);
    expect(series[series.length - 1]).toMatchObject({
      dateKey: "2026-08-24",
      recoveredPaise: 500,
    });
    expect(series[series.length - 2]).toMatchObject({
      dateKey: "2026-08-23",
      recoveredPaise: 250,
    });
    expect(series[0].recoveredPaise).toBe(0);
  });

  it("buckets newly-detected risk value on detection days", () => {
    const series = computeDailySeries(
      [],
      [risk({ createdAt: new Date("2026-08-24T01:00:00Z"), amountAtRisk: 777 })],
      { days: 3, now: new Date("2026-08-24T12:00:00Z") }
    );
    expect(series[series.length - 1].detectedPaise).toBe(777);
  });

  it("refuses to fabricate a trend from sparse or zero history", () => {
    expect(computeWeeklyTrend([])).toBeNull();
    expect(computeWeeklyTrend(computeDailySeries([], [], { days: 14, now: NOW }))).toMatchObject({
      meaningful: false,
    });
  });

  it("marks a real trend as meaningful only with revenue in both weeks", () => {
    const day = (offset: number) =>
      new Date(Date.UTC(2026, 7, 24 - offset, 10, 0, 0));

    const workflows = [
      workflow({ id: "cur", status: "succeeded", amountRecovered: 400, completedAt: day(1) }),
      workflow({ id: "prev", status: "succeeded", amountRecovered: 300, completedAt: day(8) }),
    ];
    const trend = computeWeeklyTrend(computeDailySeries(workflows, [], { days: 14, now: NOW }))!;
    expect(trend.meaningful).toBe(true);
    expect(trend.direction).toBe("up");
    expect(trend.deltaPaise).toBe(100);
  });
});

describe("intelligence KPIs", () => {
  it("averages scores and counts sources", () => {
    const kpis = computeIntelligenceKpis([
      workflow({ recoveryScore: 80, decisionSource: "ai" }),
      workflow({ recoveryScore: 60, decisionSource: "rules" }),
      workflow({ recoveryScore: 75, decisionSource: "ai" }),
    ]);
    expect(kpis.avgRecoveryScore).toBe(Math.round((80 + 60 + 75) / 3));
    expect(kpis.highOpportunityCases).toBe(2);
    expect(kpis.aiAssistedDecisions).toBe(2);
    expect(kpis.ruleBasedDecisions).toBe(1);
  });

  it("handles the empty dataset", () => {
    const kpis = computeIntelligenceKpis([]);
    expect(kpis.avgRecoveryScore).toBe(0);
    expect(kpis.highOpportunityCases).toBe(0);
  });
});

describe("recovery timeline mapping", () => {
  const baseRow = {
    action: "recover",
    actor: "system" as const,
    status: "success" as const,
  };

  it("orders events oldest-first regardless of input order", () => {
    const timeline = buildRecoveryTimeline([
      { id: "b", ...baseRow, details: { event: "execution_started", from: "pending", to: "executing", attemptNumber: 1 }, createdAt: new Date("2026-08-24T10:05:00Z") },
      { id: "a", ...baseRow, details: { event: "decision_generated" }, createdAt: new Date("2026-08-24T10:00:00Z") },
    ]);

    expect(timeline.map((e) => e.id)).toEqual(["a", "b"]);
    expect(timeline[1].title).toBe("Execution started");
    expect(timeline[1].from).toBe("pending");
    expect(timeline[1].to).toBe("executing");
    expect(timeline[1].attemptNumber).toBe(1);
  });

  it("labels webhook and guardrail events distinctly without inventing data", () => {
    const timeline = buildRecoveryTimeline([
      { id: "w", action: "webhook", actor: "razorpay_webhook", status: "success", details: { event: "payment_link.paid" }, createdAt: new Date() },
      { id: "g", action: "guardrail_block", actor: "system", status: "warning", details: {}, createdAt: new Date() },
      { id: "u", action: "mystery_action", actor: "user", status: "success", details: {}, createdAt: new Date() },
    ]);

    expect(timeline.find((e) => e.id === "w")?.kind).toBe("webhook");
    expect(timeline.find((e) => e.id === "w")?.title).toBe("Customer paid via link");
    expect(timeline.find((e) => e.id === "g")?.kind).toBe("guardrail");
    // Unknown rows still render - never dropped, never fabricated.
    expect(timeline.find((e) => e.id === "u")?.title).toBe("System event");
  });
});
