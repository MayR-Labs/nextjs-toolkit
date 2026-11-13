import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createCaptcha, TEST_KEYS } from "../captcha";
import { createSms, toE164 } from "../sms";
import { createPayments, demoPaymentProvider } from ".";
import { paystackProvider, verifyPaystackSignature } from "./paystack";

describe("paystack", () => {
  const secret = "sk_test_x";
  const body = JSON.stringify({
    event: "charge.success",
    data: {
      id: 9,
      reference: "R1",
      status: "success",
      amount: 5000,
      currency: "NGN",
    },
  });
  const sig = createHmac("sha512", secret).update(body).digest("hex");

  it("verifies webhook signatures", () => {
    expect(verifyPaystackSignature(body, sig, secret)).toBe(true);
    expect(verifyPaystackSignature(body, "bad", secret)).toBe(false);
  });

  it("parses a signed webhook", async () => {
    const event = await paystackProvider(secret).parseWebhook(
      body,
      new Headers({ "x-paystack-signature": sig }),
    );
    expect(event).toMatchObject({
      id: "charge.success:9",
      payment: { reference: "R1", amountMinor: 5000, status: "success" },
    });
    expect(
      await paystackProvider(secret).parseWebhook(body, new Headers()),
    ).toBeNull();
  });

  it("initialises through the API", async () => {
    const fetcher = (async () =>
      new Response(
        JSON.stringify({
          status: true,
          message: "ok",
          data: { authorization_url: "https://pay", access_code: "a" },
        }),
      )) as typeof fetch;
    const result = await paystackProvider(secret, fetcher).initialize({
      reference: "R",
      amountMinor: 1,
      currency: "NGN",
      email: "a@b.c",
      callbackUrl: "/",
    });
    expect(result.redirectUrl).toBe("https://pay");
  });

  it("enables providers from PAYMENTS_PROVIDERS and refuses others", () => {
    const payments = createPayments({
      env: { PAYMENTS_PROVIDERS: "paystack", PAYSTACK_SECRET_KEY: "sk" },
    });
    expect(payments.providers).toEqual(["paystack"]);
    expect(payments.get("paystack").id).toBe("paystack");
    expect(() => payments.get("demo")).toThrow(/not enabled/);
    expect(() =>
      createPayments({ env: { PAYMENTS_PROVIDERS: "paystack" } }).get(
        "paystack",
      ),
    ).toThrow(/PAYSTACK_SECRET_KEY/);
  });

  it("demo mode enables only the demo provider", () => {
    const payments = createPayments({
      env: { DEMO_MODE: "true", PAYMENTS_PROVIDERS: "paystack" },
    });
    expect(payments.providers).toEqual(["demo"]);
    expect(payments.get("demo").id).toBe(demoPaymentProvider().id);
  });
});

describe("captcha and sms helpers", () => {
  it("captcha off always passes; on requires a token", async () => {
    expect(await createCaptcha({ env: {} }).verify(null)).toBe(true);
    expect(
      await createCaptcha({ env: { CAPTCHA_DRIVER: "turnstile" } }).verify(
        null,
      ),
    ).toBe(false);
    const ok = (async () =>
      new Response(JSON.stringify({ success: true }))) as typeof fetch;
    const captcha = createCaptcha({
      env: { CAPTCHA_DRIVER: "turnstile" },
      fetcher: ok,
    });
    expect(captcha.siteKey).toBe(TEST_KEYS.turnstile.siteKey);
    expect(await captcha.verify("t")).toBe(true);
    const form = new FormData();
    form.set("cf-turnstile-response", "t");
    expect(await captcha.verifyForm(form)).toBe(true);
  });

  it("captcha never uses test keys in production", async () => {
    const ok = (async () =>
      new Response(JSON.stringify({ success: true }))) as typeof fetch;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const captcha = createCaptcha({
      env: { NODE_ENV: "production", CAPTCHA_DRIVER: "hcaptcha" },
      fetcher: ok,
    });
    expect(captcha.siteKey).toBeUndefined();
    expect(await captcha.verify("t")).toBe(false);
    log.mockRestore();
    const real = createCaptcha({
      env: {
        NODE_ENV: "production",
        CAPTCHA_DRIVER: "hcaptcha",
        HCAPTCHA_SITE_KEY: "site",
        HCAPTCHA_SECRET_KEY: "secret",
      },
      fetcher: ok,
    });
    expect(real.siteKey).toBe("site");
    expect(await real.verify("t")).toBe(true);
  });

  it("sms is off unless SMS_DRIVER is set, and captures in dev", async () => {
    expect(
      await createSms({ env: {} }).send({ to: "0803 123 4567", text: "x" }),
    ).toBeNull();
    const captured: string[] = [];
    vi.spyOn(console, "info").mockImplementation(() => {});
    const sms = createSms({
      env: { SMS_DRIVER: "dev" },
      capture: (entry) => void captured.push(entry.to),
    });
    await sms.send({ to: "0803 123 4567", text: "x" });
    expect(captured).toEqual(["+2348031234567"]);
    await expect(
      createSms({ env: { SMS_DRIVER: "termii" } }).send({
        to: "0803 123 4567",
        text: "x",
      }),
    ).rejects.toThrow(/TERMII_API_KEY/);
  });

  it("normalises phone numbers", () => {
    expect(toE164("0803 123 4567")).toBe("+2348031234567");
    expect(toE164("+44 20 7946 0958")).toBe("+442079460958");
    expect(toE164("2348031234567")).toBe("+2348031234567");
    expect(toE164("12")).toBeNull();
  });
});
