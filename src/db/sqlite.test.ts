import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { afterAll, describe, expect, it } from "vitest";
import { serialiseLocalWrites } from "./sqlite";

const dir = mkdtempSync(join(tmpdir(), "webkit-sqlite-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("serialiseLocalWrites", () => {
  it("lets a write wait for an open transaction instead of failing or blocking", async () => {
    const raw = createClient({
      url: `file:${join(dir, "a.db")}`,
      timeout: 200,
    });
    await raw.execute("PRAGMA journal_mode=WAL");
    await raw.execute("create table t (v integer)");
    const client = serialiseLocalWrites(raw, 2000);

    const tx = await client.transaction("write");
    await tx.execute("insert into t values (1)");
    let ticked = false;
    const outside = client.execute("insert into t values (2)");
    // The event loop is free while the outside write waits.
    await new Promise<void>((r) =>
      setTimeout(() => {
        ticked = true;
        r();
      }, 50),
    );
    expect(ticked).toBe(true);
    await tx.commit();
    await outside;
    const rows = await client.execute("select v from t order by v");
    expect(rows.rows.map((r) => Number(r.v))).toEqual([1, 2]);
    client.close();
  });

  it("does not deadlock a write made outside its own open transaction", async () => {
    const raw = createClient({ url: `file:${join(dir, "b.db")}`, timeout: 50 });
    await raw.execute("create table t (v integer)");
    const client = serialiseLocalWrites(raw, 100);
    const tx = await client.transaction("write");
    await tx.execute("insert into t values (1)");
    // Gives up waiting after 100 ms; SQLite then reports busy rather than hanging forever.
    await expect(client.execute("insert into t values (2)")).rejects.toThrow();
    await tx.rollback();
    client.close();
  });
});
