import { prisma } from "@/lib/prisma";
import { createPaymentLink } from "@/lib/razorpay/payment-links";
import { runAllGuardrails } from "@/lib/guardrails/rules";
import { DEFAULT_LIMITS } from "@/lib/guardrails/limits";
import { PAYMENT_LINK_ELIGIBLE_STRATEGIES } from "@/lib/recovery-eligibility";
import { isExecutable } from "./state-machine";
import { classifyFailure, type FailureCategory } from "./failure-classification";
import {
  RETRY_POLICY,
  STALE_EXECUTION_MINUTES,
  nextRetryDate,
  shouldRetry,
} from "./retry-policy";
import { recordLifecycleEvent } from "./audit";
import type { Prisma } from "@prisma/client";
import type { RecoveryStatus } from "@/lib/types";

/**
 * Recovery execution service (payment-link strategies).
 *
 * Guarantees:
 *  - ATOMIC CLAIM: an execution starts with a compare-and-set UPDATE inside a
 *    transaction. Two concurrent requests can never both claim the same
 *    workflow - the loser's UPDATE matches zero rows.
 *  - IDEMPOTENCY: succeeded/escalated/cancelled workflows are never
 *    executable; an already-executing workflow rejects new claims unless it
 *    is provably stale (crashed before creating a link).
 *  - TRUSTED AMOUNTS: the payment amount is always `revenueRisk.amountAtRisk`
 *    read from the database. Decisions/AI influence strategy only - never
 *    amounts.
 *  - CLASSIFIED FAILURES: provider failures are classified temporary vs
 *    permanent; only temporary failures within the retry policy get
 *    scheduled retries. Everything is audited.
 */

export type ExecutionErrorCode =
  | "recovery_not_found"
  | "risk_not_linked"
  | "customer_not_resolvable"
  | "unsupported_currency"
  | "amount_below_guardrail_minimum"
  | "strategy_not_executable"
  | "recovery_not_executable"
  | "retry_not_due"
  | "retry_limit_reached"
  | "guardrail_blocked"
  | "duplicate_claim"
  | "payment_link_creation_failed"
  | "recovery_execution_failed";

export class RecoveryExecutionError extends Error {
  readonly code: ExecutionErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ExecutionErrorCode,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "RecoveryExecutionError";
    this.code = code;
    this.details = details;
  }
}

export interface PaymentLinkExecutionResult {
  recoveryId: string;
  riskId: string;
  status: RecoveryStatus;
  attemptCount: number;
  paymentLink: {
    linkId: string;
    shortUrl: string;
    amount: number;
    referenceId: string;
  };
}

const CUSTOMER_SELECT = { select: { id: true, name: true, email: true, phone: true } } as const;

interface CustomerRow {
  id: string;
  name: string;
  email: string;
  phone: string;
}

interface WorkflowRow {
  id: string;
  status: string;
  strategy: string;
  retryDelay: string | null;
  attemptCount: number;
  nextRetryAt: Date | null;
  revenueRiskId: string;
  revenueRisk: {
    id: string;
    merchantId: string;
    type: string;
    currency: string;
    amountAtRisk: number;
    payment: { customer: CustomerRow | null } | null;
    subscription: { customer: CustomerRow | null } | null;
    order: { customer: CustomerRow | null } | null;
  } | null;
}

const PAYMENT_LINK_TTL_SECONDS = 7 * 24 * 60 * 60;

function firstCustomer(risk: NonNullable<WorkflowRow["revenueRisk"]>): CustomerRow | null {
  return risk.payment?.customer ?? risk.subscription?.customer ?? risk.order?.customer ?? null;
}

async function loadWorkflow(recoveryId: string): Promise<WorkflowRow | null> {
  return prisma.recoveryWorkflow.findUnique({
    where: { id: recoveryId },
    select: {
      id: true,
      status: true,
      strategy: true,
      retryDelay: true,
      attemptCount: true,
      nextRetryAt: true,
      revenueRiskId: true,
      revenueRisk: {
        select: {
          id: true,
          merchantId: true,
          type: true,
          currency: true,
          amountAtRisk: true,
          payment: { select: { customer: CUSTOMER_SELECT } },
          subscription: { select: { customer: CUSTOMER_SELECT } },
          order: { select: { customer: CUSTOMER_SELECT } },
        },
      },
    },
  });
}

export interface ExecuteOptions {
  /** Operator-initiated attempts may re-execute a failed workflow. */
  manual?: boolean;
}

/**
 * Executes (or retries) a payment-link based recovery workflow.
 * Throws RecoveryExecutionError with a stable code on any rejection.
 */
