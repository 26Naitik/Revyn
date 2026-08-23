import { describe, it, expect } from "vitest";
import {
  RECOVERY_SCORE_WEIGHTS,
  computeRecoveryScore,
  parseStoredFactors,
  scoreBandFor,
  type RecoveryContextInput,
} from "@/lib/engine/scoring";

const NOW = new Date("2026-08-24T12:00:00Z");

function baseContext(
  overrides: Partial<RecoveryContextInput> = {}
): RecoveryContextInput {
  return {
    riskType: "failed_payment",
    amountPaise: 49_900,
    riskCreatedAt: new Date(NOW.getTime() - 2 * 3_600_000),
    customerCreatedAt: new Date(NOW.getTime() - 400 * 86_400_000),
    totalPayments: 10,
    successfulPayments: 10,
    recentFailedPayments: 0,
    recoveryAttempts: 0,
    recoverySuccesses: 0,
    ...overrides,
  };
}

function factorOf(result: ReturnType<typeof computeRecoveryScore>, key: string) {
  const factor = result.factors.find((f) => f.key === key);
  if (!factor) throw new Error(`missing factor ${key}`);
  return factor;
}

describe("recovery score weights", () => {
  it("weights sum to exactly 1", () => {
    const total = Object.values(RECOVERY_SCORE_WEIGHTS).reduce(
      (sum, weight) => sum + weight,
      0
    );
    expect(Math.abs(total - 1)).toBeLessThan(1e-9);
  });

  it("every factor carries its documented weight", () => {
    const result = computeRecoveryScore(baseContext(), NOW);
    for (const factor of result.factors) {
      expect(factor.weight).toBe(
        RECOVERY_SCORE_WEIGHTS[factor.key as keyof typeof RECOVERY_SCORE_WEIGHTS]
      );
      expect(factor.contribution).toBeCloseTo(
        factor.value * factor.weight * 100,
        1
      );
    }
  });
});

describe("healthy payment history", () => {
  it("scores a clean, long-tenured customer in the high band", () => {
    const result = computeRecoveryScore(baseContext(), NOW);

    expect(result.score).toBeGreaterThan(85);
    expect(result.band).toBe("high");
    expect(factorOf(result, "payment_history").value).toBe(1);
    expect(factorOf(result, "payment_history").detail).toContain("10/10");
  });
});

describe("repeated payment failures", () => {
  it("penalises recent failures relative to a clean baseline", () => {
    const clean = computeRecoveryScore(baseContext(), NOW);
    const repeated = computeRecoveryScore(
      baseContext({ recentFailedPayments: 3 }),
      NOW
    );

    const repeatedFailures = factorOf(repeated, "recent_failures");

    expect(repeatedFailures.value).toBeCloseTo(0.16, 2);
    expect(repeated.score).toBeLessThan(clean.score - 15);
    expect(repeatedFailures.detail).toContain("3 failed payments");
  });

  it("floors the failure penalty instead of reaching zero", () => {
    const result = computeRecoveryScore(
      baseContext({ recentFailedPayments: 99 }),
      NOW
    );
    expect(factorOf(result, "recent_failures").value).toBe(0.1);
  });
});

describe("long overdue payments", () => {
  it("decays freshness credit as the case ages", () => {
    const fresh = computeRecoveryScore(baseContext(), NOW);
    const stale = computeRecoveryScore(
      baseContext({
        riskCreatedAt: new Date(NOW.getTime() - 20 * 86_400_000),
      }),
      NOW
    );

    expect(factorOf(fresh, "overdue_duration").value).toBe(1);
    expect(factorOf(stale, "overdue_duration").value).toBeCloseTo(0.05, 2);
    expect(stale.score).toBeLessThan(fresh.score - 13);
    expect(factorOf(stale, "overdue_duration").detail).toContain("20 days old");
  });
});

describe("previously recovered customer", () => {
  it("rewards past successful recoveries over an unknown history", () => {
    const unknown = computeRecoveryScore(baseContext(), NOW);
    const recovered = computeRecoveryScore(
      baseContext({ recoveryAttempts: 3, recoverySuccesses: 2 }),
      NOW
    );

    expect(factorOf(recovered, "recovery_history").value).toBeCloseTo(0.67, 2);
    expect(recovered.score).toBeGreaterThan(unknown.score);

    const allRecovered = computeRecoveryScore(
      baseContext({ recoveryAttempts: 2, recoverySuccesses: 2 }),
      NOW
    );
    expect(factorOf(allRecovered, "recovery_history").value).toBe(1);
  });
});

