import { describe, it, expect } from "vitest";

interface RiskItem {
  type: string;
  status: string;
  amountAtRisk: number;
}

function calculateMeasurements(risks: RiskItem[]) {
  const totalAtRisk = risks.reduce((sum, r) => sum + r.amountAtRisk, 0);

  const byType: Record<string, number> = {};
  for (const r of risks) {
    byType[r.type] = (byType[r.type] || 0) + 1;
  }

  const byStatus: Record<string, number> = {};
  for (const r of risks) {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
  }

  return { totalAtRisk, byType, byStatus, totalRiskItems: risks.length };
}

describe("Measure Engine (calculation logic)", () => {
  it("calculates total at risk", () => {
    const risks: RiskItem[] = [
      { type: "failed_payment", status: "detected", amountAtRisk: 29900 },
      { type: "abandoned_checkout", status: "detected", amountAtRisk: 49900 },
      { type: "failed_subscription", status: "decided", amountAtRisk: 19900 },
    ];
    const result = calculateMeasurements(risks);
    expect(result.totalAtRisk).toBe(99700);
    expect(result.totalRiskItems).toBe(3);
  });

  it("counts by type correctly", () => {
    const risks: RiskItem[] = [
      { type: "failed_payment", status: "detected", amountAtRisk: 100 },
      { type: "failed_payment", status: "diagnosing", amountAtRisk: 200 },
      { type: "abandoned_checkout", status: "detected", amountAtRisk: 300 },
    ];
    const result = calculateMeasurements(risks);
    expect(result.byType["failed_payment"]).toBe(2);
    expect(result.byType["abandoned_checkout"]).toBe(1);
  });

  it("counts by status correctly", () => {
    const risks: RiskItem[] = [
      { type: "failed_payment", status: "detected", amountAtRisk: 100 },
      { type: "failed_payment", status: "detected", amountAtRisk: 200 },
      { type: "failed_payment", status: "decided", amountAtRisk: 300 },
    ];
    const result = calculateMeasurements(risks);
    expect(result.byStatus["detected"]).toBe(2);
    expect(result.byStatus["decided"]).toBe(1);
  });

  it("handles empty risk list", () => {
    const result = calculateMeasurements([]);
    expect(result.totalAtRisk).toBe(0);
    expect(result.totalRiskItems).toBe(0);
    expect(result.byType).toEqual({});
    expect(result.byStatus).toEqual({});
  });

  it("handles large amounts in paise", () => {
    const risks: RiskItem[] = [
      { type: "failed_payment", status: "detected", amountAtRisk: 99999900 },
    ];
    const result = calculateMeasurements(risks);
    expect(result.totalAtRisk).toBe(99999900);
  });

  it("mixes all four risk types", () => {
    const risks: RiskItem[] = [
      { type: "failed_payment", status: "detected", amountAtRisk: 100 },
      { type: "abandoned_checkout", status: "detected", amountAtRisk: 200 },
      { type: "failed_subscription", status: "detected", amountAtRisk: 300 },
      { type: "overdue_receivable", status: "detected", amountAtRisk: 400 },
    ];
    const result = calculateMeasurements(risks);
    expect(Object.keys(result.byType)).toHaveLength(4);
    expect(result.totalAtRisk).toBe(1000);
  });
});
