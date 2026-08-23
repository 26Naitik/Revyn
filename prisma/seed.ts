import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/* ------------------------------------------------------------------ */
/*  Revyn demo-seed script — idempotent, deterministic                */
/* ------------------------------------------------------------------ */

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

/* ---------- helpers ------------------------------------------------ */

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);
const hoursAgo = (n: number) => new Date(Date.now() - n * 3_600_000);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

/* ---------- fixed primary-key IDs --------------------------------- */

const MERCHANT_ID = "mer_demo_revyn";

const CUSTOMER_AARAV = "cus_demo_aarav";
const CUSTOMER_PRIYA = "cus_demo_priya";
const CUSTOMER_ROHAN = "cus_demo_rohan";

const PLAN_PRO = "plan_demo_pro";

const ORDER_PAID = "ord_demo_paid_1";
const ORDER_ABANDONED = "ord_demo_abandoned";
const ORDER_OVERDUE = "ord_demo_overdue";

const PAY_HIST_1 = "pay_demo_hist_1";
const PAY_SUB_1 = "pay_demo_sub_1";
const PAY_SUB_2 = "pay_demo_sub_2";
const PAY_SUB_3 = "pay_demo_sub_3";
const PAY_FAILED_CARD = "pay_demo_failed_card";
const PAY_FAILED_INVOICE = "pay_demo_failed_invoice";

const SUB_ROHAN = "sub_demo_rohan";

/* amounts in paise */
const AMT_2499 = 249_900;
const AMT_499 = 49_900;
const AMT_12400 = 1_240_000;
const AMT_3299 = 329_900;
const AMT_18500 = 1_850_000;

/* ================================================================ */
/*  Main seed                                                       */
/* ================================================================ */

