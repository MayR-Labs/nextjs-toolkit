import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkUpload, createStorage, objectKey } from ".";
import { localStorageDriver, serveLocalFile } from "./local";

describe("storage", () => {
  it("checks uploads", () => {
    const rules = { maxBytes: 1024, accept: ["image/", "application/pdf"] };
    expect(checkUpload({ size: 10, type: "image/png" }, rules)).toBeNull();
    expect(checkUpload({ size: 10, type: "text/html" }, rules)).toMatch(/not allowed/);
    expect(checkUpload({ size: 4096, type: "image/png" }, rules)).toMatch(/larger/);
  });

  it("builds safe keys", () => {
    expect(objectKey({ tenantId: "t1", folder: "photos", id: "x", fileName: "../My Photo!.PNG" })).toBe("t1/photos/x-my-photo-.png");
  });

  it("stores private files behind signed URLs", async () => {
    const config = { dir: await mkdtemp(join(tmpdir(), "tk-")), baseUrl: "/api/files", secret: "s" };
    const storage = createStorage(localStorageDriver(config), { signedUrlSeconds: 60 });
    await storage.put({ key: "t/a.txt", body: Buffer.from("hi"), contentType: "text/plain", visibility: "private" });
    const signedUrl = await storage.url("t/a.txt", "private");
    const ok = await serveLocalFile(config, "t/a.txt", new URL(signedUrl, "http://x"));
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("hi");
    const denied = await serveLocalFile(config, "t/a.txt", new URL("/api/files/t/a.txt", "http://x"));
    expect(denied.status).toBe(403);
    expect((await serveLocalFile(config, "../etc/passwd", new URL("http://x"))).status).toBe(404);
  });
});
