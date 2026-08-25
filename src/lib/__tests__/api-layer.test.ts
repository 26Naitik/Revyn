import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  detectAll: vi.fn(),
  diagnoseRisk: vi.fn(),
  diagnoseAll: vi.fn(),
  decideRisk: vi.fn(),
  decideAll: vi.fn(),
  measureStats: vi.fn(),
  executeRecoveryPaymentLink: vi.fn(),
  riskFindUnique: vi.fn(),
  wfFindMany: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    revenueAtRisk: { findUnique: mocks.riskFindUnique },
    recoveryWorkflow: { findMany: mocks.wfFindMany },
    auditLog: { create: mocks.auditCreate },
  },
}));

vi.mock("@/lib/engine/detect", () => ({ detectAll: mocks.detectAll }));
vi.mock("@/lib/engine/diagnose", () => ({
  diagnoseRisk: mocks.diagnoseRisk,
  diagnoseAll: mocks.diagnoseAll,
}));
vi.mock("@/lib/engine/decide", () => ({
  decideRisk: mocks.decideRisk,
  decideAll: mocks.decideAll,
}));
vi.mock("@/lib/engine/measure", () => ({ measureStats: mocks.measureStats }));

// The mocked module defines the error class inside its factory so hoisting
// works; tests import the same class from the mocked path below.
vi.mock("@/lib/recovery/execute", () => {
  class RecoveryExecutionError extends Error {
    constructor(
      readonly code: string,
      message: string,
      readonly details?: Record<string, unknown>
    ) {
      super(message);
    }
  }
  return {
    RecoveryExecutionError,
    executeRecoveryPaymentLink: mocks.executeRecoveryPaymentLink,
  };
});

import { POST as detectPOST } from "@/app/api/detect/route";
import { POST as diagnosePOST } from "@/app/api/diagnose/route";
import { POST as recoverPOST } from "@/app/api/recover/route";
import { POST as simulatePOST } from "@/app/api/simulate/route";
import { RecoveryExecutionError } from "@/lib/recovery/execute";

function jsonRequest(body?: unknown): Request {
  return new Request("http://localhost/api/test", {
    method: "POST",
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
  });
}

const DETECTION = {
  risksFound: 2,
  totalAtRisk: 150_000,
  items: [
    { id: "r1", type: "failed_payment", amountAtRisk: 100_000, customerName: "A", createdAt: new Date() },
    { id: "r2", type: "abandoned_checkout", amountAtRisk: 50_000, customerName: "B", createdAt: new Date() },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/detect", () => {
  it("returns real detection results without deciding or executing", async () => {
    mocks.detectAll.mockResolvedValue(DETECTION);
    const res = await detectPOST();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.detected.risksFound).toBe(2);
    // Timestamps are not leaked to the client.
    expect(body.detected.items[0]).not.toHaveProperty("createdAt");
    expect(mocks.decideRisk).not.toHaveBeenCalled();
  });

  it("maps engine failure to a 500 error envelope", async () => {
    mocks.detectAll.mockRejectedValue(new Error("db down"));
    const res = await detectPOST();
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("detection_failed");
  });
});

