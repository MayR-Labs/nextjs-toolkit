import { createHash } from "node:crypto";
import type { StorageDriver } from "./index";

export interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  folder?: string;
}

function signParams(params: Record<string, string>, secret: string) {
  const payload = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return createHash("sha1")
    .update(payload + secret)
    .digest("hex");
}

/** Public files on Cloudinary (logos, photos). Private files need S3 or local storage. */
export function cloudinaryStorageDriver(
  config: CloudinaryConfig,
  fetcher: typeof fetch = fetch,
): StorageDriver {
  const base = `https://api.cloudinary.com/v1_1/${config.cloudName}`;
  const publicId = (key: string) =>
    [config.folder, key].filter(Boolean).join("/");
  const deliver = (key: string) =>
    `https://res.cloudinary.com/${config.cloudName}/image/upload/${publicId(key)}`;

  const signed = (params: Record<string, string>) => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const all = { ...params, timestamp };
    return {
      ...all,
      api_key: config.apiKey,
      signature: signParams(all, config.apiSecret),
    };
  };

  return {
    name: "cloudinary",
    supportsPrivate: false,
    async put(input) {
      const form = new FormData();
      for (const [k, v] of Object.entries(
        signed({ public_id: publicId(input.key), overwrite: "true" }),
      ))
        form.set(k, v);
      form.set(
        "file",
        new Blob([new Uint8Array(input.body)], { type: input.contentType }),
      );
      const response = await fetcher(`${base}/auto/upload`, {
        method: "POST",
        body: form,
      });
      if (!response.ok)
        throw new Error(`Cloudinary upload failed: ${response.status}`);
      const body = (await response.json()) as {
        secure_url: string;
        bytes: number;
      };
      return {
        key: input.key,
        bytes: body.bytes,
        contentType: input.contentType,
        visibility: "public",
        publicUrl: body.secure_url,
      };
    },
    async read(key) {
      const response = await fetcher(deliver(key));
      return Buffer.from(await response.arrayBuffer());
    },
    async remove(key) {
      const form = new URLSearchParams(signed({ public_id: publicId(key) }));
      await fetcher(`${base}/image/destroy`, { method: "POST", body: form });
    },
    async url(key) {
      return deliver(key);
    },
  };
}
