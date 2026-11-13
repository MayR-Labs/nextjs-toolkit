import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { WebkitTables } from "../tables";
import type { Database } from "./driver";
import { isUniqueViolation } from "./errors";
import { newId } from "./ids";

export interface RateLimitRule {
  /** Attempts allowed per window. */
  max: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  /** False when this attempt is over the limit. */
  ok: boolean;
  /** Attempts counted in the current window, including this one. */
  count: number;
  /** Seconds until the window resets (0 when allowed and nothing to wait for). */
  retryAfterSeconds: number;
}

export interface RateLimiter {
  /** Counts one attempt for `key` and says whether it is within `rule`. */
  consume(key: string, rule: RateLimitRule): Promise<RateLimitResult>;
  /** Forgets `key` (e.g. the per-email counter after a successful sign-in). */
  reset(key: string): Promise<void>;
}

/** Keys fit an indexed varchar(255) on MySQL: long ones keep a readable prefix plus a hash. */
function storedKey(key: string): string {
  if (key.length <= 200) return key;
  return `${key.slice(0, 120)}#${createHash("sha256").update(key).digest("hex")}`;
}

/**
 * A fixed-window rate limiter on the `mlwebkit__rate_limits` table, so it holds across instances and
 * restarts. Works on SQLite, PostgreSQL and MySQL (select, then insert with a unique-violation retry
 * or a guarded update; no `.returning()`). Concurrent attempts may overshoot `max` by a few; every
 * attempt in the window is still counted, so the key stays blocked.
 */
export function createRateLimiter(options: {
  db: Database;
  table: WebkitTables["webkitRateLimits"];
  now?: () => number;
}): RateLimiter {
  const { db, table } = options;
  const now = options.now ?? Date.now;

  async function read(key: string) {
    const [row] = await db
      .select({ count: table.count, windowStart: table.windowStart })
      .from(table)
      .where(eq(table.key, key))
      .limit(1);
    return row;
  }

  return {
    async consume(rawKey, rule) {
      const key = storedKey(rawKey);
      const windowMs = Math.max(1, rule.windowSeconds) * 1000;
      for (let attempt = 0; attempt < 3; attempt++) {
        const at = now();
        const row = await read(key);
        if (!row) {
          try {
            await db.insert(table).values({
              id: newId(),
              key,
              count: 1,
              windowStart: new Date(at),
            });
          } catch (error) {
            if (isUniqueViolation(error)) continue; // created concurrently: count against that row
            throw error;
          }
          return { ok: 1 <= rule.max, count: 1, retryAfterSeconds: 0 };
        }
        const started = new Date(row.windowStart).getTime();
        if (at - started >= windowMs) {
          // Window over: start a new one. Guarded on the old start, so of two requests racing here
          // one resets it and the other's update matches nothing (both are allowed: a tiny overshoot).
          await db
            .update(table)
            .set({ count: 1, windowStart: new Date(at) })
            .where(
              and(eq(table.key, key), eq(table.windowStart, row.windowStart)),
            );
          return { ok: 1 <= rule.max, count: 1, retryAfterSeconds: 0 };
        }
        await db
          .update(table)
          .set({ count: sql`${table.count} + 1` })
          .where(
            and(eq(table.key, key), eq(table.windowStart, row.windowStart)),
          );
        const count = row.count + 1;
        const ok = count <= rule.max;
        return {
          ok,
          count,
          retryAfterSeconds: ok
            ? 0
            : Math.ceil((started + windowMs - at) / 1000),
        };
      }
      // Heavy contention on one key: treat it as limited rather than unlimited.
      return {
        ok: false,
        count: rule.max + 1,
        retryAfterSeconds: rule.windowSeconds,
      };
    },
    async reset(rawKey) {
      await db.delete(table).where(eq(table.key, storedKey(rawKey)));
    },
  };
}
