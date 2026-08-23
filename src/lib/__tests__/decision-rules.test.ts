import { describe, it, expect } from "vitest";
import {
  RECOVERY_STRATEGIES,
  applyLowScoreRule,
  derivePriority,
  isRecoveryStrategy,
  nextStepFor,
  selectBaseStrategy,
} from "@/lib/engine/decision-rules";

describe("selectBaseStrategy (deterministic rule map)", () => {
  it("sends a payment link for an expired card", () => {
    const decision = selectBaseStrategy("expired_card", 29_900, 0);
    expect(decision.strategy).toBe("send_payment_link");
    expect(decision.discountPercent).toBe(0);
    expect(decision.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("schedules a delayed retry for insufficient funds", () => {
    const decision = selectBaseStrategy("insufficient_funds", 49_900, 0);
    expect(decision.strategy).toBe("schedule_retry");
    expect(decision.retryDelay).toBe("48h");
  });

  it("retries immediately for transient network timeouts", () => {
    const decision = selectBaseStrategy("network_timeout", 99_900, 0);
    expect(decision.strategy).toBe("retry_payment");
  });

  it("retries a first card decline but escalates on the second", () => {
    const first = selectBaseStrategy("card_declined", 29_900, 1);
    const second = selectBaseStrategy("card_declined", 29_900, 2);

    expect(first.strategy).toBe("retry_payment");
    expect(second.strategy).toBe("escalate_human");
    expect(second.reasoning).toContain("2 times");
  });

  it("falls back safely for unknown root causes", () => {
    const unknownFresh = selectBaseStrategy("alien_failure", 10_000, 0);
    expect(unknownFresh.strategy).toBe("send_payment_link");
    expect(unknownFresh.confidence).toBeLessThan(0.5);

    const unknownRepeated = selectBaseStrategy("alien_failure", 10_000, 4);
    expect(unknownRepeated.strategy).toBe("escalate_human");
  });

  it("discounts low-value abandoned checkouts but not high-value ones", () => {
    const cheap = selectBaseStrategy("abandoned_checkout", 99_900, 0);
    const expensive = selectBaseStrategy("abandoned_checkout", 999_000, 0);

    expect(cheap.discountPercent).toBe(5);
    expect(expensive.discountPercent).toBe(0);
    expect(cheap.strategy).toBe("send_payment_link");
  });

  it("escalates stale overdue receivables", () => {
    const decision = selectBaseStrategy("overdue_receivable_stale", 50_000, 0);
    expect(decision.strategy).toBe("escalate_human");
  });
});

describe("applyLowScoreRule", () => {
  const base = selectBaseStrategy("network_timeout", 99_900, 0);

  it("routes weak automation candidates to a human", () => {
    const adjusted = applyLowScoreRule(base, 20);

    expect(adjusted.strategy).toBe("escalate_human");
    expect(adjusted.confidence).toBeLessThanOrEqual(base.confidence);
    expect(adjusted.reasoning).toContain("35");
  });

  it("keeps the deterministic strategy when the score is workable", () => {
    const adjusted = applyLowScoreRule(base, 55);
    expect(adjusted.strategy).toBe(base.strategy);
    expect(adjusted.reasoning).toBe(base.reasoning);
  });

  it("never downgrades an explicit escalation or no_action", () => {
    const escalate = applyLowScoreRule(
      { ...base, strategy: "escalate_human" },
      10
    );
    expect(escalate.strategy).toBe("escalate_human");

    const noAction = applyLowScoreRule(
      { ...base, strategy: "no_action" },
      10
    );
    expect(noAction.strategy).toBe("no_action");
  });
});

describe("derivePriority", () => {
  it("marks guardrail escalations critical", () => {
    expect(derivePriority(90, 10_000, true)).toBe("critical");
  });

  it("marks large amounts with decent scores critical", () => {
    expect(derivePriority(60, 6_000_000, false)).toBe("critical");
  });

  it("uses score and amount bands otherwise", () => {
    expect(derivePriority(75, 10_000, false)).toBe("high");
    expect(derivePriority(30, 2_000_000, false)).toBe("high");
    expect(derivePriority(50, 500_000, false)).toBe("medium");
    expect(derivePriority(20, 500_000, false)).toBe("low");
  });
});

describe("nextStepFor", () => {
  it("produces concrete guidance per strategy", () => {
    expect(nextStepFor("retry_payment")).toMatch(/retry/i);
    expect(nextStepFor("schedule_retry", { retryDelay: "48h" })).toContain(
      "48h"
    );
    expect(
      nextStepFor("offer_discount", { discountPercent: 5 })
    ).toContain("5% off");
    expect(nextStepFor("send_payment_link", { discountPercent: 5 })).toContain(
      "5% incentive"
    );
    expect(nextStepFor("escalate_human")).toMatch(/recovery team/i);
    expect(nextStepFor("no_action")).toMatch(/close/i);
  });
});

describe("strategy vocabulary", () => {
  it("exposes exactly the six supported strategies and validates them", () => {
    expect(RECOVERY_STRATEGIES).toHaveLength(6);
    for (const strategy of RECOVERY_STRATEGIES) {
      expect(isRecoveryStrategy(strategy)).toBe(true);
    }
    expect(isRecoveryStrategy("transfer_money")).toBe(false);
  });
});
