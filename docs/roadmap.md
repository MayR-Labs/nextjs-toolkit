# Toolkit roadmap

Built **alongside** Hospital MS, not before it. Each milestone is driven by what the HMS phase needs next, so
nothing is designed in a vacuum. The playground app proves each milestone on **all three databases** and every
provider that can run in CI.

| # | Milestone | Contents | Done when |
| --- | --- | --- | --- |
| T0 | Skeleton | Package build (tsup, ESM, subpath exports, `.d.ts`), playground app (own repo), CI with Postgres + MySQL + MinIO + Mailpit service containers, changesets | `pnpm build` publishes a dry-run tarball; playground boots |
| T1 | Env + config + settings | `defineToolkit`, adapter contract, env composition, `doctor`, `env:example`, settings registry with layered values | Playground fails fast with readable messages for each missing/mismatched key; a setting can be pinned by env and edited per branch |
| T2 | Database | Neutral schema layer, clients for SQLite, Postgres **and MySQL**, `insertReturning`/`upsert`/`ilike` shims, migrate/seed runners, parity test, `tk_` tables, `testing` in-memory db, **tenancy core** (`tenant_id` columns, host resolution, `tenantDb()`, both modes) | Playground CRUD suite passes on all three dialects in both tenancy modes; `twoTenants()` leak suite passes |
| T3 | Auth: Better Auth | Driver on `tk_users`, every variant in modules.md (sign-up modes, methods, 2FA policies, both session strategies, timeouts, lockout), `requireUser`, proxy helper, permission helper, unstyled components | E2E: invite → set password → 2FA → sign in → idle timeout → sign out everywhere, on all three dialects |
| T4 | Action wrapper + errors + features | `action()` builder, rate limiter, Sentry + console drivers, PII scrubbing, feature modules (env + signed licence) | Errors appear in Sentry scrubbed with a reference code; a disabled feature's routes, actions, nav and permissions are all unreachable |
| T5 | Storage | Port Fera's S3/Cloudinary, add local disk, private files + signed URLs, server `put/read` | Contract suite green on local, MinIO (S3) and Cloudinary (manual) |
| T6 | Email, SMS, captcha | Resend, SMTP, dev outbox, React Email; Termii, Africa's Talking, Twilio, dev; Turnstile, hCaptcha | Reset email lands in Mailpit; SMS lands in the dev outbox; captcha blocks scripted posts |
| T7 | Jobs + live updates | DB job queue, cron route, polling and SSE strategies | A reminder job fires on schedule on Docker and Netlify; a queue updates within 5 s with each strategy |
| T8 | Demo mode | Demo drivers, `shared-reset` then `sandbox`, banner, role switcher | Two browsers on the sandbox demo cannot see each other's writes; nothing leaves the box |
| T9 | Payments | Registry, Paystack (init/verify/webhook/refund), idempotency, demo provider | A Paystack test-mode payment marks an invoice paid via webhook exactly once on replay |
| T10 | CLI + deploy templates | `init`, `add`, Dockerfile, compose, Procfile, app.json, netlify.toml, husky | `mlabs init` on a fresh `create-next-app` gives a deployable app on all four targets |
| T11 | Clerk | Driver mapped onto `tk_users` | Same E2E as T3 passes with Clerk |
| T12 | Multi-tenant platform | Platform API, custom domains + verification, encrypted tenant secrets, PostgreSQL RLS generation, tenant export/import | A tenant created through the API is live on its subdomain; RLS blocks a deliberately unscoped query |
| T13 | Adopt in Fera | Replace `fera-nextjs/src/server/{storage,db,auth}` and `env.ts` with the toolkit | Fera's tests pass; net code removed |

Order rationale: Better Auth comes before Clerk because hospital clients will mostly want their data on their
own server, and Clerk is already proven in Fera, so it is mostly glue.
