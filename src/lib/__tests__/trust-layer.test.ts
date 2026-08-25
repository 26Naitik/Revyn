import { describe, it, expect } from "vitest";
import {
  buildRecoveryTimeline,
  extractTrustSignals,
} from "@/lib/dashboard/timeline";
import type { ActivityRow } from "@/lib/dashboard/data";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function row(overrides: Partial<ActivityRow> & { id: string }): ActivityRow {
  return {
    action: "recover",
    actor: "system",
    status: "success",
    details: {},
    createdAt: new Date("2026-08-24T10:00:00Z"),
    ...overrides,
  };
}

describe("timeline ordering", () => {
  it("always renders oldest-first regardless of input order", () => {
    const events = buildRecoveryTimeline([
      row({ id: "c", createdAt: new Date("2026-08-24T11:00:00Z") }),
      row({ id: "a", createdAt: new Date("2026-08-24T09:00:00Z") }),
      row({ id: "b", createdAt: new Date("2026-08-24T10:00:00Z") }),
    ]);
    expect(events.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("returns an empty array with no fabricated events", () => {
    expect(buildRecoveryTimeline([])).toEqual([]);
  });
});

describe("important event mapping", () => {
  it("maps the full lifecycle story DETECTED→DIAGNOSED→DECIDED→ACTION→WEBHOOK→RESULT", () => {
    const events = buildRecoveryTimeline([
      row({
        id: "e1",
        action: "detect",
        details: { event: "risk_detected" },
      }),
      row({
        id: "e2",
        action: "diagnose",
        details: { event: "diagnosis_completed", reason: "insufficient_funds" },
      }),
      row({
        id: "e3",
        action: "decide",
        details: { event: "decision_generated" },
      }),
      row({
        id: "e4",
        action: "recover",
        details: {
          event: "payment_link_created",
          from: "pending",
          to: "executing",
          attemptNumber: 1,
        },
      }),
      row({
        id: "e5",
        action: "webhook",
        actor: "razorpay_webhook",
        details: { event: "payment_link.paid" },
      }),
    ]);

    expect(events.map((e) => e.title)).toEqual([
      "Risk detected",
      "Diagnosis completed",
      "Recovery decision generated",
      "Payment link created",
      "Customer paid via link",
    ]);
    // State transition and attempt number surface on execution events.
    expect(events[3].from).toBe("pending");
    expect(events[3].to).toBe("executing");
    expect(events[3].attemptNumber).toBe(1);
  });

  it("preserves unknown rows instead of dropping or inventing them", () => {
    const events = buildRecoveryTimeline([
      row({ id: "x", action: "totally_new_action", details: {} }),
    ]);
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe("System event");
    expect(events[0].kind).toBe("system");
  });
});

describe("actor/source mapping", () => {
  it("labels webhook rows by their razorpay_webhook actor", () => {
    const [event] = buildRecoveryTimeline([
      row({
        id: "w",
        action: "webhook",
        actor: "razorpay_webhook",
        details: { event: "payment_link.paid" },
      }),
    ]);
    expect(event.actor).toBe("razorpay_webhook");
    expect(event.kind).toBe("webhook");
  });

  it("keeps operator attribution intact for user actions", () => {
    const [event] = buildRecoveryTimeline([
      row({ id: "u", actor: "user", details: { event: "recovery_escalated" } }),
    ]);
    expect(event.actor).toBe("user");
  });
});

describe("success/failure mapping", () => {
  it("never reports a failed operation as successful", () => {
    const [failed] = buildRecoveryTimeline([
      row({ id: "f", status: "failure", details: { reason: "gateway_down" } }),
    ]);
    expect(failed.status).toBe("failure");

    const [warn] = buildRecoveryTimeline([
      row({ id: "g", status: "warning", action: "guardrail_warn" }),
    ]);
    expect(warn.status).toBe("warning");
  });

  it("carries the failure reason into the human-readable detail", () => {
    const [event] = buildRecoveryTimeline([
      row({ id: "f", status: "failure", details: { reason: "invalid_customer_state" } }),
    ]);
    expect(event.detail).toBe("invalid_customer_state");
  });
});

describe("duplicate webhook visibility", () => {
  it("surfaces suppressed duplicates as explicit events and trust signals", () => {
    const events = buildRecoveryTimeline([
      row({
        id: "d1",
        action: "recover",
        actor: "razorpay_webhook",
        status: "warning",
        details: { kind: "duplicate_suppressed", event: "payment_link.paid" },
      }),
    ]);

    expect(events[0].title).toBe("Duplicate webhook suppressed");

    const trust = extractTrustSignals(events);
    expect(trust.duplicateWebhooksSuppressed).toBe(1);
    expect(trust.warningEvents).toBe(1);
  });

  it("counts multiple duplicates separately from real webhooks", () => {
    const events = buildRecoveryTimeline([
      row({
        id: "real",
        action: "webhook",
        actor: "razorpay_webhook",
        details: { event: "payment_link.paid" },
      }),
      row({
        id: "dup",
        action: "recover",
        actor: "razorpay_webhook",
        status: "warning",
        details: { kind: "duplicate_suppressed" },
      }),
    ]);

    const trust = extractTrustSignals(events);
    expect(trust.duplicateWebhooksSuppressed).toBe(1);
    expect(trust.hasSuccessfulOutcome).toBe(true); // real paid webhook counted
  });
});

describe("guardrail visibility", () => {
  it("separates hard blocks from warnings", () => {
    const events = buildRecoveryTimeline([
      row({
        id: "block",
        action: "guardrail_block",
        status: "warning",
        details: { reason: "max attempts reached" },
      }),
      row({ id: "warn", action: "guardrail_warn", status: "warning" }),
    ]);

    expect(events[0].kind).toBe("guardrail");
    expect(events[0].title).toBe("Guardrail blocked action");
    expect(events[1].title).toBe("Guardrail warning");

    const trust = extractTrustSignals(events);
    expect(trust.guardrailBlocks).toBe(1);
    expect(trust.guardrailWarnings).toBe(1);
  });
});

describe("AI vs rules decision visibility", () => {
  it("exposes explainability metadata exactly as decide.ts persisted it", () => {
    const [decision] = buildRecoveryTimeline([
      row({
        id: "dec",
        action: "decide",
        actor: "ai_agent",
        details: {
          strategy: "offer_discount",
          reasoning: "Third decline; incentive maximises conversion.",
          confidence: 0.72,
          recoveryScore: 64,
          priority: "high",
          nextStep: "Create payment link with discount",
          source: "ai",
        },
      }),
    ]);

    expect(decision.decision).toMatchObject({
      strategy: "offer_discount",
      confidence: 0.72,
      recoveryScore: 64,
      source: "ai",
      priority: "high",
      nextStep: "Create payment link with discount",
    });
    expect(decision.detail).toContain("Third decline");
  });

  it("labels rule-based decisions as rules - never as AI", () => {
    const [decision] = buildRecoveryTimeline([
      row({
        id: "dec",
        action: "decide",
        actor: "system",
        details: {
          strategy: "send_payment_link",
          source: "rules",
          confidence: 0.8,
          recoveryScore: 70,
        },
      }),
    ]);
    expect(decision.decision?.source).toBe("rules");

    const trust = extractTrustSignals([decision]);
    expect(trust.decisionSource).toBe("rules");
    expect(trust.decisionSource).not.toBe("ai");
  });

  it("uses the latest re-decision when a case is decided twice", () => {
    const events = buildRecoveryTimeline([
      row({
        id: "first",
        action: "decide",
        details: { strategy: "retry_payment", source: "rules", confidence: 0.5 },
      }),
      row({
        id: "second",
        action: "decide",
        details: { strategy: "offer_discount", source: "ai", confidence: 0.9 },
      }),
    ]);
    expect(extractTrustSignals(events).decisionSource).toBe("ai");
  });

  it("omits decision metadata entirely when none was persisted", () => {
    const [event] = buildRecoveryTimeline([
      row({ id: "plain", action: "decide", details: { event: "decision_generated" } }),
    ]);
    expect(event.decision).toBeUndefined();
    expect(extractTrustSignals([event]).decisionSource).toBeNull();
  });
});

describe("trust signal aggregation", () => {
  it("tracks max attempt number across execution events", () => {
    const trust = extractTrustSignals(
      buildRecoveryTimeline([
        row({ id: "a1", details: { attemptNumber: 1 } }),
        row({ id: "a3", details: { attemptNumber: 3 } }),
        row({ id: "a2", details: { attemptNumber: 2 } }),
      ])
    );
    expect(trust.maxAttemptNumber).toBe(3);
  });

  it("marks successful outcomes only from real paid webhooks", () => {
    const recovered = extractTrustSignals(
      buildRecoveryTimeline([
        row({
          id: "paid",
          action: "webhook",
          actor: "razorpay_webhook",
          details: { event: "payment_link.paid" },
        }),
      ])
    );
    expect(recovered.hasSuccessfulOutcome).toBe(true);

    const notRecovered = extractTrustSignals(
      buildRecoveryTimeline([row({ id: "exec", details: {} })])
    );
    expect(notRecovered.hasSuccessfulOutcome).toBe(false);
  });

  it("returns zeroed signals for an empty timeline", () => {
    const trust = extractTrustSignals([]);
    expect(trust).toEqual({
      decisionSource: null,
      guardrailBlocks: 0,
      guardrailWarnings: 0,
      duplicateWebhooksSuppressed: 0,
      failedEvents: 0,
      warningEvents: 0,
      maxAttemptNumber: null,
      hasSuccessfulOutcome: false,
    });
  });
});
