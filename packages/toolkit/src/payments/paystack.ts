import { createHmac, timingSafeEqual } from "node:crypto";
import type { PaymentEvent, PaymentProvider, PaymentResult } from "./index";

const API = "https://api.paystack.co";

interface PaystackTransaction {
  reference: string;
  status: string;
  amount: number;
  currency: string;
  paid_at?: string;
  channel?: string;
}

function toResult(t: PaystackTransaction): PaymentResult {
  return {
    reference: t.reference,
    status: t.status === "success" ? "success" : t.status === "failed" ? "failed" : "pending",
    amountMinor: t.amount,
    currency: t.currency,
    paidAt: t.paid_at ? new Date(t.paid_at) : undefined,
    channel: t.channel,
  };
}

export function verifyPaystackSignature(rawBody: string, signature: string | null, secretKey: string): boolean {
  if (!signature) return false;
  const expected = createHmac("sha512", secretKey).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function paystackProvider(secretKey: string, fetcher: typeof fetch = fetch): PaymentProvider {
  const call = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const response = await fetcher(`${API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
    });
    const body = (await response.json()) as { status: boolean; message: string; data: T };
    if (!response.ok || !body.status) throw new Error(`Paystack: ${body.message}`);
    return body.data;
  };

  return {
    id: "paystack",
    currencies: ["NGN", "GHS", "ZAR", "KES", "USD"],
    async initialize(input) {
      const data = await call<{ authorization_url: string; access_code: string }>("/transaction/initialize", {
        method: "POST",
        body: JSON.stringify({
          reference: input.reference,
          amount: input.amountMinor,
          currency: input.currency,
          email: input.email,
          callback_url: input.callbackUrl,
          metadata: input.metadata,
        }),
      });
      return { redirectUrl: data.authorization_url, accessCode: data.access_code };
    },
    async verify(reference) {
      return toResult(await call<PaystackTransaction>(`/transaction/verify/${encodeURIComponent(reference)}`));
    },
    async parseWebhook(rawBody, headers): Promise<PaymentEvent | null> {
      if (!verifyPaystackSignature(rawBody, headers.get("x-paystack-signature"), secretKey)) return null;
      const event = JSON.parse(rawBody) as { event: string; data: PaystackTransaction & { id: number } };
      return {
        id: `${event.event}:${event.data.id ?? event.data.reference}`,
        type: event.event,
        payment: event.event.startsWith("charge.") ? toResult(event.data) : undefined,
        raw: event,
      };
    },
    async refund(reference, amountMinor) {
      await call("/refund", { method: "POST", body: JSON.stringify({ transaction: reference, amount: amountMinor }) });
      return { ok: true };
    },
  };
}
