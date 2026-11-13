# Changelog

## Unreleased

- Renamed the package to `@mlabshq/nextjs-webkit` (was `@mayrlabs/nextjs-toolkit`) and moved it to the
  repository root.
- Added a `prepare` script so installs from GitHub build `dist/`.
- `scopedDb().insert()` and `update()` now accept the table's own columns (including `id`); previously any
  explicit `id` was rejected by the types.

## 0.1.0

First version: env helpers, dialect-neutral Drizzle schema kit with SQLite, PostgreSQL and MySQL drivers,
tenancy, Better Auth, permissions, settings, features and signed licences, branding, storage (local, S3,
Cloudinary), email (dev, Resend, SMTP), SMS (dev, Termii), captcha (Turnstile, hCaptcha), payments
(Paystack, demo), error reporting (console, Sentry), server-action builder, demo helpers, test utilities
and client components.
