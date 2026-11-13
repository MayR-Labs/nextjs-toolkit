import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";
import { booleanString, commaList, firstEnv, intString } from "./helpers";

const optional = () => z.string().min(1).optional();

/**
 * Every variable the webkit's modules read, with their defaults. Spread it into your own `createEnv`
 * (or use `createWebkitEnv`), and override any entry by declaring the same key in your app's schema.
 */
export const webkitEnv = {
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  /** Public URL; falls back to the host platform's variables (see `platformUrl`). */
  APP_URL: z.url().optional(),

  // Database
  DATABASE_URL: z
    .string()
    .default(
      firstEnv("NETLIFY_DATABASE_URL", "POSTGRES_URL") ?? "file:./.data/app.db",
    ),
  DATABASE_AUTH_TOKEN: optional(),
  DATABASE_POOL_MAX: intString(10),

  // Tenancy
  TENANCY_MODE: z.enum(["single", "multi"]).default("single"),
  TENANCY_ROOT_DOMAIN: optional(),
  TENANCY_PLATFORM_HOST: optional(),

  // Auth
  AUTH_DRIVER: z.enum(["better-auth", "clerk"]).default("better-auth"),
  AUTH_SECRET: optional(),
  AUTH_SIGN_UP: z
    .enum(["invite-only", "open", "open-with-approval"])
    .default("invite-only"),
  /** Sign-in methods offered with Better Auth: "password", "google". */
  AUTH_METHODS: commaList(),
  AUTH_SESSION_STRATEGY: z
    .enum(["database", "cookie-cache"])
    .default("database"),
  AUTH_COOKIE_CACHE_MINUTES: intString(5),
  AUTH_IDLE_TIMEOUT_MINUTES: intString(30),
  AUTH_ABSOLUTE_TIMEOUT_HOURS: intString(12),
  AUTH_LOCKOUT_ATTEMPTS: intString(5),
  AUTH_LOCKOUT_MINUTES: intString(15),
  /** Behind a proxy you run: trust the first x-forwarded-for entry as the client IP. */
  TRUST_PROXY: booleanString(false),
  GOOGLE_CLIENT_ID: optional(),
  GOOGLE_CLIENT_SECRET: optional(),
  /** Clerk's server key. Its publishable key is NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, read by Clerk itself. */
  CLERK_SECRET_KEY: optional(),

  // Storage
  STORAGE_DRIVER: z.enum(["local", "s3", "cloudinary"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./.data/uploads"),
  STORAGE_LOCAL_BASE_URL: z.string().default("/api/files"),
  /** Signs local private-file URLs. Falls back to AUTH_SECRET. */
  STORAGE_SECRET: optional(),
  STORAGE_SIGNED_URL_MINUTES: intString(5),
  STORAGE_MAX_UPLOAD_MB: intString(20),
  S3_BUCKET: optional(),
  S3_REGION: optional(),
  S3_ACCESS_KEY_ID: optional(),
  S3_SECRET_ACCESS_KEY: optional(),
  S3_ENDPOINT: z.url().optional(),
  S3_PUBLIC_URL: z.url().optional(),
  CLOUDINARY_CLOUD_NAME: optional(),
  CLOUDINARY_API_KEY: optional(),
  CLOUDINARY_API_SECRET: optional(),
  CLOUDINARY_FOLDER: optional(),

  // Email
  EMAIL_DRIVER: z.enum(["dev", "smtp", "resend"]).default("dev"),
  EMAIL_FROM: optional(),
  EMAIL_REPLY_TO: optional(),
  RESEND_API_KEY: optional(),
  SMTP_HOST: optional(),
  SMTP_PORT: intString(587),
  SMTP_USER: optional(),
  SMTP_PASSWORD: optional(),
  SMTP_SECURE: booleanString(false),

  // SMS
  SMS_DRIVER: z.enum(["off", "dev", "termii"]).default("off"),
  SMS_SENDER_ID: optional(),
  SMS_COUNTRY_CODE: z.string().default("234"),
  TERMII_API_KEY: optional(),

  // Captcha
  CAPTCHA_DRIVER: z.enum(["off", "turnstile", "hcaptcha"]).default("off"),
  TURNSTILE_SITE_KEY: optional(),
  TURNSTILE_SECRET_KEY: optional(),
  HCAPTCHA_SITE_KEY: optional(),
  HCAPTCHA_SECRET_KEY: optional(),

  // Payments
  PAYMENTS_PROVIDERS: commaList(),
  PAYSTACK_PUBLIC_KEY: optional(),
  PAYSTACK_SECRET_KEY: optional(),

  // Errors
  ERRORS_DRIVER: z.enum(["console", "sentry"]).default("console"),
  SENTRY_DSN: optional(),
  SENTRY_ENVIRONMENT: optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),

  // Demo
  DEMO_MODE: booleanString(false),
  DEMO_STRATEGY: z.enum(["sandbox", "shared-reset"]).default("shared-reset"),

  // Branding (brandingFromEnv)
  BRAND_NAME: optional(),
  BRAND_SHORT_NAME: optional(),
  BRAND_TAGLINE: optional(),
  BRAND_DESCRIPTION: optional(),
  BRAND_LOGO_URL: optional(),
  BRAND_LOGO_DARK_URL: optional(),
  BRAND_MARK_URL: optional(),
  BRAND_FAVICON_URL: optional(),
  BRAND_OG_IMAGE_URL: optional(),
  BRAND_PRIMARY_COLOR: optional(),
  BRAND_ACCENT_COLOR: optional(),
  BRAND_SIDEBAR_COLOR: optional(),
  BRAND_FONT: optional(),
  BRAND_POWERED_BY: booleanString(true),
  ORG_NAME: optional(),
  ORG_LEGAL_NAME: optional(),
  ORG_RC_NUMBER: optional(),
  ORG_EMAIL: optional(),
  ORG_PHONE: optional(),
  ORG_ADDRESS: optional(),
  ORG_WEBSITE: optional(),
};

export type EnvIssue = { path: string[]; message: string };

/**
 * Cross-field rules for the webkit's variables: what each selected provider needs, and what production
 * requires. Returns issues instead of throwing so they can be combined with the app's own rules.
 */
export function webkitEnvRules(v: Record<string, unknown>): EnvIssue[] {
  const issues: EnvIssue[] = [];
  const set = (key: string) =>
    v[key] !== undefined && v[key] !== "" && v[key] !== null;
  const need = (keys: string[], why: string) => {
    for (const key of keys)
      if (!set(key))
        issues.push({ path: [key], message: `${key} is required ${why}` });
  };
  const production = v.NODE_ENV === "production";
  const demo = v.DEMO_MODE === true;
  const list = (key: string) =>
    Array.isArray(v[key]) ? (v[key] as string[]) : [];

  if (v.TENANCY_MODE === "multi")
    need(
      ["TENANCY_ROOT_DOMAIN", "TENANCY_PLATFORM_HOST"],
      "in multi-tenant mode",
    );
  if (set("GOOGLE_CLIENT_ID"))
    need(["GOOGLE_CLIENT_SECRET"], "with GOOGLE_CLIENT_ID");
  if (production && v.AUTH_DRIVER !== "clerk")
    need(["AUTH_SECRET"], "in production with Better Auth");
  if (production && v.AUTH_DRIVER === "clerk")
    need(["CLERK_SECRET_KEY"], "in production with Clerk");

  if (!demo) {
    if (v.STORAGE_DRIVER === "s3")
      need(
        ["S3_BUCKET", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"],
        "with STORAGE_DRIVER=s3",
      );
    if (v.STORAGE_DRIVER === "cloudinary")
      need(
        [
          "CLOUDINARY_CLOUD_NAME",
          "CLOUDINARY_API_KEY",
          "CLOUDINARY_API_SECRET",
        ],
        "with STORAGE_DRIVER=cloudinary",
      );
    if (v.EMAIL_DRIVER === "resend")
      need(["RESEND_API_KEY"], "with EMAIL_DRIVER=resend");
    if (v.EMAIL_DRIVER === "smtp")
      need(["SMTP_HOST"], "with EMAIL_DRIVER=smtp");
    if (production && v.EMAIL_DRIVER !== "dev")
      need(["EMAIL_FROM"], "to send email in production");
    if (v.SMS_DRIVER === "termii")
      need(["TERMII_API_KEY", "SMS_SENDER_ID"], "with SMS_DRIVER=termii");
    if (list("PAYMENTS_PROVIDERS").includes("paystack"))
      need(["PAYSTACK_SECRET_KEY"], "with Paystack in PAYMENTS_PROVIDERS");
  }
  if (
    production &&
    (demo || v.STORAGE_DRIVER === "local") &&
    !set("STORAGE_SECRET") &&
    !set("AUTH_SECRET")
  )
    need(
      ["STORAGE_SECRET"],
      "(or AUTH_SECRET) to sign local file URLs in production",
    );
  if (production && v.CAPTCHA_DRIVER === "turnstile")
    need(
      ["TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY"],
      "in production with CAPTCHA_DRIVER=turnstile",
    );
  if (production && v.CAPTCHA_DRIVER === "hcaptcha")
    need(
      ["HCAPTCHA_SITE_KEY", "HCAPTCHA_SECRET_KEY"],
      "in production with CAPTCHA_DRIVER=hcaptcha",
    );
  if (v.ERRORS_DRIVER === "sentry")
    need(["SENTRY_DSN"], "with ERRORS_DRIVER=sentry");
  return issues;
}

type WebkitShape = typeof webkitEnv;
type Merged<S> = Omit<WebkitShape, keyof S> & S;
/** The validated env: every webkit variable plus the app's own, typed. */
export type WebkitEnv<S = Record<never, z.ZodType>> = ReturnType<
  typeof createEnv<Merged<S>>
>;

export interface WebkitEnvOptions<S> {
  /** The app's own server variables. A key the webkit also declares replaces the webkit's entry. */
  server?: S;
  /** The app's own cross-field rules, run after the webkit's. */
  rules?: (values: Record<string, unknown>) => EnvIssue[];
  /** Defaults to SKIP_ENV_VALIDATION or `next build`. */
  skipValidation?: boolean;
}

/**
 * `createEnv` from @t3-oss/env-nextjs with every webkit variable and rule already included, so the app
 * only declares its own variables. Server-only: there are no NEXT_PUBLIC_* variables, so one build can
 * serve any deployment. Empty strings count as unset.
 *
 *   export const env = createWebkitEnv({
 *     server: { EDITION: z.enum(["clinic", "hospital"]).default("hospital"), EMAIL_FROM: z.string().default("App <no-reply@app.test>") },
 *   });
 */
export function createWebkitEnv<
  S extends Record<string, z.ZodType> = Record<never, z.ZodType>,
>(options: WebkitEnvOptions<S> = {}): WebkitEnv<S> {
  const rules = (values: Record<string, unknown>) => [
    ...webkitEnvRules(values),
    ...(options.rules?.(values) ?? []),
  ];
  const settings = {
    server: { ...webkitEnv, ...options.server },
    experimental__runtimeEnv: {},
    emptyStringAsUndefined: true,
    skipValidation:
      options.skipValidation ??
      (Boolean(process.env.SKIP_ENV_VALIDATION) ||
        process.env.NEXT_PHASE === "phase-production-build"),
    createFinalSchema: (shape: z.ZodRawShape, isServer: boolean) =>
      z.object(shape).superRefine((values, ctx) => {
        if (!isServer) return;
        for (const issue of rules(values as Record<string, unknown>))
          ctx.addIssue({ code: "custom", ...issue });
      }),
  };
  // The merged shape is only known per app, so the call is typed through the declared return type.
  return createEnv(settings as never) as WebkitEnv<S>;
}