async function main() {
  console.log("▸ Seeding Revyn demo data …");

  /* 1. Merchant --------------------------------------------------- */
  await prisma.merchant.upsert({
    where: { id: MERCHANT_ID },
    create: {
      id: MERCHANT_ID,
      name: "Revyn Demo Store",
      razorpayMerId: "rzp_test_demo_merchant",
    },
    update: {},
  });

  /* 2. Customers -------------------------------------------------- */
  const customers = [
    {
      id: CUSTOMER_AARAV,
      name: "Aarav Sharma",
      email: "aarav.sharma@example.com",
      phone: "+919876543210",
    },
    {
      id: CUSTOMER_PRIYA,
      name: "Priya Patel",
      email: "priya.patel@example.com",
      phone: "+919876543211",
    },
    {
      id: CUSTOMER_ROHAN,
      name: "Rohan Mehta",
      email: "rohan.mehta@example.com",
      phone: "+919876543212",
    },
  ] as const;

  for (const c of customers) {
    await prisma.customer.upsert({
      where: { id: c.id },
      create: { ...c, merchantId: MERCHANT_ID },
      update: {},
    });
  }

  /* 3. Plan ------------------------------------------------------- */
  await prisma.plan.upsert({
    where: { id: PLAN_PRO },
    create: {
      id: PLAN_PRO,
      merchantId: MERCHANT_ID,
      name: "Revyn Pro Monthly",
      amount: AMT_499,
      currency: "INR",
      interval: "monthly",
    },
    update: {},
  });

  /* 4. Historical orders (paid) ------------------------------------ */
  const pastOrders: Array<{
    id: string;
    customerId: string;
    razorpayOrderId: string;
    amount: number;
    createdAt: Date;
  }> = [
    {
      id: ORDER_PAID,
      customerId: CUSTOMER_AARAV,
      razorpayOrderId: "order_demo_rzp_1001",
      amount: AMT_2499,
      createdAt: daysAgo(10),
    },
    {
      id: ORDER_ABANDONED,
      customerId: CUSTOMER_PRIYA,
      razorpayOrderId: "order_demo_rzp_1002",
      amount: AMT_3299,
      createdAt: minutesAgo(45), /* 30min < age < 24h → abandoned */
    },
    {
      id: ORDER_OVERDUE,
      customerId: CUSTOMER_PRIYA,
      razorpayOrderId: "order_demo_rzp_1003",
      amount: AMT_18500,
      createdAt: daysAgo(2), /* 24h < age < 72h → overdue */
    },
  ];

  for (const o of pastOrders) {
    await prisma.order.upsert({
      where: { id: o.id },
      create: {
        ...o,
        merchantId: MERCHANT_ID,
        status: "created",
        currency: "INR",
      },
      update: {
        createdAt: o.createdAt, /* refresh window-sensitive timestamps */
      },
    });
  }

  /* 5. Successful historical payments ----------------------------- */
  await prisma.payment.upsert({
    where: { id: PAY_HIST_1 },
    create: {
      id: PAY_HIST_1,
      merchantId: MERCHANT_ID,
      customerId: CUSTOMER_AARAV,
      orderId: ORDER_PAID,
      razorpayPaymentId: "pay_rzp_demo_hist_001",
      amount: AMT_2499,
      status: "captured",
      method: "card",
      captured: true,
    },
    update: {},
  });

  /* paid order → mark "paid" so it doesn't trip detection */
  await prisma.order.update({
    where: { id: ORDER_PAID },
    data: { status: "paid" },
  });

  /* 5. Subscription (halted) --------------------------------------- */
  await prisma.subscription.upsert({
    where: { id: SUB_ROHAN },
    create: {
      id: SUB_ROHAN,
      merchantId: MERCHANT_ID,
      customerId: CUSTOMER_ROHAN,
      planId: PLAN_PRO,
      razorpaySubId: "sub_rzp_demo_rohan_01",
      status: "halted",
      currentStart: daysAgo(60),
      currentEnd: daysAgo(1),
      paidCount: 3,
      remainingCount: 6, /* projected loss = 499×6 = ₹2,994 */
    },
    update: {},
  });

  /* successful subscription payments (3 of 9 completed) */
  for (const [id, dayOffset] of [
    [PAY_SUB_1, 45],
    [PAY_SUB_2, 15],
    [PAY_SUB_3, 1],
  ] as const) {
    await prisma.payment.upsert({
      where: { id },
      create: {
        id,
        merchantId: MERCHANT_ID,
        customerId: CUSTOMER_ROHAN,
        subscriptionId: SUB_ROHAN,
        razorpayPaymentId: `pay_rzp_sub_demo_${id.split("_").pop()}`,
        amount: AMT_499,
        status: "captured",
        method: "card",
        captured: true,
        createdAt: daysAgo(dayOffset),
      },
      update: {
        createdAt: daysAgo(dayOffset),
      },
    });
  }

  /* 6. Failed payment — expired card (no orderId → clean trigger)   */
  await prisma.payment.upsert({
    where: { id: PAY_FAILED_CARD },
    create: {
      id: PAY_FAILED_CARD,
      merchantId: MERCHANT_ID,
      customerId: CUSTOMER_AARAV,
      razorpayPaymentId: "pay_rzp_demo_fail_card",
      amount: AMT_12400,
      status: "failed",
      method: "card",
      errorCode: "EC_001",
      errorReason: "expired_card",
      errorDescription: "Your card has expired",
      errorSource: "customer",
      errorStep: "authorization",
    },
    update: {},
  });

  /* 7. Failed payment on overdue invoice (insufficient funds)       */
  await prisma.payment.upsert({
    where: { id: PAY_FAILED_INVOICE },
    create: {
      id: PAY_FAILED_INVOICE,
      merchantId: MERCHANT_ID,
      customerId: CUSTOMER_PRIYA,
      orderId: ORDER_OVERDUE,
      razorpayPaymentId: "pay_rzp_demo_fail_invoice",
      amount: AMT_18500,
      status: "failed",
      method: "card",
      errorCode: "EC_003",
      errorReason: "insufficient_funds",
      errorDescription: "Insufficient funds in account",
      errorSource: "customer",
      errorStep: "authorization",
      createdAt: hoursAgo(47),
    },
    update: {
      createdAt: hoursAgo(47),
    },
  });

  /* ---- summary -------------------------------------------------- */
  const [merchantCount, customerCount, planCount, orderCount, paymentCount, subCount] =
    await Promise.all([
      prisma.merchant.count({ where: { id: MERCHANT_ID } }),
      prisma.customer.count({
        where: { id: { in: [CUSTOMER_AARAV, CUSTOMER_PRIYA, CUSTOMER_ROHAN] } },
      }),
      prisma.plan.count({ where: { id: PLAN_PRO } }),
      prisma.order.count({
        where: { id: { in: [ORDER_PAID, ORDER_ABANDONED, ORDER_OVERDUE] } },
      }),
      prisma.payment.count({
        where: {
          id: {
            in: [
              PAY_HIST_1,
              PAY_SUB_1,
              PAY_SUB_2,
              PAY_SUB_3,
              PAY_FAILED_CARD,
              PAY_FAILED_INVOICE,
            ],
          },
        },
      }),
      prisma.subscription.count({ where: { id: SUB_ROHAN } }),
    ]);

  console.log("");
  console.log("Revyn demo seed complete.");
  console.log("────────────────────────────────────────────");
  console.log(`  Merchants : ${merchantCount}`);
  console.log(`  Customers : ${customerCount}`);
  console.log(`  Plans     : ${planCount}`);
  console.log(`  Orders    : ${orderCount}`);
  console.log(`  Payments  : ${paymentCount}`);
  console.log(`  Subscriptions : ${subCount}`);
  console.log("");
  console.log("Detection scenarios seeded:");
  console.log("  a) expired_card failed payment ₹12,400");
  console.log("  b) abandoned checkout ₹3,299 (45 min old)");
  console.log("  c) halted subscription (6 cycles × ₹499 = ₹2,994 at risk)");
  console.log("  d) overdue receivable ₹18,500 (2 days old)");
  console.log("");
  console.log("Run `npm run db:seed && npm run dev` then:");
  console.log("  POST /api/pipeline — detect → diagnose → decide");
  console.log("  GET  /api/stats    — view aggregated recovery metrics");
  console.log("────────────────────────────────────────────");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("Seed failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
