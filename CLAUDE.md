# Working on Madro

@AGENTS.md

Madro is a Danish nutrition, meal planning and grocery price app. Read `docs/ARCHITECTURE.md` first.

## Rules

- UI text is Danish; numbers use Danish formatting via `src/lib/format.ts`. Prices are integers in øre.
- Domain logic lives in `src/features/*/domain` as pure functions with Vitest tests. Change the algorithm version in `algorithm_versions` (new migration) when behaviour changes.
- Never query the database from the browser. Server code uses `withUser(user.id, …)` and still filters on `user_id`. Take the user id only from `requireUser()`.
- Never invent nutrition or prices. Unknown is `null` and shown as unknown. Synthetic data must stay labelled (`is_synthetic`).
- Do not scrape retailer sites or call undocumented APIs. New sources go through `src/server/providers` and `docs/DATA_SOURCES.md`.
- Schema changes are new files in `supabase/migrations`; add RLS policies in the same migration and a test in `tests/db`.
- Secrets are server-only (`src/lib/env.ts`).

## Commands

See `docs/LOCAL_DEVELOPMENT.md`. Before committing: `npm run typecheck && npm run lint && npm run format:check && npm test`, plus `npm run test:db` for schema changes and `bash scripts/e2e-local.sh` for UI changes.
