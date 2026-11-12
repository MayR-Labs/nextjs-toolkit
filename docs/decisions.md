# Decisions

## Taken (in these docs; reversible until code exists)

1. **One package, subpath exports, optional peer deps** rather than one package per module.
2. **Providers are declared in code, selected by env.** Code declares what may be bundled; env picks at runtime.
3. **Local `users` table is canonical** for every auth provider.
4. **Internal auth uses database sessions**, not JWTs, by default.
5. **App-generated IDs (UUIDv7/ULID), integer money, UTC timestamps** across all dialects.
6. **Dialect-neutral schema layer** instead of hand-maintaining three schema files.
7. **Demo mode = per-visitor SQLite sandbox** + demo drivers for every side effect; shared-DB reset as the first step.
8. **Built alongside Hospital MS**, milestone by milestone, with a playground app as the test target.
9. **Biome** (not ESLint/Prettier), matching existing repos.

## Open — need the owner's call

| # | Question | Options | Recommendation |
| --- | --- | --- | --- |
| D1 | npm scope after the MLabs rebrand | `@mayrlabs/*` (as asked) · `@mlabs/*` (check availability) · `@mlabsng/*` | Keep `@mayrlabs` if `@mlabs` is taken; the scope is invisible to clients |
| D2 | Public or private package | Public on npm (free, open source, portfolio value) · private npm/GitHub Packages (paid, keeps Fera's edge) | Public: the moat is the verticals, not the plumbing |
| D3 | Support MySQL in v1? | Yes · later | Later (T11), unless a signed client needs it |
| D4 | Better Auth and Internal both? | Both · only Better Auth (skip building our own) · only Internal | Worth reconsidering: Better Auth already gives DB-owned auth with 2FA and orgs. Building Internal is ~1–2 weeks and full control. If you mainly want "no third party holds our passwords", Better Auth alone covers it. |
| D5 | Background jobs | None in v1 · DB-backed queue in the toolkit · external (Inngest/Trigger.dev) | DB-backed table + `after()` + a cron route; enough for reminders and reorder alerts |
| D6 | SMS / WhatsApp module | Not now · add as a 9th module (Termii, Twilio) | Add after T8; hospitals rely on SMS appointment reminders |
| D7 | Repo location | `MayRLabs/Toolkit/nextjs-toolkit` (where these docs are) · inside an existing repo | As is |
