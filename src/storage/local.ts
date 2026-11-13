import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";
import type { StorageDriver } from "./index";

export interface LocalStorageConfig {
  dir: string;
  /** Route that serves files, e.g. "/api/files". The app mounts `serveLocalFile` there. */
  baseUrl: string;
  secret: string;
}

function sign(key: string, expires: number, secret: string) {
  return createHmac("sha256", secret)
    .update(`${key}:${expires}`)
    .digest("base64url");
}

function safePath(dir: string, key: string): string {
  const full = normalize(join(dir, key));
  if (!full.startsWith(normalize(dir) + sep)) throw new Error("Invalid key");
  return full;
}

/** Files on this server's disk. For local development, demos and on-site installs. */
export function localStorageDriver(config: LocalStorageConfig): StorageDriver {
  return {
    name: "local",
    supportsPrivate: true,
    async put(input) {
      const path = safePath(config.dir, input.key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, input.body);
      await writeFile(
        `${path}.meta.json`,
        JSON.stringify({
          contentType: input.contentType,
          visibility: input.visibility,
        }),
      );
      return {
        key: input.key,
        bytes: input.body.byteLength,
        contentType: input.contentType,
        visibility: input.visibility,
        publicUrl:
          input.visibility === "public" ? `${config.baseUrl}/${input.key}` : "",
      };
    },
    read: (key) => readFile(safePath(config.dir, key)),
    async remove(key) {
      const path = safePath(config.dir, key);
      await rm(path, { force: true });
      await rm(`${path}.meta.json`, { force: true });
    },
    async url(key, visibility, expiresIn) {
      if (visibility === "public") return `${config.baseUrl}/${key}`;
      const expires = Math.floor(Date.now() / 1000) + expiresIn;
      return `${config.baseUrl}/${key}?expires=${expires}&sig=${sign(key, expires, config.secret)}`;
    },
  };
}

/** Raster images are the only types served inline; everything else is a download. */
const INLINE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

/** Response headers for a stored file: no sniffing, no scripts, and a download for anything not a raster image. */
export function localFileHeaders(
  contentType: string,
  visibility: string,
): Record<string, string> {
  const type = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Cache-Control":
      visibility === "private"
        ? "private, no-store"
        : "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  };
  if (!INLINE_TYPES.has(type)) headers["Content-Disposition"] = "attachment";
  return headers;
}

/** Route handler body for local files: checks the signature of private files, then streams them. */
export async function serveLocalFile(
  config: LocalStorageConfig,
  key: string,
  url: URL,
): Promise<Response> {
  let path: string;
  try {
    path = safePath(config.dir, key);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  let meta: { contentType: string; visibility: string };
  try {
    meta = JSON.parse(await readFile(`${path}.meta.json`, "utf8"));
  } catch {
    return new Response("Not found", { status: 404 });
  }
  if (meta.visibility === "private") {
    const expires = Number(url.searchParams.get("expires"));
    const sig = Buffer.from(url.searchParams.get("sig") ?? "");
    const expected = Buffer.from(sign(key, expires, config.secret));
    const valid =
      sig.length === expected.length && timingSafeEqual(sig, expected);
    if (!valid || expires < Date.now() / 1000)
      return new Response("Link expired", { status: 403 });
  }
  const body = await readFile(path);
  return new Response(new Uint8Array(body), {
    headers: localFileHeaders(meta.contentType, meta.visibility),
  });
}
