import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import type { Database, DatabaseDriver } from "./driver";

/** SQLite through libSQL: local files (`file:`), in-memory (`:memory:`) or Turso (`libsql://`). */
export const sqliteDriver: DatabaseDriver = {
  dialect: "sqlite",
  connect({ url, authToken, schema }) {
    const client = createClient({ url, authToken });
    return drizzle(client, { schema }) as unknown as Database<typeof schema>;
  },
  async migrate(db, migrationsFolder) {
    // biome-ignore lint/suspicious/noExplicitAny: dialect-specific migrator
    await migrate(db as any, { migrationsFolder });
  },
};
