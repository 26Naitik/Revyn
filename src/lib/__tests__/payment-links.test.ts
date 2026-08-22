import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

const createMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/razorpay/client", () => ({
  RazorpayConfigError: class extends Error {},
  getRazorpayClient: () => ({ paymentLink: { create: createMock } }),
}));

import {
  PaymentLinkCreationError,
  createPaymentLink,
  paymentLinkInputSchema,
  type PaymentLinkInput,
} from "@/lib/razorpay/payment-links";

const validInput: PaymentLinkInput = {
  amountPaise: 29900,
  currency: "INR",
  customerName: "Asha Verma",
  customerEmail: "asha@example.com",
  customerContact: "+919820012345",
  referenceId: "revyn_cma1b2c3d4",
  description: "Revyn recovery for failed_payment",
};

const sampleRazorpayResponse = {
  id: "plink_test123",
  short_url: "https://rzp.io/i/plink_test123",
  amount: 29900,
  currency: "INR",
  reference_id: "revyn_cma1b2c3d4",
  status: "created",
  expire_by: 1756000000,
};

describe("paymentLinkInputSchema", () => {
  it("accepts a fully valid input", () => {
    const result = paymentLinkInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("defaults currency to INR", () => {
    const withoutCurrency = {
      amountPaise: validInput.amountPaise,
      customerName: validInput.customerName,
      customerEmail: validInput.customerEmail,
      customerContact: validInput.customerContact,
      referenceId: validInput.referenceId,
      description: validInput.description,
    };
    const result = paymentLinkInputSchema.safeParse(withoutCurrency);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currency).toBe("INR");
    }
  });

  it.each([
    ["zero amount", { ...validInput, amountPaise: 0 }],
    ["negative amount", { ...validInput, amountPaise: -100 }],
    ["fractional paise", { ...validInput, amountPaise: 100.5 }],
    ["invalid email", { ...validInput, customerEmail: "not-an-email" }],
    ["non-numeric contact", { ...validInput, customerContact: "phone-number" }],
    ["too short contact", { ...validInput, customerContact: "12345" }],
    ["empty name", { ...validInput, customerName: "   " }],
    ["short reference id", { ...validInput, referenceId: "ab" }],
    ["reference id with spaces", { ...validInput, referenceId: "revyn abc" }],
    ["empty description", { ...validInput, description: "" }],
    ["unsupported currency", { ...validInput, currency: "USD" }],
    ["non-integer expiry", { ...validInput, expireBy: 1756000000.25 }],
  ])("rejects %s", (_label, input) => {
    const result = paymentLinkInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe("createPaymentLink", () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it("rejects invalid input with ZodError and never calls Razorpay", async () => {
    await expect(
      createPaymentLink({ ...validInput, amountPaise: -5 })
    ).rejects.toThrow(ZodError);

    expect(createMock).not.toHaveBeenCalled();
  });

  it("maps the Razorpay response to the safe typed result", async () => {
    createMock.mockResolvedValue(sampleRazorpayResponse);

    const result = await createPaymentLink(validInput);

    expect(result).toEqual({
      linkId: "plink_test123",
      shortUrl: "https://rzp.io/i/plink_test123",
      amount: 29900,
      currency: "INR",
      referenceId: "revyn_cma1b2c3d4",
      status: "created",
      expireBy: 1756000000,
    });
  });

  it("sends an integer-paise standard payment link payload", async () => {
    createMock.mockResolvedValue(sampleRazorpayResponse);

    await createPaymentLink(validInput);

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 29900,
        currency: "INR",
        accept_partial: false,
        reference_id: "revyn_cma1b2c3d4",
        description: "Revyn recovery for failed_payment",
        customer: {
          name: "Asha Verma",
          email: "asha@example.com",
          contact: "+919820012345",
        },
        notify: { sms: true, email: true },
        reminder_enable: true,
      })
    );
  });

  it("includes expire_by only when provided", async () => {
    createMock.mockResolvedValue(sampleRazorpayResponse);

    await createPaymentLink({ ...validInput, expireBy: 1756100000 });

    const payloadWithExpiry = createMock.mock.calls[0][0];
    expect(payloadWithExpiry.expire_by).toBe(1756100000);

    createMock.mockClear();

    await createPaymentLink(validInput);

    const payloadWithoutExpiry = createMock.mock.calls[0][0];
    expect("expire_by" in payloadWithoutExpiry).toBe(false);
  });

  it("wraps normalized Razorpay API errors in PaymentLinkCreationError", async () => {
    createMock.mockRejectedValue({
      statusCode: 400,
      error: {
        code: "BAD_REQUEST_ERROR",
        description: "Amount is below the minimum allowed",
      },
    });

    const err = await createPaymentLink(validInput).catch((e) => e);

    expect(err).toBeInstanceOf(PaymentLinkCreationError);
    expect(err.razorpayCode).toBe("BAD_REQUEST_ERROR");
    expect(err.statusCode).toBe(400);
    expect(err.message).toContain("Amount is below the minimum allowed");
  });

  it("wraps generic SDK failures in PaymentLinkCreationError", async () => {
    createMock.mockRejectedValue(new Error("network error"));

    const err = await createPaymentLink(validInput).catch((e) => e);

    expect(err).toBeInstanceOf(PaymentLinkCreationError);
    expect(err.message).toContain("network error");
  });

  it("rejects unexpected Razorpay payloads missing id or short_url", async () => {
    createMock.mockResolvedValue({ id: "plink_test123" });

    await expect(createPaymentLink(validInput)).rejects.toThrow(
      PaymentLinkCreationError
    );
  });
});
