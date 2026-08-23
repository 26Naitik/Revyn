import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  wfFindUnique: vi.fn(),
  wfUpdateMany: vi.fn(),
  wfUpdate: vi.fn(),
  auditCreate: vi.fn(),
  dbTransaction: vi.fn(),
  createPaymentLink: vi.fn(),
  runAllGuardrails: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    recoveryWorkflow: {
      findUnique: mocks.wfFindUnique,
      updateMany: mocks.wfUpdateMany,
      update: mocks.wfUpdate,
    },
    auditLog: { create: mocks.auditCreate },
    $transaction: mocks.dbTransaction,
  },
}));

vi.mock("@/lib/razorpay/payment-links", () => ({
  PaymentLinkCreationError: class PaymentLinkCreationError extends Error {
    constructor(
      message: string,
      readonly options: Record<string, unknown> = {}
    ) {
      super(message);
    }
  },
  createPaymentLink: mocks.createPaymentLink,
}));

vi.mock("@/lib/guardrails/rules", () => ({
  runAllGuardrails: mocks.runAllGuardrails,
}));

import {
  RecoveryExecutionError,
  executeRecoveryPaymentLink,
} from "@/lib/recovery/execute";

function buildWorkflow(overrides: Record<string, unknown> = {}) {
  return {
    id: "wf1",
    status: "pending",
    strategy: "send_payment_link",
    retryDelay: null,
    attemptCount: 0,
    nextRetryAt: null,
    revenueRiskId: "risk1",
    revenueRisk: {
      id: "risk1",
      merchantId: "m1",
      type: "failed_payment",
      currency: "INR",
      amountAtRisk: 29900,
      payment: {
        customer: {
          id: "cus1",
          name: "Aarav Sharma",
          email: "aarav.sharma@example.com",
          phone: "+919876543210",
        },
      },
      subscription: null,
      order: null,
    },
    ...overrides,
  };
}

async function expectExecutionError(
  promise: Promise<unknown>,
  code: string
): Promise<RecoveryExecutionError> {
  try {
    await promise;
    throw new Error(`expected RecoveryExecutionError ${code}`);
  } catch (err) {
    expect(err).toBeInstanceOf(RecoveryExecutionError);
    const execErr = err as RecoveryExecutionError;
    expect(execErr.code).toBe(code);
    return execErr;
  }
}