export async function executeRecoveryPaymentLink(
  recoveryId: string,
  options: ExecuteOptions = {}
): Promise<PaymentLinkExecutionResult> {
  const manual = options.manual ?? false;

  const workflow = await loadWorkflow(recoveryId);
  if (!workflow) {
    throw new RecoveryExecutionError("recovery_not_found", "Recovery workflow not found");
  }

  const risk = workflow.revenueRisk;
  if (!risk) {
    throw new RecoveryExecutionError("risk_not_linked", "Recovery workflow has no linked risk");
  }

  const customer = firstCustomer(risk);
  if (!customer) {
    throw new RecoveryExecutionError("customer_not_resolvable", "No customer linked to this risk");
  }

  if (risk.currency !== "INR") {
    throw new RecoveryExecutionError("unsupported_currency", `Currency ${risk.currency} is not supported`, {
      currency: risk.currency,
    });
  }

  if (risk.amountAtRisk < DEFAULT_LIMITS.minRecoveryAmountPaise) {
    throw new RecoveryExecutionError(
      "amount_below_guardrail_minimum",
      "Amount below guardrail minimum",
      { amountPaise: risk.amountAtRisk, minPaise: DEFAULT_LIMITS.minRecoveryAmountPaise }
    );
  }

  if (!PAYMENT_LINK_ELIGIBLE_STRATEGIES.has(workflow.strategy)) {
    throw new RecoveryExecutionError(
      "strategy_not_executable",
      `Strategy ${workflow.strategy} cannot be executed as a payment link`,
      { strategy: workflow.strategy }
    );
  }

  if (!isExecutable(workflow.status, { manual })) {
    throw new RecoveryExecutionError(
      "recovery_not_executable",
      `Workflow in status "${workflow.status}" cannot be executed`,
      { status: workflow.status }
    );
  }

  if (workflow.attemptCount >= RETRY_POLICY.maxAttempts) {
    throw new RecoveryExecutionError("retry_limit_reached", "Maximum execution attempts reached", {
      attemptCount: workflow.attemptCount,
      maxAttempts: RETRY_POLICY.maxAttempts,
    });
  }

  // Automatic retries must respect the scheduled back-off; operators may
  // override the wait (guardrails still apply to everyone).
  if (
    !manual &&
    workflow.status === "retry_scheduled" &&
    workflow.nextRetryAt &&
    workflow.nextRetryAt.getTime() > Date.now()
  ) {
    throw new RecoveryExecutionError("retry_not_due", "Scheduled retry time has not been reached", {
      nextRetryAt: workflow.nextRetryAt.toISOString(),
    });
  }

  // Guardrails: per-risk attempt caps, per-customer caps, cooldowns, budget.
  const guardrail = await runAllGuardrails(risk.id, customer.id, risk.merchantId, risk.amountAtRisk);

  if (!guardrail.allowed) {
    throw new RecoveryExecutionError("guardrail_blocked", guardrail.blockedBy?.reason ?? "Guardrail blocked execution", {
      rule: guardrail.blockedBy?.rule,
    });
  }

  const referenceId = `revyn_${workflow.id}`;

  // ---- ATOMIC CLAIM ----------------------------------------------------
  // Compare-and-set the workflow into `executing`. The stale-execution arm
  // reclaims workflows whose process crashed after claiming but before a
  // payment link existed.
  const staleCutoff = new Date(Date.now() - STALE_EXECUTION_MINUTES * 60_000);
  const claimWhere: Prisma.RecoveryWorkflowWhereInput = manual
    ? {
        id: workflow.id,
        OR: [
          { status: { in: ["pending", "retry_scheduled", "failed"] } },
          { status: "executing", startedAt: { lt: staleCutoff }, razorpayActionId: null },
        ],
      }
    : {
        id: workflow.id,
        OR: [
          { status: { in: ["pending", "retry_scheduled"] } },
          { status: "executing", startedAt: { lt: staleCutoff }, razorpayActionId: null },
        ],
      };

  const claimed = await prisma.recoveryWorkflow.updateMany({
    where: claimWhere,
    data: {
      status: "executing",
      startedAt: new Date(),
      lastAttemptAt: new Date(),
      attemptCount: { increment: 1 },
    },
  });

  if (claimed.count === 0) {
    // Someone else claimed (or finished) this workflow between our read and
    // write - the duplicate request is safely absorbed.
    throw new RecoveryExecutionError("duplicate_claim", "Workflow was already claimed or changed state", {
      previousStatus: workflow.status,
    });
  }

  await recordLifecycleEvent(prisma, {
    riskId: risk.id,
    recoveryId: workflow.id,
    event: "execution_started",
    actor: manual ? "user" : "system",
    from: workflow.status,
    to: "executing",
    metadata: { attemptNumber: workflow.attemptCount + 1, strategy: workflow.strategy },
  });

  // ---- PROVIDER CALL ---------------------------------------------------
  // Amount authority: ONLY the trusted database value. Decisions/AI output
  // (including discountPercent) can never change what we charge.
  const now = new Date();
  try {
    const link = await createPaymentLink({
      amountPaise: risk.amountAtRisk,
      currency: "INR" as const,
      customerName: customer.name,
      customerEmail: customer.email,
      customerContact: customer.phone,
      referenceId,
      description: `Revyn recovery for ${risk.type}`,
      expireBy: Math.floor(now.getTime() / 1000) + PAYMENT_LINK_TTL_SECONDS,
    });

    await prisma.$transaction([
      prisma.recoveryWorkflow.update({
        where: { id: workflow.id },
        data: { razorpayActionId: link.linkId },
      }),
      prisma.auditLog.create({
        data: {
          revenueRiskId: risk.id,
          recoveryId: workflow.id,
          action: "recover",
          actor: manual ? "user" : "system",
          details: JSON.stringify({
            kind: "lifecycle",
            event: "payment_link_created",
            from: "executing",
            to: "executing",
            attemptNumber: workflow.attemptCount + 1,
            paymentLinkId: link.linkId,
            referenceId: link.referenceId ?? referenceId,
            amountPaise: link.amount,
          }),
          status: "success",
        },
      }),
    ]);

    return {
      recoveryId: workflow.id,
      riskId: risk.id,
      status: "executing",
      attemptCount: workflow.attemptCount + 1,
      paymentLink: {
        linkId: link.linkId,
        shortUrl: link.shortUrl,
        amount: link.amount,
        referenceId: link.referenceId ?? referenceId,
      },
    };
  } catch (err) {
    const rawMessage =
      err instanceof Error ? err.message : "Unknown provider error";
    const classified = classifyFailure(rawMessage);

    const finalStatus = await recordExecutionFailure({
      workflowId: workflow.id,
      riskId: risk.id,
      previousStatus: workflow.status,
      attemptCount: workflow.attemptCount + 1,
      decisionRetryDelay: workflow.retryDelay,
      reason: rawMessage,
      category: classified.category,
      retryable: shouldRetry({
        category: classified.category,
        attemptCount: workflow.attemptCount + 1,
      }),
      actor: manual ? "user" : "system",
    });

    throw new RecoveryExecutionError(
      "payment_link_creation_failed",
      `Payment link creation failed (${classified.category}): ${rawMessage}`,
      {
        category: classified.category,
        failureReason: rawMessage,
        workflowStatus: finalStatus,
        attemptCount: workflow.attemptCount + 1,
      }
    );
  }
}

