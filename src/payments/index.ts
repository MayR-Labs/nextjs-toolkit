import {
  type EnvReader,
  type EnvSource,
  envReader,
  lazy,
  pickProvider,
} from "../config";
import { paystackProvider } from "./paystack";

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
  initialize(
    input: InitializeInput,
  ): Promise<{ redirectUrl: string; accessCode?: string }>;
  verify(reference: string): Promise<PaymentResult>;
  /** Verifies the signature; returns null for invalid or irrelevant requests. */
  parseWebhook(rawBody: string, headers: Headers): Promise<PaymentEvent | null>;
  refund?(reference: string, amountMinor?: number): Promise<{ ok: boolean }>;
}

/** Demo provider: every payment succeeds immediately on the app's own demo checkout page. */
export function demoPaymentProvider(
  checkoutPath = "/demo/checkout",
): PaymentProvider {
  return {
    id: "demo",
    currencies: ["NGN", "USD", "GHS", "KES", "ZAR"],
    async initialize(input) {
      const query = new URLSearchParams({
        reference: input.reference,
        callback: input.callbackUrl,
      });
      return { redirectUrl: `${checkoutPath}?${query}` };
    },
    async verify(reference) {
      return {
        reference,
        status: "success",
        amountMinor: 0,
        currency: "NGN",
        paidAt: new Date(),
      };
    },
    async parseWebhook() {
      return null;
    },
  };
}

/** A payment provider the app can enable by id (`PAYMENTS_PROVIDERS`). Created on first use. */
export interface PaymentProviderDefinition {
  name: string;
  create(context: { env: EnvReader }): PaymentProvider;
}

export const paystack: PaymentProviderDefinition = {
  name: "paystack",
  create: ({ env }) =>
    paystackProvider(
      env.need(
        "PAYSTACK_SECRET_KEY",
        "when PAYMENTS_PROVIDERS includes paystack",
      ),
    ),
};

export interface PaymentsOptions {
  /** Values that take precedence over `process.env`, e.g. the app's validated env. */
  env?: EnvSource;
  /** Provider ids to enable. Defaults to `PAYMENTS_PROVIDERS` ("paystack", comma-separated). */
  enabled?: string[];
  /** Extra or custom providers. */
  providers?: PaymentProviderDefinition[];
  /** Demo mode enables only the demo provider. Defaults to `DEMO_MODE`. */
  demo?: boolean;
  /** The app's demo checkout page. Defaults to `/demo/checkout`. */
  demoCheckoutPath?: string;
}

/** The app's payment providers. Several can be enabled at once; the app picks one per payment. */
export function createPayments(options: PaymentsOptions = {}) {
  const env = envReader(options.env);
  const demo = options.demo ?? env.bool("DEMO_MODE");
  const definitions: PaymentProviderDefinition[] = [
    paystack,
    {
      name: "demo",
      create: () =>
        demoPaymentProvider(options.demoCheckoutPath ?? "/demo/checkout"),
    },
    ...(options.providers ?? []),
  ];
  const ids = demo
    ? ["demo"]
    : [...new Set(options.enabled ?? env.list("PAYMENTS_PROVIDERS"))];
  const instances = new Map(
    ids.map((id) => [
      id,
      lazy(() =>
        pickProvider(definitions, id, {
          variable: "PAYMENTS_PROVIDERS",
          module: "payment",
        }).create({ env }),
      ),
    ]),
  );

  return {
    enabled: ids.length > 0,
    /** Enabled provider ids, in configured order. */
    providers: ids,
    /** The first enabled provider's id. */
    default: ids[0] as string | undefined,
    get(id: string): PaymentProvider {
      const instance = instances.get(id);
      if (!instance) throw new Error(`Payment provider "${id}" is not enabled`);
      return instance();
    },
  };
}

export type Payments = ReturnType<typeof createPayments>;
