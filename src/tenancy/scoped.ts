import {
  and,
  type Column,
  count,
  eq,
  type InferInsertModel,
  type InferSelectModel,
  type SQL,
  type Table,
} from "drizzle-orm";
import type { Database } from "../db/driver";

type TenantTable = Table & { tenantId: Column };
type Where = SQL | undefined;
/** Like Omit, but resolves for generic drizzle models (Omit loses their keys inside a generic). */
type Without<M, K extends PropertyKey> = { [P in keyof M as P extends K ? never : P]: M[P] };
type InsertValues<T extends Table> = Without<InferInsertModel<T>, "tenantId">;

/**
 * A tenant-bound view of the database. Every read, update and delete is filtered by `tenant_id`, and
 * every insert is stamped with it, so feature code cannot forget the condition. Joins and other
 * complex queries use `db` directly with `scope.where(table, …)`.
 */
export function scopedDb(db: Database, tenantId: string) {
  const own = (table: TenantTable, where?: Where) =>
    and(eq(table.tenantId, tenantId), where) as SQL;

  return {
    db,
    tenantId,
    /** `tenant_id = current AND …conditions`, for hand-written queries. */
    where: (table: TenantTable, ...conditions: Where[]) =>
      and(eq(table.tenantId, tenantId), ...conditions) as SQL,

    async findMany<T extends TenantTable>(
      table: T,
      options: {
        where?: Where;
        orderBy?: SQL | Column | Array<SQL | Column>;
        limit?: number;
        offset?: number;
      } = {},
    ): Promise<InferSelectModel<T>[]> {
      // biome-ignore lint/suspicious/noExplicitAny: dialect-neutral builder
      let query: any = db.select().from(table as any).where(own(table, options.where));
      if (options.orderBy) {
        const order = Array.isArray(options.orderBy) ? options.orderBy : [options.orderBy];
        query = query.orderBy(...order);
      }
      if (options.limit !== undefined) query = query.limit(options.limit);
      if (options.offset) query = query.offset(options.offset);
      return query;
    },

    async findFirst<T extends TenantTable>(
      table: T,
      where?: Where,
    ): Promise<InferSelectModel<T> | undefined> {
      const rows = await this.findMany(table, { where, limit: 1 });
      return rows[0];
    },

    async count<T extends TenantTable>(table: T, where?: Where): Promise<number> {
      const rows = await db
        .select({ n: count() })
        // biome-ignore lint/suspicious/noExplicitAny: dialect-neutral builder
        .from(table as any)
        .where(own(table, where));
      return Number(rows[0]?.n ?? 0);
    },

    async insert<T extends TenantTable>(
      table: T,
      values: InsertValues<T> | InsertValues<T>[],
    ): Promise<void> {
      const rows = (Array.isArray(values) ? values : [values]).map((v) => ({
        ...v,
        tenantId,
      }));
      if (rows.length === 0) return;
      // biome-ignore lint/suspicious/noExplicitAny: dialect-neutral builder
      await db.insert(table as any).values(rows as any);
    },

    async update<T extends TenantTable>(
      table: T,
      set: Partial<Without<InferInsertModel<T>, "tenantId" | "id">>,
      where: Where,
    ): Promise<void> {
      // biome-ignore lint/suspicious/noExplicitAny: dialect-neutral builder
      await db.update(table as any).set(set as any).where(own(table, where));
    },

    async delete<T extends TenantTable>(table: T, where: Where): Promise<void> {
      // biome-ignore lint/suspicious/noExplicitAny: dialect-neutral builder
      await db.delete(table as any).where(own(table, where));
    },
  };
}

export type ScopedDb = ReturnType<typeof scopedDb>;
