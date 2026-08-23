import { createHmac, timingSafeEqual } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  RETRY_POLICY,
  nextRetryDate,
  hasAttemptsLeft,
} from "@/lib/recovery/retry-policy";
import { FAILURE_REASONS } from "@/lib/recovery/failure-classification";
import { recordDuplicateSuppressed } from "@/lib/recovery/audit";

export const RAZORPAY_SIGNATURE_HEADER = "x-razorpay-signature";

const REFERENCE_PREFIX = "revyn_";

export interface WebhookHttpResponse {
  status: number;
  body: Record<string, unknown>;
}

export function verifyRazorpaySignature(
  rawBody: string,
  signature: string | null | undefined,
  secret: string
): boolean {
  if (!rawBody || !signature || !secret) {
    return false;
  }

  const expected = Buffer.from(
    createHmac("sha256", secret).update(rawBody, "utf8").digest("hex"),
    "utf8"
  );
  const received = Buffer.from(signature, "utf8");

  if (expected.length !== received.length) {
    return false;
  }

  return timingSafeEqual(expected, received);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

type WebhookTx = Prisma.TransactionClient;

interface ResolvedWorkflow {
  id: string;
  revenueRiskId: string;
  status: string;
  amountRecovered: number;
  razorpayActionId: string | null;
  attemptCount: number;
  revenueRisk: {
    amountAtRisk: number;
  };
}

async function findWorkflowForPaymentLink(
  tx: WebhookTx,
  entity: Record<string, unknown>
): Promise<ResolvedWorkflow | null> {
  const paymentLinkId = asString(entity.id);

  if (paymentLinkId) {
    const byActionId = await tx.recoveryWorkflow.findFirst({
      where: { razorpayActionId: paymentLinkId },
      include: { revenueRisk: { select: { amountAtRisk: true } } },
    });

    if (byActionId) {
      return byActionId;
    }
  }

  const referenceId = asString(entity.reference_id);

  if (referenceId?.startsWith(REFERENCE_PREFIX)) {
    const candidateId = referenceId.slice(REFERENCE_PREFIX.length);
    const byReference = await tx.recoveryWorkflow.findUnique({
      where: { id: candidateId },
      include: { revenueRisk: { select: { amountAtRisk: true } } },
    });

    if (
      byReference &&
      (!byReference.razorpayActionId ||
        (paymentLinkId !== null && byReference.razorpayActionId === paymentLinkId))
    ) {
      return byReference;
    }
  }

  return null;
}

interface ProcessedOutcome {
  outcome: "processed";
  workflowId: string;
  riskId: string | null;
  amountRecorded: number;
}

interface DuplicateOutcome {
  outcome: "duplicate";
  workflowId: string;
}

interface UnknownOutcome {
  outcome: "unknown_reference";
}

type PaymentLinkPaidResult =
  | ProcessedOutcome
  | DuplicateOutcome
  | UnknownOutcome;

export async function processPaymentLinkPaidEvent(
  event: unknown
): Promise<PaymentLinkPaidResult> {
  if (!isRecord(event) || event.event !== "payment_link.paid") {
    throw new Error("processPaymentLinkPaidEvent expects a payment_link.paid event");
  }

  const payload = isRecord(event.payload) ? event.payload : null;
  const plinkPayload =
    payload && isRecord(payload.payment_link) ? payload.payment_link : null;
  const entity =
    plinkPayload && isRecord(plinkPayload.entity) ? plinkPayload.entity : null;

  if (!entity) {
    throw new Error("payment_link.paid event has no payment_link entity");
  }

  const paymentLinkId = asString(entity.id);
  const referenceId = asString(entity.reference_id);
  const razorpayPaymentId = (() => {
    if (!payload || !isRecord(payload.payment)) return null;
    if (!isRecord(payload.payment.entity)) return null;
    return asString(payload.payment.entity.id);
  })();

  const result = await prisma.$transaction(async (tx) => {
    const workflow = await findWorkflowForPaymentLink(tx, entity);

    if (!workflow) {
      return { outcome: "unknown_reference" } satisfies UnknownOutcome;
    }

    const amountPaid =
      asFiniteNumber(entity.amount_paid) ?? asFiniteNumber(entity.amount);

    if (amountPaid === null || amountPaid <= 0) {
      throw new Error(
        `payment_link.paid event for workflow ${workflow.id} has no usable paid amount`
      );
    }

    const cap = workflow.revenueRisk.amountAtRisk;
    const amountRecorded =
      cap > 0 ? Math.min(amountPaid, cap) : amountPaid;

    const previousStatus = workflow.status;

    const claimed = await tx.recoveryWorkflow.updateMany({
      where: { id: workflow.id, status: { not: "succeeded" } },
      data: {
        status: "succeeded",
        amountRecovered: amountRecorded,
        completedAt: new Date(),
      },
    });

    if (claimed.count === 0) {
      return {
        outcome: "duplicate",
        workflowId: workflow.id,
      } satisfies DuplicateOutcome;
    }

    await tx.revenueAtRisk.update({
      where: { id: workflow.revenueRiskId },
      data: { status: "recovered" },
    });

    await tx.auditLog.create({
      data: {
        revenueRiskId: workflow.revenueRiskId,
        recoveryId: workflow.id,
        action: "webhook",
        actor: "razorpay_webhook",
        details: JSON.stringify({
          kind: "lifecycle",
          event: "payment_link_paid",
          from: previousStatus,
          to: "succeeded",
          paymentLinkId,
          referenceId,
          razorpayPaymentId,
          amountPaid,
          amountRecorded,
        }),
        status: "success",
      },
    });

    return {
      outcome: "processed",
      workflowId: workflow.id,
      riskId: workflow.revenueRiskId,
      amountRecorded,
    } satisfies ProcessedOutcome;
  });

  if (result.outcome === "unknown_reference") {
    await prisma.auditLog.create({
      data: {
        revenueRiskId: null,
        recoveryId: null,
        action: "webhook",
        actor: "razorpay_webhook",
        details: JSON.stringify({
          event: "payment_link.paid",
          paymentLinkId,
          referenceId,
          reason: "no_matching_recovery_workflow",
        }),
        status: "warning",
      },
    });
  }

  if (result.outcome === "duplicate") {
    await recordDuplicateSuppressed(prisma, {
      recoveryId: result.workflowId,
      event: "payment_link.paid",
      actor: "razorpay_webhook",
      reason: "workflow_already_succeeded",
      metadata: { paymentLinkId },
    }).catch(() => undefined);
  }

  return result;
}

/* ------------------------------------------------------------------ */
/*  payment_link.expired                                              */
/* ------------------------------------------------------------------ */

export interface ExpiredProcessedOutcome {
  outcome: "processed";
  workflowId: string;
  riskId: string;
  result: "retry_scheduled" | "failed";
  nextRetryAt: string | null;
}

interface ExpiredTerminalOutcome {
  outcome: "terminal";
  workflowId: string;
}

type PaymentLinkExpiredResult =
  | ExpiredProcessedOutcome
  | DuplicateOutcome
  | UnknownOutcome
  | ExpiredTerminalOutcome;

/**
 * Handles `payment_link.expired`: the customer did not pay before the link
 * lapsed. Classified as a TEMPORARY failure - the customer may still pay via
 * a fresh link - so the workflow either gets a scheduled retry (within the
 * retry policy) or moves to terminal failure once attempts are exhausted.
 */
export async function processPaymentLinkExpiredEvent(
  event: unknown
): Promise<PaymentLinkExpiredResult> {
  if (!isRecord(event) || event.event !== "payment_link.expired") {
    throw new Error("processPaymentLinkExpiredEvent expects a payment_link.expired event");
  }

  const payload = isRecord(event.payload) ? event.payload : null;
  const plinkPayload =
    payload && isRecord(payload.payment_link) ? payload.payment_link : null;
  const entity =
    plinkPayload && isRecord(plinkPayload.entity) ? plinkPayload.entity : null;

  if (!entity) {
    throw new Error("payment_link.expired event has no payment_link entity");
  }

  const paymentLinkId = asString(entity.id);
  const referenceId = asString(entity.reference_id);

  const result = await prisma.$transaction(async (tx) => {
    const workflow = await findWorkflowForPaymentLink(tx, entity);

    if (!workflow) {
      return { outcome: "unknown_reference" } satisfies UnknownOutcome;
    }

    if (
      workflow.status === "succeeded" ||
      workflow.status === "failed" ||
      workflow.status === "cancelled" ||
      workflow.status === "escalated"
    ) {
      if (workflow.status === "succeeded") {
        return {
          outcome: "duplicate",
          workflowId: workflow.id,
        } satisfies DuplicateOutcome;
      }
      return {
        outcome: "terminal",
        workflowId: workflow.id,
      } satisfies ExpiredTerminalOutcome;
    }

    // Expiry is temporary; retry while the policy allows attempts.
    const willRetry = hasAttemptsLeft(workflow.attemptCount);
    const nextRetryAt = nextRetryDate(
      Math.max(1, workflow.attemptCount),
      null
    );

    const updated = await tx.recoveryWorkflow.updateMany({
      where: { id: workflow.id, status: { in: ["pending", "executing", "retry_scheduled"] } },
      data: willRetry
        ? {
            status: "retry_scheduled",
            startedAt: null,
            nextRetryAt,
            lastFailureReason: FAILURE_REASONS.paymentLinkExpired,
            lastFailureCategory: "temporary",
          }
        : {
            status: "failed",
            startedAt: null,
            nextRetryAt: null,
            completedAt: new Date(),
            lastFailureReason: FAILURE_REASONS.paymentLinkExpired,
            lastFailureCategory: "temporary",
          },
    });

    if (updated.count === 0) {
      return {
        outcome: "duplicate",
        workflowId: workflow.id,
      } satisfies DuplicateOutcome;
    }

    const finalStatus = willRetry ? "retry_scheduled" : "failed";

    await tx.auditLog.create({
      data: {
        revenueRiskId: workflow.revenueRiskId,
        recoveryId: workflow.id,
        action: "webhook",
        actor: "razorpay_webhook",
        details: JSON.stringify({
          kind: "lifecycle",
          event: "payment_link_expired",
          from: workflow.status,
          to: finalStatus,
          reason:
            "Retry scheduled because the payment link expired without payment." +
            (willRetry ? "" : " Retry limit reached."),
          paymentLinkId,
          referenceId,
          category: "temporary",
          attemptCount: workflow.attemptCount,
          maxAttempts: RETRY_POLICY.maxAttempts,
          ...(willRetry ? { nextRetryAt: nextRetryAt.toISOString() } : {}),
        }),
        status: willRetry ? "warning" : "failure",
      },
    });

    return {
      outcome: "processed",
      workflowId: workflow.id,
      riskId: workflow.revenueRiskId,
      result: finalStatus,
      nextRetryAt: willRetry ? nextRetryAt.toISOString() : null,
    } satisfies ExpiredProcessedOutcome;
  });

  if (result.outcome === "unknown_reference") {
    await prisma.auditLog
      .create({
        data: {
          revenueRiskId: null,
          recoveryId: null,
          action: "webhook",
          actor: "razorpay_webhook",
          details: JSON.stringify({
            event: "payment_link.expired",
            paymentLinkId,
            referenceId,
            reason: "no_matching_recovery_workflow",
          }),
          status: "warning",
        },
      })
      .catch(() => undefined);
  }

  return result;
}

export async function handleRazorpayWebhook(
  rawBody: string,
  signature: string | null | undefined
): Promise<WebhookHttpResponse> {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

  if (!secret) {
    return {
      status: 500,
      body: { error: "webhook_secret_not_configured" },
    };
  }

  if (!verifyRazorpaySignature(rawBody, signature, secret)) {
    return {
      status: 401,
      body: { error: "invalid_signature" },
    };
  }

  let event: unknown;

  try {
    event = JSON.parse(rawBody);
  } catch {
    return {
      status: 400,
      body: { error: "invalid_json" },
    };
  }

  const eventName = isRecord(event) ? event.event : undefined;

  const supportedEvent =
    eventName === "payment_link.paid"
      ? "paid"
      : eventName === "payment_link.expired"
        ? "expired"
        : null;

  if (!supportedEvent) {
    return {
      status: 200,
      body: { ok: true, handled: false, event: eventName ?? null },
    };
  }

  try {
    if (supportedEvent === "expired") {
      const result = await processPaymentLinkExpiredEvent(event);

      switch (result.outcome) {
        case "processed":
          return {
            status: 200,
            body: {
              ok: true,
              handled: true,
              duplicate: false,
              recoveryId: result.workflowId,
              retryScheduled: result.result === "retry_scheduled",
              nextRetryAt: result.nextRetryAt,
            },
          };
        case "duplicate":
        case "terminal":
          return {
            status: 200,
            body: {
              ok: true,
              handled: true,
              duplicate: result.outcome === "duplicate",
              ignored: result.outcome === "terminal",
              recoveryId: result.workflowId,
            },
          };
        case "unknown_reference":
          return {
            status: 200,
            body: { ok: true, handled: false, reason: "unknown_reference" },
          };
      }
    }

    const result = await processPaymentLinkPaidEvent(event);

    switch (result.outcome) {
      case "processed":
        return {
          status: 200,
          body: {
            ok: true,
            handled: true,
            duplicate: false,
            recoveryId: result.workflowId,
            amountRecorded: result.amountRecorded,
          },
        };
      case "duplicate":
        return {
          status: 200,
          body: {
            ok: true,
            handled: true,
            duplicate: true,
            recoveryId: result.workflowId,
          },
        };
      case "unknown_reference":
        return {
          status: 200,
          body: { ok: true, handled: false, reason: "unknown_reference" },
        };
    }
  } catch (err) {
  console.error("========== RAZORPAY WEBHOOK ERROR ==========");
  console.error(err);
  console.error(
    "Message:",
    err instanceof Error ? err.message : String(err)
  );
  console.error(
    "Stack:",
    err instanceof Error ? err.stack : "No stack available"
  );
  console.error("============================================");

  return {
    status: 500,
    body: {
      error: "webhook_processing_failed",
      message: err instanceof Error ? err.message : String(err),
    },
  };
  }
}