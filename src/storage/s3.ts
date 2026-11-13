import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StorageDriver, StorageProvider } from "./index";

export interface S3Config {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** S3-compatible stores (R2, Spaces, MinIO). */
  endpoint?: string;
  /** Base URL public files are served from (CDN or bucket domain). */
  publicUrl?: string;
}

export function s3StorageDriver(config: S3Config): StorageDriver {
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: Boolean(config.endpoint),
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  const publicBase =
    config.publicUrl ??
    (config.endpoint
      ? `${config.endpoint}/${config.bucket}`
      : `https://${config.bucket}.s3.${config.region}.amazonaws.com`);

  return {
    name: "s3",
    supportsPrivate: true,
    async put(input) {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType,
          CacheControl:
            input.visibility === "public"
              ? "public, max-age=31536000, immutable"
              : "private, no-store",
        }),
      );
      return {
        key: input.key,
        bytes: input.body.byteLength,
        contentType: input.contentType,
        visibility: input.visibility,
        publicUrl:
          input.visibility === "public" ? `${publicBase}/${input.key}` : "",
      };
    },
    async read(key) {
      const result = await client.send(
        new GetObjectCommand({ Bucket: config.bucket, Key: key }),
      );
      return Buffer.from(
        await (
          result.Body as { transformToByteArray(): Promise<Uint8Array> }
        ).transformToByteArray(),
      );
    },
    async remove(key) {
      await client.send(
        new DeleteObjectCommand({ Bucket: config.bucket, Key: key }),
      );
    },
    async url(key, visibility, expiresIn) {
      if (visibility === "public") return `${publicBase}/${key}`;
      return getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: config.bucket, Key: key }),
        { expiresIn },
      );
    },
  };
}

/** The S3 provider for `createStorage({ providers: [s3] })`: S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_ENDPOINT, S3_PUBLIC_URL. */
export const s3: StorageProvider = {
  name: "s3",
  supportsPrivate: true,
  create: ({ env }) =>
    s3StorageDriver({
      bucket: env.need("S3_BUCKET", "when STORAGE_DRIVER=s3"),
      region: env.need("S3_REGION", "when STORAGE_DRIVER=s3"),
      accessKeyId: env.need("S3_ACCESS_KEY_ID", "when STORAGE_DRIVER=s3"),
      secretAccessKey: env.need(
        "S3_SECRET_ACCESS_KEY",
        "when STORAGE_DRIVER=s3",
      ),
      endpoint: env.str("S3_ENDPOINT"),
      publicUrl: env.str("S3_PUBLIC_URL"),
    }),
};
