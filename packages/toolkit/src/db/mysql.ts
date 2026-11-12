import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";
import type { Database, DatabaseDriver } from "./driver";

export const mysqlDriver: DatabaseDriver = {
  dialect: "mysql",
  connect({ url, schema, poolMax }) {
    const pool = mysql.createPool({ uri: url, connectionLimit: poolMax ?? 10 });
    return drizzle(pool, { schema, mode: "default" }) as unknown as Database<
      typeof schema
    >;
  },
  async migrate(db, migrationsFolder) {
    // biome-ignore lint/suspicious/noExplicitAny: dialect-specific migrator
    await migrate(db as any, { migrationsFolder });
  },
};
