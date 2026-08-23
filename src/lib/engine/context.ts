import { prisma } from "@/lib/prisma";
import type { RecoveryContextInput } from "./scoring";

/**
 * Loads everything the decision engine needs about a recovery case from the
 * database and shapes it into the pure `RecoveryContextInput` consumed by the
 * deterministic scorer. Keeps all I/O in one place so engine rules stay pure.
 */

export interface RiskWithRelations {
  id: string;
  merchantId: string;
  type: string;
  amountAtRisk: number;
  currency: string;
  rootCause: string | null;
  createdAt: Date;
  paymentId: string | null;
  subscriptionId: string | null;
  orderId: string | null;
}

const RECENT_FAILURE_WINDOW_DAYS = 30;

export async function loadRisk(riskId: string): Promise<RiskWithRelations | null> {
  const risk = await prisma.revenueAtRisk.findUnique({
    where: { id: riskId },
    select: {
      id: true,
      merchantId: true,
      type: true,
      amountAtRisk: true,
      currency: true,
      rootCause: true,
      createdAt: true,
      paymentId: true,
      subscriptionId: true,
      orderId: true,
    },
  });
  return risk;
}

export async function resolveCustomerId(risk: RiskWithRelations): Promise<string | null> {
  if (risk.paymentId) {
    const payment = await prisma.payment.findUnique({
      where: { id: risk.paymentId },
      select: { customerId: true },
    });
    if (payment) return payment.customerId;
  }
  if (risk.subscriptionId) {
    const subscription = await prisma.subscription.findUnique({
      where: { id: risk.subscriptionId },
      select: { customerId: true },
    });
    if (subscription) return subscription.customerId;
  }
  if (risk.orderId) {
    const order = await prisma.order.findUnique({
      where: { id: risk.orderId },
      select: { customerId: true },
    });
    if (order) return order.customerId;
  }
  return null;
}

export interface CustomerHistoryStats {
  totalPayments: number;
  successfulPayments: number;
  recentFailedPayments: number;
}

async function loadCustomerHistoryStats(
  customerId: string
): Promise<CustomerHistoryStats> {
  const windowStart = new Date(
    Date.now() - RECENT_FAILURE_WINDOW_DAYS * 24 * 60 * 60 * 1000
  );

  const [totalPayments, successfulPayments, recentFailedPayments] =
    await Promise.all([
      prisma.payment.count({ where: { customerId } }),
      prisma.payment.count({
        where: { customerId, status: { in: ["captured", "authorized"] } },
      }),
      prisma.payment.count({
        where: { customerId, status: "failed", createdAt: { gte: windowStart } },
      }),
    ]);

  return { totalPayments, successfulPayments, recentFailedPayments };
}

export interface RecoveryHistoryStats {
  attempts: number;
  successes: number;
}

async function loadRecoveryHistoryStats(
  customerId: string
): Promise<RecoveryHistoryStats> {
  // Same customer-scoping trick the guardrails use: a customer owns risks via
  // any of their payment / subscription / order links.
  const customerRiskScope = {
    revenueRisk: {
      OR: [
        { payment: { customerId } },
        { subscription: { customerId } },
        { order: { customerId } },
      ],
    },
  };

  const [attempts, successes] = await Promise.all([
    prisma.recoveryWorkflow.count({ where: customerRiskScope }),
    prisma.recoveryWorkflow.count({
      where: { ...customerRiskScope, status: "succeeded" },
    }),
  ]);

  return { attempts, successes };
}

export async function buildRecoveryContext(
  risk: RiskWithRelations,
  customerId: string
): Promise<RecoveryContextInput> {
  const [history, recoveries, customer] = await Promise.all([
    loadCustomerHistoryStats(customerId),
    loadRecoveryHistoryStats(customerId),
    prisma.customer.findUnique({
      where: { id: customerId },
      select: { createdAt: true },
    }),
  ]);

  return {
    riskType: risk.type,
    amountPaise: risk.amountAtRisk,
    riskCreatedAt: risk.createdAt,
    customerCreatedAt: customer?.createdAt ?? risk.createdAt,
    totalPayments: history.totalPayments,
    successfulPayments: history.successfulPayments,
    recentFailedPayments: history.recentFailedPayments,
    recoveryAttempts: recoveries.attempts,
    recoverySuccesses: recoveries.successes,
  };
}