/**
 * Records a failed execution attempt: classifies the failure and either
 * schedules a retry or moves the workflow to a terminal state. Uses a CAS on
 * `executing` so a webhook marking success mid-flight always wins.
 *
 * Returns the resulting workflow status.
 */
export async function recordExecutionFailure(input: {
  workflowId: string;
  riskId: string;
  previousStatus: string;
  attemptCount: number;
  decisionRetryDelay: string | null;
  reason: string;
  category: FailureCategory;
  retryable: boolean;
  actor?: "system" | "user";
}): Promise<RecoveryStatus> {
  const willRetry = input.retryable;

  if (willRetry) {
    const nextRetryAt = nextRetryDate(
      input.attemptCount,
      input.decisionRetryDelay
    );

    const reverted = await prisma.recoveryWorkflow.updateMany({
      where: { id: input.workflowId, status: "executing", razorpayActionId: null },
      data: {
        status: "retry_scheduled",
        startedAt: null,
        nextRetryAt,
        lastFailureReason: input.reason,
        lastFailureCategory: input.category,
      },
    });

    if (reverted.count === 0) {
      // Webhook already recorded success (or another writer moved state) -
      // do not clobber provider truth.
      return "succeeded";
    }

    await recordLifecycleEvent(prisma, {
      riskId: input.riskId,
      recoveryId: input.workflowId,
      event: "execution_failed_retry_scheduled",
      actor: input.actor ?? "system",
      from: "executing",
      to: "retry_scheduled",
      reason: `Retry scheduled because the payment provider returned a temporary failure: ${input.reason}`,
      status: "warning",
      metadata: {
        category: input.category,
        attemptCount: input.attemptCount,
        nextRetryAt: nextRetryAt.toISOString(),
      },
    });

    return "retry_scheduled";
  }

  const failed = await prisma.recoveryWorkflow.updateMany({
    where: { id: input.workflowId, status: "executing" },
    data: {
      status: "failed",
      completedAt: new Date(),
      lastFailureReason: input.reason,
      lastFailureCategory: input.category,
      nextRetryAt: null,
    },
  });

  if (failed.count === 0) {
    return "succeeded";
  }

  await recordLifecycleEvent(prisma, {
    riskId: input.riskId,
    recoveryId: input.workflowId,
    event:
      input.category === "permanent"
        ? "execution_failed_permanent"
        : "execution_failed_exhausted",
    actor: input.actor ?? "system",
    from: "executing",
    to: "failed",
    reason:
      input.category === "permanent"
        ? `Permanent failure, no automated retry possible: ${input.reason}`
        : `Temporary failures exhausted the retry limit after ${input.attemptCount} attempts: ${input.reason}`,
    status: "failure",
    metadata: {
      category: input.category,
      attemptCount: input.attemptCount,
    },
  });

  return "failed";
}
