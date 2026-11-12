# Decisions

## Principle

**When two reasonable approaches exist, build both and let configuration choose.** Every Fera product is sold
before its clients are known, so the code cannot assume one hospital's workflow or one host. Each variant has a
default that works out of the box, and the settings registry (modules.md) makes the rest a switch, not a fork.
The exception is when one option is clearly worse (e.g. demo approaches A and C): those are documented and not built.

## Taken

1. **Scope `@mlabs`.** Package `@mlabs/nextjs-toolkit`, plus `@mlabs/tsconfig` and `@mlabs/biome-config`.
   No packages are published under `@mlabs` yet; the npm org still has to be created (npm blocked an automated
   check of whether the name is reserved). Fallback if taken: `@mlabsng`.
2. **Source on GitHub at `MayR-Labs/nextjs-toolkit`.**
3. **One package, subpath exports, optional peer deps** rather than one package per module.
4. **Providers declared in code, selected by env.**
5. **Local `tk_users` table is canonical** for every auth provider.
6. **Self-hosted auth = Better Auth**, not a hand-written provider. Clerk is the hosted alternative.
7. **Both session strategies** (`database`, `cookie-cache`); `database` is the default.
8. **SQLite, Postgres and MySQL all supported from T2**, all tested in CI on every change.
9. **App-generated IDs, integer money, UTC timestamps.**
10. **Dialect-neutral schema layer** instead of hand-maintaining three schema files.
11. **Both demo strategies** (`sandbox` default, `shared-reset`), same demo drivers.
12. **Both live-update strategies** (`polling` default, `sse`).
13. **Feature modules with env or signed-licence enablement** for apps sold in editions.
14. **SMS/WhatsApp is a toolkit module** (Termii, Africa's Talking, Twilio).
15. **DB-backed background jobs**; external job services can be added as adapters later.
16. **Built alongside Hospital MS**, with a playground app as the test target. **Biome** for lint/format.

## Open

| # | Question | Recommendation |
| --- | --- | --- |
| D1 | Public or private package | Public on npm: free, good for the portfolio, and the value is in the verticals, not the plumbing. Private (GitHub Packages) if you'd rather not show it |
