# Architecture

## Repository shape

A pnpm workspace, published as **one** npm package with subpath exports.

```
nextjs-toolkit/
  packages/
    toolkit/                 → @mayrlabs/nextjs-toolkit (the published package)
      src/
        index.ts             defineToolkit, types
        env/                 env composition on top of @t3-oss/env-nextjs
        auth/                contract + better-auth/ clerk/ demo/
        db/                  dialect-neutral schema helpers, client factory, migrate/seed runners
        storage/             contract + s3/ cloudinary/ local/ demo/
        email/               contract + resend/ smtp/ dev/ demo/
        captcha/             contract + turnstile/ hcaptcha/ noop/
        payments/            contract + registry; paystack/ (first provider)
        sms/                 contract + termii/ africastalking/ twilio/ dev/
        settings/            typed settings registry, admin UI generator
        features/            feature modules, editions, signed licences
        live/                polling and SSE live updates
        jobs/                DB-backed background jobs
        errors/              contract + sentry/ console/
        demo/                sandbox manager, guards, banner component
        actions/             safe server-action wrapper (auth, captcha, rate limit, demo, error capture)
        cli/                 `mlabs` binary: init, add, doctor
      templates/             files the CLI writes: Dockerfile, Procfile, netlify.toml, husky hooks…
    tsconfig/                → @mayrlabs/tsconfig (shared base configs)
    biome-config/            → @mayrlabs/biome-config
  apps/
    playground/              a small Next.js app that uses every module; the CI integration target
  docs/
```

**Why one package rather than `@mayrlabs/auth`, `@mayrlabs/storage`, …?** The modules share the env layer, the
action wrapper and demo mode, and they are versioned together in practice. Subpath exports plus optional peer
dependencies give the same "install only what you use" result without eight changelogs. If one module grows
an audience of its own it can be split out later without changing import paths much.

## Config: `defineToolkit`

The app has one `toolkit.config.ts` at its root. It declares, per module, the providers the app **ships**
(the code that may end up in the bundle). Which one runs is decided by env at runtime, so the same build can
point at SQLite locally and Postgres in production.

```ts
export default defineToolkit({
  app: { name, slug, url? },
  auth: [betterAuth({ ... })],                   // one or more; AUTH_DRIVER chooses when >1
  db: [sqlite(), postgres()],                    // DATABASE_URL scheme chooses
  storage: [localDisk(), s3()],                  // STORAGE_DRIVER chooses
  email: [devMail(), resend()],                  // EMAIL_DRIVER chooses
  captcha: [turnstile()],                        // optional module: omit and it is a no-op
  payments: [paystack()],                        // a registry: several can be active at once
  errors: sentry(),
  demo: { enabled: "env" | false, ... },
});
```

The toolkit then exposes server-side singletons the app imports from its own `src/server/toolkit.ts`:

```ts
// src/server/toolkit.ts
import "server-only";
import config from "../../toolkit.config";
import { createToolkit } from "@mayrlabs/nextjs-toolkit/server";
import * as schema from "./db/schema";

export const { env, db, auth, storage, mail, captcha, payments, errors, action } =
  createToolkit(config, { schema });
```

Every module is lazy: its provider SDK is loaded with a dynamic `import()` the first time it is used, so
unused drivers cost nothing at runtime and cold starts stay small.

## The adapter contract

Every module follows the same pattern:

```ts
interface Adapter<Name extends string, Api, EnvShape extends ZodRawShape> {
  module: "storage" | "email" | ...;
  provider: Name;                      // "s3", "cloudinary", ...
  env: EnvFragment<EnvShape>;          // zod shape + cross-field rules + runtimeEnv mapping
  create(env: z.infer<ZodObject<EnvShape>>, ctx: ToolkitContext): Promise<Api>;
  demo?: (real: Api, ctx: DemoContext) => Api;   // how this module behaves in demo mode
}
```

- `Api` is the module's interface (see [modules.md](modules.md)). The app only ever sees the interface.
- A third party or the app itself can write an adapter (e.g. a Flutterwave payments adapter) by implementing
  the same shape. Nothing in the toolkit hard-codes the list of providers.
