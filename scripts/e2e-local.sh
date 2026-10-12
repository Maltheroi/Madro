#!/usr/bin/env bash
# Builds the app, (re)starts it on E2E_PORT and runs Playwright against the local stack.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${E2E_PORT:-3100}"
cd "$ROOT"
# Stop any previous server on the port (npx spawns a child, so the pid file alone is not enough).
if [[ -f .local-stack/next.pid ]]; then kill "$(cat .local-stack/next.pid)" 2>/dev/null || true; fi
fuser -k "$PORT/tcp" >/dev/null 2>&1 || true
sleep 1
npx next build >/tmp/madro-build.log 2>&1 || { tail -40 /tmp/madro-build.log; exit 1; }
nohup npx next start -p "$PORT" >/tmp/madro-next.log 2>&1 &
echo $! > .local-stack/next.pid
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$PORT/" && break; sleep 0.5; done
npx playwright test "$@"
