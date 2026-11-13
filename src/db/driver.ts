import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Dialect } from "./dialect";

/**
 * Every dialect's database is typed as PostgreSQL. Queries must stay within the API all three share
 * (no `.returning()`: MySQL lacks it, and IDs are generated in the app anyway).
 */
// biome-ignore lint/suspicious/noExplicitAny: schema shape is the app's
export type Database<S extends Record<string, unknown> = any> =
  PostgresJsDatabase<S>;

export interface DatabaseDriver {
  dialect: Dialect;
  connect<S extends Record<string, unknown>>(options: {
    url: string;
    authToken?: string;
    schema: S;
    poolMax?: number;
  }): Database<S>;
  migrate(db: Database, migrationsFolder: string): Promise<void>;
  close?(db: Database): Promise<void>;
}
