#!/usr/bin/env bash
# Applies all migrations and the dev seed to a throwaway PostgreSQL cluster
# (with a minimal Supabase shim) and runs the database test suite.
#
# Requires PostgreSQL server binaries (initdb, pg_ctl). Set PG_BIN to their
# directory if they are not on PATH. Alternatively set DATABASE_TEST_URL to an
# existing empty database that already has the Supabase roles and auth schema
# (e.g. `supabase start`), and the script skips cluster creation.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${DB_TEST_PORT:-54329}"

if [[ -z "${DATABASE_TEST_URL:-}" ]]; then
  PG_BIN="${PG_BIN:-$(dirname "$(command -v initdb 2>/dev/null || ls /usr/lib/postgresql/*/bin/initdb | tail -1)")}"
  DATA_DIR="$(mktemp -d)"
  cleanup() { "$PG_BIN/pg_ctl" -D "$DATA_DIR" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA_DIR"; }
  trap cleanup EXIT
  RUN_AS=()
  if [[ "$(id -u)" == "0" ]]; then
    chown -R postgres "$DATA_DIR"
    RUN_AS=(sudo -u postgres)
  fi
  "${RUN_AS[@]}" "$PG_BIN/initdb" -D "$DATA_DIR" -U postgres --auth=trust >/dev/null
  "${RUN_AS[@]}" "$PG_BIN/pg_ctl" -D "$DATA_DIR" -o "-p $PORT -k $DATA_DIR -c listen_addresses=127.0.0.1" -l "$DATA_DIR/log" start >/dev/null
  for _ in $(seq 1 30); do pg_isready -h 127.0.0.1 -p "$PORT" >/dev/null 2>&1 && break; sleep 0.2; done
  export DATABASE_TEST_URL="postgres://postgres@127.0.0.1:$PORT/postgres"
  psql "$DATABASE_TEST_URL" -v ON_ERROR_STOP=1 -q -f "$ROOT/tests/db/supabase-shim.sql"
fi

for f in "$ROOT"/supabase/migrations/*.sql; do
  psql "$DATABASE_TEST_URL" -v ON_ERROR_STOP=1 -q -f "$f"
done
psql "$DATABASE_TEST_URL" -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/seed.sql"

cd "$ROOT"
npx vitest run --config vitest.db.config.ts "$@"
