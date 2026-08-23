import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  wfFindFirst: vi.fn(),
  wfFindUnique: vi.fn(),
  wfUpdateMany: vi.fn(),
  riskUpdate: vi.fn(),
  auditCreateInTx: vi.fn(),
  auditCreateOuter: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    auditLog: { create: mocks.auditCreateOuter },
  },
}));

import {
  handleRazorpayWebhook,
  verifyRazorpaySignature,
} from "@/lib/razorpay/webhooks";

const SECRET = "test_webhook_secret";

function sign(rawBody: string, secret = SECRET): string {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

function buildEvent(overrides: Record<string, unknown> = {}) {
  return {
    event: "payment_link.paid",
    created_at: 1756000000,
    payload: {
      payment_link: {
        entity: {
          id: "plink_abc123",
          reference_id: "revyn_wf1",
          amount: 29900,
          amount_paid: 29900,
          currency: "INR",
          status: "paid",
          ...overrides,
        },
      },
      payment: {
        entity: { id: "pay_xyz789" },
      },
    },
  };
}

const baseWorkflow = {
  id: "wf1",
  revenueRiskId: "risk1",
  strategy: "send_payment_link",
  status: "executing",
  amountRecovered: 0,
  razorpayActionId: null,
  attemptCount: 1,
  revenueRisk: { amountAtRisk: 29900 },
};

describe("verifyRazorpaySignature", () => {
  const body = JSON.stringify(buildEvent());

  it("accepts a correctly signed payload", () => {
    expect(verifyRazorpaySignature(body, sign(body), SECRET)).toBe(true);
  });

  it("rejects a tampered payload", () => {
    const tampered = body.replace("29900", "99999");
    expect(verifyRazorpaySignature(tampered, sign(body), SECRET)).toBe(false);
  });

  it("rejects a signature made with the wrong secret", () => {
    expect(verifyRazorpaySignature(body, sign(body, "other"), SECRET)).toBe(false);
  });

  it("rejects garbage and missing signatures", () => {
    expect(verifyRazorpaySignature(body, "deadbeef", SECRET)).toBe(false);
    expect(verifyRazorpaySignature(body, null, SECRET)).toBe(false);
    expect(verifyRazorpaySignature(body, "", SECRET)).toBe(false);
  });
});

describe("handleRazorpayWebhook", () => {
  const tx = {
    recoveryWorkflow: {
      findFirst: mocks.wfFindFirst,
      findUnique: mocks.wfFindUnique,
      updateMany: mocks.wfUpdateMany,
    },
    revenueAtRisk: { update: mocks.riskUpdate },
    auditLog: { create: mocks.auditCreateInTx },
  };

  beforeEach(() => {
    for (const fn of Object.values(mocks)) {
      fn.mockReset();
    }
    process.env.RAZORPAY_WEBHOOK_SECRET = SECRET;
    mocks.transaction.mockImplementation(
      async (fn: (t: typeof tx) => unknown) => fn(tx)
    );
    mocks.wfFindFirst.mockResolvedValue(null);
    mocks.wfFindUnique.mockResolvedValue(null);
    mocks.wfUpdateMany.mockResolvedValue({ count: 0 });
    mocks.riskUpdate.mockResolvedValue({});
    mocks.auditCreateInTx.mockResolvedValue({});
    mocks.auditCreateOuter.mockResolvedValue({});
  });

  afterEach(() => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
  });

  it("rejects an invalid signature with 401 and never touches the database", async () => {
    const rawBody = JSON.stringify(buildEvent());
    const res = await handleRazorpayWebhook(rawBody, "invalid_signature");

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "invalid_signature" });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.auditCreateOuter).not.toHaveBeenCalled();
  });

  it("rejects a missing signature header with 401", async () => {
    const res = await handleRazorpayWebhook(JSON.stringify(buildEvent()), null);
    expect(res.status).toBe(401);
  });

  it("returns 500 when the webhook secret is not configured", async () => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    const rawBody = JSON.stringify(buildEvent());
    const res = await handleRazorpayWebhook(rawBody, sign(rawBody));

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("webhook_secret_not_configured");
  });

  it("returns 400 for a signed but malformed JSON body", async () => {
    const res = await handleRazorpayWebhook("{not-json", sign("{not-json"));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_json" });
  });

  it("ignores unrelated signed events without processing", async () => {
    const rawBody = JSON.stringify({ event: "payment.captured", payload: {} });
    const res = await handleRazorpayWebhook(rawBody, sign(rawBody));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      handled: false,
      event: "payment.captured",
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("marks workflow succeeded and risk recovered exactly once", async () => {
    mocks.wfFindFirst.mockResolvedValue(baseWorkflow);
    mocks.wfUpdateMany.mockResolvedValue({ count: 1 });

    const rawBody = JSON.stringify(buildEvent());
    const res = await handleRazorpayWebhook(rawBody, sign(rawBody));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      handled: true,
      duplicate: false,
      recoveryId: "wf1",
      amountRecorded: 29900,
    });

    expect(mocks.wfUpdateMany).toHaveBeenCalledTimes(1);
    expect(mocks.wfUpdateMany).toHaveBeenCalledWith({
      where: { id: "wf1", status: { not: "succeeded" } },
      data: expect.objectContaining({
        status: "succeeded",
        amountRecovered: 29900,
        completedAt: expect.any(Date),
      }),
    });
    expect(mocks.riskUpdate).toHaveBeenCalledWith({
      where: { id: "risk1" },
      data: { status: "recovered" },
    });
    expect(mocks.auditCreateInTx).toHaveBeenCalledTimes(1);
    expect(mocks.auditCreateInTx).toHaveBeenCalledWith({
      data: expect.objectContaining({
        revenueRiskId: "risk1",
        recoveryId: "wf1",
        action: "webhook",
        actor: "razorpay_webhook",
        status: "success",
      }),
    });
    expect(mocks.auditCreateOuter).not.toHaveBeenCalled();
  });

  it("clamps the recorded amount to the at-risk cap", async () => {
    mocks.wfFindFirst.mockResolvedValue({
      ...baseWorkflow,
      revenueRisk: { amountAtRisk: 25000 },
    });
    mocks.wfUpdateMany.mockResolvedValue({ count: 1 });

    const rawBody = JSON.stringify(buildEvent({ amount_paid: 999999 }));
    const res = await handleRazorpayWebhook(rawBody, sign(rawBody));

    expect(res.status).toBe(200);
    expect(mocks.wfUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ amountRecovered: 25000 }),
      })
    );
  });

  it("is idempotent for duplicate deliveries and audits the suppression", async () => {
    mocks.wfFindFirst.mockResolvedValue({
      ...baseWorkflow,
      status: "succeeded",
      amountRecovered: 29900,
    });
    mocks.wfUpdateMany.mockResolvedValue({ count: 0 });

    const rawBody = JSON.stringify(buildEvent());
    const res = await handleRazorpayWebhook(rawBody, sign(rawBody));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, handled: true, duplicate: true });
    expect(mocks.riskUpdate).not.toHaveBeenCalled();
    expect(mocks.auditCreateInTx).not.toHaveBeenCalled();
    // Duplicate deliveries are absorbed AND recorded as suppressed events.
    expect(mocks.auditCreateOuter).toHaveBeenCalledTimes(1);
    expect(mocks.auditCreateOuter).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recoveryId: "wf1",
        action: "recover",
        status: "warning",
        details: expect.stringContaining('"kind":"duplicate_suppressed"'),
      }),
    });
  });

  it("resolves workflows via reference_id when the link id is unknown", async () => {
    mocks.wfFindUnique.mockResolvedValue(baseWorkflow);
    mocks.wfUpdateMany.mockResolvedValue({ count: 1 });

    const rawBody = JSON.stringify(buildEvent({ id: "plink_unknown" }));
    const res = await handleRazorpayWebhook(rawBody, sign(rawBody));

    expect(res.body).toMatchObject({
      handled: true,
      duplicate: false,
      recoveryId: "wf1",
    });
    expect(mocks.wfFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "wf1" } })
    );
    expect(mocks.wfUpdateMany).toHaveBeenCalledTimes(1);
  });

  it("logs a warning and skips processing for unmatched references", async () => {
    const rawBody = JSON.stringify(
      buildEvent({ reference_id: "revyn_missing_wf" })
    );
    const res = await handleRazorpayWebhook(rawBody, sign(rawBody));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      handled: false,
      reason: "unknown_reference",
    });
    expect(mocks.wfUpdateMany).not.toHaveBeenCalled();
    expect(mocks.auditCreateInTx).not.toHaveBeenCalled();
    expect(mocks.auditCreateOuter).toHaveBeenCalledTimes(1);
    expect(mocks.auditCreateOuter).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "webhook",
        actor: "razorpay_webhook",
        status: "warning",
      }),
    });
  });

  it("does not trust a reference whose stored link id differs", async () => {
    mocks.wfFindUnique.mockResolvedValue({
      ...baseWorkflow,
      razorpayActionId: "plink_other_link",
    });

    const rawBody = JSON.stringify(buildEvent());
    const res = await handleRazorpayWebhook(rawBody, sign(rawBody));

    expect(res.body).toMatchObject({ handled: false, reason: "unknown_reference" });
    expect(mocks.wfUpdateMany).not.toHaveBeenCalled();
  });

  it("returns 500 when processing throws unexpectedly", async () => {
    mocks.wfFindFirst.mockRejectedValue(new Error("db down"));
    const rawBody = JSON.stringify(buildEvent());
    const res = await handleRazorpayWebhook(rawBody, sign(rawBody));

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("webhook_processing_failed");
  });
});

