import { prisma } from "@/lib/prisma";
import type { RevenueRiskType } from "@/lib/types";

export interface DetectionItem {
  id: string;
  type: RevenueRiskType;
  amountAtRisk: number;
  customerName: string;
  createdAt: Date;
}

export interface DetectionResult {
  risksFound: number;
  totalAtRisk: number;
  items: DetectionItem[];
}

export async function detectFailedPayments(): Promise<DetectionItem[]> {
  const failedPayments = await prisma.payment.findMany({
    where: {
      status: "failed",
      risks: { none: {} },
    },
    include: {
      customer: { select: { name: true } },
    },
  });

  const created: DetectionItem[] = [];

  for (const payment of failedPayments) {
    const risk = await prisma.revenueAtRisk.create({
      data: {
        merchantId: payment.merchantId,
        paymentId: payment.id,
        type: "failed_payment",
        amountAtRisk: payment.amount,
        currency: payment.currency,
        status: "detected",
        confidenceScore: 0,
      },
    });

    await prisma.auditLog.create({
      data: {
        revenueRiskId: risk.id,
        action: "detect",
        actor: "system",
        details: JSON.stringify({
          source: "failed_payment",
          paymentId: payment.razorpayPaymentId,
          amount: payment.amount,
        }),
        status: "success",
      },
    });

    created.push({
      id: risk.id,
      type: "failed_payment",
      amountAtRisk: payment.amount,
      customerName: payment.customer.name,
      createdAt: risk.createdAt,
    });
  }

  return created;
}

export async function detectAbandonedCheckouts(): Promise<DetectionItem[]> {
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);

  const abandonedOrders = await prisma.order.findMany({
    where: {
      status: "created",
      createdAt: { lt: thirtyMinAgo },
      payments: { none: {} },
      risks: { none: {} },
    },
    include: {
      customer: { select: { name: true } },
    },
  });

  const created: DetectionItem[] = [];

  for (const order of abandonedOrders) {
    const risk = await prisma.revenueAtRisk.create({
      data: {
        merchantId: order.merchantId,
        orderId: order.id,
        type: "abandoned_checkout",
        amountAtRisk: order.amount,
        currency: order.currency,
        status: "detected",
        confidenceScore: 0,
      },
    });

    await prisma.auditLog.create({
      data: {
        revenueRiskId: risk.id,
        action: "detect",
        actor: "system",
        details: JSON.stringify({
          source: "abandoned_checkout",
          orderId: order.razorpayOrderId,
          amount: order.amount,
          createdAt: order.createdAt.toISOString(),
        }),
        status: "success",
      },
    });

    created.push({
      id: risk.id,
      type: "abandoned_checkout",
      amountAtRisk: order.amount,
      customerName: order.customer.name,
      createdAt: risk.createdAt,
    });
  }

  return created;
}

export async function detectFailedSubscriptions(): Promise<DetectionItem[]> {
  const failedSubscriptions = await prisma.subscription.findMany({
    where: {
      status: { in: ["expired", "activation_failed", "halted"] },
      remainingCount: { gt: 0 },
      risks: { none: {} },
    },
    include: {
      customer: { select: { name: true } },
      plan: { select: { amount: true, currency: true } },
    },
  });

  const created: DetectionItem[] = [];

  for (const sub of failedSubscriptions) {
    const projectedLoss = sub.plan.amount * sub.remainingCount;

    const risk = await prisma.revenueAtRisk.create({
      data: {
        merchantId: sub.merchantId,
        subscriptionId: sub.id,
        type: "failed_subscription",
        amountAtRisk: projectedLoss,
        currency: sub.plan.currency,
        status: "detected",
        confidenceScore: 0,
      },
    });

    await prisma.auditLog.create({
      data: {
        revenueRiskId: risk.id,
        action: "detect",
        actor: "system",
        details: JSON.stringify({
          source: "failed_subscription",
          subscriptionId: sub.razorpaySubId,
          subscriptionStatus: sub.status,
          planAmount: sub.plan.amount,
          remainingCount: sub.remainingCount,
          projectedLoss,
        }),
        status: "success",
      },
    });

    created.push({
      id: risk.id,
      type: "failed_subscription",
      amountAtRisk: projectedLoss,
      customerName: sub.customer.name,
      createdAt: risk.createdAt,
    });
  }

  return created;
}

export async function detectOverdueReceivables(): Promise<DetectionItem[]> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const overdueOrders = await prisma.order.findMany({
    where: {
      status: "created",
      createdAt: { lt: oneDayAgo },
      risks: { none: {} },
    },
    include: {
      customer: { select: { name: true } },
    },
  });

  const created: DetectionItem[] = [];

  for (const order of overdueOrders) {
    const hasPayment = await prisma.payment.count({
      where: {
        orderId: order.id,
        status: { in: ["authorized", "captured"] },
      },
    });

    if (hasPayment > 0) continue;

    const risk = await prisma.revenueAtRisk.create({
      data: {
        merchantId: order.merchantId,
        orderId: order.id,
        type: "overdue_receivable",
        amountAtRisk: order.amount,
        currency: order.currency,
        status: "detected",
        confidenceScore: 0,
      },
    });

    await prisma.auditLog.create({
      data: {
        revenueRiskId: risk.id,
        action: "detect",
        actor: "system",
        details: JSON.stringify({
          source: "overdue_receivable",
          orderId: order.razorpayOrderId,
          amount: order.amount,
          createdAt: order.createdAt.toISOString(),
        }),
        status: "success",
      },
    });

    created.push({
      id: risk.id,
      type: "overdue_receivable",
      amountAtRisk: order.amount,
      customerName: order.customer.name,
      createdAt: risk.createdAt,
    });
  }

  return created;
}

export async function detectAll(): Promise<DetectionResult> {
  const [failedPayments, abandonedCheckouts, failedSubscriptions, overdueReceivables] =
    await Promise.all([
      detectFailedPayments(),
      detectAbandonedCheckouts(),
      detectFailedSubscriptions(),
      detectOverdueReceivables(),
    ]);

  const allItems = [
    ...failedPayments,
    ...abandonedCheckouts,
    ...failedSubscriptions,
    ...overdueReceivables,
  ];

  return {
    risksFound: allItems.length,
    totalAtRisk: allItems.reduce((sum, item) => sum + item.amountAtRisk, 0),
    items: allItems,
  };
}
