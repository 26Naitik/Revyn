import { describe, it, expect } from "vitest";
import {
  canTransition,
  isExecutable,
  isRecoveryStatus,
  assertTransition,
  InvalidTransitionError,
  TERMINAL_STATUSES,
} from "@/lib/recovery/state-machine";

describe("recovery workflow state machine", () => {
  it("allows the happy path", () => {
    expect(canTransition("pending", "executing")).toBe(true);
    expect(canTransition("executing", "succeeded")).toBe(true);
    expect(canTransition("pending", "cancelled")).toBe(true);
  });

  it("supports failure and retry paths", () => {
    expect(canTransition("executing", "retry_scheduled")).toBe(true);
    expect(canTransition("retry_scheduled", "executing")).toBe(true);
    expect(canTransition("failed", "executing")).toBe(true); // manual retry
    expect(canTransition("failed", "escalated")).toBe(true);
    expect(canTransition("failed", "cancelled")).toBe(true);
    expect(canTransition("pending", "escalated")).toBe(true);
  });

  it("rejects invalid transitions", () => {
    expect(canTransition("pending", "succeeded")).toBe(false);
    expect(canTransition("pending", "failed")).toBe(false);
    expect(canTransition("retry_scheduled", "succeeded")).toBe(false);
    expect(canTransition("executing", "pending")).toBe(false);
    expect(canTransition("executing", "escalated")).toBe(false);
    expect(canTransition("nonsense", "executing")).toBe(false);
    expect(canTransition("executing", "nonsense")).toBe(false);
  });

  it("never allows a SUCCEEDED workflow to move anywhere", () => {
    for (const status of [
      "pending",
      "executing",
      "retry_scheduled",
      "failed",
      "escalated",
      "cancelled",
      "succeeded",
    ]) {
      expect(canTransition("succeeded", status)).toBe(false);
    }
  });

  it("treats escalated, cancelled, succeeded and failed as terminal for automation", () => {
    expect(TERMINAL_STATUSES).toEqual(
      expect.arrayContaining(["succeeded", "failed", "escalated", "cancelled"])
    );
    // Escalated cases must not automatically execute.
    expect(isExecutable("escalated")).toBe(false);
    expect(isExecutable("escalated", { manual: true })).toBe(false);
    // Cancelled cases must never execute.
    expect(isExecutable("cancelled")).toBe(false);
    expect(isExecutable("cancelled", { manual: true })).toBe(false);
  });

  it("permits execution only from pending/retry_scheduled automatically", () => {
    expect(isExecutable("pending")).toBe(true);
    expect(isExecutable("retry_scheduled")).toBe(true);
    expect(isExecutable("failed")).toBe(false);
    expect(isExecutable("failed", { manual: true })).toBe(true);
    expect(isExecutable("executing")).toBe(false);
    expect(isExecutable("succeeded")).toBe(false);
  });

  it("assertTransition throws a typed error on invalid transitions", () => {
    expect(() => assertTransition("succeeded", "executing")).toThrow(
      InvalidTransitionError
    );
    try {
      assertTransition("succeeded", "executing");
    } catch (err) {
      expect((err as InvalidTransitionError).from).toBe("succeeded");
      expect((err as InvalidTransitionError).to).toBe("executing");
    }
    expect(() => assertTransition("pending", "executing")).not.toThrow();
  });

  it("validates status strings", () => {
    expect(isRecoveryStatus("retry_scheduled")).toBe(true);
    expect(isRecoveryStatus("escalated")).toBe(true);
    expect(isRecoveryStatus("queued")).toBe(false);
  });
});
