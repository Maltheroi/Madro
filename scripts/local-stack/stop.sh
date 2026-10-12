#!/usr/bin/env bash
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STATE="${LOCAL_STACK_DIR:-$ROOT/.local-stack}"
PG_BIN="${PG_BIN:-$(dirname "$(command -v pg_ctl 2>/dev/null || ls /usr/lib/postgresql/*/bin/pg_ctl | tail -1)")}"
for p in auth gateway; do [[ -f "$STATE/$p.pid" ]] && kill "$(cat "$STATE/$p.pid")" 2>/dev/null; rm -f "$STATE/$p.pid"; done
RUN_AS=(); [[ "$(id -u)" == "0" ]] && RUN_AS=(sudo -u postgres)
"${RUN_AS[@]}" "$PG_BIN/pg_ctl" -D "$STATE/pg" stop >/dev/null 2>&1 || true
echo "Local stack stopped."
