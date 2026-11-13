import {
  ConfigError,
  type EnvReader,
  type EnvSource,
  envReader,
  lazy,
  pickProvider,
} from "../config";
import type { Capture } from "../email";

export interface SmsMessage {
  to: string;
  text: string;
  channel?: "sms" | "whatsapp";
}

export interface SmsDriver {
  name: string;
  send(message: SmsMessage & { sender: string }): Promise<{ id: string }>;
}

/** Normalises a phone number to E.164. Local Nigerian numbers (080…) become +23480…. */
export function toE164(raw: string, defaultCountryCode = "234"): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+"))
    return /^\+\d{8,15}$/.test(digits) ? digits : null;
  if (digits.startsWith("00")) return toE164(`+${digits.slice(2)}`);
  if (digits.startsWith("0"))
    return toE164(`+${defaultCountryCode}${digits.slice(1)}`);
  if (digits.startsWith(defaultCountryCode)) return toE164(`+${digits}`);
  return null;
}

export function devSmsDriver(capture?: Capture): SmsDriver {
  return {
    name: "dev",
    async send(message) {
      console.info(`[sms:dev] to=${message.to} ${message.text}`);
      await capture?.({ channel: "sms", to: message.to, body: message.text });
      return { id: `dev-${Date.now()}` };
    },
  };
}

export function termiiDriver(
  apiKey: string,
  fetcher: typeof fetch = fetch,
): SmsDriver {
  return {
    name: "termii",
    async send(message) {
      const response = await fetcher("https://api.ng.termii.com/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          to: message.to.replace("+", ""),
          from: message.sender,
          sms: message.text,
          type: "plain",
          channel: message.channel === "whatsapp" ? "whatsapp" : "generic",
        }),
      });
      if (!response.ok) throw new Error(`Termii failed: ${response.status}`);
      const body = (await response.json()) as { message_id?: string };
      return { id: body.message_id ?? "" };
    },
  };
}

/** An SMS provider the app can select by name (`SMS_DRIVER`). Created on first use. */
export interface SmsProvider {
  name: string;
  create(context: { env: EnvReader; capture?: Capture }): SmsDriver;
}

export const devSms: SmsProvider = {
  name: "dev",
  create: ({ capture }) => devSmsDriver(capture),
};

export const termii: SmsProvider = {
  name: "termii",
  create: ({ env }) =>
    termiiDriver(env.need("TERMII_API_KEY", "when SMS_DRIVER=termii")),
};

export interface SmsOptions {
  /** Values that take precedence over `process.env`, e.g. the app's validated env. */
  env?: EnvSource;
  /** "off", a provider name, or a driver object. Defaults to `SMS_DRIVER`, then "off". */
  driver?: string | SmsDriver;
  /** Extra or custom providers. */
  providers?: SmsProvider[];
  /** Sender id. Defaults to `SMS_SENDER_ID`. */
  sender?: string;
  /** Country code for local numbers. Defaults to `SMS_COUNTRY_CODE`, then "234". */
  country?: string;
  /** Receives messages the dev driver captures instead of sending. */
  capture?: Capture;
  /** Demo mode always uses the dev driver. Defaults to `DEMO_MODE`. */
  demo?: boolean;
}

/** The app's SMS sender. With `SMS_DRIVER=off` it is disabled and `send` returns null. */
export function createSms(options: SmsOptions = {}) {
  const env = envReader(options.env);
  const demo = options.demo ?? env.bool("DEMO_MODE");
  const given = typeof options.driver === "object" ? options.driver : undefined;
  const providers = [devSms, termii, ...(options.providers ?? [])];
  const selected =
    given?.name ??
    (demo
      ? "dev"
      : ((options.driver as string | undefined) ??
        env.str("SMS_DRIVER", "off")));
  const enabled = selected !== "off";

  const driver = lazy(
    (): SmsDriver =>
      given ??
      pickProvider(providers, selected, {
        variable: "SMS_DRIVER",
        module: "SMS",
      }).create({ env, capture: options.capture }),
  );
  const sender = () => {
    const value = options.sender ?? env.str("SMS_SENDER_ID");
    if (value) return value;
    if (selected === "dev") return "dev";
    throw new ConfigError("SMS_SENDER_ID is required to send SMS.");
  };

  return {
    /** The selected provider's name, or "off". */
    driver: selected,
    enabled,
    async send(message: SmsMessage) {
      if (!enabled) return null;
      const to = toE164(
        message.to,
        options.country ?? env.str("SMS_COUNTRY_CODE", "234"),
      );
      if (!to) throw new Error(`Invalid phone number: ${message.to}`);
      return driver().send({ ...message, to, sender: sender() });
    },
  };
}

export type Sms = ReturnType<typeof createSms>;