describe("POST /api/diagnose", () => {
  it("diagnoses a single existing risk", async () => {
    mocks.riskFindUnique.mockResolvedValue({ id: "risk_1" });
    mocks.diagnoseRisk.mockResolvedValue({
      riskId: "risk_1",
      rootCause: "insufficient_funds",
      confidenceScore: 0.9,
      explanation: "Balance too low",
      recommendedNextStep: "send_payment_link",
    });

    const res = await diagnosePOST(jsonRequest({ riskId: "risk_1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.diagnoses).toHaveLength(1);
    expect(body.diagnoses[0].rootCause).toBe("insufficient_funds");
  });

  it("returns 404 for an unknown risk instead of throwing", async () => {
    mocks.riskFindUnique.mockResolvedValue(null);
    const res = await diagnosePOST(jsonRequest({ riskId: "nope" }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("risk_not_found");
  });

  it("diagnoses everything when no body fields are provided", async () => {
    mocks.diagnoseAll.mockResolvedValue([
      { riskId: "r1", rootCause: "x", confidenceScore: 0.5, explanation: "", recommendedNextStep: "" },
    ]);
    const res = await diagnosePOST(jsonRequest({}));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.diagnosed.count).toBe(1);
  });

  it("rejects malformed bodies with 400", async () => {
    const res = await diagnosePOST(
      new Request("http://localhost/api/test", {
        method: "POST",
        body: "{not json",
        headers: { "content-type": "application/json" },
      })
    );
    expect(res.status).toBe(400);

    const badField = await diagnosePOST(jsonRequest({ riskId: 42 }));
    expect(badField.status).toBe(400);
  });
});

function baseDecision() {
  return {
    strategy: "send_payment_link",
    reasoning: "Fresh failure; link converts well.",
    confidence: 0.8,
    estimatedRecovery: 80_000,
    discountPercent: 0,
    retryDelay: null,
    escalationReason: null,
    recoveryScore: 75,
    scoreBand: "high",
    priority: "high",
    nextStep: "Create payment link",
    factors: [],
    source: "rules",
    riskId: "risk_9",
    recoveryId: "wf_9",
    persisted: true,
  };
}

describe("POST /api/recover", () => {
  it("decides then executes a link-eligible case end-to-end", async () => {
    mocks.riskFindUnique.mockResolvedValue({ id: "risk_9" });
    mocks.decideRisk.mockResolvedValue(baseDecision());
    mocks.executeRecoveryPaymentLink.mockResolvedValue({
      recoveryId: "wf_9",
      riskId: "risk_9",
      status: "executing",
      attemptCount: 1,
      paymentLink: { linkId: "link_1", shortUrl: "https://rzp.io/x", amount: 100_000, referenceId: "revyn_wf_9" },
    });

    const res = await recoverPOST(jsonRequest({ riskId: "risk_9" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.executed).toBe(true);
    expect(body.execution.paymentLink.linkId).toBe("link_1");
    expect(mocks.executeRecoveryPaymentLink).toHaveBeenCalledWith("wf_9");
  });

  it("returns the decision unexecuted for non-link strategies", async () => {
    mocks.riskFindUnique.mockResolvedValue({ id: "risk_9" });
    mocks.decideRisk.mockResolvedValue({
      ...baseDecision(),
      strategy: "escalate_human",
      recoveryId: null,
    });

    const res = await recoverPOST(jsonRequest({ riskId: "risk_9" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.executed).toBe(false);
    expect(body.execution).toBeNull();
    expect(mocks.executeRecoveryPaymentLink).not.toHaveBeenCalled();
  });

  it("maps execution rejection codes to HTTP statuses without losing the decision", async () => {
    mocks.riskFindUnique.mockResolvedValue({ id: "risk_9" });
    mocks.decideRisk.mockResolvedValue(baseDecision());
    mocks.executeRecoveryPaymentLink.mockRejectedValue(
      new RecoveryExecutionError("guardrail_blocked", "Cooldown active", { rule: "cooldown" })
    );

    const res = await recoverPOST(jsonRequest({ riskId: "risk_9" }));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toBe("guardrail_blocked");
    expect(body.details.rule).toBe("cooldown");
    expect(body.decision.strategy).toBe("send_payment_link");
  });

  it("404s unknown risks and validates input", async () => {
    mocks.riskFindUnique.mockResolvedValue(null);
    expect((await recoverPOST(jsonRequest({ riskId: "ghost" }))).status).toBe(404);
    expect((await recoverPOST(jsonRequest({ wrong: "shape" }))).status).toBe(400);
  });
});

describe("POST /api/simulate", () => {
  function setupSweep() {
    mocks.detectAll.mockResolvedValue(DETECTION);
    mocks.diagnoseAll.mockResolvedValue([]);
    mocks.decideAll.mockResolvedValue([]);
    mocks.wfFindMany.mockResolvedValue([{ id: "wf_a" }]);
    mocks.measureStats.mockResolvedValue({
      totalAtRisk: 150_000,
      totalRecovered: 100_000,
      recoveryRate: 2 / 3,
      byType: {},
      byStatus: {},
    });
  }

  it("runs the full loop and reports execution outcomes honestly", async () => {
    setupSweep();
    mocks.executeRecoveryPaymentLink
      .mockResolvedValueOnce({ status: "executing" })
      .mockRejectedValueOnce(
        new RecoveryExecutionError("guardrail_blocked", "blocked")
      );

    const res = await simulatePOST();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.detected.risksFound).toBe(2);
    expect(body.executed.count).toBe(1); // one succeeded...
    expect(body.executed.failures).toEqual([
      { recoveryId: "wf_a", error: "guardrail_blocked" }, // ...one blocked
    ]);
    expect(body.measured.recoveryRate).toBeCloseTo(2 / 3);
    // Simulation run is audited.
    expect(mocks.auditCreate).toHaveBeenCalledTimes(1);
    const auditDetails = JSON.parse(mocks.auditCreate.mock.calls[0][0].data.details);
    expect(auditDetails.simulationRun).toBe(true);
    expect(auditDetails.executionFailures).toBe(1);
  });

  it("audits nothing when the loop itself fails", async () => {
    mocks.detectAll.mockRejectedValue(new Error("boom"));
    const res = await simulatePOST();
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("simulation_failed");
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });
});
