import nodemailer from "nodemailer";
import type { MailDriver, MailProvider } from "./index";

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
}

/** SMTP through nodemailer. Also used for a local Mailpit (host localhost, port 1025). */
export function smtpDriver(config: SmtpConfig): MailDriver {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user
      ? { user: config.user, pass: config.password }
      : undefined,
  });
  return {
    name: "smtp",
    async send(message) {
      const info = await transport.sendMail({
        from: message.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        replyTo: message.replyTo,
      });
      return { id: info.messageId };
    },
  };
}

/** The SMTP provider for `createMailer({ providers: [smtp] })`: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_SECURE. */
export const smtp: MailProvider = {
  name: "smtp",
  create: ({ env }) =>
    smtpDriver({
      host: env.need("SMTP_HOST", "when EMAIL_DRIVER=smtp"),
      port: env.int("SMTP_PORT", 587),
      secure: env.bool("SMTP_SECURE", false),
      user: env.str("SMTP_USER"),
      password: env.str("SMTP_PASSWORD"),
    }),
};
