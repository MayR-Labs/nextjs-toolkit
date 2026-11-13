import {
  ConfigError,
  type EnvReader,
  type EnvSource,
  envReader,
  lazy,
  pickProvider,
} from "../config";
import type { Database } from "../db/driver";
import { newId } from "../db/ids";
import type { WebkitTables } from "../tables";

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

/** Where captured mail and SMS go in dev and demo mode, e.g. `outboxCapture(database)`. */
export type Capture = (entry: {
  channel: "email" | "sms";
  to: string;
  subject?: string;
  body: string;
}) => Promise<void> | void;

/** Never sends: logs and hands the message to `capture`. */
export function devMailDriver(capture?: Capture): MailDriver {
  return {
    name: "dev",
    async send(message) {
      const to = ([] as string[]).concat(message.to).join(", ");
      console.info(`[mail:dev] to=${to} subject="${message.subject}"`);
      await capture?.({
        channel: "email",
        to,
        subject: message.subject,
        body: message.html,
      });
      return { id: `dev-${Date.now()}` };
    },
  };
}

/** Resend over its HTTP API (no SDK needed). */
export function resendDriver(
  apiKey: string,
  fetcher: typeof fetch = fetch,
): MailDriver {
  return {
    name: "resend",
    async send(message) {
      const response = await fetcher("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: message.from,
          to: ([] as string[]).concat(message.to),
          subject: message.subject,
          html: message.html,
          text: message.text,
          reply_to: message.replyTo,
        }),
      });
      if (!response.ok)
        throw new Error(
          `Resend failed: ${response.status} ${await response.text()}`,
        );
      const body = (await response.json()) as { id: string };
      return { id: body.id };
    },
  };
}

/** A mail provider the app can select by name (`EMAIL_DRIVER`). Created on first use. */
export interface MailProvider {
  name: string;
  create(context: { env: EnvReader; capture?: Capture }): MailDriver;
}

export const devMail: MailProvider = {
  name: "dev",
  create: ({ capture }) => devMailDriver(capture),
};

export const resend: MailProvider = {
  name: "resend",
  create: ({ env }) =>
    resendDriver(env.need("RESEND_API_KEY", "when EMAIL_DRIVER=resend")),
};

export interface MailerOptions {
  /** Values that take precedence over `process.env`, e.g. the app's validated env. */
  env?: EnvSource;
  /** Provider name, or a driver object. Defaults to `EMAIL_DRIVER`, then "dev". */
  driver?: string | MailDriver;
  /** Providers that need an SDK, e.g. `smtp` from `@mlabshq/nextjs-webkit/email/smtp`. */
  providers?: MailProvider[];
  /** Defaults to `EMAIL_FROM`. */
  from?: string;
  /** Defaults to `EMAIL_REPLY_TO`. */
  replyTo?: string;
  /** Receives mail the dev driver captures instead of sending. */
  capture?: Capture;
  /** Demo mode always uses the dev driver. Defaults to `DEMO_MODE`. */
  demo?: boolean;
}

/**
 * The app's mailer. The provider comes from `EMAIL_DRIVER` (dev, resend, smtp) unless `driver` is given.
 * With the dev driver and `SMTP_HOST` set (outside demo mode), mail goes to that server, e.g. a local
 * Mailpit, when the smtp provider is registered.
 */
export function createMailer(options: MailerOptions = {}) {
  const env = envReader(options.env);
  const demo = options.demo ?? env.bool("DEMO_MODE");
  const given = typeof options.driver === "object" ? options.driver : undefined;
  const providers = [devMail, resend, ...(options.providers ?? [])];
  const selected =
    given?.name ??
    (demo
      ? "dev"
      : ((options.driver as string | undefined) ??
        env.str("EMAIL_DRIVER", "dev")));

  const driver = lazy((): MailDriver => {
    if (given) return given;
    const context = { env, capture: options.capture };
    if (selected === "dev" && !demo && env.str("SMTP_HOST")) {
      const smtp = providers.find((p) => p.name === "smtp");
      if (smtp) return smtp.create(context);
    }
    return pickProvider(providers, selected, {
      variable: "EMAIL_DRIVER",
      module: "email",
      hints: {
        smtp: "add `smtp` from @mlabshq/nextjs-webkit/email/smtp to `providers` (and install nodemailer).",
      },
    }).create(context);
  });

  const from = () => {
    const value = options.from ?? env.str("EMAIL_FROM");
    if (value) return value;
    if (env.production && selected !== "dev")
      throw new ConfigError("EMAIL_FROM is required to send email.");
    return "no-reply@localhost";
  };

  return {
    /** The selected provider's name. */
    driver: selected,
    async send(message: MailMessage) {
      return driver().send({
        ...message,
        from: message.from ?? from(),
        replyTo:
          message.replyTo ?? options.replyTo ?? env.str("EMAIL_REPLY_TO"),
      });
    },
  };
}

export type Mailer = ReturnType<typeof createMailer>;

/**
 * Stores captured email and SMS in the `mlwebkit__outbox` table, so dev and demo messages can be shown in
 * an in-app outbox instead of being sent. Pass the result as `capture` to `createMailer` / `createSms`.
 */
export function outboxCapture(
  database: { db: Database; schema: Pick<WebkitTables, "webkitOutbox"> },
  tenantId?: string,
): Capture {
  return async (entry) => {
    await database.db.insert(database.schema.webkitOutbox).values({
      id: newId(),
      tenantId,
      channel: entry.channel,
      to: entry.to,
      subject: entry.subject,
      body: entry.body,
    });
  };
}

/** Minimal escaping for values interpolated into HTML templates. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
