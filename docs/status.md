# v0.1 status

## Implemented (`src/`)

| Entry | What it provides |
| --- | --- |
| `@mayrlabs/nextjs-webkit` | `toolkitTables(t)`: tenants, domains, Better Auth tables, settings, outbox, payment events |
| `/env` | zod helpers for `@t3-oss/env-nextjs`: required-in-production, lists, booleans, cross-field rules, platform URL |
| `/db`, `/db/sqlite`, `/db/postgres`, `/db/mysql` | Dialect-neutral column kit, `defineTables`, `createDatabase` with shipped drivers, migrators, UUIDv7 ids, `ilike`, `paginate` |
| `/tenancy` | Host matching (platform / subdomain / custom domain), `scopedDb` (tenant-filtered reads, updates, deletes and stamped inserts) |
| `/auth`, `/auth/better-auth` | `definePermissions` (exact, `prefix.*`, `*`), `createBetterAuth` on the app's DB with sign-up modes, session strategies, idle timeout, lockout, Google; `createUserWithPassword`, `revokeAllSessions` |
| `/settings` | `defineSettings`, env names, env parsing, single/multi-tenant resolution with sources and read-only flags, `.env.example` generation |
| `/features` | Feature registry with dependencies and editions, `+a,-b` overrides, Ed25519 licence signing and verification |
| `/branding` | Branding from env or stored values, colour normalising, contrast-aware text colours, CSS variables |
| `/storage`, `/storage/local`, `/storage/s3`, `/storage/cloudinary` | Server-side put/read/remove/url with public and private files; local disk with signed URLs and a route helper |
| `/email`, `/email/smtp` | Dev (captured), Resend (HTTP API), SMTP (nodemailer) |
| `/sms` | Dev (captured), Termii; E.164 normalising |
| `/captcha` | Turnstile and hCaptcha verification with test keys |
| `/payments`, `/payments/paystack` | Provider registry, Paystack initialise/verify/webhook/refund, demo provider |
| `/errors`, `/errors/sentry` | Error reporter with reference codes and PII scrubbing; console and Sentry drivers |
| `/actions` | Server-action builder: zod input, guards, demo hook, typed results, error capture, FormData parsing |
| `/demo` | Demo guard, relative dates, seeded random |
| `/testing` | In-memory SQLite from a schema (drizzle-kit API), tenant-leak assertion |
| `/client` | Public-config provider and captcha widget (`"use client"`) |

40 unit tests (`pnpm test`). Types are emitted with `tsc` into `dist/types`.

## Not yet

Clerk driver, per-visitor demo sandboxes, Server-Sent Events, Africa's Talking/Twilio, the `mlabs` CLI and
deploy templates (they live in the app for now), PostgreSQL RLS generation, DB-backed jobs, direct-to-store
browser uploads, `@mayrlabs/tsconfig` and `@mayrlabs/biome-config`.

## Publishing

```bash
pnpm build && pnpm test
npm publish --access public   # or private, see decisions.md D1
```

Then in each app replace the `file:` dependency with the published version.
