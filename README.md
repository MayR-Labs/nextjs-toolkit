# @mayrlabs/nextjs-toolkit

> Status: **planning**. Nothing here is built yet. These docs are the spec.

One package that gives every MLabs Next.js app (personal projects, Fera vertical SaaS, client work) the same
infrastructure: auth, database, file storage, email, captcha, payments, error tracking, env validation, demo
mode and deployment files. The app chooses **which modules it uses** and **which provider backs each one**;
the toolkit owns the code behind them.

```ts
// toolkit.config.ts (in the app)
import { defineToolkit } from "@mayrlabs/nextjs-toolkit";
import { clerk } from "@mayrlabs/nextjs-toolkit/auth/clerk";
import { internalAuth } from "@mayrlabs/nextjs-toolkit/auth/internal";
import { postgres, sqlite, mysql } from "@mayrlabs/nextjs-toolkit/db";
import { s3, cloudinary, localDisk } from "@mayrlabs/nextjs-toolkit/storage";
import { resend, smtp, devMail } from "@mayrlabs/nextjs-toolkit/email";
import { turnstile } from "@mayrlabs/nextjs-toolkit/captcha";
import { paystack } from "@mayrlabs/nextjs-toolkit/payments/paystack";
import { sentry } from "@mayrlabs/nextjs-toolkit/errors/sentry";

export default defineToolkit({
  app: { name: "Hospital MS", slug: "hospital-ms" },
  auth: [internalAuth(), clerk()],          // installed providers; AUTH_DRIVER picks one at runtime
  db: [sqlite(), postgres(), mysql()],      // DATABASE_URL scheme picks one
  storage: [localDisk(), s3(), cloudinary()],
  email: [devMail(), smtp(), resend()],
  captcha: [turnstile()],
  payments: [paystack()],
  errors: sentry(),
  demo: { enabled: "env" },                 // DEMO_MODE=true turns it on
});
```

## Why

Fera, Moonlit, LaunchPad, Pocketa and the rest each re-implement the same pieces with small differences
(see `fera-nextjs/src/server/{storage,db,auth,email.ts}` and `src/env.ts`). Every fix has to be copied by
hand. The toolkit makes those pieces one versioned dependency.

## Docs

| Doc | What it covers |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | Package shape, config, env composition, the adapter contract, runtime selection |
| [docs/modules.md](docs/modules.md) | Each module's interface and providers: auth, db, storage, email, captcha, payments, errors |
| [docs/demo-mode.md](docs/demo-mode.md) | Seeded, non-persisting demo deployments |
| [docs/tooling-and-deploy.md](docs/tooling-and-deploy.md) | Husky, lint-staged, Biome, tests, Docker, Procfile, netlify.toml, the `mlabs` CLI |
| [docs/roadmap.md](docs/roadmap.md) | Build order, milestones, what "done" means for each |
| [docs/decisions.md](docs/decisions.md) | Decisions taken, and the ones still open |

## Goals

- **Configure, don't copy.** An app imports adapters and sets env vars; no provider code lives in the app.
- **Pay only for what you use.** Provider SDKs are optional peer dependencies behind subpath exports, so an app
  that never uses Cloudinary never installs or bundles it.
- **One env schema.** Each selected adapter contributes its own zod fragment to a single `@t3-oss/env-nextjs`
  schema, with cross-field rules ("S3_BUCKET needs S3_REGION").
- **Works offline locally.** SQLite, local disk, console/Mailpit email, internal auth, test captcha keys: a fresh
  clone runs with zero accounts.
- **Demo mode is a toolkit feature**, not something each vertical re-invents.

## Non-goals

- Not a UI kit. It ships the few components its modules need (captcha widget, upload button, sign-in form for
  internal auth) unstyled or Tailwind-minimal; app design stays in the app.
- Not a framework over Next.js. Apps still write normal App Router code, server actions and route handlers.
- Not multi-tenant infrastructure. Fera verticals deploy one instance per client; the toolkit assumes one
  database per deployment.
