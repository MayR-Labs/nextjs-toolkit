import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import type { DatabaseDriver } from "./driver";

export const postgresDriver: DatabaseDriver = {
  dialect: "postgres",
  connect({ url, schema, poolMax }) {
    const client = postgres(url, { max: poolMax ?? 10, prepare: false });
    return drizzle(client, { schema });
  },
  async migrate(db, migrationsFolder) {
    await migrate(db, { migrationsFolder });
  },
};
