import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { type Client, createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import type { Database, DatabaseDriver } from "./driver";

/** How long a local connection waits for a lock before failing with SQLITE_BUSY. */
const BUSY_TIMEOUT_MS = 5000;

/**
 * Local file databases: switch to WAL (readers no longer block the writer; the mode is stored
 * in the file, so once is enough) and set a busy timeout. `connect` is synchronous, so this runs
 * as a fire-and-forget promise; the local client executes statements synchronously in call
 * order, so it lands before the app's first query. Failures are swallowed (e.g. a read-only file).
 */
function tuneLocalFile(client: Client): void {
  void client
    .execute("PRAGMA journal_mode=WAL")
    .then(() => client.execute(`PRAGMA busy_timeout=${BUSY_TIMEOUT_MS}`))
    .catch(() => {});
}

const WRITE = /^\s*(insert|update|delete|replace|create|drop|alter)\b/i;
const sqlOf = (stmt: unknown) =>
  typeof stmt === "string"
    ? stmt
    : String((stmt as { sql?: string })?.sql ?? "");

/**
 * libSQL runs local-file statements synchronously, and each transaction uses its own connection. A
 * write on the main connection while another request's transaction is open therefore blocks the
 * whole Node process for the busy timeout. This wrapper makes such writes (and new transactions)
 * wait asynchronously until open transactions finish, so other requests keep running. The wait is
 * capped at the busy timeout: code that writes outside its own open transaction cannot deadlock.
 */
export function serialiseLocalWrites(
  client: Client,
  maxWaitMs = BUSY_TIMEOUT_MS,
): Client {
  let open = 0;
  let idle: Promise<void> = Promise.resolve();
  let release: () => void = () => {};
  const waitForIdle = () =>
    open === 0
      ? Promise.resolve()
      : Promise.race([
          idle,
          new Promise<void>((r) => setTimeout(r, maxWaitMs)),
        ]);

  return new Proxy(client, {
    get(target, prop) {
      if (prop === "execute")
        return async (stmt: unknown, ...rest: unknown[]) => {
          if (WRITE.test(sqlOf(stmt))) await waitForIdle();
          // biome-ignore lint/suspicious/noExplicitAny: forwarding libSQL's overloads
          return (target.execute as any)(stmt, ...rest);
        };
      if (prop === "batch")
        return async (stmts: unknown[], ...rest: unknown[]) => {
          if (stmts.some((s) => WRITE.test(sqlOf(s)))) await waitForIdle();
          // biome-ignore lint/suspicious/noExplicitAny: forwarding libSQL's overloads
          return (target.batch as any)(stmts, ...rest);
        };
      if (prop === "transaction")
        return async (...args: unknown[]) => {
          await waitForIdle();
          // biome-ignore lint/suspicious/noExplicitAny: forwarding libSQL's overloads
          const tx = await (target.transaction as any)(...args);
          if (open++ === 0)
            idle = new Promise<void>((r) => {
              release = r;
            });
          let done = false;
          const finish = () => {
            if (done) return;
            done = true;
            if (--open === 0) release();
          };
          for (const end of ["commit", "rollback"] as const) {
            const original = tx[end].bind(tx);
            tx[end] = async () => {
              try {
                return await original();
              } finally {
                finish();
              }
            };
          }
          const close = tx.close.bind(tx);
          tx.close = () => {
            finish();
            return close();
          };
          return tx;
        };
      // Other members (close, sync, protocol…) use the client's private fields: call them on it.
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

/** SQLite through libSQL: local files (`file:`), in-memory (`:memory:`) or Turso (`libsql://`). */
export const sqliteDriver: DatabaseDriver = {
  dialect: "sqlite",
  connect({ url, authToken, schema }) {
    const isFile = url.startsWith("file:");
    // Local files: create the folder so a fresh clone works without setup.
    if (isFile) mkdirSync(dirname(url.slice(5)), { recursive: true });
    // `timeout` is libSQL's busy timeout, applied to every pooled connection (the PRAGMA below
    // only reaches one of them).
    const client = createClient({
      url,
      authToken,
      ...(isFile ? { timeout: BUSY_TIMEOUT_MS } : {}),
    });
    if (isFile) tuneLocalFile(client);
    const local = isFile ? serialiseLocalWrites(client) : client;
    return drizzle(local, { schema }) as unknown as Database<typeof schema>;
  },
  async migrate(db, migrationsFolder) {
    // biome-ignore lint/suspicious/noExplicitAny: dialect-specific migrator
    await migrate(db as any, { migrationsFolder });
  },
};
