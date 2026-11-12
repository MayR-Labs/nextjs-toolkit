export interface InitializeInput {
  reference: string;
  amountMinor: number;
  currency: string;
  email: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentResult {
  reference: string;
  status: "success" | "failed" | "pending";
  amountMinor: number;
  currency: string;
  paidAt?: Date;
  channel?: string;
}

export interface PaymentEvent {
  id: string;
  type: "charge.success" | "charge.failed" | "refund.processed" | string;
  payment?: PaymentResult;
  raw: unknown;
}

export interface PaymentProvider {
  id: string;
  currencies: string[];
  initialize(input: InitializeInput): Promise<{ redirectUrl: string; accessCode?: string }>;
  verify(reference: string): Promise<PaymentResult>;
  /** Verifies the signature; returns null for invalid or irrelevant requests. */
  parseWebhook(rawBody: string, headers: Headers): Promise<PaymentEvent | null>;
  refund?(reference: string, amountMinor?: number): Promise<{ ok: boolean }>;
}

/** Demo provider: every payment succeeds immediately on the app's own demo checkout page. */
export function demoPaymentProvider(checkoutPath = "/demo/checkout"): PaymentProvider {
  return {
    id: "demo",
    currencies: ["NGN", "USD", "GHS", "KES", "ZAR"],
    async initialize(input) {
      const query = new URLSearchParams({ reference: input.reference, callback: input.callbackUrl });
      return { redirectUrl: `${checkoutPath}?${query}` };
    },
    async verify(reference) {
      return { reference, status: "success", amountMinor: 0, currency: "NGN", paidAt: new Date() };
    },
    async parseWebhook() {
      return null;
    },
  };
}

/** Several providers can be active at once; the app picks one per payment. */
export function createPayments(providers: PaymentProvider[]) {
  const byId = new Map(providers.map((p) => [p.id, p]));
  return {
    enabled: providers.length > 0,
    providers: [...byId.keys()],
    get(id: string): PaymentProvider {
      const provider = byId.get(id);
      if (!provider) throw new Error(`Payment provider "${id}" is not enabled`);
      return provider;
    },
  };
}
