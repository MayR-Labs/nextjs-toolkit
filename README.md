# @mlabshq/nextjs-webkit

Server-side building blocks for Next.js apps: env validation helpers, one Drizzle schema for SQLite,
PostgreSQL and MySQL, multi-tenancy, Better Auth, permissions, settings, feature editions with signed
licences, branding, file storage, email, SMS, captcha, payments, error reporting, a server-action builder,
demo-mode helpers and test utilities.

Each module is its own subpath export, and every provider SDK is an optional peer dependency, so an app
installs and bundles only what it uses. Nothing is configured globally: you create each service in your
app (usually in `src/server/`) and pass it what it needs.

## Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Entry points](#entry-points)
- [Conventions](#conventions)
- Modules: [Env](#env) · [Database](#database) · [Tenancy](#tenancy) · [Auth](#auth) ·
  [Settings](#settings) · [Features and licences](#features-and-licences) · [Branding](#branding) ·
  [Storage](#storage) · [Email](#email) · [SMS](#sms) · [Captcha](#captcha) · [Payments](#payments) ·
  [Errors](#errors) · [Server actions](#server-actions) · [Demo mode](#demo-mode) · [Testing](#testing) ·
  [Client](#client)
- [Environment variables the package reads](#environment-variables-the-package-reads)
- [Production checklist](#production-checklist)
- [Development](#development)

## Requirements

- Node.js 22 or later
- Next.js 16, React 19
- zod 4, drizzle-orm 0.44 or later, `@t3-oss/env-nextjs` 0.13 or later

The modules are server-only except `/client`. Import them from server components, route handlers, server
actions and scripts, never from client components.

## Installation

```bash
pnpm add @mlabshq/nextjs-webkit next react zod drizzle-orm @t3-oss/env-nextjs
```

Then add the peer dependencies of the modules you use:

| Module | Install |
| --- | --- |
| `/db/sqlite` | `@libsql/client` |
| `/db/postgres` | `postgres` |
| `/db/mysql` | `mysql2` |
| `/auth/better-auth` | `better-auth` |
| `/storage/s3` | `@aws-sdk/client-s3 @aws-sdk/s3-request-presigner` |
| `/email/smtp` | `nodemailer` |
| `/errors/sentry` | `@sentry/nextjs` |
| `/testing` | `@libsql/client drizzle-kit` (dev) |
| migrations | `drizzle-kit` (dev) |

Cloudinary, Resend, Termii, Paystack, Turnstile and hCaptcha are called over HTTP and need no SDK.

### Installing from GitHub (before an npm release)

```bash
pnpm add @mlabshq/nextjs-webkit@github:MayR-Labs/nextjs-webkit#main
```

The package's `prepare` script builds `dist/` during install. pnpm only runs it if you allow it, in the
app's `pnpm-workspace.yaml`:

```yaml
allowBuilds:
  "@mlabshq/nextjs-webkit": true
```

`pnpm update @mlabshq/nextjs-webkit` moves the lockfile to the latest commit on `main`. If you run Vitest,
add `server: { deps: { inline: ["@mlabshq/nextjs-webkit"] } }` to the `test` block so its `next/*` imports
resolve the same way they do in the app.

## Entry points

| Import | Provides |
| --- | --- |
| `@mlabshq/nextjs-webkit` | `toolkitTables` (the package's own tables) |
| `/env` | zod helpers for `@t3-oss/env-nextjs`, `platformUrl`, `firstEnv` |
| `/db` | `defineTables`, `createDatabase`, `newId`, `randomToken`, `ilike`, `paginate`, `dialectFor` |
| `/db/sqlite`, `/db/postgres`, `/db/mysql` | `sqliteDriver`, `postgresDriver`, `mysqlDriver` |
| `/tenancy` | `matchHost`, `isValidSlug`, `scopedDb`, `DEFAULT_TENANT_ID`, `PLATFORM_SCOPE` |
| `/auth` | `definePermissions` |
| `/auth/better-auth` | `createBetterAuth`, `createUserWithPassword`, `revokeAllSessions` |
| `/settings` | `defineSettings`, `resolveSetting`, `parseEnvValue`, `settingEnvName`, `envExample` |
| `/features` | `defineFeatures`, `resolveFeatures`, `parseOverrides`, `generateLicenceKeys`, `signLicence`, `verifyLicence` |
| `/branding` | `brandingFromEnv`, `mergeBranding`, `brandCssVariables`, `readableText`, `contrastRatio`, `normaliseHex` |
| `/storage` | `createStorage`, `checkUpload`, `objectKey` |
| `/storage/local`, `/storage/s3`, `/storage/cloudinary` | `localStorageDriver` + `serveLocalFile`, `s3StorageDriver`, `cloudinaryStorageDriver` |
| `/email` | `createMailer`, `devMailDriver`, `resendDriver`, `escapeHtml` |
| `/email/smtp` | `smtpDriver` |
| `/sms` | `createSms`, `devSmsDriver`, `termiiDriver`, `toE164` |
| `/captcha` | `createCaptcha`, `TEST_KEYS` |
| `/payments` | `createPayments`, `demoPaymentProvider` |
| `/payments/paystack` | `paystackProvider`, `verifyPaystackSignature` |
| `/errors` | `createErrorReporter`, `consoleDriver`, `scrub`, `DEFAULT_SCRUB` |
| `/errors/sentry` | `sentryDriver` |
| `/actions` | `createActionClient`, `ActionError`, `ActionResult`, `formToObject` |
| `/demo` | `demoGuard`, `daysFromNow`, `seededRandom` |
| `/testing` | `memoryDatabase`, `expectOnlyTenant` |
| `/client` | `PublicConfigProvider`, `usePublicConfig`, `CaptchaWidget` (`"use client"`) |

## Conventions

- **IDs** are UUIDv7 strings generated in the app (`newId()`), never by the database.
- **Money** is an integer in minor units (kobo, cents).
- **Timestamps** are UTC; calendar dates are ISO strings (`YYYY-MM-DD`).
- **Queries stay portable**: the database is typed as PostgreSQL, but code must run on all three dialects, so
  avoid `.returning()` (MySQL lacks it) and dialect-specific SQL.
- **No `NEXT_PUBLIC_*`**: browser values are resolved on the server and passed down with
  `PublicConfigProvider`, so one build can serve any deployment.
- The package's own tables are prefixed `tk_`.

---

## Env

Helpers for building an [`@t3-oss/env-nextjs`](https://env.t3.gg) schema.

| Helper | Behaviour |
| --- | --- |
| `requiredInProduction()` | Optional string locally, required when `NODE_ENV=production` |
| `booleanString(fallback = false)` | `"true"`, `"1"`, `"yes"`, `"on"` → `true`; unset → `fallback` |
| `intString(fallback)` | Integer parsed from a string, with a default |
| `commaList()` | `"a, b"` → `["a", "b"]`; unset → `[]` |
| `emailList()` | `commaList()` lower-cased |
| `requireWith(values, pairs)` | Cross-field rules: "`key` is required when `by` is set". Returns issues to add |
| `firstEnv(...names)` | The first non-empty env var among `names` |
| `platformUrl()` | Public URL from `APP_URL`, then Netlify `URL`, Vercel and Heroku variables |

```ts
// src/env.ts
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";
import {
  booleanString, emailList, firstEnv, intString, platformUrl, requiredInProduction, requireWith,
} from "@mlabshq/nextjs-webkit/env";

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z
      .string()
      .default(firstEnv("NETLIFY_DATABASE_URL", "POSTGRES_URL") ?? "file:.data/app.db"),
    AUTH_SECRET: requiredInProduction(),
    DEMO_MODE: booleanString(),
    ADMIN_EMAILS: emailList(),
    DATABASE_POOL_MAX: intString(10),
    S3_BUCKET: z.string().optional(),
    S3_REGION: z.string().optional(),
  },
  experimental__runtimeEnv: {}, // server-only variables are read from process.env
  createFinalSchema: (shape, isServer) =>
    z.object(shape).superRefine((values, ctx) => {
      if (!isServer) return;
      for (const issue of requireWith(values, [["S3_REGION", "S3_BUCKET", "S3 storage"]]))
        ctx.addIssue({ code: "custom", ...issue });
    }),
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});

export const appUrl = () => platformUrl() ?? "http://localhost:3000";
```

---

## Database

Write the schema once with a dialect-neutral column kit, then connect to whichever database `DATABASE_URL`
points at. `postgres://` or `postgresql://` selects PostgreSQL, `mysql://` selects MySQL, anything else
(`file:`, `libsql://`, `:memory:`) selects SQLite.

### Schema

`defineTables` takes a factory that receives the kit `t` and returns your tables. It returns
`schemaFor(dialect)`, which builds (and caches) the tables for one dialect.

| Column helper | PostgreSQL | MySQL | SQLite |
| --- | --- | --- | --- |
| `t.id(name = "id")` | text primary key, UUIDv7 default | varchar(36) | text |
| `t.ref(name)` | text | varchar(36) | text |
| `t.text(name, { length? })` | text | varchar(length ?? 255) | text |
| `t.longText(name)` | text | text (not indexable) | text |
| `t.int(name)` | integer | int | integer |
| `t.money(name)` | bigint (number) | bigint (number) | integer |
| `t.bool(name)` | boolean | boolean | integer (boolean) |
| `t.timestamp(name)` | timestamptz | datetime(3) | integer (ms) |
| `t.date(name)` | date (string) | date (string) | text |
| `t.json<T>(name)` | jsonb | json | text (json) |
| `t.createdAt()` / `t.updatedAt()` | `created_at` / `updated_at`, set automatically | | |

`t.table`, `t.index` and `t.uniqueIndex` are the dialect's own Drizzle builders. Use `t.text` for anything
you index or make unique, and `t.longText` for free text.

```ts
// src/server/db/schema.ts
import { toolkitTables } from "@mlabshq/nextjs-webkit";
import { defineTables, dialectFor } from "@mlabshq/nextjs-webkit/db";

export const schemaFor = defineTables((t) => ({
  ...toolkitTables(t),
  patients: t.table(
    "patients",
    {
      id: t.id(),
      tenantId: t.ref("tenant_id").notNull(),
      name: t.text("name").notNull(),
      balance: t.money("balance").notNull().default(0),
      createdAt: t.createdAt(),
      updatedAt: t.updatedAt(),
    },
    (table) => [t.index("patients_tenant").on(table.tenantId)],
  ),
}));

// Read process.env directly so drizzle-kit can load this file on its own.
export const dialect = dialectFor(process.env.DATABASE_URL);
export const schema = schemaFor(dialect);
export const { tkTenants, tkUsers, tkSessions, tkAccounts, tkVerifications, patients } = schema;
```

`toolkitTables(t)` adds the tables other modules rely on: `tk_tenants`, `tk_tenant_domains`, the Better Auth
tables (`tk_users`, `tk_sessions`, `tk_accounts`, `tk_verifications`), `tk_settings`, `tk_outbox` and
`tk_payment_events`. Include it even if you only use some of them.

### Connecting

```ts
// src/server/db/client.ts
import "server-only";
import { createDatabase, type Database } from "@mlabshq/nextjs-webkit/db";
import { postgresDriver } from "@mlabshq/nextjs-webkit/db/postgres";
import { sqliteDriver } from "@mlabshq/nextjs-webkit/db/sqlite";
import { env } from "@/env";
import { schemaFor, type schema } from "./schema";

const connect = () =>
  createDatabase({
    url: env.DATABASE_URL,
    authToken: env.DATABASE_AUTH_TOKEN, // Turso only
    poolMax: env.DATABASE_POOL_MAX,     // PostgreSQL and MySQL, default 10
    drivers: [sqliteDriver, postgresDriver], // only the drivers this app ships
    schemaFor,
  });

// One connection per process, surviving dev hot reloads.
const g = globalThis as unknown as { __db?: ReturnType<typeof connect> };
const connection = g.__db ?? connect();
if (env.NODE_ENV !== "production") g.__db = connection;

export const { db, dialect, driver } = connection;
export type Db = Database<typeof schema>;
```

`createDatabase` throws if `DATABASE_URL` points at a dialect whose driver you did not pass. For a SQLite
file, create its folder before connecting (`mkdirSync(dirname(url.slice(5)), { recursive: true })`).

### Migrations

Generate one migration folder per dialect from the same schema file. `TK_DIALECT` forces the dialect while
drizzle-kit loads it:

```ts
// drizzle/config.pg.ts (copy for sqlite and mysql with their dialect and folder)
import { defineConfig } from "drizzle-kit";

process.env.TK_DIALECT = "postgres";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle/pg",
});
```

```bash
drizzle-kit generate --config drizzle/config.sqlite.ts
drizzle-kit generate --config drizzle/config.pg.ts
drizzle-kit generate --config drizzle/config.mysql.ts
```

Apply them at deploy time with the driver that was selected:

```ts
const folders = { sqlite: "sqlite", postgres: "pg", mysql: "mysql" } as const;
await driver.migrate(db, `./drizzle/${folders[dialect]}`);
```

### Query helpers

- `newId()` returns a UUIDv7; `randomToken(bytes = 32)` returns a URL-safe random string.
- `ilike(column, pattern)` is a case-insensitive `LIKE` that works on every dialect.
- `paginate(page, size = 25, max = 100)` turns untrusted input into `{ limit, offset, page }`.

```ts
const { limit, offset } = paginate(searchParams.page);
const rows = await db.select().from(patients).where(ilike(patients.name, `%${q}%`)).limit(limit).offset(offset);
```

---

## Tenancy

Apps run **single-tenant** (one deployment per client, every row uses `DEFAULT_TENANT_ID`) or
**multi-tenant** (one deployment, tenants in `tk_tenants`, resolved from the request host). Tenant-owned
tables carry a `tenantId` column (`t.ref("tenant_id").notNull()`).

### Resolving the tenant from the host

```ts
import { matchHost } from "@mlabshq/nextjs-webkit/tenancy";

const match = matchHost(request.headers.get("host"), {
  rootDomain: "app.example.com",       // tenants live at <slug>.app.example.com
  platformHost: "admin.example.com",   // the platform's own admin host
});
// { kind: "platform" } | { kind: "subdomain", slug } | { kind: "custom", host } | { kind: "none" }
```

Look up `slug` in `tk_tenants.slug`, or a custom `host` in `tk_tenant_domains.host` (only once
`verifiedAt` is set). `isValidSlug(slug)` checks a new tenant's slug: lowercase letters, digits and hyphens,
up to 63 characters, not `www`, `api`, `admin`, `app` or `platform`.

### Tenant-scoped queries

`scopedDb(db, tenantId)` filters every read, update and delete by `tenant_id` and stamps it on every insert,
so feature code cannot forget the condition:

```ts
import { scopedDb } from "@mlabshq/nextjs-webkit/tenancy";
import { eq } from "drizzle-orm";

const scope = scopedDb(db, tenantId);

await scope.insert(patients, { id: newId(), name: "Ada" });            // tenantId added
const list = await scope.findMany(patients, { orderBy: patients.name, limit: 20 });
const one = await scope.findFirst(patients, eq(patients.id, id));
const total = await scope.count(patients);
await scope.update(patients, { name: "Ada L." }, eq(patients.id, id));
await scope.delete(patients, eq(patients.id, id));

// Joins and other hand-written queries: use scope.where for the tenant condition.
await db.select().from(patients).innerJoin(visits, eq(visits.patientId, patients.id))
  .where(scope.where(patients, eq(visits.status, "open")));
```

`DEFAULT_TENANT_ID` is the fixed id of the single tenant in single-tenant mode, so data can later move to a
multi-tenant deployment. `PLATFORM_SCOPE` (`"platform"`) is the `tk_settings.tenant_id` for platform-wide
defaults and locks.

---

## Auth

### Better Auth on your database

`createBetterAuth` configures [Better Auth](https://www.better-auth.com) with email and password (and
optionally Google) on the `tk_users`, `tk_sessions`, `tk_accounts` and `tk_verifications` tables.

```ts
// src/server/auth.ts
import "server-only";
import { createBetterAuth } from "@mlabshq/nextjs-webkit/auth/better-auth";
import { escapeHtml } from "@mlabshq/nextjs-webkit/email";
import { appUrl, env } from "@/env";
import { db, dialect, tkAccounts, tkSessions, tkUsers, tkVerifications } from "./db";
import { mailer } from "./mail";

export const auth = createBetterAuth({
  db,
  dialect,
  tables: { tkUsers, tkSessions, tkAccounts, tkVerifications },
  secret: env.AUTH_SECRET!,
  baseURL: appUrl(),
  appName: "My App",
  signUp: "invite-only",                         // "open" | "open-with-approval" | "invite-only"
  session: { strategy: "database", idleMinutes: 60 },
  lockout: { attempts: 5, minutes: 15 },
  google: env.GOOGLE_CLIENT_ID
    ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET! }
    : undefined,
  sendResetPassword: async ({ email, name, url }) => {
    await mailer.send({
      to: email,
      subject: "Set your password",
      html: `<p>Hello ${escapeHtml(name)},</p><p><a href="${url}">Set my password</a></p>`,
      text: `Set your password: ${url}`,
    });
  },
});
```

```ts
// src/app/api/auth/[...all]/route.ts
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/server/auth";

export const { GET, POST } = toNextJsHandler(auth);
```

| Option | Meaning |
| --- | --- |
| `signUp` | `"invite-only"` disables public sign-up; create users with `createUserWithPassword`. `"open"` and `"open-with-approval"` allow it (approval is the app's own check) |
| `session.strategy` | `"database"` checks the session row on every request. `"cookie-cache"` also caches it in a signed cookie for `cookieCacheMinutes` (default 5), which is faster but delays sign-out on other devices by up to that long |
| `session.idleMinutes` | Sessions slide forward on activity and expire after this long idle (minimum 5) |
| `lockout` | Rate-limits `/sign-in/email` to `attempts` per `minutes` window |
| `trustedOrigins` | Extra allowed origins, or an async function of the request (e.g. to trust tenant hosts) |
| `extend` | Any other Better Auth options (plugins, hooks), merged last. `nextCookies()` is always added |

Passwords need at least 8 characters, and resetting a password signs the user out everywhere.

```ts
import { createUserWithPassword, revokeAllSessions } from "@mlabshq/nextjs-webkit/auth/better-auth";

const userId = await createUserWithPassword(auth, { email, name, password }); // returns existing id if taken
await revokeAllSessions(auth, userId);
```

Read the session in server code with Better Auth's own API: `await auth.api.getSession({ headers: await headers() })`.

### Permissions

Map roles to permission patterns: an exact permission, a prefix wildcard (`billing.*`) or `*`.

```ts
import { definePermissions } from "@mlabshq/nextjs-webkit/auth";

export const access = definePermissions(
  ["patient.read", "patient.write", "billing.refund", "billing.view"] as const,
  {
    owner: ["*"],
    cashier: ["billing.*", "patient.read"],
    nurse: ["patient.*"],
  },
);

access.can("cashier", "billing.refund");     // true
access.can(["nurse", "cashier"], "patient.write"); // true
access.granted(["cashier"]);                 // ["patient.read", "billing.refund", "billing.view"]
```

Unknown roles grant nothing. Store each user's roles in your own membership table.

---

## Settings

A typed registry of runtime settings that can come from env, from the database (per tenant, optionally per
branch) or from a code default.

```ts
// src/server/settings.ts
import { defineSettings } from "@mlabshq/nextjs-webkit/settings";
import { z } from "zod";

export const settings = defineSettings({
  "billing.timing": {
    schema: z.enum(["before-service", "at-discharge"]),
    default: "before-service",
    scope: "branch",                 // "tenant" | "branch"
    group: "Billing",
    label: "When patients pay",
    options: [
      { value: "before-service", label: "Before service" },
      { value: "at-discharge", label: "At discharge" },
    ],
  },
  "queue.refreshSeconds": {
    schema: z.number().int().min(5),
    default: 15,
    scope: "tenant",
    group: "Queues",
    label: "Queue refresh interval",
  },
});
```

Each key has an env name: `settingEnvName("billing.timing")` is `SETTING_BILLING_TIMING`, and with a branch
`SETTING_BILLING_TIMING__IKEJA`. Env values are parsed against the schema as a raw string, then JSON, then a
comma-separated list.

`resolveSetting` decides the effective value. Load the relevant `tk_settings` rows yourself (platform row,
tenant row, branch row) and pass them in:

```ts
import { resolveSetting } from "@mlabshq/nextjs-webkit/settings";

const resolved = resolveSetting({
  key: "billing.timing",
  definition: settings["billing.timing"],
  mode: "single",                 // TenancyMode
  env: process.env,
  stored: {
    platform: platformRow ? { value: platformRow.value, locked: platformRow.locked } : undefined,
    tenant: tenantRow?.value,
    branch: branchRow?.value,
  },
  branch: "ikeja",
  adminEditable: true,            // single-tenant: may admins change values not pinned by env?
});
// { value, source, readOnly }
```

Resolution order:

- **Single-tenant**: branch env → env → branch row → tenant row → default. Values from env are read-only
  in the settings screen.
- **Multi-tenant**: locked platform row → branch row → tenant row → platform row → env → default.

Stored values that fail the schema are skipped. `envExample(settings)` renders a commented `.env.example`
section for every setting, grouped by `group`.

---

## Features and licences

Split an app into features and sell it in editions. Each tenant (or deployment) gets an edition plus
`+feature,-feature` overrides.

```ts
import { defineFeatures, resolveFeatures } from "@mlabshq/nextjs-webkit/features";

export const catalog = defineFeatures(
  {
    patients: { label: "Patients" },
    billing: { label: "Billing", requires: ["patients"] },
    pharmacy: { label: "Pharmacy", requires: ["billing"] },
    wards: { label: "Wards", requires: ["patients"] },
  },
  {
    clinic: ["patients", "billing"],
    hospital: ["patients", "billing", "pharmacy", "wards"],
  },
);

const enabled = resolveFeatures(catalog.features, catalog.editions.clinic, "+wards,-billing");
// Set { "patients", "wards" }: removing billing also removes pharmacy, which needs it
enabled.has("wards");
```

Dependencies of enabled features are added automatically, and unknown names are ignored. Check
`enabled.has(...)` in every place a feature is reachable: its pages, its actions, its navigation entries and
the permissions it grants.

### Signed licences

For on-site installs, an Ed25519-signed licence key carries the edition, overrides and limits. The private
key stays with you; the deployment only gets the public key.

```ts
import { generateLicenceKeys, signLicence, verifyLicence } from "@mlabshq/nextjs-webkit/features";

const { publicKey, privateKey } = generateLicenceKeys(); // PEM strings; run once, keep privateKey secret

const key = signLicence(
  { licensee: "St. Mary's", edition: "hospital", features: "-wards", limits: { users: 50 }, expiresAt: "2027-12-31" },
  privateKey,
);

const check = verifyLicence(process.env.LICENCE_KEY!, process.env.LICENCE_PUBLIC_KEY!);
if (check.valid && !check.expired) {
  const edition = check.payload.edition as keyof typeof catalog.editions;
  resolveFeatures(catalog.features, catalog.editions[edition], check.payload.features);
}
```

`verifyLicence` returns `{ valid: false, reason }` for a malformed or tampered key, and
`{ valid: true, payload, expired }` otherwise. Deciding what an expired licence still allows is up to the app.

---

## Branding

White-label an app per deployment (from env) or per tenant (from stored values).

```ts
import { brandCssVariables, brandingFromEnv, mergeBranding, type Branding } from "@mlabshq/nextjs-webkit/branding";

const defaults: Branding = {
  name: "My App",
  shortName: "My App",
  primaryColor: "#0f766e",
  accentColor: "#f59e0b",
  poweredBy: true,
  org: {},
};

const brand = brandingFromEnv(process.env, defaults);          // single-tenant
const tenantBrand = mergeBranding(brand, storedTenantBranding); // multi-tenant overrides
```

```tsx
// app/layout.tsx
<body style={brandCssVariables(brand) as React.CSSProperties}>
```

`brandCssVariables` returns `--brand-primary`, `--brand-accent`, `--brand-sidebar` and a readable text colour
for each (`--brand-primary-fg`, …). Colours are normalised to `#rrggbb`; invalid ones fall back to the
defaults. `readableText(bg)` and `contrastRatio(a, b)` are exported for your own checks.

Env variables read by `brandingFromEnv`: `BRAND_NAME`, `BRAND_SHORT_NAME`, `BRAND_TAGLINE`,
`BRAND_DESCRIPTION`, `BRAND_LOGO_URL`, `BRAND_LOGO_DARK_URL`, `BRAND_MARK_URL`, `BRAND_FAVICON_URL`,
`BRAND_OG_IMAGE_URL`, `BRAND_PRIMARY_COLOR`, `BRAND_ACCENT_COLOR`, `BRAND_SIDEBAR_COLOR`, `BRAND_FONT`,
`BRAND_POWERED_BY` (`false` hides "powered by"), and `ORG_NAME`, `ORG_LEGAL_NAME`, `ORG_RC_NUMBER`,
`ORG_EMAIL`, `ORG_PHONE`, `ORG_ADDRESS`, `ORG_WEBSITE`.

---

## Storage

One interface over local disk, S3-compatible stores and Cloudinary, with public and private files. Private
files are only reachable through short-lived signed URLs.

| Driver | Private files | Use for |
| --- | --- | --- |
| `localStorageDriver` | yes | local development, demos, on-site servers with a persistent disk |
| `s3StorageDriver` | yes | AWS S3, Cloudflare R2, DigitalOcean Spaces, MinIO |
| `cloudinaryStorageDriver` | no | public images (logos, photos) |

```ts
// src/server/storage.ts
import "server-only";
import { createStorage, type StorageDriver } from "@mlabshq/nextjs-webkit/storage";
import { type LocalStorageConfig, localStorageDriver } from "@mlabshq/nextjs-webkit/storage/local";
import { s3StorageDriver } from "@mlabshq/nextjs-webkit/storage/s3";
import { env } from "@/env";

export const localConfig: LocalStorageConfig = {
  dir: ".data/files",
  baseUrl: "/api/files",     // where serveLocalFile is mounted
  secret: env.AUTH_SECRET!,  // signs private URLs
};

const driver: StorageDriver =
  env.STORAGE_DRIVER === "s3"
    ? s3StorageDriver({
        bucket: env.S3_BUCKET!,
        region: env.S3_REGION!,
        accessKeyId: env.S3_ACCESS_KEY_ID!,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
        endpoint: env.S3_ENDPOINT,     // R2, Spaces, MinIO
        publicUrl: env.S3_PUBLIC_URL,  // CDN or bucket domain for public files
      })
    : localStorageDriver(localConfig);

export const storage = createStorage(driver, { signedUrlSeconds: 10 * 60 });
```

For Cloudinary: `cloudinaryStorageDriver({ cloudName, apiKey, apiSecret, folder })`.

Uploading from a server action:

```ts
import { checkUpload, objectKey } from "@mlabshq/nextjs-webkit/storage";
import { newId } from "@mlabshq/nextjs-webkit/db";

const problem = checkUpload(file, { maxBytes: 5 * 1024 * 1024, accept: ["image/", "application/pdf"] });
if (problem) throw new ActionError(problem);

const stored = await storage.put({
  key: objectKey({ tenantId, folder: "patients", id: newId(), fileName: file.name }),
  body: Buffer.from(await file.arrayBuffer()),
  contentType: file.type,
  visibility: "private",
});
// Save stored.key. stored.publicUrl is set for public files only.

const link = await storage.url(stored.key, "private"); // signed, expires after signedUrlSeconds
const bytes = await storage.read(stored.key);
await storage.remove(stored.key);
```

`objectKey` builds `<prefix>/<tenant>/<folder>/<id>-<safe-name>`. `createStorage` refuses private files on a
driver that cannot hold them.

The local driver needs a route that serves its files and checks signatures:

```ts
// src/app/api/files/[...key]/route.ts
import { serveLocalFile } from "@mlabshq/nextjs-webkit/storage/local";
import { localConfig } from "@/server/storage";

export async function GET(request: Request, { params }: RouteContext<"/api/files/[...key]">) {
  const { key } = await params;
  return serveLocalFile(localConfig, key.join("/"), new URL(request.url));
}
```

Do not use local storage on hosts with an ephemeral disk (Heroku, Netlify, Vercel).

---

## Email

```ts
// src/server/mail.ts
import { createMailer, devMailDriver, type MailDriver, resendDriver } from "@mlabshq/nextjs-webkit/email";
import { smtpDriver } from "@mlabshq/nextjs-webkit/email/smtp";
import { env } from "@/env";

const driver: MailDriver =
  env.MAIL_DRIVER === "resend"
    ? resendDriver(env.RESEND_API_KEY!)
    : env.MAIL_DRIVER === "smtp"
      ? smtpDriver({ host: env.SMTP_HOST!, port: env.SMTP_PORT, secure: env.SMTP_SECURE, user: env.SMTP_USER, password: env.SMTP_PASSWORD })
      : devMailDriver(async (entry) => {
          await db.insert(tkOutbox).values({ id: newId(), ...entry }); // optional capture
        });

export const mailer = createMailer(driver, { from: "My App <no-reply@example.com>", replyTo: "support@example.com" });

await mailer.send({ to: "ada@example.com", subject: "Welcome", html: "<p>Hi</p>", text: "Hi" });
```

| Driver | Notes |
| --- | --- |
| `devMailDriver(capture?)` | Never sends. Logs the message and passes it to `capture` (e.g. to store it in `tk_outbox` and show a dev inbox) |
| `resendDriver(apiKey)` | Resend HTTP API |
| `smtpDriver(config)` | Any SMTP server through nodemailer; also a local Mailpit (`localhost:1025`, `secure: false`) |

Escape user input in HTML bodies with `escapeHtml(value)`. Rendering templates (for example with React
Email) is up to the app; pass the resulting `html` and `text`.

---

## SMS

```ts
import { createSms, devSmsDriver, termiiDriver } from "@mlabshq/nextjs-webkit/sms";

export const sms = createSms(
  env.SMS_DRIVER === "termii" ? termiiDriver(env.TERMII_API_KEY!) : env.SMS_DRIVER === "dev" ? devSmsDriver() : null,
  { sender: "MyApp", country: "234" },
);

if (sms.enabled) await sms.send({ to: "0803 123 4567", text: "Your code is 123456" });
await sms.send({ to: "+2348031234567", text: "Hello", channel: "whatsapp" }); // Termii WhatsApp channel
```

Passing `null` disables SMS: `send` then returns `null` without sending. Numbers are normalised to E.164
with `toE164(raw, country)` (a leading `0` becomes the country code), and an invalid number throws.
`devSmsDriver(capture?)` logs and captures like the dev mail driver.

---

## Captcha

Server-side verification for Cloudflare Turnstile and hCaptcha.

```ts
import { createCaptcha } from "@mlabshq/nextjs-webkit/captcha";

export const captcha = createCaptcha(env.CAPTCHA_PROVIDER, {   // "turnstile" | "hcaptcha" | "off"
  siteKey: env.CAPTCHA_SITE_KEY,
  secretKey: env.CAPTCHA_SECRET_KEY,
});

// In a server action or route handler:
const token = formData.get(captcha.provider === "turnstile" ? "cf-turnstile-response" : "h-captcha-response");
if (!(await captcha.verify(token as string, ip))) throw new ActionError("Please complete the captcha.");
```

Render the widget with `<CaptchaWidget provider={captcha.provider} siteKey={captcha.siteKey} />` from
[`/client`](#client) inside the form; it posts the token under the field names above.

When a key is missing, the provider's published test keys (`TEST_KEYS`) are used, which always pass. That
makes local development work with no account, but **set both keys in production**. `"off"` accepts
everything.

---

## Payments

A provider interface with Paystack and a demo provider. Several providers can be enabled at once and the app
picks one per payment.

```ts
import { createPayments, demoPaymentProvider } from "@mlabshq/nextjs-webkit/payments";
import { paystackProvider } from "@mlabshq/nextjs-webkit/payments/paystack";

export const payments = createPayments(
  env.DEMO_MODE ? [demoPaymentProvider("/demo/checkout")] : env.PAYSTACK_SECRET_KEY ? [paystackProvider(env.PAYSTACK_SECRET_KEY)] : [],
);
```

Starting and confirming a payment:

```ts
const provider = payments.get("paystack");
const { redirectUrl } = await provider.initialize({
  reference: newId(),          // your own unique reference; store it with the invoice
  amountMinor: 250_000,        // ₦2,500.00 in kobo
  currency: "NGN",
  email: customer.email,
  callbackUrl: `${appUrl()}/billing/return`,
  metadata: { invoiceId },
});
redirect(redirectUrl);

// On the callback page, or as a fallback to the webhook:
const result = await provider.verify(reference); // { status: "success" | "failed" | "pending", amountMinor, currency, paidAt }
```

Always compare `result.amountMinor` and `result.currency` with what you expected before marking anything
paid.

Webhooks: verify the signature, then record the event in `tk_payment_events`, whose unique key
(`provider`, `event_id`) makes replays harmless:

```ts
// src/app/api/payments/[provider]/route.ts
export async function POST(request: Request, { params }: RouteContext<"/api/payments/[provider]">) {
  const { provider } = await params;
  if (!payments.providers.includes(provider)) return new Response("Unknown provider", { status: 404 });

  const raw = await request.text();
  const event = await payments.get(provider).parseWebhook(raw, request.headers);
  if (!event) return new Response("Invalid signature", { status: 401 });

  try {
    await db.insert(tkPaymentEvents).values({ id: newId(), provider, eventId: event.id, type: event.type, payload: event.raw });
  } catch {
    return new Response("Already processed", { status: 200 });
  }

  if (event.type === "charge.success" && event.payment) await settle(event.payment.reference);
  return new Response("OK");
}
```

Point the Paystack dashboard's webhook URL at `/api/payments/paystack`. Refunds:
`await provider.refund?.(reference, amountMinor)` (omit the amount for a full refund).

`demoPaymentProvider(checkoutPath)` redirects to your own demo checkout page with `reference` and `callback`
query parameters, and `verify` always succeeds. Never enable it outside demo mode.

---

## Errors

Report unexpected errors with a short reference code the user can quote to support, with sensitive fields
scrubbed.

```ts
import { createErrorReporter } from "@mlabshq/nextjs-webkit/errors";
import { sentryDriver } from "@mlabshq/nextjs-webkit/errors/sentry";

export const errors = createErrorReporter(env.SENTRY_DSN ? sentryDriver : undefined); // console by default

const ref = errors.capture(error, { userId, tenantId, action: "billing.refund", tags: { branch }, extra: { input } });
// ref: e.g. "3FA9C21B"
```

Values in `extra` whose key contains a sensitive word (`password`, `token`, `secret`, `authorization`,
`cookie`, `email`, `phone`, `address`, `dateOfBirth`, clinical note fields…) are replaced with
`"[scrubbed]"`. Pass your own list as the second argument; `DEFAULT_SCRUB` is exported to extend.

`sentryDriver` only reports; initialise Sentry yourself in `instrumentation.ts`:

```ts
export async function register() {
  if (!process.env.SENTRY_DSN) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.1 });
}
```

---

## Server actions

`createActionClient` builds server actions with one shape: guards, zod-validated input, a demo-mode hook,
a typed result and captured errors.

```ts
// src/server/action.ts
import "server-only";
import { ActionError, createActionClient } from "@mlabshq/nextjs-webkit/actions";
import { demoGuard } from "@mlabshq/nextjs-webkit/demo";

const demo = demoGuard({ enabled: env.DEMO_MODE, strategy: "shared-reset", blocked: ["staff.invite", "settings.*"] });

export const action = createActionClient<Viewer>({
  context: async () => {
    const viewer = await getViewer();
    if (!viewer) throw new ActionError("Your session has ended. Please sign in again.");
    return viewer;
  },
  errors,                                            // an ErrorReporter
  beforeMutation: (_viewer, name) => demo(name),     // runs for every non-read-only action
});

export const requirePermission = (permission: Permission) => (viewer: Viewer) => {
  if (!access.can(viewer.roles, permission)) throw new ActionError("You do not have permission to do that.");
};
```

```ts
// src/features/patients/actions.ts
"use server";
export const registerPatient = action("patients.register")
  .guard(requirePermission("patient.write"))
  .input(z.object({ name: z.string().min(1), phone: z.string().optional() }))
  .run(async ({ input, ctx }) => {
    const id = newId();
    await scopedDb(db, ctx.tenantId).insert(patients, { id, ...input });
    return { id };
  });
```

The action can be called with a plain object (`await registerPatient({ name })`) or used with
`useActionState(registerPatient, null)` in a form. It always resolves to an `ActionResult`:

```ts
type ActionResult<T> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]>; ref?: string };
```

The order is: build context → guards → validate input (failures return `fieldErrors`) → `beforeMutation`
(skipped for `.readOnly()` actions) → handler.

- Throw `ActionError(message, fieldErrors?)` for expected failures; the message is shown to the user.
- Any other error is reported through `errors` and returns "Something went wrong. Reference: XXXX".
- `redirect()`, `notFound()` and other Next.js control-flow errors pass through untouched.

Form data is converted with `formToObject`: repeated keys become arrays, keys ending in `[]` are always
arrays, and empty strings become `undefined` so optional fields work.

---

## Demo mode

Helpers for public demo deployments.

- `demoGuard({ enabled, strategy, blocked })` returns a function for the action client's `beforeMutation`.
  It throws `ActionError("This is disabled in the demo.")` for action names in `blocked` (exact names or
  `prefix.*`) while `enabled` is true. Combine it with demo drivers elsewhere: `devMailDriver`,
  `devSmsDriver`, `demoPaymentProvider` and local storage, so nothing leaves the server.
- `daysFromNow(days, hour = 9, minute = 0)` keeps seeded dates relative to today, so a demo rebuilt
  tomorrow still looks current.
- `seededRandom(seed)` gives deterministic `next()`, `int(min, max)`, `pick(items)` and `chance(p)`, so the
  demo data is identical on every rebuild.

```ts
const rand = seededRandom(7);
for (let i = 0; i < 40; i++) {
  await db.insert(appointments).values({ id: newId(), tenantId, startsAt: daysFromNow(rand.int(-14, 14), rand.int(8, 16)) });
}
```

---

## Testing

```ts
import { memoryDatabase, expectOnlyTenant } from "@mlabshq/nextjs-webkit/testing";
import { scopedDb } from "@mlabshq/nextjs-webkit/tenancy";
import { schemaFor } from "@/server/db/schema";

const schema = schemaFor("sqlite");
const db = await memoryDatabase(schema); // fresh in-memory SQLite with every table created, no migrations

await scopedDb(db, "tenant-a").insert(schema.patients, { id: newId(), name: "Ada" });
await scopedDb(db, "tenant-b").insert(schema.patients, { id: newId(), name: "Bola" });

const rows = await scopedDb(db, "tenant-a").findMany(schema.patients);
expectOnlyTenant(rows, "tenant-a"); // throws if any row belongs to another tenant
```

`memoryDatabase` needs `@libsql/client` and `drizzle-kit` installed. Providers that call HTTP APIs
(`resendDriver`, `termiiDriver`, `paystackProvider`, `createCaptcha`, `cloudinaryStorageDriver`) take an
optional `fetch` as their last argument, so tests can pass a fake.

---

## Client

The only module safe to import from client components.

```tsx
// app/layout.tsx (server component)
import { PublicConfigProvider } from "@mlabshq/nextjs-webkit/client";

<PublicConfigProvider value={{ captchaProvider: captcha.provider, captchaSiteKey: captcha.siteKey ?? null, appName: brand.name }}>
  {children}
</PublicConfigProvider>
```

```tsx
"use client";
import { CaptchaWidget, usePublicConfig } from "@mlabshq/nextjs-webkit/client";

export function SignInCaptcha() {
  const config = usePublicConfig();
  return <CaptchaWidget provider={config.captchaProvider as string} siteKey={config.captchaSiteKey as string} />;
}
```

Only put values in `PublicConfigProvider` that are safe for every visitor to see.

---

## Environment variables the package reads

The package reads very little from `process.env` on its own; everything else is passed in by your app.

| Variable | Read by |
| --- | --- |
| `NODE_ENV` | `requiredInProduction()` |
| `TK_DIALECT` | `dialectFor()`, to force a dialect (drizzle-kit configs) |
| `APP_URL`, `URL`, `VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_URL`, `HEROKU_APP_NAME` | `platformUrl()` |
| `BRAND_*`, `ORG_*` | `brandingFromEnv(env, …)`, from the object you pass |
| `SETTING_*` | `resolveSetting({ env, … })`, from the object you pass |

## Production checklist

- The Better Auth `secret` and the local storage signing `secret` are long random values (at least 32
  characters), kept out of the repository.
- Captcha has real `siteKey` and `secretKey` values (missing keys fall back to always-pass test keys).
- Storage is not local on hosts with an ephemeral disk.
- Migrations for the selected dialect run before the new build serves traffic.
- `demoPaymentProvider`, `devMailDriver` and `devSmsDriver` are only used in development or demo mode.
- Paystack webhooks point at your webhook route, and payments are checked against the expected amount.
- Error reporting uses Sentry (or another driver) rather than the console driver.

## Not included yet

Clerk, Africa's Talking and Twilio drivers, background jobs, live updates (polling/SSE), per-visitor demo
sandboxes, PostgreSQL row-level security, direct browser-to-store uploads and a CLI. Until then, apps build
these themselves on the interfaces above (`MailDriver`, `SmsDriver`, `StorageDriver`, `PaymentProvider`,
`ErrorDriver` are all plain objects you can implement).

## Development

```bash
pnpm install          # also builds dist/ through the prepare script
pnpm typecheck
pnpm test
pnpm lint
pnpm build            # dist/ (tsup, ESM) and dist/types (tsc)
```

Releasing: bump `version`, update [CHANGELOG.md](CHANGELOG.md), then `npm publish --access public`
(`prepare` builds and `prepublishOnly` runs the tests).

## License

[MIT](LICENSE)
