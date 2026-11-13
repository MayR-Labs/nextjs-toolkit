import {
  ConfigError,
  type EnvReader,
  type EnvSource,
  envReader,
  lazy,
  pickProvider,
} from "../config";
import { cloudinaryStorageDriver } from "./cloudinary";
import {
  type LocalStorageConfig,
  localStorageDriver,
  serveLocalFile,
} from "./local";

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
  url(
    key: string,
    visibility: Visibility,
    expiresInSeconds: number,
  ): Promise<string>;
}

export interface UploadRules {
  maxBytes: number;
  /** MIME types or prefixes ending in "/" (e.g. "image/"). */
  accept: string[];
}

/** Checks a file against size and type rules before it reaches a store. */
export function checkUpload(
  file: { size: number; type: string },
  rules: UploadRules,
): string | null {
  if (file.size > rules.maxBytes)
    return `File is larger than ${Math.round(rules.maxBytes / 1024 / 1024)} MB`;
  const ok = rules.accept.some((a) =>
    a.endsWith("/") ? file.type.startsWith(a) : file.type === a,
  );
  return ok ? null : `Files of type ${file.type || "unknown"} are not allowed`;
}

/** Builds a safe object key: <prefix>/<tenant>/<folder>/<id>-<name>. */
export function objectKey(parts: {
  prefix?: string;
  tenantId?: string;
  folder: string;
  id: string;
  fileName: string;
}) {
  const name =
    parts.fileName
      .toLowerCase()
      .replace(/[^a-z0-9.]+/g, "-")
      .replace(/\.{2,}/g, ".")
      .replace(/^[-.]+|[-.]+$/g, "")
      .slice(-80) || "file";
  return [parts.prefix, parts.tenantId, parts.folder, `${parts.id}-${name}`]
    .filter(Boolean)
    .join("/");
}

/** A storage provider the app can select by name (`STORAGE_DRIVER`). Created on first use. */
export interface StorageProvider {
  name: string;
  /** Whether private files are supported (served only through short-lived signed URLs). */
  supportsPrivate: boolean;
  create(context: { env: EnvReader; local: LocalStorageConfig }): StorageDriver;
}

export const local: StorageProvider = {
  name: "local",
  supportsPrivate: true,
  create: ({ local }) => localStorageDriver(local),
};

export const cloudinary: StorageProvider = {
  name: "cloudinary",
  supportsPrivate: false,
  create: ({ env }) =>
    cloudinaryStorageDriver({
      cloudName: env.need(
        "CLOUDINARY_CLOUD_NAME",
        "when STORAGE_DRIVER=cloudinary",
      ),
      apiKey: env.need("CLOUDINARY_API_KEY", "when STORAGE_DRIVER=cloudinary"),
      apiSecret: env.need(
        "CLOUDINARY_API_SECRET",
        "when STORAGE_DRIVER=cloudinary",
      ),
      folder: env.str("CLOUDINARY_FOLDER"),
    }),
};

export interface StorageOptions {
  /** Values that take precedence over `process.env`, e.g. the app's validated env. */
  env?: EnvSource;
  /** Provider name, or a driver object. Defaults to `STORAGE_DRIVER`, then "local". */
  driver?: string | StorageDriver;
  /** Providers that need an SDK, e.g. `s3` from `@mlabshq/nextjs-webkit/storage/s3`. */
  providers?: StorageProvider[];
  /** Local disk settings. Default to STORAGE_LOCAL_DIR, STORAGE_LOCAL_BASE_URL, STORAGE_SECRET (or AUTH_SECRET). */
  local?: Partial<LocalStorageConfig>;
  /** How long signed URLs for private files last. Defaults to `STORAGE_SIGNED_URL_MINUTES` (5) minutes. */
  signedUrlSeconds?: number;
  /** Demo mode always stores on local disk. Defaults to `DEMO_MODE`. */
  demo?: boolean;
}

/** The app's file store. The provider comes from `STORAGE_DRIVER` (local, s3, cloudinary). */
export function createStorage(options: StorageOptions = {}) {
  const env = envReader(options.env);
  const demo = options.demo ?? env.bool("DEMO_MODE");
  const given = typeof options.driver === "object" ? options.driver : undefined;
  const providers = [local, cloudinary, ...(options.providers ?? [])];
  const selected =
    given?.name ??
    (demo
      ? "local"
      : ((options.driver as string | undefined) ??
        env.str("STORAGE_DRIVER", "local")));
  const signedUrlSeconds =
    options.signedUrlSeconds ?? env.int("STORAGE_SIGNED_URL_MINUTES", 5) * 60;

  const localConfig = lazy((): LocalStorageConfig => {
    const secret =
      options.local?.secret ??
      env.str("STORAGE_SECRET") ??
      env.str("AUTH_SECRET");
    if (!secret && env.production)
      throw new ConfigError(
        "STORAGE_SECRET (or AUTH_SECRET) is required to sign local file URLs.",
      );
    return {
      dir:
        options.local?.dir ?? env.str("STORAGE_LOCAL_DIR", "./.data/uploads"),
      baseUrl:
        options.local?.baseUrl ??
        env.str("STORAGE_LOCAL_BASE_URL", "/api/files"),
      secret: secret ?? "dev-only-storage-secret",
    };
  });
  const provider = () =>
    pickProvider(providers, selected, {
      variable: "STORAGE_DRIVER",
      module: "storage",
      hints: {
        s3: "add `s3` from @mlabshq/nextjs-webkit/storage/s3 to `providers` (and install the AWS SDK).",
      },
    });
  const driver = lazy(
    (): StorageDriver =>
      given ?? provider().create({ env, local: localConfig() }),
  );
  const supportsPrivate = () =>
    given?.supportsPrivate ?? provider().supportsPrivate;

  return {
    /** The selected provider's name. */
    driver: selected,
    get supportsPrivate() {
      return supportsPrivate();
    },
    async put(input: PutInput) {
      if (input.visibility === "private" && !supportsPrivate())
        throw new Error(
          `The ${selected} store cannot hold private files; use S3 or local storage.`,
        );
      return driver().put(input);
    },
    read: async (key: string) => driver().read(key),
    remove: async (key: string) => driver().remove(key),
    /** Public URL, or a signed URL for private files. */
    url: async (key: string, visibility: Visibility) =>
      driver().url(key, visibility, signedUrlSeconds),
    /**
     * Route handler body for local files (checks signatures of private files). Mount it at the local base
     * URL (`/api/files/[...key]` by default). Returns 404 when the store is not local.
     */
    async serve(request: Request, key: string): Promise<Response> {
      if (selected !== "local" || given)
        return new Response("Not found", { status: 404 });
      return serveLocalFile(localConfig(), key, new URL(request.url));
    },
  };
}

export type Storage = ReturnType<typeof createStorage>;
