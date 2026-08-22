import { describe, it, expect } from "vitest";

interface DiagnosisInput {
  type: string;
  errorCode: string | null;
  errorReason: string | null;
  errorSource: string | null;
  errorStep: string | null;
  subStatus: string | null;
  paidCount: number;
  remainingCount: number;
  orderAgeHours: number;
}

interface DiagnosisOutput {
  rootCause: string;
  confidenceScore: number;
  recommendedNextStep: string;
}

function diagnose(input: DiagnosisInput): DiagnosisOutput {
  if (input.type === "failed_payment") {
    if (input.errorReason === "expired_card") {
      return { rootCause: "expired_card", confidenceScore: 0.95, recommendedNextStep: "send_payment_link" };
    }
    if (input.errorReason === "insufficient_funds") {
      return { rootCause: "insufficient_funds", confidenceScore: 0.9, recommendedNextStep: "schedule_retry" };
    }
    if (input.errorReason === "card_declined") {
      return { rootCause: "card_declined", confidenceScore: 0.8, recommendedNextStep: "retry_payment" };
    }
    if (input.errorReason === "network_timeout" || (input.errorStep === "payment_authentication" && input.errorReason === "network_error")) {
      return { rootCause: "network_timeout", confidenceScore: 0.85, recommendedNextStep: "retry_payment" };
    }
    if (input.errorReason === "incorrect_otp" || input.errorReason === "authentication_failed") {
      return { rootCause: "authentication_failure", confidenceScore: 0.85, recommendedNextStep: "send_payment_link" };
    }
    return { rootCause: "payment_processing_error", confidenceScore: 0.5, recommendedNextStep: "send_payment_link" };
  }

  if (input.type === "abandoned_checkout") {
    return { rootCause: "abandoned_checkout", confidenceScore: 0.7, recommendedNextStep: "send_payment_link" };
  }

  if (input.type === "failed_subscription") {
    if (input.subStatus === "activation_failed") {
      return { rootCause: "subscription_mandate_failed", confidenceScore: 0.85, recommendedNextStep: "send_payment_link" };
    }
    if (input.subStatus === "halted") {
      return { rootCause: "subscription_halted", confidenceScore: 0.8, recommendedNextStep: "schedule_retry" };
    }
    if (input.paidCount === 0) {
      return { rootCause: "subscription_first_payment_failed", confidenceScore: 0.75, recommendedNextStep: "send_payment_link" };
    }
    return { rootCause: "subscription_recurring_failure", confidenceScore: 0.7, recommendedNextStep: "schedule_retry" };
  }

  if (input.type === "overdue_receivable") {
    if (input.orderAgeHours > 72) {
      return { rootCause: "overdue_receivable_stale", confidenceScore: 0.9, recommendedNextStep: "escalate_human" };
    }
    return { rootCause: "overdue_receivable", confidenceScore: 0.65, recommendedNextStep: "send_payment_link" };
  }

  return { rootCause: "unknown", confidenceScore: 0.2, recommendedNextStep: "escalate_human" };
}

