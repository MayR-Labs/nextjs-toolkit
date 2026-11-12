# Modules

Each section: the interface the app sees, the providers, and what to watch for.
"Demo" says how the module behaves when demo mode is on (detail in [demo-mode.md](demo-mode.md)).

---

## Auth

Providers: **Better Auth** (self-hosted: the app's own database holds users, passwords and sessions) and
**Clerk** (hosted). Plus a `demo` driver.

**Why there is no separate hand-written "Internal" provider.** The original idea was an Internal provider where
the app manages its own passwords and sessions. Better Auth *is* that: an open-source TypeScript library that
runs inside the app, stores everything in the app's database through its Drizzle adapter (Postgres, MySQL,
SQLite), and already has email + password, email verification, password reset, rate limiting, 2FA (TOTP and
backup codes), passkeys, magic links, email OTP, social sign-in, an admin plugin (create users, ban, revoke
sessions, impersonate) and a JWT plugin. Writing our own would rebuild that, with our own security bugs. So
"Internal" in the toolkit means the Better Auth driver; nothing leaves the deployment and there is no
third-party bill. If Better Auth ever becomes a problem, the local users table (below) means a hand-written
driver can replace it without touching app data.

```ts
interface AuthApi {
  getSession(): Promise<Session | null>;          // cached per request
  requireUser(opts?: { permission?: string }): Promise<AppUser>;  // redirects / throws 401/403
  signOut(): Promise<void>;
  routes: RouteHandlers;                          // mounted under /api/toolkit/auth
  components: { SignIn, SignUp, UserButton };     // provider-native where they exist
}
interface Session { userId: string; externalId: string; provider: string; expiresAt: Date }
```

**The local users table is always the source of truth for the app.** Whatever the provider, the toolkit keeps a
`users` row keyed by `(provider, external_id)`; roles, branch membership, staff profiles and audit logs point at
`users.id`. That is what lets a hospital move from Clerk to Better Auth (or the reverse) without touching clinical
data, and it is how Fera already works (`admins` table + Clerk). With Better Auth, its user model *is* `tk_users`
(mapped by table name, with our extra columns); with Clerk, a `tk_users` row is created on first sign-in.

| Provider | Who stores passwords | Notes |
| --- | --- | --- |
| Better Auth | The app's DB | Default. Tables `tk_users`, `tk_sessions`, `tk_accounts`, `tk_verifications` in the app's schema, all three dialects. Email goes through the toolkit mail module, captcha through the captcha module. |
| Clerk | Clerk | Hosted UI, invitations, MFA out of the box. Cost per monthly user; user data leaves the deployment. Keyless mode locally. |

