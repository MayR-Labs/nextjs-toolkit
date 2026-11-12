import type { Dialect } from "./dialect";
import { dialectFor } from "./dialect";
import type { Database, DatabaseDriver } from "./driver";

export interface CreateDatabaseOptions<S extends Record<string, unknown>> {
  url: string;
  authToken?: string;
  poolMax?: number;
  /** The drivers this app ships (import from @mayrlabs/nextjs-toolkit/db/<dialect>). */
  drivers: DatabaseDriver[];
  schemaFor: (dialect: Dialect) => S;
}

/** Connects to whichever database `url` points at, using one of the shipped drivers. */
export function createDatabase<S extends Record<string, unknown>>(
  options: CreateDatabaseOptions<S>,
): { db: Database<S>; dialect: Dialect; driver: DatabaseDriver } {
  const dialect = dialectFor(options.url);
  const driver = options.drivers.find((d) => d.dialect === dialect);
  if (!driver) {
    throw new Error(
      `DATABASE_URL points at ${dialect}, but this app does not ship the ${dialect} driver.`,
    );
  }
  const db = driver.connect({
    url: options.url,
    authToken: options.authToken,
    poolMax: options.poolMax,
    schema: options.schemaFor(dialect),
  });
  return { db, dialect, driver };
}