describe("Diagnosis Engine (rule-based logic)", () => {
  describe("Failed card payment", () => {
    it("diagnoses expired card", () => {
      const result = diagnose({ type: "failed_payment", errorCode: "BAD_REQUEST_ERROR", errorReason: "expired_card", errorSource: "customer", errorStep: "payment_authentication", subStatus: null, paidCount: 0, remainingCount: 0, orderAgeHours: 0 });
      expect(result.rootCause).toBe("expired_card");
      expect(result.confidenceScore).toBeGreaterThanOrEqual(0.9);
      expect(result.recommendedNextStep).toBe("send_payment_link");
    });

    it("diagnoses insufficient funds", () => {
      const result = diagnose({ type: "failed_payment", errorCode: "BAD_REQUEST_ERROR", errorReason: "insufficient_funds", errorSource: "customer", errorStep: "payment_authentication", subStatus: null, paidCount: 0, remainingCount: 0, orderAgeHours: 0 });
      expect(result.rootCause).toBe("insufficient_funds");
      expect(result.confidenceScore).toBeGreaterThanOrEqual(0.85);
      expect(result.recommendedNextStep).toBe("schedule_retry");
    });

    it("diagnoses card declined", () => {
      const result = diagnose({ type: "failed_payment", errorCode: "BAD_REQUEST_ERROR", errorReason: "card_declined", errorSource: "acquirer", errorStep: "payment_authentication", subStatus: null, paidCount: 0, remainingCount: 0, orderAgeHours: 0 });
      expect(result.rootCause).toBe("card_declined");
      expect(result.recommendedNextStep).toBe("retry_payment");
    });

    it("diagnoses network timeout", () => {
      const result = diagnose({ type: "failed_payment", errorCode: "SERVER_ERROR", errorReason: "network_timeout", errorSource: "customer", errorStep: "payment_authentication", subStatus: null, paidCount: 0, remainingCount: 0, orderAgeHours: 0 });
      expect(result.rootCause).toBe("network_timeout");
      expect(result.recommendedNextStep).toBe("retry_payment");
    });

    it("diagnoses authentication failure", () => {
      const result = diagnose({ type: "failed_payment", errorCode: "BAD_REQUEST_ERROR", errorReason: "incorrect_otp", errorSource: "customer", errorStep: "payment_authentication", subStatus: null, paidCount: 0, remainingCount: 0, orderAgeHours: 0 });
      expect(result.rootCause).toBe("authentication_failure");
      expect(result.recommendedNextStep).toBe("send_payment_link");
    });
  });

  describe("Abandoned checkout", () => {
    it("diagnoses abandoned checkout", () => {
      const result = diagnose({ type: "abandoned_checkout", errorCode: null, errorReason: null, errorSource: null, errorStep: null, subStatus: null, paidCount: 0, remainingCount: 0, orderAgeHours: 1 });
      expect(result.rootCause).toBe("abandoned_checkout");
      expect(result.recommendedNextStep).toBe("send_payment_link");
    });
  });

  describe("Failed subscription", () => {
    it("diagnoses mandate failure", () => {
      const result = diagnose({ type: "failed_subscription", errorCode: null, errorReason: null, errorSource: null, errorStep: null, subStatus: "activation_failed", paidCount: 0, remainingCount: 5, orderAgeHours: 0 });
      expect(result.rootCause).toBe("subscription_mandate_failed");
      expect(result.recommendedNextStep).toBe("send_payment_link");
    });

    it("diagnoses halted subscription", () => {
      const result = diagnose({ type: "failed_subscription", errorCode: null, errorReason: null, errorSource: null, errorStep: null, subStatus: "halted", paidCount: 3, remainingCount: 3, orderAgeHours: 0 });
      expect(result.rootCause).toBe("subscription_halted");
      expect(result.recommendedNextStep).toBe("schedule_retry");
    });

    it("diagnoses first payment failure", () => {
      const result = diagnose({ type: "failed_subscription", errorCode: null, errorReason: null, errorSource: null, errorStep: null, subStatus: "expired", paidCount: 0, remainingCount: 6, orderAgeHours: 0 });
      expect(result.rootCause).toBe("subscription_first_payment_failed");
      expect(result.recommendedNextStep).toBe("send_payment_link");
    });

    it("diagnoses recurring failure", () => {
      const result = diagnose({ type: "failed_subscription", errorCode: null, errorReason: null, errorSource: null, errorStep: null, subStatus: "expired", paidCount: 3, remainingCount: 3, orderAgeHours: 0 });
      expect(result.rootCause).toBe("subscription_recurring_failure");
      expect(result.recommendedNextStep).toBe("schedule_retry");
    });
  });

  describe("Overdue receivable", () => {
    it("diagnoses recent overdue", () => {
      const result = diagnose({ type: "overdue_receivable", errorCode: null, errorReason: null, errorSource: null, errorStep: null, subStatus: null, paidCount: 0, remainingCount: 0, orderAgeHours: 48 });
      expect(result.rootCause).toBe("overdue_receivable");
      expect(result.recommendedNextStep).toBe("send_payment_link");
    });

    it("diagnoses stale overdue", () => {
      const result = diagnose({ type: "overdue_receivable", errorCode: null, errorReason: null, errorSource: null, errorStep: null, subStatus: null, paidCount: 0, remainingCount: 0, orderAgeHours: 80 });
      expect(result.rootCause).toBe("overdue_receivable_stale");
      expect(result.recommendedNextStep).toBe("escalate_human");
      expect(result.confidenceScore).toBeGreaterThanOrEqual(0.85);
    });
  });
});
