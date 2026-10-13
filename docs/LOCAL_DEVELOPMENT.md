# Local development

## Requirements

- Node.js 22 and npm
- Either Docker (for the Supabase CLI) or PostgreSQL 16 server binaries plus a Supabase Auth binary (Docker-free stack)

```bash
npm ci
```

## Option A: Supabase CLI (Docker)

```bash
npx supabase start          # applies supabase/migrations and supabase/seed.sql
cp .env.example .env.local  # fill in the URL, anon key, service role key and DB URL that `supabase status` prints
npm run dev
```

## Option B: Docker-free stack

Used in this repository's cloud sessions and usable in CI. It runs Postgres on :54322, Supabase Auth (GoTrue) on :9999 and a small gateway on :54321 that maps `/auth/v1` like Supabase does. It signs HS256 anon and service keys and writes `.env.local`.

Build the Auth binary once (Go 1.27+):

```bash
mkdir -p /tmp/gotrue-src && cd /tmp/gotrue-src
GOFLAGS=-mod=mod go mod download -json github.com/supabase/auth@master | jq -r .Dir | xargs -I{} cp -r {}/. .
chmod -R u+w . && sed -i '/godotenv/d' go.mod    # drop the local replace directive
GOFLAGS=-mod=mod go build -o /tmp/gotrue-bin/auth .
```

Then:

```bash
GOTRUE_BIN=/tmp/gotrue-bin/auth bash scripts/local-stack/start.sh
npm run dev
bash scripts/local-stack/stop.sh
```

Email confirmation is auto-approved in this stack so sign-up works without SMTP.

## Seed data

`supabase/seed.sql` is generated from `supabase/seed-data/` (`index.mjs` combines the files; check recipes with `node scripts/check-seed-recipes.mjs --list`):

```bash
node scripts/generate-seed.mjs
```

The seed contains approximate nutrition values and **synthetic** prices for three fictional chains. They exist to develop and test the app and are labelled in the UI.

## Checks

| Command | What it runs |
|---|---|
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run format:check` | Prettier |
| `npm test` | Vitest unit tests (domain logic, provider parsing, AI fallback) |
| `npm run test:db` | Migrations + seed on a throwaway Postgres cluster, then RLS and schema tests |
| `npm run build` | Production build |
| `bash scripts/e2e-local.sh` | Builds, starts the app on :3100 and runs Playwright (mobile + desktop) against the running local stack |

In environments with a preinstalled Chromium, set `PLAYWRIGHT_CHROMIUM_PATH` (for example `/opt/pw-browsers/chromium`).

## Making yourself admin

```sql
insert into public.app_admins (user_id) select id from auth.users where email = 'you@example.dk';
```
