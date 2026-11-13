# @mlabshq/nextjs-webkit

Server-side building blocks for Next.js apps: env validation helpers, one Drizzle schema for SQLite,
PostgreSQL and MySQL, multi-tenancy, auth (Better Auth or Clerk), permissions, settings, feature editions
with signed licences, branding, file storage, email, SMS, captcha, payments, error reporting, a
server-action builder, demo-mode helpers and test utilities.

Services with several providers pick theirs from configuration: set `EMAIL_DRIVER=resend` or
`STORAGE_DRIVER=s3` and the same app code uses Resend or S3. Each module is its own subpath export, and
every provider SDK is an optional peer dependency, so an app installs and bundles only what it uses.

## Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Entry points](#entry-points)
- [Conventions](#conventions)
- [Providers from configuration](#providers-from-configuration)
- Modules: [Env](#env) · [Database](#database) · [Tenancy](#tenancy) · [Auth](#auth) ·
  [Settings](#settings) · [Features and licences](#features-and-licences) · [Branding](#branding) ·
  [Storage](#storage) · [Email](#email) · [SMS](#sms) · [Captcha](#captcha) · [Payments](#payments) ·
  [Errors](#errors) · [Server actions](#server-actions) · [Demo mode](#demo-mode) · [Testing](#testing) ·
  [Client](#client)
- [Environment variables](#environment-variables)
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
| `/auth/clerk` | `@clerk/nextjs` |
| `/storage/s3` | `@aws-sdk/client-s3 @aws-sdk/s3-request-presigner` |
| `/email/smtp` | `nodemailer` |
| `/errors/sentry` | `@sentry/nextjs` |
| `/testing` | `@libsql/client drizzle-kit` (dev) |
| migrations | `drizzle-kit` (dev) |

Cloudinary, Resend, Termii, Paystack, Turnstile and hCaptcha are called over HTTP and need no SDK.

### Installing from GitHub (before an npm release)

Pin a commit, and allow that commit's `prepare` script (it builds `dist/`) in the app's
`pnpm-workspace.yaml`. pnpm only accepts the exact tarball URL here; the package name alone is not enough.

```bash
pnpm add @mlabshq/nextjs-webkit@github:MayR-Labs/nextjs-webkit#<commit-sha>
```

```yaml
allowBuilds:
  "@mlabshq/nextjs-webkit@https://codeload.github.com/MayR-Labs/nextjs-webkit/tar.gz/<commit-sha>": true
```

Both must change together whenever you move to a new commit, so script it. Fera Health's
`scripts/webkit-update.mjs` resolves a branch or tag to a sha, rewrites both, and runs `pnpm install`.

If you run Vitest, add `server: { deps: { inline: ["@mlabshq/nextjs-webkit"] } }` to the `test` block so its
`next/*` imports resolve the same way they do in the app.

## Entry points

| Import | Provides |
| --- | --- |
| `@mlabshq/nextjs-webkit` | `webkitTables`, `WebkitTables` (the package's own tables; added to every schema automatically) |
| `/env` | `createWebkitEnv`, `webkitEnv`, `webkitEnvRules`; zod helpers, `platformUrl`, `firstEnv` |
| `/db` | `defineTables`, `createDatabase`, `DatabaseConnection`, `newId`, `randomToken`, `ilike`, `paginate`, `dialectFor` |
| `/db/sqlite`, `/db/postgres`, `/db/mysql` | `sqliteDriver`, `postgresDriver`, `mysqlDriver` |
| `/tenancy` | `matchHost`, `isValidSlug`, `scopedDb`, `DEFAULT_TENANT_ID`, `PLATFORM_SCOPE` |
| `/auth` | `createAuth`, `AuthError`, `definePermissions` |
| `/auth/better-auth` | `betterAuthProvider`, `createBetterAuth`, `betterAuthDriver`, `createUserWithPassword`, `revokeAllSessions` |
| `/auth/clerk` | `clerkProvider`, `clerkDriver` |
| `/settings` | `defineSettings`, `resolveSetting`, `parseEnvValue`, `settingEnvName`, `envExample` |
| `/features` | `defineFeatures`, `resolveFeatures`, `parseOverrides`, `generateLicenceKeys`, `signLicence`, `verifyLicence` |
| `/branding` | `brandingFromEnv`, `mergeBranding`, `brandCssVariables`, `readableText`, `contrastRatio`, `normaliseHex` |
| `/storage` | `createStorage`, `checkUpload`, `objectKey`; providers `local`, `cloudinary` |
| `/storage/s3` | provider `s3`, `s3StorageDriver` |
| `/storage/local`, `/storage/cloudinary` | `localStorageDriver`, `serveLocalFile`, `cloudinaryStorageDriver` |
| `/email` | `createMailer`, `outboxCapture`, `escapeHtml`; providers `devMail`, `resend` |
| `/email/smtp` | provider `smtp`, `smtpDriver` |
| `/sms` | `createSms`, `toE164`; providers `devSms`, `termii` |
| `/captcha` | `createCaptcha`, `TEST_KEYS` |
| `/payments` | `createPayments`, `demoPaymentProvider`; provider `paystack` |
| `/payments/paystack` | `paystackProvider`, `verifyPaystackSignature` |
| `/errors` | `createErrorReporter`, `consoleDriver`, `scrub`, `DEFAULT_SCRUB` |
| `/errors/sentry` | provider `sentry`, `sentryDriver` |
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
- The package's own tables are prefixed `mlwebkit__` and added to your schema automatically.

## Providers from configuration

Database, auth, storage, email, SMS, captcha, payments and error reporting each have one `create*`
function that reads its configuration and picks the provider itself:

```ts
import { createMailer } from "@mlabshq/nextjs-webkit/email";
import { smtp } from "@mlabshq/nextjs-webkit/email/smtp";

export const mailer = createMailer({ env, providers: [smtp] });
// EMAIL_DRIVER=dev | resend | smtp, plus that provider's own variables
```

- **Selection** comes from one variable per module (`EMAIL_DRIVER`, `STORAGE_DRIVER`, …; see
  [Environment variables](#environment-variables)). Passing `driver: "resend"` overrides it, and passing a
  driver object (`driver: myMailDriver`) skips selection entirely, which is handy in tests.
- **Built-in providers** need no SDK and are always available. Providers that need an SDK (SMTP, S3, Sentry,
  Better Auth, Clerk) are imported from their own subpath and listed in `providers`, so apps that do not use
  them never bundle them. Selecting one that is not registered fails with a message saying what to import.
- **`env`** is optional. Values in it take precedence over `process.env`; pass your validated
  `@t3-oss/env-nextjs` object so its defaults apply. Numbers, booleans and lists are accepted as well as
  strings.
- **Providers are created on first use.** Creating a service never throws for missing keys, so builds and
  unrelated pages keep working; the first call fails with the variable to set, e.g.
  `RESEND_API_KEY is required when EMAIL_DRIVER=resend.`
- **Demo mode** (`DEMO_MODE=true`, or `demo: true`) switches email and SMS to the dev drivers, storage to local
  disk and payments to the demo provider, so nothing leaves the server.
- **Custom providers** are plain objects, `{ name, create({ env }) }`, returning a driver (`MailDriver`,
  `SmsDriver`, `StorageDriver`, `PaymentProvider`, `ErrorDriver`, `AuthDriver`). Register them in
  `providers`; a custom provider with a built-in's name replaces it.

---

## Env

`createWebkitEnv` is `createEnv` from [`@t3-oss/env-nextjs`](https://env.t3.gg) with every variable the
webkit reads already declared (with defaults) and validated (with cross-field rules such as "`S3_BUCKET` is
required with `STORAGE_DRIVER=s3`"). The app declares only its own variables:

```ts
// src/env.ts
import { createWebkitEnv, emailList } from "@mlabshq/nextjs-webkit/env";
import { z } from "zod";

export const env = createWebkitEnv({
  server: {
    // The app's own variables
    EDITION: z.enum(["clinic", "hospital"]).default("hospital"),
    ADMIN_EMAILS: emailList(),
    // Override a webkit variable by declaring the same key
    EMAIL_FROM: z.string().default("My App <no-reply@myapp.test>"),
  },
  // Optional cross-field rules of your own, run after the webkit's
  rules: (v) => (v.EDITION === "hospital" && !v.ADMIN_EMAILS ? [{ path: ["ADMIN_EMAILS"], message: "…" }] : []),
});

env.STORAGE_DRIVER; // "local" | "s3" | "cloudinary", typed, defaulted
env.EDITION;        // "clinic" | "hospital"
```

- Server-only: no `NEXT_PUBLIC_*` variables, so one build can serve any deployment.
- Empty strings count as unset. Validation is skipped during `next build` and when `SKIP_ENV_VALIDATION`
  is set.
- Pass `env` to every `create*` service so they use these validated values and defaults.
- Calling `createEnv` yourself (for example to add client variables)? Spread `webkitEnv` into `server` and
  add `webkitEnvRules(values)` issues in `createFinalSchema`.

The full list is in [Environment variables](#environment-variables). The helpers it is built from are
exported too:

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

---

## Database

Write the schema once with a dialect-neutral column kit, then connect to whichever database `DATABASE_URL`
points at. `postgres://` or `postgresql://` selects PostgreSQL, `mysql://` selects MySQL, anything else
(`file:`, `libsql://`, `:memory:`) selects SQLite. Local `file:` databases are switched to WAL mode with a
5-second busy timeout on connect.

`isUniqueViolation(error)` tells a unique-constraint failure apart from other errors on all three dialects;
`createRateLimiter({ db, table: schema.webkitRateLimits })` gives `consume(key, { max, windowSeconds })` and
`reset(key)` on a shared table.

### Schema

`defineTables` takes a factory that receives the kit `t` and returns your tables. It returns
`schemaFor(dialect)`, which builds (and caches) the tables for one dialect, **with the webkit's own tables
added**: `mlwebkit__tenants`, `mlwebkit__tenant_domains`, `mlwebkit__users`, `mlwebkit__sessions`,
`mlwebkit__accounts`, `mlwebkit__verifications`, `mlwebkit__settings`, `mlwebkit__outbox`,
`mlwebkit__payment_events` and `mlwebkit__rate_limits` (as `webkitTenants`, `webkitUsers`, … in TypeScript). They are generated and
migrated with the app's tables; you never declare them.

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
import { defineTables, dialectFor } from "@mlabshq/nextjs-webkit/db";

export const schemaFor = defineTables((t) => ({
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
// drizzle-kit reads tables from top-level exports, so export every table (webkit ones included).
export const { webkitTenants, webkitTenantDomains, webkitUsers, webkitSessions, webkitAccounts,
  webkitVerifications, webkitSettings, webkitOutbox, webkitPaymentEvents, patients } = schema;
```

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
    env,
    drivers: [sqliteDriver, postgresDriver], // only the drivers this app ships
    schemaFor,
  });

// One connection per process, surviving dev hot reloads.
const g = globalThis as unknown as { __db?: ReturnType<typeof connect> };
const connection = g.__db ?? connect();
if (env.NODE_ENV !== "production") g.__db = connection;

/** The connection the webkit's services take (`createAuth`, `outboxCapture`). */
export const database = connection;
export const { db, dialect, driver } = connection;
export type Db = Database<typeof schema>;
```

| Option | Default |
| --- | --- |
| `url` | `DATABASE_URL`, then `NETLIFY_DATABASE_URL`, `POSTGRES_URL`, then `file:./.data/app.db` |
| `authToken` | `DATABASE_AUTH_TOKEN` (Turso only) |
| `poolMax` | `DATABASE_POOL_MAX`, then 10 (PostgreSQL and MySQL) |

The URL picks the dialect, and `createDatabase` throws if you did not pass that dialect's driver. The SQLite
driver creates the folder of a `file:` database, so a fresh clone runs without setup.

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
**multi-tenant** (one deployment, tenants in `mlwebkit__tenants`, resolved from the request host). Tenant-owned
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

Look up `slug` in `mlwebkit__tenants.slug`, or a custom `host` in `mlwebkit__tenant_domains.host` (only once
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
multi-tenant deployment. `PLATFORM_SCOPE` (`"platform"`) is the `mlwebkit__settings.tenant_id` for platform-wide
defaults and locks.

---

## Auth

`createAuth` gives the app one auth interface whichever provider `AUTH_DRIVER` selects. User ids are always
local `mlwebkit__users` ids, so the rest of the app (memberships, audit logs, "created by" columns) does not
change when the provider does.

| `AUTH_DRIVER` | Import | Sign-in | Notes |
| --- | --- | --- | --- |
| `better-auth` | `betterAuthProvider` from `/auth/better-auth` | `password`: the app renders its own pages | Users, sessions and passwords in your database |
| `clerk` | `clerkProvider` from `/auth/clerk` | `hosted`: Clerk's components | Clerk owns passwords and sessions; users are linked to `mlwebkit__users` by email on first sign-in |

```ts
// src/server/auth.ts
import "server-only";
import { createAuth } from "@mlabshq/nextjs-webkit/auth";
import { betterAuthProvider } from "@mlabshq/nextjs-webkit/auth/better-auth";
import { clerkProvider } from "@mlabshq/nextjs-webkit/auth/clerk";
import { env } from "@/env";
import { database } from "./db";
import { mailer } from "./mail";

export const auth = createAuth({
  env,
  database,
  providers: [
    betterAuthProvider({ mailer }), // set-password emails use a default template
    clerkProvider(),
  ],
});
```

```ts
// src/app/api/auth/[...all]/route.ts (Better Auth's endpoints; Clerk needs none and returns 404)
import { auth } from "@/server/auth";

export const { GET, POST } = auth.handler;
```

Using it (every method reads the current request's headers itself):

```ts
const session = await auth.getSession();       // { user: { id, email, name }, createdAt? } | null
await auth.signOut();

// Invitations and seeding work the same with either provider:
const userId = await auth.createUser({ email, name, password });   // password optional
await auth.inviteUser({ email, name });                             // link lands on /reset-password or /sign-up
await auth.inviteUser({ email, name, baseURL: "https://acme.app.test" }); // …on a tenant's own host
await auth.revokeAllSessions(userId);

// Email and password flows, when auth.signInMode === "password":
await auth.password.signIn({ email, password });
await auth.password.requestReset({ email, redirectTo: `${auth.baseURL}/reset-password` });
await auth.password.reset({ token, password });
```

Expected failures (wrong password, expired link, a password flow on Clerk) throw `AuthError`, which extends
`ActionError`, so its message is safe to show and the action builder returns it as a normal error result.
Sessions older than `AUTH_ABSOLUTE_TIMEOUT_HOURS` count as signed out (for providers that report when a
session started). `baseURL` defaults to `APP_URL`, then the host platform's URL.

### Better Auth settings

Read from env; pass the option to `betterAuthProvider` to override.

| Variable | Option | Meaning |
| --- | --- | --- |
| `AUTH_SECRET` | `secret` | Signs sessions. Required in production |
| `AUTH_SIGN_UP` [invite-only] | `signUp` | `invite-only` disables public sign-up (use `createUser` / `inviteUser`); `open` and `open-with-approval` allow it |
| `AUTH_SESSION_STRATEGY` [database] | `session.strategy` | `database` checks the session row every request; `cookie-cache` also caches it in a signed cookie for `AUTH_COOKIE_CACHE_MINUTES` [5], faster but sign-out on other devices lags by up to that long |
| `AUTH_IDLE_TIMEOUT_MINUTES` [30] | `session.idleMinutes` | Sessions slide forward on activity and expire after this long idle |
| `AUTH_LOCKOUT_ATTEMPTS` [5], `AUTH_LOCKOUT_MINUTES` [15] | `lockout` | Rate limit on password sign-in and reset requests: per email (`attempts` per window; a successful sign-in clears it) and per client IP (`attempts × 10`, since offices share IPs). Stored in `mlwebkit__rate_limits`, so it holds for `auth.password.*` calls from server actions and across instances. Over the limit: `AuthError("Too many attempts. Try again in N minutes.", "rejected")` |
| `TRUST_PROXY` [false] | | Use the first `x-forwarded-for` entry as the client IP (only behind a proxy you control); otherwise the last entry, then `x-real-ip` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `google` | Google sign-in, when both are set (and `AUTH_METHODS` is empty or includes `google`) |
| `BRAND_NAME` | `appName` | Shown in emails |
| `TENANCY_MODE=multi` + `TENANCY_*` | `trustedOrigins` | The platform host and every tenant subdomain are trusted origins |
| | `mailer` | Sends password-reset and invitation emails with a default template |
| | `sendResetPassword` | Your own email instead of the default template |
| | `extend` | Any other Better Auth options (plugins, hooks), merged last. `nextCookies()` is always added |

Passwords need at least 8 characters, and resetting a password signs the user out everywhere.

### Clerk

`clerkProvider()` needs `@clerk/nextjs` installed, and Clerk reads `CLERK_SECRET_KEY` and
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` itself (for development without a Clerk account,
`npx clerk@latest init` writes temporary keys). The driver loads Clerk's SDK only when it is used, so
Better Auth deployments and scripts never load it. Add Clerk's own pieces to the app, switched on by
`AUTH_DRIVER` so the same build supports both providers:

```ts
// src/proxy.ts
import { clerkMiddleware } from "@clerk/nextjs/server";
import { type NextFetchEvent, type NextRequest, NextResponse } from "next/server";

const clerk = clerkMiddleware();
export default function proxy(request: NextRequest, event: NextFetchEvent) {
  return process.env.AUTH_DRIVER === "clerk" ? clerk(request, event) : NextResponse.next();
}
export const config = { matcher: ["/((?!_next|.*\\..*).*)", "/(api|trpc)(.*)"] };
```

```tsx
// app/layout.tsx: inside <body>
{env.AUTH_DRIVER === "clerk" ? <ClerkProvider signInUrl="/sign-in" signUpUrl="/sign-up">{children}</ClerkProvider> : children}

// app/sign-in/page.tsx: when auth.signInMode === "hosted"
<SignIn routing="hash" signUpUrl="/sign-up" forceRedirectUrl={next} />

// app/sign-up/page.tsx: invitations land here
<SignUp routing="hash" signInUrl="/sign-in" />
```

On a user's first sign-in the driver links their Clerk account to the `mlwebkit__users` row with the same
email (creating it if needed), so people invited with `auth.inviteUser` keep the id their memberships use.
Set sign-up to "Restricted" in the Clerk dashboard so only invited people can join. Clerk sessions do not
report `createdAt`; set the maximum session lifetime in the Clerk dashboard. `auth.password` methods throw
`AuthError` with code `unsupported`.

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

`resolveSetting` decides the effective value. Load the relevant `mlwebkit__settings` rows yourself (platform row,
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

| `STORAGE_DRIVER` | Private files | Import | Use for |
| --- | --- | --- | --- |
| `local` (default) | yes | built in | local development, demos, on-site servers with a persistent disk |
| `s3` | yes | `s3` from `/storage/s3` | AWS S3, Cloudflare R2, DigitalOcean Spaces, MinIO |
| `cloudinary` | no | built in | public images (logos, photos) |

```ts
// src/server/storage.ts
import "server-only";
import { createStorage } from "@mlabshq/nextjs-webkit/storage";
import { s3 } from "@mlabshq/nextjs-webkit/storage/s3";
import { env } from "@/env";

export const storage = createStorage({ env, providers: [s3] });
```

| Provider | Variables |
| --- | --- |
| all | `STORAGE_SIGNED_URL_MINUTES` (5) |
| `local` | `STORAGE_LOCAL_DIR` (`./.data/uploads`), `STORAGE_LOCAL_BASE_URL` (`/api/files`), `STORAGE_SECRET` (falls back to `AUTH_SECRET`; required in production) |
| `s3` | `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, optional `S3_ENDPOINT` (R2, Spaces, MinIO) and `S3_PUBLIC_URL` (CDN or bucket domain) |
| `cloudinary` | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, optional `CLOUDINARY_FOLDER` |

Options `local`, `signedUrlSeconds` and `demo` override the variables.

Local files are served with `X-Content-Type-Options: nosniff` and `Content-Security-Policy: default-src 'none';
sandbox`; anything other than a PNG, JPEG, WebP or GIF image is sent as `Content-Disposition: attachment`.

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

const link = await storage.url(stored.key, "private"); // signed, expires after the signed URL lifetime
const bytes = await storage.read(stored.key);
await storage.remove(stored.key);
```

`objectKey` builds `<prefix>/<tenant>/<folder>/<id>-<safe-name>`. Putting a private file on a store that
cannot hold one (Cloudinary) throws.

Local files are served by a route at the local base URL, which checks the signature of private files:

```ts
// src/app/api/files/[...key]/route.ts
import { storage } from "@/server/storage";

export async function GET(request: Request, { params }: RouteContext<"/api/files/[...key]">) {
  const { key } = await params;
  return storage.serve(request, key.join("/")); // 404 when the store is not local
}
```

Do not use local storage on hosts with an ephemeral disk (Heroku, Netlify, Vercel).

---

## Email

```ts
// src/server/mail.ts
import { createMailer, outboxCapture } from "@mlabshq/nextjs-webkit/email";
import { smtp } from "@mlabshq/nextjs-webkit/email/smtp";
import { env } from "@/env";
import { database } from "./db";

export const mailer = createMailer({
  env,
  providers: [smtp],
  capture: outboxCapture(database), // optional: dev and demo mail lands in mlwebkit__outbox
});

await mailer.send({ to: "ada@example.com", subject: "Welcome", html: "<p>Hi</p>", text: "Hi" });
```

| `EMAIL_DRIVER` | Import | Variables |
| --- | --- | --- |
| `dev` (default) | built in | none. Never sends: logs the message and passes it to `capture` |
| `resend` | built in | `RESEND_API_KEY` |
| `smtp` | `smtp` from `/email/smtp` | `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_SECURE` (false), `SMTP_USER`, `SMTP_PASSWORD` |

`EMAIL_FROM` and `EMAIL_REPLY_TO` are the default sender and reply-to (options `from` and `replyTo` override
them; `EMAIL_FROM` is required in production for real providers). With `EMAIL_DRIVER=dev` and `SMTP_HOST` set,
mail goes to that SMTP server instead, which suits a local Mailpit (`SMTP_HOST=localhost`, `SMTP_PORT=1025`).

Escape user input in HTML bodies with `escapeHtml(value)`. Rendering templates (for example with React
Email) is up to the app; pass the resulting `html` and `text`.

---

## SMS

```ts
import { createSms } from "@mlabshq/nextjs-webkit/sms";

export const sms = createSms({ env });

if (sms.enabled) await sms.send({ to: "0803 123 4567", text: "Your code is 123456" });
await sms.send({ to: "+2348031234567", text: "Hello", channel: "whatsapp" }); // Termii WhatsApp channel
```

| `SMS_DRIVER` | Variables |
| --- | --- |
| `off` (default) | none. `send` returns `null` |
| `dev` | none. Logs and passes the message to `capture` |
| `termii` | `TERMII_API_KEY` |

`SMS_SENDER_ID` is the sender (option `sender`). Numbers are normalised to E.164 with `toE164(raw, country)`,
where `SMS_COUNTRY_CODE` (default `234`) replaces a leading `0`; an invalid number throws.

---

## Captcha

Server-side verification for Cloudflare Turnstile and hCaptcha.

```ts
import { createCaptcha } from "@mlabshq/nextjs-webkit/captcha";

export const captcha = createCaptcha({ env });

// In a server action:
if (!(await captcha.verifyForm(formData, ip))) throw new ActionError("Please complete the captcha.");
```

| `CAPTCHA_DRIVER` | Variables |
| --- | --- |
| `off` (default) | none. Every check passes |
| `turnstile` | `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` |
| `hcaptcha` | `HCAPTCHA_SITE_KEY`, `HCAPTCHA_SECRET_KEY` |

Render the widget with `<CaptchaWidget provider={captcha.provider} siteKey={captcha.siteKey} />` from
[`/client`](#client) inside the form. It posts its token in `captcha.tokenField`, which `verifyForm` reads;
`verify(token, ip)` checks a token you already have.

Missing keys fall back to the provider's published always-pass test keys (`TEST_KEYS`) outside production,
so local development needs no account. **In production, missing keys make every check fail** (and log why),
so a misconfigured deployment never accepts bots silently.

---

## Payments

A provider interface with Paystack and a demo provider. Several providers can be enabled at once and the app
picks one per payment.

```ts
import { createPayments } from "@mlabshq/nextjs-webkit/payments";

export const payments = createPayments({ env });
// PAYMENTS_PROVIDERS=paystack  (comma-separated; each provider reads its own keys)
```

| Provider | Variables |
| --- | --- |
| `paystack` | `PAYSTACK_SECRET_KEY` |
| `demo` | enabled automatically, and alone, in demo mode. Redirects to `demoCheckoutPath` (default `/demo/checkout`) and always succeeds |

`payments.enabled`, `payments.providers` (enabled ids) and `payments.default` (the first one) describe what is
on; `payments.get(id)` returns a provider and throws for one that is not enabled.

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

Webhooks: verify the signature, then record the event in `mlwebkit__payment_events`, whose unique key
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
    await db.insert(webkitPaymentEvents).values({ id: newId(), provider, eventId: event.id, type: event.type, payload: event.raw });
  } catch {
    return new Response("Already processed", { status: 200 });
  }

  if (event.type === "charge.success" && event.payment) await settle(event.payment.reference);
  return new Response("OK");
}
```

Point the Paystack dashboard's webhook URL at `/api/payments/paystack`. Refunds:
`await provider.refund?.(reference, amountMinor)` (omit the amount for a full refund).

---

## Errors

Report unexpected errors with a short reference code the user can quote to support, with sensitive fields
scrubbed.

```ts
import { createErrorReporter } from "@mlabshq/nextjs-webkit/errors";
import { sentry } from "@mlabshq/nextjs-webkit/errors/sentry";

export const errors = createErrorReporter({ env, providers: [sentry] });
// ERRORS_DRIVER=console (default) | sentry (needs SENTRY_DSN)

const ref = errors.capture(error, { userId, tenantId, action: "billing.refund", tags: { branch }, extra: { input } });
// ref: e.g. "3FA9C21B"
```

Reporting never throws: if the selected provider is misconfigured, the reporter logs why once and falls back
to the console.

Values in `extra` whose key contains a sensitive word (`password`, `token`, `secret`, `authorization`,
`cookie`, `email`, `phone`, `address`, `dateOfBirth`, clinical note fields…) are replaced with
`"[scrubbed]"`. Pass your own list as `scrub`; `DEFAULT_SCRUB` is exported to extend.

The Sentry provider only reports; initialise Sentry yourself in `instrumentation.ts`:

```ts
export async function register() {
  if (process.env.ERRORS_DRIVER !== "sentry" || !process.env.SENTRY_DSN) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.1 });
}
```

Keep Node.js-only startup code (database, seeding) in a separate file imported directly inside
`if (process.env.NEXT_RUNTIME === "nodejs") { … }` in `register()`, so the Edge build does not bundle it.

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
  `prefix.*`) while `enabled` is true. With `DEMO_MODE=true`, email, SMS, storage and payments switch to
  their dev or demo providers on their own, so nothing leaves the server.
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

`memoryDatabase` needs `@libsql/client` and `drizzle-kit` installed.

To test code that uses services, pass a driver object instead of a provider name
(`createMailer({ driver: { name: "fake", send } })`) or an `env` object that selects what you want
(`createSms({ env: { SMS_DRIVER: "dev" }, capture })`). Drivers that call HTTP APIs (`resendDriver`,
`termiiDriver`, `paystackProvider`, `cloudinaryStorageDriver`) take an optional `fetch` as their last
argument, and `createCaptcha` takes a `fetcher` option, so tests can pass a fake.

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

## Environment variables

`createWebkitEnv` declares and validates all of these. Each `create*` function reads them from `process.env`,
with its `env` option layered on top. Defaults are in brackets.

| Module | Selects provider | Provider settings |
| --- | --- | --- |
| Database | `DATABASE_URL` scheme [`file:./.data/app.db`], also `NETLIFY_DATABASE_URL`, `POSTGRES_URL` | `DATABASE_AUTH_TOKEN`, `DATABASE_POOL_MAX` [10] |
| Tenancy | `TENANCY_MODE` [single] | `TENANCY_ROOT_DOMAIN`, `TENANCY_PLATFORM_HOST` (required in multi) |
| Auth | `AUTH_DRIVER` [better-auth] | `AUTH_SECRET`, `AUTH_SIGN_UP`, `AUTH_METHODS`, `AUTH_SESSION_STRATEGY`, `AUTH_COOKIE_CACHE_MINUTES` [5], `AUTH_IDLE_TIMEOUT_MINUTES` [30], `AUTH_ABSOLUTE_TIMEOUT_HOURS` [12], `AUTH_LOCKOUT_ATTEMPTS` [5], `AUTH_LOCKOUT_MINUTES` [15], `GOOGLE_*`; Clerk: `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` |
| Storage | `STORAGE_DRIVER` [local] | `STORAGE_SIGNED_URL_MINUTES` [5], `STORAGE_MAX_UPLOAD_MB` [20], `STORAGE_LOCAL_DIR`, `STORAGE_LOCAL_BASE_URL`, `STORAGE_SECRET` / `AUTH_SECRET`, `S3_*`, `CLOUDINARY_*` |
| Email | `EMAIL_DRIVER` [dev] | `EMAIL_FROM`, `EMAIL_REPLY_TO`, `RESEND_API_KEY`, `SMTP_HOST`, `SMTP_PORT` [587], `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` |
| SMS | `SMS_DRIVER` [off] | `SMS_SENDER_ID`, `SMS_COUNTRY_CODE` [234], `TERMII_API_KEY` |
| Captcha | `CAPTCHA_DRIVER` [off] | `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `HCAPTCHA_SITE_KEY`, `HCAPTCHA_SECRET_KEY` |
| Payments | `PAYMENTS_PROVIDERS` [none] | `PAYSTACK_SECRET_KEY` |
| Errors | `ERRORS_DRIVER` [console] | `SENTRY_DSN` |
| Demo mode | `DEMO_MODE` [false], `DEMO_STRATEGY` [shared-reset] | switches email, SMS, storage and payments to their dev or demo providers |
| Branding | | `BRAND_*`, `ORG_*` (see [Branding](#branding)) |
| General | | `NODE_ENV`, `APP_URL` |

Other variables the package reads:

| Variable | Read by |
| --- | --- |
| `NODE_ENV` | `requiredInProduction()`, and production checks (captcha test keys, storage secret, `EMAIL_FROM`) |
| `TK_DIALECT` | `dialectFor()`, to force a dialect (drizzle-kit configs) |
| `APP_URL`, `URL`, `VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_URL`, `HEROKU_APP_NAME` | `platformUrl()` |
| `BRAND_*`, `ORG_*` | `brandingFromEnv(env, …)`, from the object you pass |
| `SETTING_*` | `resolveSetting({ env, … })`, from the object you pass |

## Production checklist

- The Better Auth `secret` and `STORAGE_SECRET` (or `AUTH_SECRET`) are long random values (at least 32
  characters), kept out of the repository.
- Captcha has real site and secret keys; without them every check fails in production.
- `STORAGE_DRIVER` is not `local` on hosts with an ephemeral disk.
- Migrations for the selected dialect run before the new build serves traffic.
- `DEMO_MODE` is off, unless this deployment is the public demo.
- Paystack webhooks point at your webhook route, and payments are checked against the expected amount.
- `ERRORS_DRIVER=sentry` with `SENTRY_DSN` set, rather than the console.
- With Clerk: `clerkMiddleware()` runs in `proxy.ts`, and the session lifetime is set in the Clerk dashboard.

## Not included yet

Africa's Talking and Twilio drivers, background jobs, live updates (polling/SSE), per-visitor demo
sandboxes, PostgreSQL row-level security, direct browser-to-store uploads and a CLI. Until then, apps build
these themselves on the interfaces above; any provider can be added as a [custom
provider](#providers-from-configuration).

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
