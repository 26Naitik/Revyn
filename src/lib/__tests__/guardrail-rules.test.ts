import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  riskFindUnique: vi.fn(),
  auditCount: vi.fn(),
  auditFindFirst: vi.fn(),
  auditCreate: vi.fn(),
  wfCount: vi.fn(),
  wfAggregate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    revenueAtRisk: { findUnique: mocks.riskFindUnique },
    auditLog: {
      count: mocks.auditCount,
      findFirst: mocks.auditFindFirst,
      create: mocks.auditCreate,
    },
    recoveryWorkflow: {
      count: mocks.wfCount,
      aggregate: mocks.wfAggregate,
    },
  },
}));

import {
  checkMaxDiscountsPerCustomerPerMonth,
  checkMaxPaymentLinksPerWeek,
  checkMaxRetriesPerCustomer,
  runAllGuardrails,
} from "@/lib/guardrails/rules";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("checkMaxPaymentLinksPerWeek", () => {
  it("allows a customer under the weekly link cap", async () => {
    mocks.auditCount.mockResolvedValue(1);
    const result = await checkMaxPaymentLinksPerWeek("cus_1");
    expect(result).toMatchObject({ allowed: true, rule: "max_payment_links_per_week" });
    // Rate limit uses a real rolling window.
    const where = mocks.auditCount.mock.calls[0][0].where;
    expect(where.createdAt.gte).toBeInstanceOf(Date);
    expect(where.details).toEqual({ contains: "payment_link_created" });
    expect(where.revenueRisk.OR.map((o: object) => Object.keys(o)[0]).sort()).toEqual([
      "order",
      "payment",
      "subscription",
    ]);
  });

  it("blocks at the configured cap of links in the last 7 days", async () => {
    mocks.auditCount.mockResolvedValue(2);
    const result = await checkMaxPaymentLinksPerWeek("cus_1");
    expect(result).toMatchObject({
      allowed: false,
      rule: "max_payment_links_per_week",
    });
    expect(result.reason).toContain("(max: 2)");
  });

  it("honours per-call overrides", async () => {
    mocks.auditCount.mockResolvedValue(1);
    const result = await checkMaxPaymentLinksPerWeek("cus_1", {
      maxPaymentLinksPerWeek: 1,
    });
    expect(result.allowed).toBe(false);
  });
});

describe("checkMaxDiscountsPerCustomerPerMonth", () => {
  it("allows a customer with no recent discount decisions", async () => {
    mocks.wfCount.mockResolvedValue(0);
    const result = await checkMaxDiscountsPerCustomerPerMonth("cus_2");
    expect(result.allowed).toBe(true);
    const where = mocks.wfCount.mock.calls[0][0].where;
    expect(where.discountPercent).toEqual({ gt: 0 });
    expect(where.createdAt.gte).toBeInstanceOf(Date);
  });

  it("blocks when the monthly discount budget is already spent", async () => {
    mocks.wfCount.mockResolvedValue(1);
    const result = await checkMaxDiscountsPerCustomerPerMonth("cus_2");
    expect(result).toMatchObject({
      allowed: false,
      rule: "max_discount_per_customer_per_month",
    });
  });
});

describe("checkMaxRetriesPerCustomer scoping", () => {
  it("counts recover actions across every owned risk", async () => {
    mocks.auditCount.mockResolvedValue(3);
    const result = await checkMaxRetriesPerCustomer("cus_3");
    expect(result).toMatchObject({
      allowed: false,
      rule: "max_retries_per_customer",
    });
  });
});

describe("runAllGuardrails aggregation", () => {
  function allowAll() {
    mocks.riskFindUnique.mockResolvedValue({
      id: "risk_1",
      recovery: { attemptCount: 0 },
      auditLogs: [],
    });
    mocks.auditCount.mockResolvedValue(0);
    mocks.wfCount.mockResolvedValue(0);
    mocks.wfAggregate.mockResolvedValue({ _sum: { amountRecovered: 0 } });
    mocks.auditFindFirst.mockResolvedValue(null);
  }

  it("returns allowed without writing an audit row when nothing blocks", async () => {
    allowAll();
    const result = await runAllGuardrails("risk_1", "cus_1", "mer_1", 50_000);
    expect(result).toEqual({ allowed: true, blockedBy: null });
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("writes exactly one guardrail_block audit entry naming the blocking rule", async () => {
    mocks.riskFindUnique.mockResolvedValue({
      id: "risk_1",
      recovery: { attemptCount: 3 },
      auditLogs: [],
    });
    mocks.auditCount.mockResolvedValue(0);
    mocks.wfCount.mockResolvedValue(0);
    mocks.wfAggregate.mockResolvedValue({ _sum: { amountRecovered: 0 } });
    mocks.auditFindFirst.mockResolvedValue(null);

    const result = await runAllGuardrails("risk_1", "cus_1", "mer_1", 50_000);

    expect(result.allowed).toBe(false);
    expect(result.blockedBy?.rule).toBe("max_attempts_per_risk");
    expect(mocks.auditCreate).toHaveBeenCalledTimes(1);
    const data = mocks.auditCreate.mock.calls[0][0].data;
    expect(data.action).toBe("guardrail_block");
    expect(data.status).toBe("warning");
    const details = JSON.parse(data.details as string);
    expect(details.rule).toBe("max_attempts_per_risk");
    expect(details.reason).toContain("max: 3");
  });

  it("surfaces the new weekly-link rate limit through the aggregate gate", async () => {
    allowAll();
    mocks.auditCount.mockImplementation(() => {
      return Promise.resolve(2); // hits both retries + links checks
    });

    const result = await runAllGuardrails("risk_1", "cus_1", "mer_1", 50_000);

    expect(result.allowed).toBe(false);
    // Deterministic precedence: first blocked rule in the fixed order wins.
    expect(["max_retries_per_customer", "max_payment_links_per_week"]).toContain(
      result.blockedBy?.rule
    );
  });
});
