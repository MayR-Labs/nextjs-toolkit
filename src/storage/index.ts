export type Visibility = "public" | "private";

export interface PutInput {
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
  visibility: Visibility;
}

export interface StoredObject {
  key: string;
  bytes: number;
  contentType: string;
  visibility: Visibility;
  /** Permanent URL for public files; empty for private files (use `url()` to sign one). */
  publicUrl: string;
}

export interface StorageDriver {
  name: string;
  /** Whether private files are supported (served only through short-lived signed URLs). */
  supportsPrivate: boolean;
  put(input: PutInput): Promise<StoredObject>;
  read(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
  /** Public URL, or a signed URL that expires in `expiresInSeconds` for private files. */
  url(key: string, visibility: Visibility, expiresInSeconds: number): Promise<string>;
}

export interface UploadRules {
  maxBytes: number;
  /** MIME types or prefixes ending in "/" (e.g. "image/"). */
  accept: string[];
}

/** Checks a file against size and type rules before it reaches a store. */
export function checkUpload(file: { size: number; type: string }, rules: UploadRules): string | null {
  if (file.size > rules.maxBytes) return `File is larger than ${Math.round(rules.maxBytes / 1024 / 1024)} MB`;
  const ok = rules.accept.some((a) => (a.endsWith("/") ? file.type.startsWith(a) : file.type === a));
  return ok ? null : `Files of type ${file.type || "unknown"} are not allowed`;
}

/** Builds a safe object key: <prefix>/<tenant>/<folder>/<id>-<name>. */
export function objectKey(parts: { prefix?: string; tenantId?: string; folder: string; id: string; fileName: string }) {
  const name = parts.fileName.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/\.{2,}/g, ".").replace(/^[-.]+|[-.]+$/g, "").slice(-80) || "file";
  return [parts.prefix, parts.tenantId, parts.folder, `${parts.id}-${name}`].filter(Boolean).join("/");
}

export function createStorage(driver: StorageDriver, options: { signedUrlSeconds: number }) {
  return {
    driver: driver.name,
    supportsPrivate: driver.supportsPrivate,
    async put(input: PutInput) {
      if (input.visibility === "private" && !driver.supportsPrivate)
        throw new Error(`The ${driver.name} store cannot hold private files; use S3 or local storage.`);
      return driver.put(input);
    },
    read: (key: string) => driver.read(key),
    remove: (key: string) => driver.remove(key),
    url: (key: string, visibility: Visibility) => driver.url(key, visibility, options.signedUrlSeconds),
  };
}

export type Storage = ReturnType<typeof createStorage>;