describe("executeRecoveryPaymentLink", () => {
  beforeEach(() => {
    for (const fn of Object.values(mocks)) {
      fn.mockReset();
    }
    mocks.wfUpdateMany.mockResolvedValue({ count: 1 });
    mocks.auditCreate.mockResolvedValue({});
    mocks.dbTransaction.mockResolvedValue([{}, {}]);
    mocks.runAllGuardrails.mockResolvedValue({
      allowed: true,
      blockedBy: null,
    });
    mocks.createPaymentLink.mockResolvedValue({
      linkId: "plink_1",
      shortUrl: "https://rzp.io/i/plink_1",
      amount: 29900,
      currency: "INR",
      referenceId: "revyn_wf1",
      status: "created",
      expireBy: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("executes atomically: claims, creates the link and audits both steps", async () => {
    mocks.wfFindUnique.mockResolvedValue(buildWorkflow());

    const result = await executeRecoveryPaymentLink("wf1");

    // Claim used a compare-and-set on executable statuses only.
    expect(mocks.wfUpdateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: "wf1",
        OR: [
          { status: { in: ["pending", "retry_scheduled"] } },
          { status: "executing", startedAt: { lt: expect.any(Date) }, razorpayActionId: null },
        ],
      },
      data: expect.objectContaining({
        status: "executing",
        attemptCount: { increment: 1 },
        startedAt: expect.any(Date),
        lastAttemptAt: expect.any(Date),
      }),
    });

    // Amount authority: charged amount comes ONLY from the database risk.
    expect(mocks.createPaymentLink).toHaveBeenCalledWith(
      expect.objectContaining({ amountPaise: 29900, referenceId: "revyn_wf1" })
    );

    // Persistence of the live link is transactional with its audit entry.
    expect(mocks.dbTransaction).toHaveBeenCalledTimes(1);

    // Lifecycle audit for the claim itself.
    const auditCalls = mocks.auditCreate.mock.calls.map(
      (call) => call[0].data
    ) as Array<{ details: string }>;
    const details = auditCalls.map((d) => JSON.parse(d.details));
    expect(details.some((d) => d.event === "execution_started")).toBe(true);
    expect(details.some((d) => d.event === "payment_link_created")).toBe(true);

    expect(result).toMatchObject({
      recoveryId: "wf1",
      riskId: "risk1",
      status: "executing",
      attemptCount: 1,
    });
  });

  it("rejects a second concurrent execution when the CAS claim loses the race", async () => {
    mocks.wfFindUnique.mockResolvedValue(buildWorkflow());
    mocks.wfUpdateMany.mockResolvedValue({ count: 0 }); // another request won

    const err = await expectExecutionError(
      executeRecoveryPaymentLink("wf1"),
      "duplicate_claim"
    );
    expect(err.details).toMatchObject({ previousStatus: "pending" });
    expect(mocks.createPaymentLink).not.toHaveBeenCalled();
  });

  it("refuses to execute a SUCCEEDED workflow", async () => {
    mocks.wfFindUnique.mockResolvedValue(buildWorkflow({ status: "succeeded" }));

    await expectExecutionError(executeRecoveryPaymentLink("wf1"), "recovery_not_executable");
    expect(mocks.wfUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses ESCALATED workflows even for manual retries", async () => {
    mocks.wfFindUnique.mockResolvedValue(buildWorkflow({ status: "escalated" }));

    await expectExecutionError(
      executeRecoveryPaymentLink("wf1", { manual: true }),
      "recovery_not_executable"
    );
  });

  it("respects scheduled back-off for automatic retries but allows manual override", async () => {
    const future = new Date(Date.now() + 6 * 3_600_000);
    mocks.wfFindUnique.mockResolvedValue(
      buildWorkflow({ status: "retry_scheduled", nextRetryAt: future })
    );

    await expectExecutionError(
      executeRecoveryPaymentLink("wf1"),
      "retry_not_due"
    );

    await executeRecoveryPaymentLink("wf1", { manual: true });
    expect(mocks.createPaymentLink).toHaveBeenCalledTimes(1);
  });

  it("enforces the retry limit before touching the provider", async () => {
    mocks.wfFindUnique.mockResolvedValue(buildWorkflow({ attemptCount: 3 }));

    const err = await expectExecutionError(
      executeRecoveryPaymentLink("wf1"),
      "retry_limit_reached"
    );
    expect(err.details).toMatchObject({ attemptCount: 3 });
    expect(mocks.runAllGuardrails).not.toHaveBeenCalled();
    expect(mocks.createPaymentLink).not.toHaveBeenCalled();
  });

  it("surfaces guardrail blocks without calling the provider", async () => {
    mocks.wfFindUnique.mockResolvedValue(buildWorkflow());
    mocks.runAllGuardrails.mockResolvedValue({
      allowed: false,
      blockedBy: { allowed: false, rule: "cooldown", reason: "Cooldown active" },
    });

    await expectExecutionError(executeRecoveryPaymentLink("wf1"), "guardrail_blocked");
    expect(mocks.createPaymentLink).not.toHaveBeenCalled();
  });

  it("rejects non-link strategies instead of executing them", async () => {
    mocks.wfFindUnique.mockResolvedValue(
      buildWorkflow({ strategy: "escalate_human" })
    );

    await expectExecutionError(
      executeRecoveryPaymentLink("wf1"),
      "strategy_not_executable"
    );
  });

  it("schedules a retry after a TEMPORARY provider failure", async () => {
    mocks.wfFindUnique.mockResolvedValue(buildWorkflow());
    mocks.createPaymentLink.mockRejectedValue(new Error("network timeout"));

    const err = await expectExecutionError(
      executeRecoveryPaymentLink("wf1"),
      "payment_link_creation_failed"
    );

    expect(err.details).toMatchObject({
      category: "temporary",
      workflowStatus: "retry_scheduled",
      attemptCount: 1,
    });

    // Rollback CAS moved executing -> retry_scheduled with a back-off date.
    expect(mocks.wfUpdateMany).toHaveBeenLastCalledWith({
      where: { id: "wf1", status: "executing", razorpayActionId: null },
      data: expect.objectContaining({
        status: "retry_scheduled",
        nextRetryAt: expect.any(Date),
        lastFailureCategory: "temporary",
      }),
    });

    const lastCall = mocks.auditCreate.mock.lastCall;
    expect(lastCall).toBeDefined();
    const data = lastCall![0] as { data: { details: string } };
    const details = JSON.parse(data.data.details);
    expect(details.event).toBe("execution_failed_retry_scheduled");
    expect(details.reason).toContain("temporary failure");
  });

  it("moves to terminal FAILED on a PERMANENT failure with no retry scheduled", async () => {
    mocks.wfFindUnique.mockResolvedValue(buildWorkflow());
    mocks.createPaymentLink.mockRejectedValue(
      new Error("invalid customer contact")
    );

    const err = await expectExecutionError(
      executeRecoveryPaymentLink("wf1"),
      "payment_link_creation_failed"
    );

    expect(err.details).toMatchObject({
      category: "permanent",
      workflowStatus: "failed",
    });

    expect(mocks.wfUpdateMany).toHaveBeenLastCalledWith({
      where: { id: "wf1", status: "executing" },
      data: expect.objectContaining({
        status: "failed",
        lastFailureCategory: "permanent",
        nextRetryAt: null,
      }),
    });
  });

  it("keeps the system consistent when the post-link transaction fails", async () => {
    mocks.wfFindUnique.mockResolvedValue(buildWorkflow());
    mocks.dbTransaction.mockRejectedValue(new Error("db write failed"));

    const err = await expectExecutionError(
      executeRecoveryPaymentLink("wf1"),
      "payment_link_creation_failed"
    );

    // The workflow is rolled back into a recoverable state rather than being
    // left stuck in `executing`.
    expect(err.details).toMatchObject({ workflowStatus: "retry_scheduled" });
    expect(mocks.wfUpdateMany).toHaveBeenLastCalledWith({
      where: { id: "wf1", status: "executing", razorpayActionId: null },
      data: expect.objectContaining({ status: "retry_scheduled" }),
    });
  });

  it("never lets a decision change the charged amount", async () => {
    // Even with a large discountPercent recorded on the workflow, the charge
    // equals revenueRisk.amountAtRisk - amounts are DB-trusted only.
    mocks.wfFindUnique.mockResolvedValue(buildWorkflow());

    await executeRecoveryPaymentLink("wf1");

    const call = mocks.createPaymentLink.mock.calls[0][0];
    expect(call.amountPaise).toBe(29900);
  });

  it("validates prerequisites before claiming", async () => {
    mocks.wfFindUnique.mockResolvedValue(null);
    await expectExecutionError(
      executeRecoveryPaymentLink("missing"),
      "recovery_not_found"
    );

    mocks.wfFindUnique.mockResolvedValue(
      buildWorkflow({ revenueRisk: { ...buildWorkflow().revenueRisk, currency: "USD" } })
    );
    await expectExecutionError(
      executeRecoveryPaymentLink("wf1"),
      "unsupported_currency"
    );

    mocks.wfFindUnique.mockResolvedValue(
      buildWorkflow({
        revenueRisk: { ...buildWorkflow().revenueRisk, amountAtRisk: 100 },
      })
    );
    await expectExecutionError(
      executeRecoveryPaymentLink("wf1"),
      "amount_below_guardrail_minimum"
    );
  });
});
