# Tooling and deployment

## Shared developer tooling

This repo publishes one package. The shared Biome and TypeScript configs, if they become packages, live in their
own repos; the CLI writes the per-repo glue.

| Concern | Choice | Shipped as |
| --- | --- | --- |
| Lint + format | Biome (already used in Fera, pinned 2.x) | `@mayrlabs/biome-config`, app's `biome.json` extends it |
| Types | TypeScript strict, `noUncheckedIndexedAccess` | `@mayrlabs/tsconfig/nextjs.json` |
| Git hooks | Husky + lint-staged | written by `mlabs init` |
| Unit tests | Vitest | app config; toolkit ships `testing` helpers (in-memory SQLite db, fake adapters) |
| E2E | Playwright | app config; runs against SQLite + demo seed in CI |
| Env | `@t3-oss/env-nextjs` + zod 4 | the toolkit's env layer |

Hooks:

- `pre-commit` → `lint-staged`: `biome check --write` on staged files, then `tsc --noEmit` is **not** run here
  (too slow); type checks run in `pre-push`.
- `pre-push` → `pnpm typecheck && pnpm test`.
- `commit-msg` → optional conventional-commit check, off by default (owner's commit style is plain sentences).

## The `mlabs` CLI

Ships inside the package as a `bin`:

- `mlabs init` — adds `toolkit.config.ts`, `src/env.ts`, `src/server/toolkit.ts`, the catch-all route,
  `instrumentation.ts`, husky + lint-staged, `.env.example`, and the deploy files chosen in a prompt.
- `mlabs add <module> <provider>` — installs the provider's peer dependency and adds it to the config.
- `mlabs doctor` — resolved drivers, missing env, ephemeral-disk warnings, DB connectivity, pending migrations.
- `mlabs db:generate | db:migrate | db:seed | db:reset | db:studio` — dialect-aware wrappers over drizzle-kit.
- `mlabs env:example` — regenerates `.env.example` from the composed schema.

## Deployment targets

All templates assume `output: "standalone"` is **not** forced (Netlify needs the default output); the
Dockerfile enables it via an env flag the config reads.

| Target | Files | Notes |
| --- | --- | --- |
| Docker | `Dockerfile` (multi-stage, node 22-slim, standalone output, non-root user), `.dockerignore`, `compose.yaml` (app + postgres + mailpit + minio for a full local stack) | Primary target for Fera vertical client installs and the demo. Migrations run in an entrypoint step guarded by an env flag. |
| Heroku | `Procfile`: `web: pnpm start -p $PORT`, `release: pnpm mlabs db:migrate`; `app.json` for review apps | Ephemeral disk: `doctor` refuses local storage / SQLite in production here. |
| Netlify | `netlify.toml` (as in Fera: `pnpm run deploy` = migrate → seed → build) | Netlify DB → `NETLIFY_DATABASE_URL` picked up automatically. |
| Vercel | none needed; `POSTGRES_URL` picked up | Listed for completeness. |
| On-prem (hospital LAN) | Docker image + `compose.yaml` + backup script | For hospitals with poor internet: a server in the building, optional sync later. |

CI (GitHub Actions, in each repo): lint → typecheck → unit tests → build → E2E on SQLite. This repo also runs
the playground's integration tests against Postgres and MySQL service containers and MinIO, so every dialect and
the S3 driver are exercised on each change.

## Releasing the toolkit

- Changesets for versioning; publish to npm (public or private scope, see decisions.md).
- During co-development with Hospital MS, link it locally (`pnpm add ../../Toolkit/nextjs-webkit`
  or a `link:` override) and switch to a version range once 0.1 is published.
