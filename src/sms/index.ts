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
  if (digits.startsWith("+")) return /^\+\d{8,15}$/.test(digits) ? digits : null;
  if (digits.startsWith("00")) return toE164(`+${digits.slice(2)}`);
  if (digits.startsWith("0")) return toE164(`+${defaultCountryCode}${digits.slice(1)}`);
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

export function termiiDriver(apiKey: string, fetcher: typeof fetch = fetch): SmsDriver {
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

export function createSms(driver: SmsDriver | null, options: { sender: string; country?: string }) {
  return {
    enabled: driver !== null,
    async send(message: SmsMessage) {
      if (!driver) return null;
      const to = toE164(message.to, options.country);
      if (!to) throw new Error(`Invalid phone number: ${message.to}`);
      return driver.send({ ...message, to, sender: options.sender });
    },
  };
}
