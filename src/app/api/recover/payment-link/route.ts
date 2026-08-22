import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { DEFAULT_LIMITS } from "@/lib/guardrails/limits";
import {
  createPaymentLink,
  PaymentLinkCreationError,
} from "@/lib/razorpay/payment-links";

const requestSchema = z.object({
  recoveryId: z.string().min(1).max(64),
});

const LINK_ELIGIBLE_STRATEGIES = new Set(["send_payment_link", "offer_discount"]);

const PAYMENT_LINK_TTL_SECONDS = 7 * 24 * 60 * 60;

function errorResponse(status: number, error: string, details?: unknown) {
  return NextResponse.json(details === undefined ? { error } : { error, details }, {
    status,
  });
}

export async function POST(request: Request) {
  let rawBody: unknown;

  try {
    rawBody = await request.json();
  } catch {
    return errorResponse(400, "invalid_json");
  }

  const parsed = requestSchema.safeParse(rawBody);

  if (!parsed.success) {
    return errorResponse(400, "invalid_request", parsed.error.issues);
  }

  const recovery = await prisma.recoveryWorkflow.findUnique({
    where: { id: parsed.data.recoveryId },
    include: {
      revenueRisk: {
        include: {
          payment: { include: { customer: true } },
          subscription: { include: { customer: true } },
          order: { include: { customer: true } },
        },
      },
    },
  });

  if (!recovery) {
    return errorResponse(404, "recovery_not_found");
  }

  if (!LINK_ELIGIBLE_STRATEGIES.has(recovery.strategy)) {
    return errorResponse(409, "strategy_not_payment_link_eligible", {
      strategy: recovery.strategy,
    });
  }

  if (recovery.status !== "pending") {
    return errorResponse(409, "recovery_not_pending", {
      status: recovery.status,
    });
  }

  const risk = recovery.revenueRisk;

  if (!risk) {
    return errorResponse(409, "risk_not_linked_to_recovery");
  }

  if (risk.currency !== "INR") {
    return errorResponse(409, "unsupported_currency", { currency: risk.currency });
  }

  const customer =
    risk.payment?.customer ?? risk.subscription?.customer ?? risk.order?.customer;

  if (!customer) {
    return errorResponse(409, "customer_not_resolvable");
  }

  if (risk.amountAtRisk < DEFAULT_LIMITS.minRecoveryAmountPaise) {
    return errorResponse(409, "amount_below_guardrail_minimum", {
      amountPaise: risk.amountAtRisk,
      minPaise: DEFAULT_LIMITS.minRecoveryAmountPaise,
    });
  }

  const claim = await prisma.recoveryWorkflow.updateMany({
    where: { id: recovery.id, status: "pending" },
    data: { status: "executing", startedAt: new Date() },
  });

  if (claim.count === 0) {
    return errorResponse(409, "recovery_not_pending");
  }

  const referenceId = `revyn_${recovery.id}`;

  try {
    const link = await createPaymentLink({
      amountPaise: risk.amountAtRisk,
      currency: risk.currency,
      customerName: customer.name,
      customerEmail: customer.email,
      customerContact: customer.phone,
      referenceId,
      description: `Revyn recovery for ${risk.type}`,
      expireBy: Math.floor(Date.now() / 1000) + PAYMENT_LINK_TTL_SECONDS,
    });

    await prisma.recoveryWorkflow.update({
      where: { id: recovery.id },
      data: { razorpayActionId: link.linkId },
    });

    await prisma.auditLog.create({
      data: {
        revenueRiskId: risk.id,
        recoveryId: recovery.id,
        action: "recover",
        actor: "system",
        details: JSON.stringify({
          strategy: recovery.strategy,
          paymentLinkId: link.linkId,
          referenceId: link.referenceId ?? referenceId,
          amountPaise: link.amount,
          shortUrl: link.shortUrl,
        }),
        status: "success",
      },
    });

    return NextResponse.json({
      linkId: link.linkId,
      shortUrl: link.shortUrl,
      amount: link.amount,
      referenceId: link.referenceId ?? referenceId,
    });
  } catch (err) {
    const message =
      err instanceof PaymentLinkCreationError
        ? err.message
        : "Failed to create Razorpay payment link";

    await prisma.recoveryWorkflow
      .updateMany({
        where: { id: recovery.id, status: "executing", razorpayActionId: null },
        data: { status: "pending", startedAt: null },
      })
      .catch(() => undefined);

    await prisma.auditLog
      .create({
        data: {
          revenueRiskId: risk.id,
          recoveryId: recovery.id,
          action: "recover",
          actor: "system",
          details: JSON.stringify({ referenceId, failureReason: message }),
          status: "failure",
        },
      })
      .catch(() => undefined);

    return errorResponse(502, "payment_link_creation_failed", { message });
  }
}
