# Demo mode

Goal: a public demo (e.g. `hospital-ms.mlabs.ng`) where a prospect lands on a fully seeded system, can click
through every flow including creating and editing records, and **nothing they do persists** or leaks to other
visitors. No real email, SMS, payment or file storage is ever touched.

## Options considered

| Approach | Visitor experience | Problems |
| --- | --- | --- |
| A. Block writes (actions return "success" but do nothing) | Click "Admit patient" → toast says done → patient is not on the ward list | Feels broken. Prospects think the product does not work. |
| B. Shared DB, reset on a schedule | Writes work | Visitors see each other's junk (and anything offensive someone types) until the next reset. |
| C. Run each write in a transaction and roll back | Action returns real result | Next page load does not show it, same as A. |
| **D. Per-visitor sandbox database** | Everything works for that visitor, for the length of their visit | Needs a long-running server and some disk. |

**Chosen: D, with B's nightly reset of the template as a safety net.**

## How the sandbox works

1. At deploy (or on boot), `mlabs db:seed --profile demo` builds a **template** SQLite file from the app's demo
   seed: realistic patients, staff for every role, a week of appointments, admissions, lab results, bills.
   Seed data is generated with a fixed random seed so screenshots and walkthroughs stay stable, and dates are
   **relative to today** so the queue always shows "today's" patients.
2. A visitor's first request gets a `tk_demo` cookie (random id). The toolkit copies the template to
   `DEMO_DIR/<id>.db` (a file copy of a few MB is milliseconds).
3. For that request and every later one, `db` resolves to that visitor's file. App code does not change: the
   toolkit's `db` is already a per-request getter.
4. Sandboxes expire after `DEMO_TTL` of inactivity (default 2 h) and are swept by an interval on the server.
   A hard cap (`DEMO_MAX_SANDBOXES`, LRU) protects the disk.
5. A banner on every page: "Demo — changes are private to you and disappear after 2 hours. [Reset] [Switch role]".

Because the demo always uses SQLite, **the app's demo build must pass on SQLite** — another reason the schema
layer in [modules.md](modules.md) matters.

## Every side effect gets a demo driver

When `DEMO_MODE=true`, the toolkit swaps adapters regardless of other env:

| Module | Demo behaviour |
| --- | --- |
| Auth | Role switcher instead of sign-in. Each role maps to a seeded staff user. |
| DB | Per-visitor sandbox as above. |
| Storage | Writes to the sandbox's temp folder; seeded files (sample X-ray, lab PDF) are read-only shared assets. |
| Email | Captured to the sandbox outbox, shown in a "Demo inbox" drawer. |
| Payments | Fake provider: instant success on a demo checkout page. |
| SMS / WhatsApp (app-level, later) | Captured like email. |
| Captcha | On for the public landing forms, off inside the app. |
| Errors | Sent to Sentry with `demo: true`. |
| Cron / background jobs | Run against the visitor's sandbox on demand, not globally. |

The action wrapper also refuses a short list of actions marked `.demo("blocked")` (changing the deployment's
own settings, inviting real email addresses, exporting all data) and shows why.

## Hosting the demo

Per-visitor files need a persistent process and local disk, so the demo runs on **Docker** (a small VPS, Fly,
Railway, or Heroku with the sandbox dir on the dyno's ephemeral disk, which is fine because sandboxes are meant
to be thrown away). Netlify/Vercel functions are not suitable for the demo; they are fine for real client
deployments on Postgres.

## Fallback if D is too heavy at first

Ship B first (shared demo DB + reset every hour + the same demo drivers for side effects) and move to D once the
first vertical is feature-complete. The demo drivers are the same in both, so nothing is thrown away.
