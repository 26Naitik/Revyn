import { describe, it, expect } from "vitest";
import { DEFAULT_LIMITS } from "@/lib/guardrails/limits";

describe("Guardrail Limits", () => {
  it("has sensible defaults", () => {
    expect(DEFAULT_LIMITS.maxAttemptsPerRisk).toBe(3);
    expect(DEFAULT_LIMITS.maxRetriesPerCustomer).toBe(3);
    expect(DEFAULT_LIMITS.maxDiscountPercent).toBe(10);
    expect(DEFAULT_LIMITS.minRecoveryAmountPaise).toBe(1000);
    expect(DEFAULT_LIMITS.maxRecoveryBudgetPaise).toBe(5000000);
    expect(DEFAULT_LIMITS.cooldownMinutes).toBe(60);
    expect(DEFAULT_LIMITS.escalateAfterFailures).toBe(3);
  });

  it("min recovery amount is at least INR 10", () => {
    expect(DEFAULT_LIMITS.minRecoveryAmountPaise).toBeGreaterThanOrEqual(1000);
  });

  it("max discount does not exceed 10%", () => {
    expect(DEFAULT_LIMITS.maxDiscountPercent).toBeLessThanOrEqual(10);
  });

  it("max attempts per risk is reasonable", () => {
    expect(DEFAULT_LIMITS.maxAttemptsPerRisk).toBeLessThanOrEqual(5);
    expect(DEFAULT_LIMITS.maxAttemptsPerRisk).toBeGreaterThanOrEqual(1);
  });
});
