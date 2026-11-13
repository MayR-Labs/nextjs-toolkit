import * as my from "drizzle-orm/mysql-core";
import * as pg from "drizzle-orm/pg-core";
import * as sq from "drizzle-orm/sqlite-core";
import type { Dialect } from "./dialect";
import { newId } from "./ids";

/**
 * Dialect-neutral column helpers. The PostgreSQL kit defines the TypeScript types; the SQLite and
 * MySQL kits produce the equivalent columns at runtime. Rules: app-generated text IDs, integer money,
 * UTC timestamps, ISO date strings, JSON columns with one TypeScript type.
 */
function pgKit() {
  return {
    dialect: "postgres" as Dialect,
    table: pg.pgTable,
    index: pg.index,
    uniqueIndex: pg.uniqueIndex,
    /** Primary key: a UUIDv7 generated in the app. */
    id: (name = "id") =>
      pg
        .text(name)
        .primaryKey()
        .$defaultFn(() => newId()),
    /** A reference to another row's id. */
    ref: (name: string) => pg.text(name),
    /** Short text. Indexable on every dialect (varchar on MySQL). */
    text: (name: string, _opts?: { length?: number }) => pg.text(name),
    /** Long text, not indexable on MySQL. */
    longText: (name: string) => pg.text(name),
    int: (name: string) => pg.integer(name),
    /** Money in minor units (kobo). */
    money: (name: string) => pg.bigint(name, { mode: "number" }),
    bool: (name: string) => pg.boolean(name),
    timestamp: (name: string) =>
      pg.timestamp(name, { withTimezone: true, mode: "date" }),
    /** A calendar date as an ISO string (YYYY-MM-DD). */
    date: (name: string) => pg.date(name, { mode: "string" }),
    json: <T>(name: string) => pg.jsonb(name).$type<T>(),
  };
}

export type Kit = ReturnType<typeof pgKit> & {
  createdAt: () => ReturnType<ReturnType<typeof pgKit>["timestamp"]>;
  updatedAt: () => ReturnType<ReturnType<typeof pgKit>["timestamp"]>;
};

function sqliteKit() {
  return {
    dialect: "sqlite" as Dialect,
    table: sq.sqliteTable,
    index: sq.index,
    uniqueIndex: sq.uniqueIndex,
    id: (name = "id") =>
      sq
        .text(name)
        .primaryKey()
        .$defaultFn(() => newId()),
    ref: (name: string) => sq.text(name),
    text: (name: string) => sq.text(name),
    longText: (name: string) => sq.text(name),
    int: (name: string) => sq.integer(name),
    money: (name: string) => sq.integer(name),
    bool: (name: string) => sq.integer(name, { mode: "boolean" }),
    timestamp: (name: string) => sq.integer(name, { mode: "timestamp_ms" }),
    date: (name: string) => sq.text(name),
    json: (name: string) => sq.text(name, { mode: "json" }),
  };
}

function mysqlKit() {
  return {
    dialect: "mysql" as Dialect,
    table: my.mysqlTable,
    index: my.index,
    uniqueIndex: my.uniqueIndex,
    id: (name = "id") =>
      my
        .varchar(name, { length: 36 })
        .primaryKey()
        .$defaultFn(() => newId()),
    ref: (name: string) => my.varchar(name, { length: 36 }),
    text: (name: string, opts?: { length?: number }) =>
      my.varchar(name, { length: opts?.length ?? 255 }),
    longText: (name: string) => my.text(name),
    int: (name: string) => my.int(name),
    money: (name: string) => my.bigint(name, { mode: "number" }),
    bool: (name: string) => my.boolean(name),
    timestamp: (name: string) => my.datetime(name, { mode: "date", fsp: 3 }),
    date: (name: string) => my.date(name, { mode: "string" }),
    json: (name: string) => my.json(name),
  };
}

const builders = { postgres: pgKit, sqlite: sqliteKit, mysql: mysqlKit };

export function kitFor(dialect: Dialect): Kit {
  const base = builders[dialect]() as unknown as ReturnType<typeof pgKit>;
  return {
    ...base,
    createdAt: () =>
      base
        .timestamp("created_at")
        .notNull()
        .$defaultFn(() => new Date()),
    updatedAt: () =>
      base
        .timestamp("updated_at")
        .notNull()
        .$defaultFn(() => new Date())
        .$onUpdateFn(() => new Date()),
  };
}
