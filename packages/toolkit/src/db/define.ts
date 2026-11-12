import type { Dialect } from "./dialect";
import { type Kit, kitFor } from "./kit";

/**
 * Write the schema once; get it for any dialect. The factory runs once per dialect and the result is
 * cached, so table objects are stable for drizzle.
 *
 *   export const schemaFor = defineTables((t) => ({ patients: t.table("patients", { id: t.id() }) }));
 *   const { patients } = schemaFor("postgres");
 */
export function defineTables<T>(factory: (t: Kit) => T) {
  const cache = new Map<Dialect, T>();
  return (dialect: Dialect): T => {
    let tables = cache.get(dialect);
    if (!tables) {
      tables = factory(kitFor(dialect));
      cache.set(dialect, tables);
    }
    return tables;
  };
}