**Configurable variants** (all built; set in `toolkit.config.ts`, some overridable by the app's settings at runtime):

| Option | Values | Default |
| --- | --- | --- |
| `signUp` | `invite-only` · `open` · `open-with-approval` | `invite-only` |
| `methods` | any of `password`, `magic-link`, `email-otp`, `passkey`, `google` (and other social providers) | `password` |
| `twoFactor` | `off` · `optional` · `required` · `required-for-roles` | `optional` |
| `session.strategy` | `database` (revocable, checked every request) · `cookie-cache` (signed cookie checked first, DB re-checked every N minutes) | `database` |
| `session.idleTimeout` / `absoluteTimeout` | durations, per role | 30 min / 12 h |
| `lockout` | attempts + cooldown | 5 / 15 min |

`database` is the default because staff systems need "sign this person out everywhere now" and short idle
timeouts on shared computers. `cookie-cache` exists for apps where speed matters more than instant revocation.

- Sign-in, reset and invitation forms go through captcha and the rate limiter.
- Unstyled `SignIn`, `ResetPassword`, `AcceptInvite`, `TwoFactor` components ship with the toolkit for the
  Better Auth driver (Clerk brings its own).

**Permissions are not the auth module's job.** Auth answers "who is this"; the app defines roles and
permissions. The toolkit provides a small typed helper (`definePermissions({ "patient.read": [...roles] })`)
and `requireUser({ permission })` calls it.

Demo: a role switcher ("Sign in as Doctor / Nurse / Pharmacist / Cashier / Admin") replaces the sign-in form;
no passwords.

---

## Database

Drizzle ORM. Dialects: **SQLite** (libSQL client: local files, Turso), **PostgreSQL** (`postgres` driver; Neon,
Netlify DB, RDS, self-hosted), **MySQL** (`mysql2`; PlanetScale, shared/cPanel hosting, self-hosted).

Selection: the `DATABASE_URL` scheme (`file:`/`libsql:` → SQLite, `postgres://` → Postgres, `mysql://` → MySQL),
as Fera already does with `dialectFor()`.

**The hard part is the schema.** Drizzle table builders are dialect-specific (`sqliteTable`, `pgTable`,
`mysqlTable`). Fera writes every table twice and has a compile-time parity check (`schema/parity.ts`). With three
dialects that becomes triple maintenance, so the toolkit adds a thin **dialect-neutral schema layer**:

```ts
// src/server/db/tables.ts (in the app) — written once
import { defineTables } from "@mayrlabs/nextjs-toolkit/db/schema";

export const tables = defineTables((t) => ({
  patients: t.table("patients", {
    id: t.id(),                         // text ULID/UUIDv7, generated in the app
    hospitalNumber: t.text("hospital_number").notNull().unique(),
    dateOfBirth: t.date("date_of_birth"),
    balanceKobo: t.money("balance_kobo").notNull().default(0),   // integer minor units
    meta: t.json<PatientMeta>("meta"),
    createdAt: t.createdAt(),
    updatedAt: t.updatedAt(),
  }),
}));
```

`defineTables` runs the same factory against each dialect's builders, producing three real Drizzle schemas
(`tables.pg`, `tables.sqlite`, `tables.mysql`) for drizzle-kit, plus one canonical type for app code. The parity
check moves into the toolkit and runs in CI. If a table genuinely needs a dialect-specific feature, the factory
receives `t.dialect` and can branch, but that should be rare.

Rules the helpers enforce so queries stay portable:

- **IDs are generated in the app** (UUIDv7 or ULID), never auto-increment. MySQL has no `RETURNING`, so code
  must not depend on `.returning()`; with app-side IDs it never needs to. `db.insertReturning()` is provided for
  convenience and uses `$returningId`/re-select on MySQL.
- **Money is integer minor units** (kobo). No floats, no `numeric` that comes back as a string in one dialect
  and a number in another.
- **Timestamps are stored UTC**; dates without time (`date_of_birth`) are ISO strings.
- **JSON columns** map to `jsonb` / `json` / `text` with the same TypeScript type.
- **Case-insensitive search**: `t.ilike()` helper (Postgres `ILIKE`, others `LOWER() LIKE`). Full-text search is
  out of scope for v1; patient search uses indexed prefix columns.
- **Transactions**: `db.transaction()` works on all three; libSQL in serverless mode needs interactive
  transactions enabled, which the client factory handles.

Migrations: drizzle-kit, one config and one migrations folder per dialect (`drizzle/pg`, `drizzle/sqlite`,
`drizzle/mysql`), all generated by one command (`mlabs db:generate`). `mlabs db:migrate` applies the right folder
for the current `DATABASE_URL`. Seeding is a toolkit runner (`mlabs db:seed [--reset] [--profile demo]`) over
seed modules the app writes.

Toolkit-owned tables (prefixed `tk_`): `tk_users`, `tk_sessions`, `tk_accounts`, `tk_verifications` (Better
Auth's models, mapped to these names), `tk_files`, `tk_rate_limits`, `tk_payment_events` (webhook idempotency),
`tk_mail_outbox` (dev/demo capture), `tk_settings`, `tk_jobs`. The app's schema imports them so drizzle-kit sees one schema.

**MySQL is supported from the start**, alongside SQLite and Postgres, because shared/cPanel hosting that only
offers MySQL is common for Nigerian clients. Nothing prevents it; it only costs care in three places, all
handled inside the toolkit so app code never sees them:

- No `RETURNING` → app-generated IDs + `insertReturning()` shim (above).
- Different upsert syntax (`ON DUPLICATE KEY UPDATE` vs `ON CONFLICT`) → `db.upsert()` helper.
- Stricter index limits (long `text` columns cannot be indexed) → `t.text()` takes a `length`, and indexed
  text columns become `varchar(n)` on MySQL automatically.

Every PR runs the playground test suite against all three dialects in CI, so a query that works on one and
breaks on another fails the build.

Demo: per-visitor SQLite sandbox (see demo-mode.md).

---

## Storage

Providers: **S3** (and S3-compatible: R2, Spaces, MinIO), **Cloudinary**, **Local disk**.

Lifted from Fera's `src/server/storage`, which already has the right shape (browser uploads straight to the
store, then the server confirms):

```ts
interface StorageApi {
  prepareUpload(req: UploadRequest): Promise<UploadTarget>;   // presigned PUT / signed form / local URL
  confirm(receipt: UploadReceipt): Promise<StoredFile>;       // verifies the file exists, records tk_files
  url(file: StoredFile, opts?: { expiresIn?: number }): Promise<string>;  // public or signed GET
  read(key: string): Promise<ReadableStream>;                  // server-side access (e.g. PDF generation)
  put(key: string, body: Buffer | ReadableStream, meta): Promise<StoredFile>;  // server-generated files
  remove(key: string): Promise<void>;
}
```

Additions over Fera's version:

- **Visibility per file: `public` or `private`.** Fera only needed public marketing images. Hospital files (lab
  reports, scans, ID cards) are private: stored without public ACLs and served only through short-lived signed
  URLs after a permission check. `url()` decides.
- **Server-side `put`/`read`** for generated documents (invoices, discharge summaries).
- **Local disk** driver: files under `STORAGE_LOCAL_DIR` (default `./.data/uploads`); uploads and reads go
  through the toolkit route handler with HMAC-signed, expiring URLs. Only for local dev, demo, and
  single-server Docker/on-prem installs (Heroku and Netlify filesystems are ephemeral; `doctor` warns).
- Size and MIME allow-lists per "kind", declared by the app.

Demo: writes go to the sandbox's temp dir and are deleted with it.

---

## Email

Providers: **Resend**, **SMTP** (nodemailer), **Dev** (nodemailer to a local Mailpit if `SMTP_HOST` is set,
otherwise written to `tk_mail_outbox` and logged to the console with a link to `/api/toolkit/dev/mail`).

```ts
interface MailApi {
  send(msg: { to; subject; react?: ReactElement; html?; text?; replyTo?; tags? }): Promise<{ id: string }>;
}
```

- Templates are React Email components in the app; the toolkit renders them once and hands HTML + text to the
  driver. A few shared templates ship with the toolkit (invite, password reset, sign-in alert).
- Sending never blocks the user's request on provider latency for non-critical mail: `send` is awaited for
  auth mail, `queue` (fire-and-forget with `after()` from `next/server`) for notifications.

Demo: always captured to the sandbox outbox and shown in an in-app "Demo inbox" panel. Never sent.

---

## Captcha

Providers: **Cloudflare Turnstile**, **hCaptcha**, `noop` (when the module is omitted, or in tests).

```ts
interface CaptchaApi { verify(token: string, ip?: string): Promise<boolean> }
// client: <Captcha /> from @mayrlabs/nextjs-toolkit/client — renders the configured provider's widget
```

Wired into the action wrapper with `.captcha()`. Local dev uses each provider's published always-pass test keys
by default. Demo: verified as normal on public forms; skipped inside the app.

---

## Payments

An **extensible registry**: several providers can be active, and apps or other packages can register more.
Paystack is the first one built.

```ts
interface PaymentProvider {
  id: "paystack" | string;
  currencies: Currency[];
  initialize(i: { reference; amountMinor; currency; email; metadata; callbackUrl }): Promise<{ redirectUrl; accessCode? }>;
  verify(reference: string): Promise<PaymentResult>;
  parseWebhook(req: Request): Promise<PaymentEvent | null>;   // verifies signature (Paystack: HMAC-SHA512)
  refund?(reference: string, amountMinor?: number): Promise<RefundResult>;
}
```

- **References are created by the app before redirecting**, stored in the app's own table, and the webhook is
  the source of truth for "paid". `verify` is used on the callback page for fast UI feedback only.
- Webhooks land on `/api/toolkit/payments/[provider]`, are de-duplicated through `tk_payment_events`
  (unique on provider + event id), then dispatched to app handlers registered with `payments.on("charge.success", fn)`.
- Amounts are always integer minor units with an explicit currency.
- Later candidates: Flutterwave, Monnify (bank transfer is big for hospital deposits), Stripe for non-NG clients.

Demo: a fake provider that "succeeds" instantly on a demo checkout page. No real keys are configured.

---

## Errors

Providers: **Sentry**, `console` (default locally).

- Uses Next's `instrumentation.ts` and `onRequestError`; the toolkit exports `register()` and `onRequestError`
  for the app to re-export, plus the client init.
- `errors.capture(err, { user, tags })` facade so app code never imports Sentry directly.
- Scrubbing: request bodies and known PII fields are stripped before sending (a must for patient data);
  the app can add field names. Source maps uploaded at build when `SENTRY_AUTH_TOKEN` is set.
- Every error in the action wrapper is captured with the action name and user id, and the user gets a reference
  code they can quote to support.

Demo: captured with a `demo` tag (useful: it shows what prospects break).

---

## Settings

The mechanism behind "build every variant, let configuration choose". Generalises Fera's settings table and
console field registry.

```ts
export const settings = defineSettings({
  "billing.timing": {
    schema: z.enum(["prepaid", "postpaid", "by-payer"]),
    default: "by-payer",
    scope: "branch",                 // deployment | branch | user
    label: "When patients pay",
    help: "Prepaid: pay before each service. Postpaid: settle at the end of the visit or at discharge.",
    lockedBy: "env",                 // optional: an env var can pin it so the admin UI shows it read-only
  },
});

await settings.get("billing.timing", { branchId });   // typed, cached per request
```

- Three layers, most specific wins: **code default → deployment (`toolkit.config` or env) → database
  (admin UI, per branch where the scope allows)**. A deployment can pin a value so the hospital cannot change it.
- The admin settings screen is generated from the registry (grouped, searchable, with help text and an audit
  entry for every change).
- Demo: changes land in the visitor's sandbox, so prospects can try every variant.

## Feature modules and licensing

For apps sold in editions (Fera's healthcare products). The app declares its feature modules; a deployment
enables a subset.

```ts
export const features = defineFeatures({
  wards:    { requires: ["patients"], permissions: ["ward.*"], nav: [...] },
  pharmacy: { requires: ["patients", "inventory"] },
  ...
});
```

- `features.enabled("wards")` is checked in four places by the toolkit, not by hand: the feature's route
  segment layout (`notFound()`), the action wrapper (`.feature("wards")` rejects), navigation and search
  (filtered), and permissions (a disabled feature's permissions are never granted to any role).
- **Where the enabled list comes from** is configurable: `env` (`FEATURES=patients,pharmacy`), or a
  **signed licence** (`LICENCE_KEY`: edition, features, branch/user limits and expiry, signed with Fera's
  private key and verified offline with the public key in the app). The licence option matters for
  client-hosted and on-site installs, where the client can edit env vars.
- The licence check never blocks clinical reading: an expired licence shows a warning and, after a grace
  period, makes the app read-only, never locked.

## Live updates

For queues, boards and dashboards. `useLive(key)` on the client, `live.publish(key)` after a mutation.

| Strategy | How | When |
| --- | --- | --- |
| `polling` (default) | Client refetches every N seconds | Works on every host, including Netlify/Heroku |
| `sse` | Server-Sent Events from a route handler, fan-out in process | Single long-running server (Docker, on-site) |

## Background jobs

A DB-backed queue (`tk_jobs`) with `jobs.enqueue(name, payload, { runAt })`, drained by `after()` on requests and
by a cron route (`/api/toolkit/jobs/tick`) called by the host's scheduler (Netlify scheduled functions, Heroku
Scheduler, a cron container in compose). Enough for reminders, reorder alerts and nightly reports, with no extra
infrastructure. An adapter interface leaves room for Inngest/Trigger.dev later.

## SMS / WhatsApp

Providers: **Termii**, **Africa's Talking**, **Twilio**, and `dev` (captured to the outbox like email).
`sms.send({ to, text, channel: "sms" | "whatsapp" })`. Phone numbers normalised to E.164 with a default
country (`NG`). Demo: captured, never sent.
