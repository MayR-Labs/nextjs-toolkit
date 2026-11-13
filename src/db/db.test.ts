import { getTableConfig as mysqlConfig } from "drizzle-orm/mysql-core";
import { getTableConfig as pgConfig } from "drizzle-orm/pg-core";
import { getTableConfig as sqliteConfig } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import { defineTables } from "./define";
import { dialectFor } from "./dialect";
import { newId } from "./ids";
import { paginate } from "./query";

const schemaFor = defineTables(() => ({}));

describe("db", () => {
  it("detects dialects", () => {
    expect(dialectFor("postgres://x")).toBe("postgres");
    expect(dialectFor("mysql://x")).toBe("mysql");
    expect(dialectFor("file:./a.db")).toBe("sqlite");
  });

  it("builds the same tables and columns for every dialect", () => {
    const names = (cols: Array<{ name: string }>) =>
      cols.map((c) => c.name).sort();
    for (const key of Object.keys(schemaFor("postgres")) as Array<
      keyof ReturnType<typeof schemaFor>
    >) {
      const pg = pgConfig(schemaFor("postgres")[key] as never);
      const sq = sqliteConfig(schemaFor("sqlite")[key] as never);
      const my = mysqlConfig(schemaFor("mysql")[key] as never);
      expect(sq.name).toBe(pg.name);
      expect(names(sq.columns)).toEqual(names(pg.columns));
      expect(names(my.columns)).toEqual(names(pg.columns));
      expect(my.indexes.length).toBe(pg.indexes.length);
    }
  });

  it("caches tables per dialect", () => {
    expect(schemaFor("sqlite")).toBe(schemaFor("sqlite"));
  });

  it("generates time-ordered UUIDv7 ids", () => {
    const a = newId(1000);
    const b = newId(2000);
    expect(a).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(a < b).toBe(true);
  });

  it("paginates safely", () => {
    expect(paginate("3", 20)).toEqual({ limit: 20, offset: 40, page: 3 });
    expect(paginate("abc")).toEqual({ limit: 25, offset: 0, page: 1 });
  });
});
