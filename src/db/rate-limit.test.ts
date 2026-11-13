import { describe, expect, it } from "vitest";
import { memoryDatabase } from "../testing";
import { defineTables } from "./define";
import { isUniqueViolation } from "./errors";
import { newId } from "./ids";
import { createRateLimiter } from "./rate-limit";

const schema = defineTables(() => ({}))("sqlite");

describe("rate limiter", () => {
  it("allows up to max per window, then blocks until the window ends", async () => {
    const db = await memoryDatabase(schema);
    let clock = 1_000_000;
    const limiter = createRateLimiter({
      db,
      table: schema.webkitRateLimits,
      now: () => clock,
    });
    const rule = { max: 3, windowSeconds: 60 };
    for (let i = 1; i <= 3; i++)
      expect((await limiter.consume("k", rule)).ok).toBe(true);
    const blocked = await limiter.consume("k", rule);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(60);
    expect((await limiter.consume("other", rule)).ok).toBe(true);
    clock += 61_000;
    expect((await limiter.consume("k", rule)).ok).toBe(true);
    await limiter.consume("k", rule);
    await limiter.consume("k", rule);
    expect((await limiter.consume("k", rule)).ok).toBe(false);
    await limiter.reset("k");
    expect((await limiter.consume("k", rule)).ok).toBe(true);
  });

  it("detects unique violations only", async () => {
    const db = await memoryDatabase(schema);
    const row = { id: newId(), key: "dup", count: 1, windowStart: new Date() };
    await db.insert(schema.webkitRateLimits).values(row);
    const error = await db
      .insert(schema.webkitRateLimits)
      .values({ ...row, id: newId() })
      .catch((e: unknown) => e);
    expect(isUniqueViolation(error)).toBe(true);
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    expect(isUniqueViolation({ code: "ER_DUP_ENTRY", errno: 1062 })).toBe(true);
    expect(
      isUniqueViolation({
        code: "SQLITE_CONSTRAINT",
        message: "NOT NULL constraint failed: x",
      }),
    ).toBe(false);
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
    expect(isUniqueViolation(new Error("boom"))).toBe(false);
  });
});
