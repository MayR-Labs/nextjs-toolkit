import { type EnvSource, envReader } from "../config";
import type { WebkitTables } from "../tables";
import type { Dialect } from "./dialect";
import { dialectFor } from "./dialect";
import type { Database, DatabaseDriver } from "./driver";

/** A connected database, as returned by `createDatabase`. Services take it to find their tables. */
export interface DatabaseConnection<
  S extends Record<string, unknown> = WebkitTables,
> {
  db: Database<S>;
  dialect: Dialect;
  driver: DatabaseDriver;
  url: string;
  /** The tables for this dialect, including the webkit's own. */
  schema: S;
}

export interface CreateDatabaseOptions<S extends Record<string, unknown>> {
  /** Values that take precedence over `process.env`, e.g. the app's validated env. */
  env?: EnvSource;
  /** Defaults to DATABASE_URL, then NETLIFY_DATABASE_URL, POSTGRES_URL, then `file:./.data/app.db`. */
  url?: string;
  /** Turso only. Defaults to DATABASE_AUTH_TOKEN. */
  authToken?: string;
  /** PostgreSQL and MySQL pool size. Defaults to DATABASE_POOL_MAX, then 10. */
  poolMax?: number;
  /** The drivers this app ships (import from @mlabshq/nextjs-webkit/db/<dialect>). */
  drivers: DatabaseDriver[];
  schemaFor: (dialect: Dialect) => S;
}

/** Connects to whichever database `url` points at, using one of the shipped drivers. */
export function createDatabase<S extends Record<string, unknown>>(
  options: CreateDatabaseOptions<S>,
): DatabaseConnection<S> {
  const env = envReader(options.env);
  const url =
    options.url ??
    env.str("DATABASE_URL") ??
    env.str("NETLIFY_DATABASE_URL") ??
    env.str("POSTGRES_URL") ??
    "file:./.data/app.db";
  const dialect = dialectFor(url);
  const driver = options.drivers.find((d) => d.dialect === dialect);
  if (!driver) {
    throw new Error(
      `DATABASE_URL points at ${dialect}, but this app does not ship the ${dialect} driver.`,
    );
  }
  const schema = options.schemaFor(dialect);
  const db = driver.connect({
    url,
    authToken: options.authToken ?? env.str("DATABASE_AUTH_TOKEN"),
    poolMax: options.poolMax ?? env.int("DATABASE_POOL_MAX", 10),
    schema,
  });
  return { db, dialect, driver, url, schema };
}
