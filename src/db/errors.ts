/** Error properties the three drivers use for a failed constraint. */
interface DriverError {
  code?: unknown;
  errno?: unknown;
  rawCode?: unknown;
  message?: unknown;
  cause?: unknown;
}

function matches(error: DriverError): boolean {
  const code = typeof error.code === "string" ? error.code : "";
  const message = typeof error.message === "string" ? error.message : "";
  // PostgreSQL: unique_violation.
  if (code === "23505") return true;
  // MySQL: ER_DUP_ENTRY.
  if (code === "ER_DUP_ENTRY" || error.errno === 1062) return true;
  // SQLite / libSQL: extended codes, or the generic constraint code with a UNIQUE/PRIMARY KEY message
  // (SQLITE_CONSTRAINT alone also covers NOT NULL and foreign keys).
  if (
    code === "SQLITE_CONSTRAINT_UNIQUE" ||
    code === "SQLITE_CONSTRAINT_PRIMARYKEY"
  )
    return true;
  if (error.rawCode === 2067 || error.rawCode === 1555) return true;
  if (
    code.startsWith("SQLITE_CONSTRAINT") ||
    message.includes("SQLITE_CONSTRAINT")
  )
    return /UNIQUE constraint failed|PRIMARY KEY constraint failed/.test(
      message,
    );
  return /UNIQUE constraint failed/.test(message);
}

/**
 * Whether an error (or anything in its `cause` chain, e.g. drizzle's DrizzleQueryError) is a
 * unique-constraint violation on SQLite/libSQL, PostgreSQL or MySQL. Other constraint failures
 * (NOT NULL, foreign keys) are not.
 */
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (
    let depth = 0;
    depth < 5 && current && typeof current === "object";
    depth++
  ) {
    if (matches(current as DriverError)) return true;
    current = (current as DriverError).cause;
  }
  return false;
}
