import nodemailer from "nodemailer";
import type { MailDriver } from "./index";

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
    auth: config.user ? { user: config.user, pass: config.password } : undefined,
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