describe("high-value payment", () => {
  it("scores very large tickets below mid-market tickets", () => {
    const mid = computeRecoveryScore(
      baseContext({ amountPaise: 499_900 }),
      NOW
    );
    const huge = computeRecoveryScore(
      baseContext({ amountPaise: 30_000_000 }),
      NOW
    );

    expect(factorOf(mid, "amount_fit").value).toBe(1);
    expect(factorOf(huge, "amount_fit").value).toBe(0.35);
    expect(huge.score).toBeLessThan(mid.score);
  });
});

describe("low-risk vs high-risk cases", () => {
  it("orders clearly so queues can be prioritised", () => {
    const lowRisk = computeRecoveryScore(baseContext(), NOW);
    const highRisk = computeRecoveryScore(
      baseContext({
        totalPayments: 4,
        successfulPayments: 1,
        recentFailedPayments: 3,
        riskCreatedAt: new Date(NOW.getTime() - 15 * 86_400_000),
        customerCreatedAt: new Date(NOW.getTime() - 5 * 86_400_000),
        amountPaise: 25_000_000,
      }),
      NOW
    );

    expect(lowRisk.band).toBe("high");
    expect(highRisk.band).toBe("low");
    expect(lowRisk.score).toBeGreaterThan(highRisk.score + 30);
  });
});

describe("missing optional data", () => {
  it("stays finite, bounded and neutral when nothing is known", () => {
    const result = computeRecoveryScore(
      baseContext({
        totalPayments: 0,
        successfulPayments: 0,
        recentFailedPayments: 0,
        recoveryAttempts: 0,
        recoverySuccesses: 0,
        customerCreatedAt: NOW,
      }),
      NOW
    );

    expect(Number.isFinite(result.score)).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.factors).toHaveLength(6);
    for (const factor of result.factors) {
      expect(Number.isFinite(factor.value)).toBe(true);
      expect(factor.value).toBeGreaterThanOrEqual(0);
      expect(factor.value).toBeLessThanOrEqual(1);
    }
    // No history -> neutral scores, not zeros.
    expect(factorOf(result, "payment_history").value).toBe(0.5);
    expect(factorOf(result, "recovery_history").value).toBe(0.5);
  });
});

describe("determinism", () => {
  it("produces byte-identical results for identical inputs", () => {
    const context = baseContext({
      recentFailedPayments: 2,
      recoveryAttempts: 1,
      recoverySuccesses: 1,
    });

    const first = computeRecoveryScore(context, NOW);
    const second = computeRecoveryScore(context, NOW);

    expect(second).toEqual(first);
  });

  it("is independent of wall-clock time when 'now' is pinned", () => {
    const context = baseContext();
    const pinned = computeRecoveryScore(context, NOW);
    const later = computeRecoveryScore(context, new Date(NOW.getTime() + 5_000));

    expect(later).toEqual(pinned);
  });
});

describe("score bands", () => {
  it("maps thresholds deterministically", () => {
    expect(scoreBandFor(95)).toBe("high");
    expect(scoreBandFor(70)).toBe("high");
    expect(scoreBandFor(69.9)).toBe("medium");
    expect(scoreBandFor(40)).toBe("medium");
    expect(scoreBandFor(39.9)).toBe("low");
  });
});

describe("parseStoredFactors", () => {
  it("validates persisted JSON and rejects malformed shapes", () => {
    const good = [
      {
        key: "payment_history",
        label: "Payment history",
        value: 1,
        weight: 0.25,
        contribution: 25,
        detail: "10/10 past payments captured",
      },
    ];
    expect(parseStoredFactors(good)).toHaveLength(1);
    expect(parseStoredFactors(null)).toEqual([]);
    expect(parseStoredFactors([{ unexpected: true }])).toEqual([]);
    expect(parseStoredFactors("nonsense")).toEqual([]);
  });
});
