import { z } from "zod";
import { getRazorpayClient } from "./client";

export const paymentLinkInputSchema = z.object({
  amountPaise: z.number().int().positive(),
  currency: z.enum(["INR"]).default("INR"),
  customerName: z.string().trim().min(1).max(120),
  customerEmail: z.email().max(254),
  customerContact: z.string().trim().regex(/^\+?[0-9]{10,15}$/),
  referenceId: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .regex(/^[A-Za-z0-9_-]+$/),
  description: z.string().trim().min(1).max(2048),
  expireBy: z.number().int().positive().optional(),
});

export type PaymentLinkInput = z.input<typeof paymentLinkInputSchema>;

export interface PaymentLinkResult {
  linkId: string;
  shortUrl: string;
  amount: number;
  currency: string;
  referenceId: string | null;
  status: string | null;
  expireBy: number | null;
}

interface PaymentLinkCreationErrorOptions {
  razorpayCode?: string;
  razorpayDescription?: string;
  statusCode?: number;
}

export class PaymentLinkCreationError extends Error {
  readonly razorpayCode?: string;
  readonly razorpayDescription?: string;
  readonly statusCode?: number;

  constructor(message: string, options: PaymentLinkCreationErrorOptions = {}) {
    super(message);
    this.name = "PaymentLinkCreationError";
    this.razorpayCode = options.razorpayCode;
    this.razorpayDescription = options.razorpayDescription;
    this.statusCode = options.statusCode;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function mapPaymentLinkEntity(entity: unknown): PaymentLinkResult {
  if (!isRecord(entity)) {
    throw new PaymentLinkCreationError(
      "Razorpay returned an unexpected payment link payload"
    );
  }

  const linkId = optionalString(entity.id);
  const shortUrl = optionalString(entity.short_url);

  if (!linkId || !shortUrl) {
    throw new PaymentLinkCreationError(
      "Razorpay payment link response is missing id or short_url"
    );
  }

  const amount = Number(entity.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new PaymentLinkCreationError(
      "Razorpay payment link response has an invalid amount"
    );
  }

  const expireByRaw = entity.expire_by;
  const expireBy =
    typeof expireByRaw === "number" && Number.isFinite(expireByRaw)
      ? expireByRaw
      : null;

  return {
    linkId,
    shortUrl,
    amount,
    currency: optionalString(entity.currency) ?? "INR",
    referenceId: optionalString(entity.reference_id),
    status: optionalString(entity.status),
    expireBy,
  };
}

export async function createPaymentLink(
  input: PaymentLinkInput
): Promise<PaymentLinkResult> {
  const parsed = paymentLinkInputSchema.safeParse(input);

  if (!parsed.success) {
    throw parsed.error;
  }

  const payload = {
    amount: parsed.data.amountPaise,
    currency: parsed.data.currency,
    accept_partial: false,
    reference_id: parsed.data.referenceId,
    description: parsed.data.description,
    customer: {
      name: parsed.data.customerName,
      email: parsed.data.customerEmail,
      contact: parsed.data.customerContact,
    },
    notify: {
      sms: true,
      email: true,
    },
    reminder_enable: true,
    ...(parsed.data.expireBy !== undefined
      ? { expire_by: parsed.data.expireBy }
      : {}),
  };

  let response: unknown;

  try {
    const client = getRazorpayClient();
    response = await client.paymentLink.create(payload);
  } catch (err) {
    if (isRecord(err) && isRecord(err.error)) {
      const code = optionalString(err.error.code) ?? undefined;
      const description =
        optionalString(err.error.description) ?? "Razorpay API rejected the payment link request";
      const statusCode =
        typeof err.statusCode === "number" ? err.statusCode : undefined;
      throw new PaymentLinkCreationError(description, {
        razorpayCode: code,
        razorpayDescription: description,
        statusCode,
      });
    }

    if (err instanceof Error) {
      throw new PaymentLinkCreationError(err.message);
    }

    throw new PaymentLinkCreationError(
      "Unknown error while creating Razorpay payment link"
    );
  }

  return mapPaymentLinkEntity(response);
}
