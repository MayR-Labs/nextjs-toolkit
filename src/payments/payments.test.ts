import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createCaptcha } from "../captcha";
import { toE164 } from "../sms";
import { createPayments, demoPaymentProvider } from ".";
import { paystackProvider, verifyPaystackSignature } from "./paystack";

describe("paystack", () => {
  const secret = "sk_test_x";
  const body = JSON.stringify({ event: "charge.success", data: { id: 9, reference: "R1", status: "success", amount: 5000, currency: "NGN" } });
  const sig = createHmac("sha512", secret).update(body).digest("hex");

  it("verifies webhook signatures", () => {
    expect(verifyPaystackSignature(body, sig, secret)).toBe(true);
    expect(verifyPaystackSignature(body, "bad", secret)).toBe(false);
  });

  it("parses a signed webhook", async () => {
    const event = await paystackProvider(secret).parseWebhook(body, new Headers({ "x-paystack-signature": sig }));
    expect(event).toMatchObject({ id: "charge.success:9", payment: { reference: "R1", amountMinor: 5000, status: "success" } });
    expect(await paystackProvider(secret).parseWebhook(body, new Headers())).toBeNull();
  });

  it("initialises through the API", async () => {
    const fetcher = (async () =>
      new Response(JSON.stringify({ status: true, message: "ok", data: { authorization_url: "https://pay", access_code: "a" } }))) as typeof fetch;
    const result = await paystackProvider(secret, fetcher).initialize({ reference: "R", amountMinor: 1, currency: "NGN", email: "a@b.c", callbackUrl: "/" });
    expect(result.redirectUrl).toBe("https://pay");
  });

  it("registry refuses unknown providers", () => {
    const payments = createPayments([demoPaymentProvider()]);
    expect(payments.get("demo").id).toBe("demo");
    expect(() => payments.get("paystack")).toThrow();
  });
});

describe("captcha and sms helpers", () => {
  it("captcha off always passes; on requires a token", async () => {
    expect(await createCaptcha("off").verify(null)).toBe(true);
    expect(await createCaptcha("turnstile").verify(null)).toBe(false);
    const ok = (async () => new Response(JSON.stringify({ success: true }))) as typeof fetch;
    expect(await createCaptcha("turnstile", {}, ok).verify("t")).toBe(true);
  });

  it("normalises phone numbers", () => {
    expect(toE164("0803 123 4567")).toBe("+2348031234567");
    expect(toE164("+44 20 7946 0958")).toBe("+442079460958");
    expect(toE164("2348031234567")).toBe("+2348031234567");
    expect(toE164("12")).toBeNull();
  });
});
