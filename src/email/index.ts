export interface MailMessage {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
}

export interface MailDriver {
  name: string;
  send(message: MailMessage & { from: string }): Promise<{ id: string }>;
}

/** Where captured mail goes in dev and demo mode (e.g. the tk_outbox table). */
export type Capture = (entry: { channel: "email" | "sms"; to: string; subject?: string; body: string }) =>
  Promise<void> | void;

/** Never sends: logs and hands the message to `capture`. */
export function devMailDriver(capture?: Capture): MailDriver {
  return {
    name: "dev",
    async send(message) {
      const to = ([] as string[]).concat(message.to).join(", ");
      console.info(`[mail:dev] to=${to} subject="${message.subject}"`);
      await capture?.({ channel: "email", to, subject: message.subject, body: message.html });
      return { id: `dev-${Date.now()}` };
    },
  };
}

/** Resend over its HTTP API (no SDK needed). */
export function resendDriver(apiKey: string, fetcher: typeof fetch = fetch): MailDriver {
  return {
    name: "resend",
    async send(message) {
      const response = await fetcher("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: message.from,
          to: ([] as string[]).concat(message.to),
          subject: message.subject,
          html: message.html,
          text: message.text,
          reply_to: message.replyTo,
        }),
      });
      if (!response.ok) throw new Error(`Resend failed: ${response.status} ${await response.text()}`);
      const body = (await response.json()) as { id: string };
      return { id: body.id };
    },
  };
}

export function createMailer(driver: MailDriver, defaults: { from: string; replyTo?: string }) {
  return {
    driver: driver.name,
    send(message: MailMessage) {
      return driver.send({ ...message, from: message.from ?? defaults.from, replyTo: message.replyTo ?? defaults.replyTo });
    },
  };
}

export type Mailer = ReturnType<typeof createMailer>;

/** Minimal escaping for values interpolated into HTML templates. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
