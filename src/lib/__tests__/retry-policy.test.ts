import { describe, it, expect } from "vitest";
import {
  RETRY_POLICY,
  computeRetryDelayHours,
  hasAttemptsLeft,
  nextRetryDate,
  parseRetryDelayHours,
  retryExhaustedReason,
  shouldRetry,
} from "@/lib/recovery/retry-policy";

describe("retry policy", () => {
  it("caps total attempts and stops the loop", () => {
    expect(hasAttemptsLeft(0)).toBe(true);
    expect(hasAttemptsLeft(RETRY_POLICY.maxAttempts - 1)).toBe(true);
    expect(hasAttemptsLeft(RETRY_POLICY.maxAttempts)).toBe(false);
    expect(hasAttemptsLeft(RETRY_POLICY.maxAttempts + 5)).toBe(false);
  });

  it("retries only temporary failures within the attempt budget", () => {
    expect(shouldRetry({ category: "temporary", attemptCount: 1 })).toBe(true);
    expect(shouldRetry({ category: "temporary", attemptCount: RETRY_POLICY.maxAttempts })).toBe(false);
    expect(shouldRetry({ category: "permanent", attemptCount: 1 })).toBe(false);
  });

  it("parses decision delays in hours/minutes/days", () => {
    expect(parseRetryDelayHours("48h")).toBe(48);
    expect(parseRetryDelayHours("24 hours")).toBe(24);
    expect(parseRetryDelayHours("90m")).toBeCloseTo(1.5);
    expect(parseRetryDelayHours("2 days")).toBe(48);
    expect(parseRetryDelayHours(null)).toBeNull();
    expect(parseRetryDelayHours("soon")).toBeNull();
    expect(parseRetryDelayHours("-4h")).toBeNull();
    expect(parseRetryDelayHours("0h")).toBeNull();
  });

  it("honours the decision delay on the first retry but backs off afterwards", () => {
    const first = computeRetryDelayHours(1, "48h");
    expect(first).toBe(48);

    const second = computeRetryDelayHours(2, "48h");
    expect(second).toBe(RETRY_POLICY.defaultDelayHours * 2);

    // Back-off is capped so retries never drift out indefinitely.
    const capped = computeRetryDelayHours(10, null);
    expect(capped).toBe(RETRY_POLICY.maxDelayHours);
  });

  it("caps an aggressive decision delay at the policy maximum", () => {
    expect(computeRetryDelayHours(1, "999h")).toBe(RETRY_POLICY.maxDelayHours);
  });

  it("schedules the next retry in the future", () => {
    const now = new Date("2026-08-24T12:00:00Z");
    const next = nextRetryDate(1, "24h", now);
    expect(next.getTime()).toBe(now.getTime() + 24 * 3_600_000);
  });

  it("explains exhaustion for audit trails", () => {
    const reason = retryExhaustedReason(3);
    expect(reason).toContain("3");
    expect(reason).toContain(String(RETRY_POLICY.maxAttempts));
  });
});
