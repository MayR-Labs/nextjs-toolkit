import { describe, expect, it, vi } from "vitest";
import { createMailer, type MailProvider } from ".";

describe("email", () => {
  it("defaults to the dev driver and captures mail", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const captured: string[] = [];
    const mailer = createMailer({
      env: {},
      capture: (entry) => void captured.push(entry.to),
    });
    expect(mailer.driver).toBe("dev");
    await mailer.send({ to: "a@b.c", subject: "Hi", html: "<p>Hi</p>" });
    expect(captured).toEqual(["a@b.c"]);
  });

  it("picks the provider from EMAIL_DRIVER and applies from/replyTo defaults", async () => {
    const send = vi.fn(async () => ({ id: "1" }));
    const fake: MailProvider = {
      name: "fake",
      create: () => ({ name: "fake", send }),
    };
    const mailer = createMailer({
      env: {
        EMAIL_DRIVER: "fake",
        EMAIL_FROM: "App <no-reply@app.test>",
        EMAIL_REPLY_TO: "help@app.test",
      },
      providers: [fake],
    });
    await mailer.send({ to: "a@b.c", subject: "Hi", html: "x" });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "App <no-reply@app.test>",
        replyTo: "help@app.test",
      }),
    );
  });

  it("explains how to enable a provider that is not registered", async () => {
    await expect(
      createMailer({ env: { EMAIL_DRIVER: "smtp" } }).send({
        to: "a",
        subject: "s",
        html: "h",
      }),
    ).rejects.toThrow(/email\/smtp/);
    await expect(
      createMailer({ env: { EMAIL_DRIVER: "resend" } }).send({
        to: "a",
        subject: "s",
        html: "h",
      }),
    ).rejects.toThrow(/RESEND_API_KEY/);
  });

  it("demo mode forces the dev driver; dev with SMTP_HOST uses smtp when registered", () => {
    expect(
      createMailer({ env: { DEMO_MODE: true, EMAIL_DRIVER: "resend" } }).driver,
    ).toBe("dev");
    const send = vi.fn(async () => ({ id: "1" }));
    const smtp: MailProvider = {
      name: "smtp",
      create: () => ({ name: "smtp", send }),
    };
    const mailer = createMailer({
      env: { SMTP_HOST: "localhost" },
      providers: [smtp],
    });
    return mailer
      .send({ to: "a", subject: "s", html: "h" })
      .then(() => expect(send).toHaveBeenCalled());
  });
});

describe("outboxCapture", () => {
  it("stores captured mail in mlwebkit__outbox", async () => {
    const { defineTables } = await import("../db/define");
    const { memoryDatabase } = await import("../testing");
    const { outboxCapture } = await import(".");
    vi.spyOn(console, "info").mockImplementation(() => {});
    const schema = defineTables(() => ({}))("sqlite");
    const db = await memoryDatabase(schema);
    const mailer = createMailer({
      env: {},
      capture: outboxCapture({ db, schema }, "t1"),
    });
    await mailer.send({ to: "a@b.c", subject: "Hi", html: "<p>Hi</p>" });
    const rows = await db.select().from(schema.webkitOutbox);
    expect(rows).toMatchObject([
      { tenantId: "t1", channel: "email", to: "a@b.c", subject: "Hi" },
    ]);
  });
});
