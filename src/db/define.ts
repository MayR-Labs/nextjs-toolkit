import { type WebkitTables, webkitTables } from "../tables";
import type { Dialect } from "./dialect";
import { type Kit, kitFor } from "./kit";

export type Schema<T> = WebkitTables & T;

/**
 * Write the schema once; get it for any dialect. The webkit's own `mlwebkit__*` tables (tenants, users,
 * sessions, settings, outbox, payment events…) are included automatically, so drizzle-kit generates their
 * migrations with the app's. The factory runs once per dialect and the result is cached, so table objects
 * are stable for drizzle.
 *
 *   export const schemaFor = defineTables((t) => ({ patients: t.table("patients", { id: t.id() }) }));
 *   const { patients, webkitUsers } = schemaFor("postgres");
 */
export function defineTables<T extends Record<string, unknown>>(
  factory: (t: Kit) => T,
) {
  const cache = new Map<Dialect, Schema<T>>();
  return (dialect: Dialect): Schema<T> => {
    let tables = cache.get(dialect);
    if (!tables) {
      const kit = kitFor(dialect);
      tables = { ...webkitTables(kit), ...factory(kit) };
      cache.set(dialect, tables);
    }
    return tables;
  };
}
