import { describe, it, expect } from "vitest";

interface DecisionInput {
  rootCause: string;
  amountAtRisk: number;
  failCount: number;
}

interface DecisionOutput {
  strategy: string;
  confidence: number;
  discountPercent: number;
  retryDelay: string | null;
}

function decide(input: DecisionInput): DecisionOutput {
  const { rootCause, amountAtRisk, failCount } = input;

  if (failCount >= 3) {
    return { strategy: "escalate_human", confidence: 0.3, discountPercent: 0, retryDelay: null };
  }

  switch (rootCause) {
    case "expired_card":
      return { strategy: "send_payment_link", confidence: 0.9, discountPercent: 0, retryDelay: null };
    case "insufficient_funds":
      return { strategy: "schedule_retry", confidence: 0.8, discountPercent: 0, retryDelay: "48h" };
    case "card_declined":
      if (failCount >= 2) {
        return { strategy: "escalate_human", confidence: 0.6, discountPercent: 0, retryDelay: null };
      }
      return { strategy: "retry_payment", confidence: 0.7, discountPercent: 0, retryDelay: null };
    case "network_timeout":
      return { strategy: "retry_payment", confidence: 0.85, discountPercent: 0, retryDelay: null };
    case "authentication_failure":
    case "3ds_authentication_failure":
      return { strategy: "send_payment_link", confidence: 0.8, discountPercent: 0, retryDelay: null };
    case "abandoned_checkout":
      if (amountAtRisk > 500000) {
        return { strategy: "send_payment_link", confidence: 0.7, discountPercent: 0, retryDelay: null };
      }
      return { strategy: "send_payment_link", confidence: 0.65, discountPercent: 5, retryDelay: null };
    case "subscription_mandate_failed":
      return { strategy: "send_payment_link", confidence: 0.8, discountPercent: 0, retryDelay: null };
    case "subscription_halted":
      return { strategy: "schedule_retry", confidence: 0.7, discountPercent: 0, retryDelay: "24h" };
    case "subscription_recurring_failure":
      if (failCount >= 2) {
        return { strategy: "escalate_human", confidence: 0.6, discountPercent: 0, retryDelay: null };
      }
      return { strategy: "schedule_retry", confidence: 0.65, discountPercent: 0, retryDelay: "24h" };
    case "overdue_receivable":
      return { strategy: "send_payment_link", confidence: 0.6, discountPercent: 0, retryDelay: null };
    case "overdue_receivable_stale":
      return { strategy: "escalate_human", confidence: 0.5, discountPercent: 0, retryDelay: null };
    default:
      return { strategy: "send_payment_link", confidence: 0.4, discountPercent: 0, retryDelay: null };
  }
}

describe("Decision Engine (rule-based logic)", () => {
  it("sends payment link for expired card", () => {
    const result = decide({ rootCause: "expired_card", amountAtRisk: 29900, failCount: 0 });
    expect(result.strategy).toBe("send_payment_link");
    expect(result.discountPercent).toBe(0);
  });

  it("schedules retry for insufficient funds", () => {
    const result = decide({ rootCause: "insufficient_funds", amountAtRisk: 49900, failCount: 0 });
    expect(result.strategy).toBe("schedule_retry");
    expect(result.retryDelay).toBe("48h");
  });

  it("retries payment for network timeout", () => {
    const result = decide({ rootCause: "network_timeout", amountAtRisk: 99900, failCount: 0 });
    expect(result.strategy).toBe("retry_payment");
  });

  it("escalates after 3+ failures", () => {
    const result = decide({ rootCause: "card_declined", amountAtRisk: 29900, failCount: 3 });
    expect(result.strategy).toBe("escalate_human");
  });

  it("escalates card_declined after 2 failures", () => {
    const result = decide({ rootCause: "card_declined", amountAtRisk: 29900, failCount: 2 });
    expect(result.strategy).toBe("escalate_human");
  });

  it("offers discount for low-value abandoned checkout", () => {
    const result = decide({ rootCause: "abandoned_checkout", amountAtRisk: 9900, failCount: 0 });
    expect(result.strategy).toBe("send_payment_link");
    expect(result.discountPercent).toBe(5);
  });

  it("no discount for high-value abandoned checkout", () => {
    const result = decide({ rootCause: "abandoned_checkout", amountAtRisk: 999000, failCount: 0 });
    expect(result.strategy).toBe("send_payment_link");
    expect(result.discountPercent).toBe(0);
  });

  it("escalates stale overdue receivable", () => {
    const result = decide({ rootCause: "overdue_receivable_stale", amountAtRisk: 50000, failCount: 0 });
    expect(result.strategy).toBe("escalate_human");
  });

  it("escalates subscription recurring failure after 2 attempts", () => {
    const result = decide({ rootCause: "subscription_recurring_failure", amountAtRisk: 29900, failCount: 2 });
    expect(result.strategy).toBe("escalate_human");
  });

  it("schedules retry for subscription halted", () => {
    const result = decide({ rootCause: "subscription_halted", amountAtRisk: 19900, failCount: 0 });
    expect(result.strategy).toBe("schedule_retry");
    expect(result.retryDelay).toBe("24h");
  });

  it("sends payment link for subscription mandate failure", () => {
    const result = decide({ rootCause: "subscription_mandate_failed", amountAtRisk: 99900, failCount: 0 });
    expect(result.strategy).toBe("send_payment_link");
  });
});
