import { defineConfig } from "tsup";

const shared = {
  format: ["esm" as const],
  dts: false,
  splitting: true,
  treeshake: true,
  target: "node22",
  external: [/^node:/],
};

export default defineConfig([
  {
    ...shared,
    clean: true,
    entry: {
    "index": "src/index.ts",
    "env": "src/env/index.ts",
    "db": "src/db/index.ts",
    "db/sqlite": "src/db/sqlite.ts",
    "db/postgres": "src/db/postgres.ts",
    "db/mysql": "src/db/mysql.ts",
    "tenancy": "src/tenancy/index.ts",
    "auth": "src/auth/index.ts",
    "auth/better-auth": "src/auth/better-auth.ts",
    "settings": "src/settings/index.ts",
    "features": "src/features/index.ts",
    "branding": "src/branding/index.ts",
    "storage": "src/storage/index.ts",
    "storage/local": "src/storage/local.ts",
    "storage/s3": "src/storage/s3.ts",
    "storage/cloudinary": "src/storage/cloudinary.ts",
    "email": "src/email/index.ts",
    "email/smtp": "src/email/smtp.ts",
    "sms": "src/sms/index.ts",
    "captcha": "src/captcha/index.ts",
    "payments": "src/payments/index.ts",
    "payments/paystack": "src/payments/paystack.ts",
    "errors": "src/errors/index.ts",
    "errors/sentry": "src/errors/sentry.ts",
    "actions": "src/actions/index.ts",
    "demo": "src/demo/index.ts",
    "testing": "src/testing/index.ts"
    },
  },
  {
    ...shared,
    entry: { client: "src/client/index.tsx" },
    // Directives are dropped by tree-shaking, so this entry is emitted as-is with the banner.
    treeshake: false,
    splitting: false,
    banner: { js: '"use client";' },
  },
]);
