import { describe, expect, it } from "vitest";

import {
  formatDateTime,
  formatINRCompact,
  formatRelativeTime,
  shortRef,
} from "@/lib/format";

describe("formatINRCompact", () => {
  it("formats zero as ₹0", () => {
    expect(formatINRCompact(0)).toBe("₹0");
    expect(formatINRCompact(Number.NaN)).toBe("₹0");
  });

  it("formats small amounts as whole rupees", () => {
    expect(formatINRCompact(50_000)).toBe("₹500");
    expect(formatINRCompact(99_900)).toBe("₹999");
  });

  it("formats thousands as ₹nK", () => {
    expect(formatINRCompact(100_000)).toBe("₹1K");
    expect(formatINRCompact(248_000)).toBe("₹2.5K");
    expect(formatINRCompact(1_000_000)).toBe("₹10K");
  });

  it("formats lakhs as ₹nL", () => {
    expect(formatINRCompact(10_000_000)).toBe("₹1L");
    expect(formatINRCompact(17_200_000)).toBe("₹1.72L");
    expect(formatINRCompact(24_800_000)).toBe("₹2.48L");
    expect(formatINRCompact(99_900_000)).toBe("₹9.99L");
  });

  it("formats crores as ₹nCr", () => {
    expect(formatINRCompact(1_000_000_000)).toBe("₹1Cr");
    expect(formatINRCompact(12_500_000_000)).toBe("₹12.5Cr");
  });
});

describe("formatRelativeTime", () => {
  const base = new Date(2026, 7, 23, 12, 30);

  it("returns just now for <1 min", () => {
    const now = new Date(base.getTime() + 30_000);
    expect(formatRelativeTime(base, now)).toBe("just now");
  });

  it("formats minutes ago", () => {
    const now = new Date(base.getTime() + 5 * 60_000);
    expect(formatRelativeTime(base, now)).toBe("5m ago");
  });

  it("formats hours ago", () => {
    const now = new Date(base.getTime() + 2 * 60 * 60_000);
    expect(formatRelativeTime(base, now)).toBe("2h ago");
  });

  it("formats days ago", () => {
    const now = new Date(base.getTime() + 4 * 24 * 60 * 60_000);
    expect(formatRelativeTime(base, now)).toBe("4d ago");
  });

  it("returns formatted date for older dates", () => {
    const old = new Date(2026, 0, 1, 9, 15);
    const now = new Date(2026, 7, 23);
    expect(formatRelativeTime(old, now)).toBe(formatDateTime(old));
  });

  it("handles invalid dates", () => {
    expect(formatRelativeTime(new Date("nope"))).toBe("—");
  });
});

describe("shortRef", () => {
  it("formats risk IDs", () => {
    expect(shortRef("risk_abc123")).toBe("RSK·ABC123");
  });

  it("formats recovery IDs", () => {
    expect(shortRef("rec_abc123")).toBe("REC·ABC123");
  });

  it("formats unknown prefixes as REF", () => {
    expect(shortRef("other_xyz789")).toBe("REF·XYZ789");
  });

  it("handles null and empty", () => {
    expect(shortRef(null)).toBe("—");
    expect(shortRef("")).toBe("—");
  });
});
