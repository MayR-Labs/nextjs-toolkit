export type Dialect = "sqlite" | "postgres" | "mysql";

/** Picks the dialect from a database URL. `TK_DIALECT` overrides it (used by drizzle-kit configs). */
export function dialectFor(databaseUrl: string | undefined): Dialect {
  const forced = process.env.TK_DIALECT as Dialect | undefined;
  if (forced === "sqlite" || forced === "postgres" || forced === "mysql")
    return forced;
  const url = databaseUrl ?? "";
  if (/^postgres(ql)?:\/\//.test(url)) return "postgres";
  if (/^mysql:\/\//.test(url)) return "mysql";
  return "sqlite";
}
