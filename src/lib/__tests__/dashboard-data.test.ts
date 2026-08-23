import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  isPaymentLinkEligible,
  parseAuditDetails,
} from "@/lib/dashboard/data";
import {
  formatDateTime,
  formatINR,
  formatPercent,
  labelRiskType,
  labelStrategy,
  statusBadgeClass,
} from "@/lib/format";

describe("isPaymentLinkEligible", () => {
  it("allows pending payment-link strategies", () => {
    expect(
      isPaymentLinkEligible({ status: "pending", strategy: "send_payment_link" })
    ).toBe(true);
    expect(
      isPaymentLinkEligible({ status: "pending", strategy: "offer_discount" })
    ).toBe(true);
  });

  it.each([
    ["executing", "send_payment_link"],
    ["succeeded", "send_payment_link"],
    ["failed", "send_payment_link"],
    ["cancelled", "send_payment_link"],
    ["pending", "schedule_retry"],
    ["pending", "escalate_human"],
    ["pending", "no_action"],
  ])("rejects %s + %s", (status, strategy) => {
    expect(isPaymentLinkEligible({ status, strategy })).toBe(false);
  });
});

describe("parseAuditDetails", () => {
  it("parses a JSON object", () => {
    expect(parseAuditDetails('{"amount":100,"event":"x"}')).toEqual({
      amount: 100,
      event: "x",
    });
  });

  it("returns an empty object for non-object JSON", () => {
    expect(parseAuditDetails("[1,2]")).toEqual({});
    expect(parseAuditDetails('"text"')).toEqual({});
    expect(parseAuditDetails("42")).toEqual({});
  });

  it("returns an empty object for malformed JSON", () => {
    expect(parseAuditDetails("{not-json")).toEqual({});
    expect(parseAuditDetails("")).toEqual({});
  });
});

describe("formatINR", () => {
  it("converts paise to rupees with Indian grouping", () => {
    expect(formatINR(0)).toBe("₹0");
    expect(formatINR(29900)).toBe("₹299");
    expect(formatINR(123456)).toBe("₹1,234.56");
    expect(formatINR(50000000)).toBe("₹5,00,000");
  });

  it("handles non-finite input defensively", () => {
    expect(formatINR(Number.NaN)).toBe("₹0");
  });
});

describe("formatPercent", () => {
  it("renders a fraction as a percentage", () => {
    expect(formatPercent(0)).toBe("0.0%");
    expect(formatPercent(0.25)).toBe("25.0%");
    expect(formatPercent(1)).toBe("100.0%");
  });
});

describe("labels", () => {
  it("maps known risk types and strategies to friendly labels", () => {
    expect(labelRiskType("failed_payment")).toBe("Failed payment");
    expect(labelStrategy("escalate_human")).toBe("Escalate to human");
  });

  it("passes through unknown values unchanged", () => {
    expect(labelRiskType("mystery")).toBe("mystery");
    expect(labelStrategy("mystery")).toBe("mystery");
  });
});

describe("formatDateTime", () => {
  it("formats a date deterministically", () => {
    expect(formatDateTime(new Date(2026, 7, 23, 14, 5))).toBe(
      "23 Aug 2026, 14:05"
    );
    expect(formatDateTime(new Date(2026, 0, 1, 3, 42))).toBe(
      "1 Jan 2026, 03:42"
    );
  });

  it("returns a placeholder for invalid dates", () => {
    expect(formatDateTime(new Date("not-a-date"))).toBe("—");
  });
});

describe("statusBadgeClass", () => {
  const fallback = statusBadgeClass("mystery_status");

  it.each(["detected", "recovered", "pending", "executing", "succeeded", "failed"])(
    "has a style for %s distinct from the fallback",
    (status) => {
      expect(statusBadgeClass(status)).not.toBe(fallback);
      expect(statusBadgeClass(status)).toContain("bg-");
    }
  );

  it("falls back to a neutral style for unknown statuses", () => {
    expect(fallback).toContain("ring-gray-500/20");
  });
});
