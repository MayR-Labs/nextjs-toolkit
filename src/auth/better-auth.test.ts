import { describe, expect, it, vi } from "vitest";
import { defineTables } from "../db/define";
import { memoryDatabase } from "../testing";
import { betterAuthProvider } from "./better-auth";
import { createAuth } from "./driver";

vi.mock("next/navigation", () => ({ unstable_rethrow: () => {} }));

describe("Better Auth provider", () => {
  it("creates and invites users on the webkit tables, emailing a set-password link", async () => {
    const schema = defineTables(() => ({}))("sqlite");
    const db = await memoryDatabase(schema);
    const send = vi.fn(async () => ({ id: "1" }));
    const auth = createAuth({
      env: {
        AUTH_SECRET: "test-secret-test-secret-test-secret",
        BRAND_NAME: "Clinic",
      },
      database: { db, dialect: "sqlite", schema },
      baseURL: "http://app.test",
      providers: [betterAuthProvider({ mailer: { send } })],
    });

    const id = await auth.createUser({
      email: "Ada@Example.com",
      name: "Ada",
      password: "password123",
    });
    expect(
      await auth.createUser({ email: "ada@example.com", name: "Ada" }),
    ).toBe(id);

    const invited = await auth.inviteUser({
      email: "bola@example.com",
      name: "Bola",
    });
    expect(invited).not.toBe(id);
    expect(send).toHaveBeenCalledOnce();
    const message = (
      send.mock.calls[0] as unknown as [
        { to: string; subject: string; text: string },
      ]
    )[0];
    expect(message.to).toBe("bola@example.com");
    expect(message.subject).toBe("Set your Clinic password");
    expect(message.text).toContain(
      "callbackURL=http%3A%2F%2Fapp.test%2Freset-password",
    );

    const rows = await db.select().from(schema.webkitUsers);
    expect(rows.map((r) => r.email).sort()).toEqual([
      "ada@example.com",
      "bola@example.com",
    ]);
  });
});
