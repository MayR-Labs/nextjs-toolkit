import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import type { Database } from "../db/driver";

/**
 * A fresh in-memory SQLite database with the given tables created, for unit and integration tests.
 * Uses drizzle-kit's programmatic API, so no migration files are needed.
 */
export async function memoryDatabase<S extends Record<string, unknown>>(schema: S): Promise<Database<S>> {
  const { generateSQLiteDrizzleJson, generateSQLiteMigration } = await import("drizzle-kit/api");
  const client = createClient({ url: ":memory:" });
  const empty = await generateSQLiteDrizzleJson({});
  const target = await generateSQLiteDrizzleJson(schema);
  const statements = await generateSQLiteMigration(empty, target);
  for (const statement of statements) await client.execute(statement);
  return drizzle(client, { schema }) as unknown as Database<S>;
}

/**
 * Tenant-isolation assertion: every row returned while acting as `tenantId` must belong to it.
 * Seed two tenants with overlapping data, run each query as tenant A, and pass the rows here.
 */
export function expectOnlyTenant(rows: Array<{ tenantId?: string | null }>, tenantId: string): void {
  const leaked = rows.filter((r) => r.tenantId !== tenantId);
  if (leaked.length > 0) {
    throw new Error(`Tenant leak: ${leaked.length} row(s) from another tenant`);
  }
}
