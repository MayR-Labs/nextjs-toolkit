# Toolkit roadmap

Built **alongside** Hospital MS, not before it. Each milestone is driven by what the HMS phase needs next, so
nothing is designed in a vacuum. The playground app proves each milestone on all supported drivers.

| # | Milestone | Contents | Done when |
| --- | --- | --- | --- |
| T0 | Skeleton | Workspace, package build (tsup, ESM, subpath exports, `.d.ts`), biome/tsconfig packages, playground app, CI, changesets | `pnpm build` publishes a dry-run tarball; playground boots |
| T1 | Env + config | `defineToolkit`, adapter contract, env composition, `doctor`, `env:example` | Playground fails fast with readable messages for each missing/mismatched key |
| T2 | Database | Neutral schema layer, client factory for SQLite + Postgres, migrate/seed runners, parity test, `tk_` tables, `testing` in-memory db | Playground CRUD passes on SQLite and Postgres in CI |
| T3 | Auth: Internal | Users, sessions, scrypt, invites, reset, lockout, `requireUser`, proxy helper, permission helper | E2E: invite → set password → sign in → idle timeout → sign out everywhere |
| T4 | Action wrapper + errors | `action()` builder, rate limiter, Sentry + console drivers, PII scrubbing | Errors in playground appear in Sentry with scrubbed payload and a reference code |
| T5 | Storage | Port Fera's S3/Cloudinary, add local disk, private files + signed URLs, server `put/read` | Contract suite green on local, MinIO (S3) and Cloudinary (manual) |
| T6 | Email + captcha | Resend, SMTP, dev outbox, React Email rendering, Turnstile, hCaptcha | Reset email arrives in Mailpit locally; captcha blocks scripted posts |
| T7 | Demo mode | Template build, per-visitor sandbox, demo drivers, banner, role switcher | Two browsers on the playground demo cannot see each other's writes; nothing leaves the box |
| T8 | Payments | Registry, Paystack (init/verify/webhook/refund), idempotency, demo provider | Paystack test-mode payment marks an invoice paid via webhook exactly once on replay |
| T9 | CLI + deploy templates | `init`, `add`, Dockerfile, compose, Procfile, app.json, netlify.toml, husky | `mlabs init` on a fresh `create-next-app` gives a deployable app on all four targets |
| T10 | Clerk + Better Auth | Both adapters mapped onto `tk_users` | Same E2E as T3 passes with each driver |
| T11 | MySQL | mysql2 client, migrations folder, `RETURNING` shims | Full playground matrix green on MySQL |
| T12 | Adopt in Fera | Replace `fera-nextjs/src/server/{storage,db,auth}` and `env.ts` with the toolkit | Fera's tests pass; net code removed |

Order rationale: Internal auth comes before Clerk/Better Auth because Hospital MS clients will mostly want
their data on their own server; Clerk is already proven in Fera and is mostly glue. MySQL is last because it
has the most portability gaps and the fewest immediate users.
