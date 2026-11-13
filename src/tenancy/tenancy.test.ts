import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { defineTables } from "../db/define";
import { newId } from "../db/ids";
import { expectOnlyTenant, memoryDatabase } from "../testing";
import { matchHost } from "./host";
import { scopedDb } from "./scoped";

const schemaFor = defineTables((t) => ({
  notes: t.table("notes", {
    id: t.id(),
    tenantId: t.ref("tenant_id").notNull(),
    title: t.text("title").notNull(),
    createdAt: t.createdAt(),
  }),
}));

describe("host matching", () => {
  const options = { rootDomain: "fera.health", platformHost: "admin.fera.health" };
  it("classifies hosts", () => {
    expect(matchHost("admin.fera.health", options)).toEqual({ kind: "platform" });
    expect(matchHost("stluke.fera.health:3000", options)).toEqual({ kind: "subdomain", slug: "stluke" });
    expect(matchHost("www.fera.health", options)).toEqual({ kind: "none" });
    expect(matchHost("hms.stluke.org", options)).toEqual({ kind: "custom", host: "hms.stluke.org" });
    expect(matchHost("", options)).toEqual({ kind: "none" });
  });
});

describe("scopedDb", () => {
  it("never reads, updates or deletes another tenant's rows", async () => {
    const tables = schemaFor("sqlite");
    const db = await memoryDatabase(tables);
    const a = scopedDb(db, "A");
    const b = scopedDb(db, "B");
    await a.insert(tables.notes, [{ title: "same" }, { title: "a-only" }]);
    await b.insert(tables.notes, { title: "same" });

    const rows = await a.findMany(tables.notes);
    expect(rows).toHaveLength(2);
    expectOnlyTenant(rows, "A");
    expect(await b.count(tables.notes)).toBe(1);

    await b.update(tables.notes, { title: "changed" }, eq(tables.notes.title, "same"));
    expect((await a.findFirst(tables.notes, eq(tables.notes.title, "same")))?.title).toBe("same");

    await b.delete(tables.notes, eq(tables.notes.title, "a-only"));
    expect(await a.count(tables.notes)).toBe(2);
    expect(() => expectOnlyTenant([{ tenantId: "B" }], "A")).toThrow(/leak/);
  });

  it("accepts explicit ids on insert and rejects tenantId", async () => {
    const tables = schemaFor("sqlite");
    const a = scopedDb(await memoryDatabase(tables), "A");
    const id = newId();
    await a.insert(tables.notes, { id, title: "with id" });
    expect((await a.findFirst(tables.notes, eq(tables.notes.id, id)))?.title).toBe("with id");

    // Type-level only: tenantId is stamped by scopedDb, and ids cannot be changed.
    const typeChecks = () => {
      // @ts-expect-error tenantId is not accepted
      a.insert(tables.notes, { title: "x", tenantId: "B" });
      // @ts-expect-error id is not updatable
      a.update(tables.notes, { id: "other" }, undefined);
    };
    expect(typeChecks).toBeTypeOf("function");
  });
});