- Each adapter has a **contract test suite** exported from `@mayrlabs/nextjs-toolkit/testing` that any
  implementation must pass (upload → confirm → read → remove; send → captured; etc.).

## Env composition

`@t3-oss/env-nextjs` stays the validator, with zod 4. The toolkit builds the schema from the selected adapters
and lets the app add its own keys:

```ts
// src/env.ts
import { createToolkitEnv } from "@mayrlabs/nextjs-toolkit/env";
import config from "../toolkit.config";

export const env = createToolkitEnv(config, {
  server: { HOSPITAL_TIMEZONE: z.string().default("Africa/Lagos") },
  client: {},
  runtimeEnv: { HOSPITAL_TIMEZONE: process.env.HOSPITAL_TIMEZONE },
});
```

**One build, any deployment.** Apps built on the toolkit are deployed many times from the same code with
different env, so env is read at **runtime**, never baked in:

- The toolkit does not use `NEXT_PUBLIC_*`. Browser-side values (captcha site key, payment public keys, Sentry
  DSN, brand colours) are resolved on the server and exposed through `<ToolkitPublicConfig />` in the root layout
  and a `usePublicConfig()` hook.
- Anything that depends on env (metadata, manifest, icons, branding) renders per request.
- The Docker image is built once with `SKIP_ENV_VALIDATION=1` and validated at container start.

Rules carried over from `fera-nextjs/src/env.ts`, which already works well:

- `emptyStringAsUndefined: true`, `SKIP_ENV_VALIDATION` escape hatch for Docker builds.
- **Required-in-production** helper: optional locally, required when `NODE_ENV=production`.
- **Cross-field rules** declared by each adapter ("`S3_ACCESS_KEY_ID` is required with `S3_BUCKET`").
- **Driver rules**: if `STORAGE_DRIVER=s3`, the S3 fragment becomes required; fragments of installed but
  unselected drivers stay optional, so a laptop without Cloudinary keys still boots.
- **Platform fallbacks** for URLs: `DATABASE_URL ?? NETLIFY_DATABASE_URL ?? POSTGRES_URL`, and
  `APP_URL` from `URL`/`VERCEL_URL`/`HEROKU_APP_NAME` (Fera's `platformUrl()` moves into the toolkit).
- `mlabs doctor` prints which driver each module resolved to and which keys are missing, without printing
  secret values.

The toolkit also generates `.env.example` from the composed schema (`mlabs env:example`), so it never drifts.

## Runtime selection and Next.js boundaries

- Everything except captcha widgets, the upload helper and the demo banner is **server-only** and imports
  `server-only`.
- Client-safe exports live under `@mayrlabs/nextjs-toolkit/client` and never import a provider SDK.
- Route handlers the toolkit needs (local storage uploads/serving, Better Auth endpoints, payment webhooks,
  Better Auth's catch-all) are exported as handler factories the app mounts in one line:

  ```ts
  // src/app/api/toolkit/[...path]/route.ts
  export const { GET, POST } = toolkit.routes();
  ```

- Session checks at the edge go in `src/proxy.ts` (Next 16 renamed `middleware.ts` to `proxy.ts`):
  `export default toolkit.proxy({ public: ["/", "/sign-in"] })`. The proxy only does cheap cookie/redirect
  work; real authorization happens in server code, never only in the proxy.
- Read the Next 16 guides in `node_modules/next/dist/docs/` before implementing each boundary. Fera's
  repo is already on Next 16.4 and is the reference for current conventions.

## The action wrapper

Most of the cross-cutting behaviour meets in one place: server actions. `toolkit.action()` builds them:

```ts
export const admitPatient = action
  .input(AdmitSchema)                  // zod; errors returned as field errors, not thrown
  .require("ward.admit")               // permission check against the app's RBAC
  .captcha(false)
  .mutation(async ({ input, user, db }) => { ... });
```

It handles: input validation, session + permission, captcha (for public forms), rate limiting (DB-backed
fixed window, no Redis needed), demo-mode routing (see [demo-mode.md](demo-mode.md)), error capture to
Sentry with the user and request attached, and a typed `{ ok, data } | { ok: false, error, fieldErrors }`
result for `useActionState`. `.query()` is the read-only twin and is allowed in demo mode unchanged.

Fera's `src/server/action.ts` is the starting point.
