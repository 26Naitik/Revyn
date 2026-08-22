import { afterEach, describe, expect, it } from "vitest";
import {
  RazorpayConfigError,
  getRazorpayClient,
} from "@/lib/razorpay/client";

describe("getRazorpayClient", () => {
  const savedKeyId = process.env.RAZORPAY_KEY_ID;
  const savedKeySecret = process.env.RAZORPAY_KEY_SECRET;

  afterEach(() => {
    if (savedKeyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = savedKeyId;

    if (savedKeySecret === undefined) delete process.env.RAZORPAY_KEY_SECRET;
    else process.env.RAZORPAY_KEY_SECRET = savedKeySecret;
  });

  it("throws RazorpayConfigError when credentials are missing", () => {
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;

    expect(() => getRazorpayClient()).toThrow(RazorpayConfigError);
  });

  it("throws RazorpayConfigError when only the key id is set", () => {
    process.env.RAZORPAY_KEY_ID = "rzp_test_abc";
    delete process.env.RAZORPAY_KEY_SECRET;

    expect(() => getRazorpayClient()).toThrow(RazorpayConfigError);
  });

  it("returns a client with paymentLink API when configured", () => {
    process.env.RAZORPAY_KEY_ID = "rzp_test_abc";
    process.env.RAZORPAY_KEY_SECRET = "test_secret_value";

    const client = getRazorpayClient();

    expect(typeof client.paymentLink.create).toBe("function");
  });
});
