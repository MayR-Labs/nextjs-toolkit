# Changelog

## Unreleased

- SQLite (local files): writes and new transactions wait asynchronously while another transaction is open, instead of blocking the whole Node process for the busy timeout.

### Added

- **Sign-in rate limiting that applies to server actions.** Better Auth only applies its rate limits in its
  HTTP router, not to `auth.api.*` calls, so `password.signIn` and `password.requestReset` now count attempts
  per email (`AUTH_LOCKOUT_ATTEMPTS` per `AUTH_LOCKOUT_MINUTES`) and per client IP (ten times that) in a new
  `mlwebkit__rate_limits` table, and throw `AuthError("Too many attempts. Try again in N minutes.")`. A
  successful sign-in clears the email's counter. `TRUST_PROXY` decides which `x-forwarded-for` entry is the IP.
- `createRateLimiter` and `isUniqueViolation` (`/db`).
- Index on `mlwebkit__verifications.identifier`.

### Changed

- SQLite: local `file:` databases use WAL mode and a 5-second busy timeout.
- Local storage serves files with `Content-Security-Policy: default-src 'none'; sandbox` and as attachments
  unless they are PNG, JPEG, WebP or GIF images.
- Clerk links a Clerk user to an existing local user by email only when Clerk has verified that address;
  otherwise the Clerk user gets a separate local user.

## 0.2.0

### Added

- **Providers from configuration.** `createMailer`, `createSms`, `createStorage`, `createPayments`,
  `createCaptcha`, `createErrorReporter`, `createAuth` and `createDatabase` pick their provider from env
  (`EMAIL_DRIVER`, `SMS_DRIVER`, `STORAGE_DRIVER`, `PAYMENTS_PROVIDERS`, `CAPTCHA_DRIVER`, `ERRORS_DRIVER`,
  `AUTH_DRIVER`, `DATABASE_URL`) and read that provider's own variables. Providers are created on first use
  and name the missing variable when misconfigured. Demo mode switches email, SMS, storage and payments to
  their dev or demo providers.
- **Clerk** (`/auth/clerk`): `clerkProvider`, linking Clerk users to `mlwebkit__users` by email on first sign-in. Clerk's SDK loads only when
  the provider is used.
- **`createAuth`** (`/auth`): one interface for Better Auth and Clerk (`getSession`, `signOut`, `createUser`,
  `inviteUser`, `revokeAllSessions`, `password.*`, `handler`), and `AuthError`.
- `storage.serve(request, key)` for the local files route; `captcha.verifyForm(form)` and `captcha.tokenField`.
- The SQLite driver creates the folder of a `file:` database.
- **`createWebkitEnv`** and `webkitEnv` / `webkitEnvRules` (`/env`): every variable the webkit reads, with
  defaults and cross-field rules, so apps declare only their own variables (and can override any).
- **Tables are handled by the package**: `defineTables` adds the webkit's tables to every schema, and
  `createDatabase` returns the built `schema` so services find their tables.
- Better Auth reads its settings from env (`AUTH_*`, `GOOGLE_*`, `BRAND_NAME`, `TENANCY_*`) and sends
  set-password emails through a `mailer` with a default template.
- `outboxCapture(database, tenantId?)` stores dev and demo email and SMS in `mlwebkit__outbox`.
- `auth.inviteUser` defaults its link to `/reset-password` (Better Auth) or `/sign-up` (Clerk), optionally on
  a tenant's `baseURL`; `createAuth` enforces `AUTH_ABSOLUTE_TIMEOUT_HOURS`.

### Changed (breaking)

- The webkit's tables are prefixed `mlwebkit__` (were `tk_`), and their TypeScript names are `webkitUsers`,
  `webkitTenants`, … (were `tkUsers`, …); `toolkitTables` is now `webkitTables` and no longer needs spreading
  into the schema. Existing databases need a migration that renames the tables.
- `createAuth` takes `database` (the `createDatabase` connection); `betterAuthProvider(options?)` and
  `clerkProvider()` no longer take `db`/`dialect`/`tables`.
- Renamed the package to `@mlabshq/nextjs-webkit` (was `@mayrlabs/nextjs-toolkit`) and moved it to the
  repository root.
- Added a `prepare` script so installs from GitHub build `dist/`.
- `scopedDb().insert()` and `update()` now accept the table's own columns (including `id`); previously any
  explicit `id` was rejected by the types.
- `createMailer`, `createSms`, `createStorage`, `createPayments`, `createCaptcha` and `createErrorReporter`
  take a single options object. Pass `driver: <driver object>` for the old explicit behaviour.
- Captcha no longer falls back to always-pass test keys in production; missing keys make every check fail.
- Storage, mailer and SMS methods always return promises, so configuration errors reject instead of throwing.

## 0.1.0

First version: env helpers, dialect-neutral Drizzle schema kit with SQLite, PostgreSQL and MySQL drivers,
tenancy, Better Auth, permissions, settings, features and signed licences, branding, storage (local, S3,
Cloudinary), email (dev, Resend, SMTP), SMS (dev, Termii), captcha (Turnstile, hCaptcha), payments
(Paystack, demo), error reporting (console, Sentry), server-action builder, demo helpers, test utilities
and client components.
