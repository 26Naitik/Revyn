import { NextResponse } from "next/server";
import {
  RAZORPAY_SIGNATURE_HEADER,
  handleRazorpayWebhook,
} from "@/lib/razorpay/webhooks";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get(RAZORPAY_SIGNATURE_HEADER);

  const result = await handleRazorpayWebhook(rawBody, signature);

  return NextResponse.json(result.body, { status: result.status });
}
