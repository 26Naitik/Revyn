import { describe, it, expect } from "vitest";
import {
  FAILURE_REASONS,
  classifyFailure,
} from "@/lib/recovery/failure-classification";

describe("failure classification", () => {
  it("classifies transient provider problems as temporary and retryable", () => {
    for (const reason of [
      "Request timed out after 15000ms",
      "ECONNREFUSED 127.0.0.1:443",
      "socket hang up",
      "Razorpay rate limit exceeded",
      "service unavailable (503)",
      "insufficient_funds on instrument",
      FAILURE_REASONS.paymentLinkExpired,
    ]) {
      const result = classifyFailure(reason);
      expect(result.category).toBe("temporary");
      expect(result.retryable).toBe(true);
    }
  });

  it("classifies permanent conditions as non-retryable", () => {
    for (const reason of [
      "invalid customer email",
      "razorpay credentials not configured",
      "unauthorized: bad API key",
      "unsupported_currency EUR",
      "customer cancelled the mandate",
      "account is blocked",
    ]) {
      const result = classifyFailure(reason);
      expect(result.category).toBe("permanent");
      expect(result.retryable).toBe(false);
    }
  });

  it("defaults unknown failures to permanent so nothing loops blindly", () => {
    const result = classifyFailure("something entirely novel happened");
    expect(result.category).toBe("permanent");
    expect(result.retryable).toBe(false);
  });

  it("is deterministic", () => {
    const a = classifyFailure("network timeout");
    const b = classifyFailure("network timeout");
    expect(a).toEqual(b);
  });
});