describe("payment_link.expired handling", () => {
  const tx = {
    recoveryWorkflow: {
      findFirst: mocks.wfFindFirst,
      findUnique: mocks.wfFindUnique,
      updateMany: mocks.wfUpdateMany,
    },
    revenueAtRisk: { update: mocks.riskUpdate },
    auditLog: { create: mocks.auditCreateInTx },
  };

  beforeEach(() => {
    for (const fn of Object.values(mocks)) {
      fn.mockReset();
    }
    process.env.RAZORPAY_WEBHOOK_SECRET = SECRET;
    mocks.transaction.mockImplementation(
      async (fn: (t: typeof tx) => unknown) => fn(tx)
    );
    mocks.wfFindFirst.mockResolvedValue(null);
    mocks.wfFindUnique.mockResolvedValue(null);
    mocks.wfUpdateMany.mockResolvedValue({ count: 0 });
    mocks.riskUpdate.mockResolvedValue({});
    mocks.auditCreateInTx.mockResolvedValue({});
    mocks.auditCreateOuter.mockResolvedValue({});
  });

  afterEach(() => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
  });

  function buildExpiredEvent(overrides: Record<string, unknown> = {}) {
    return {
      event: "payment_link.expired",
      created_at: 1756000000,
      payload: {
        payment_link: {
          entity: {
            id: "plink_abc123",
            reference_id: "revyn_wf1",
            status: "expired",
            ...overrides,
          },
        },
      },
    };
  }

  it("schedules a retry when attempts remain", async () => {
    mocks.wfFindFirst.mockResolvedValue({ ...baseWorkflow, attemptCount: 1 });
    mocks.wfUpdateMany.mockResolvedValue({ count: 1 });

    const rawBody = JSON.stringify(buildExpiredEvent());
    const res = await handleRazorpayWebhook(rawBody, sign(rawBody));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      handled: true,
      retryScheduled: true,
      recoveryId: "wf1",
    });
    expect(mocks.wfUpdateMany).toHaveBeenCalledWith({
      where: { id: "wf1", status: { in: ["pending", "executing", "retry_scheduled"] } },
      data: expect.objectContaining({
        status: "retry_scheduled",
        lastFailureReason: "payment_link_expired",
        lastFailureCategory: "temporary",
        nextRetryAt: expect.any(Date),
      }),
    });
    expect(mocks.auditCreateInTx).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "webhook",
        status: "warning",
        details: expect.stringContaining('"to":"retry_scheduled"'),
      }),
    });
  });

  it("moves to terminal failure once the retry limit is exhausted", async () => {
    mocks.wfFindFirst.mockResolvedValue({ ...baseWorkflow, attemptCount: 3 });
    mocks.wfUpdateMany.mockResolvedValue({ count: 1 });

    const rawBody = JSON.stringify(buildExpiredEvent());
    const res = await handleRazorpayWebhook(rawBody, sign(rawBody));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      handled: true,
      retryScheduled: false,
    });
    expect(mocks.wfUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "failed",
          nextRetryAt: null,
          completedAt: expect.any(Date),
        }),
      })
    );
    expect(mocks.auditCreateInTx).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: "failure" }),
    });
  });

  it("treats an expired event for an already-succeeded workflow as duplicate", async () => {
    mocks.wfFindFirst.mockResolvedValue({
      ...baseWorkflow,
      status: "succeeded",
    });

    const rawBody = JSON.stringify(buildExpiredEvent());
    const res = await handleRazorpayWebhook(rawBody, sign(rawBody));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, handled: true, duplicate: true });
    expect(mocks.wfUpdateMany).not.toHaveBeenCalled();
  });

  it("ignores expiry events for terminal workflows without touching state", async () => {
    mocks.wfFindFirst.mockResolvedValue({ ...baseWorkflow, status: "cancelled" });

    const rawBody = JSON.stringify(buildExpiredEvent());
    const res = await handleRazorpayWebhook(rawBody, sign(rawBody));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, handled: true, ignored: true });
    expect(mocks.wfUpdateMany).not.toHaveBeenCalled();
    expect(mocks.auditCreateInTx).not.toHaveBeenCalled();
  });

  it("audits and skips expiry events with unknown references", async () => {
    const rawBody = JSON.stringify(
      buildExpiredEvent({ reference_id: "revyn_missing_wf" })
    );
    const res = await handleRazorpayWebhook(rawBody, sign(rawBody));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      handled: false,
      reason: "unknown_reference",
    });
    expect(mocks.wfUpdateMany).not.toHaveBeenCalled();
    expect(mocks.auditCreateOuter).toHaveBeenCalledTimes(1);
    expect(mocks.auditCreateOuter).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "webhook",
        actor: "razorpay_webhook",
        status: "warning",
      }),
    });
  });
});
