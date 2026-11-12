import { type Column, type SQL, sql } from "drizzle-orm";

/** Case-insensitive LIKE that works on every dialect. */
export function ilike(column: Column, pattern: string): SQL {
  return sql`lower(${column}) like ${pattern.toLowerCase()}`;
}

/** Normalises page/size from untrusted input. */
export function paginate(page: unknown, size = 25, max = 100) {
  const p = Math.max(1, Number.parseInt(String(page ?? 1), 10) || 1);
  const s = Math.min(max, Math.max(1, size));
  return { limit: s, offset: (p - 1) * s, page: p };
}
