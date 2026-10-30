#!/usr/bin/env bash
# Sets up the browser, loads its environment and captures, all in one shell, so
# the capture never depends on exports from an earlier process. Starts the dev
# server itself when the base URL is not already answering, and stops it after.
#
#   scripts/visual/run-capture.sh <out dir> [route ...]
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=${CARNIVAL_BROWSER_DIR:-/tmp/carnival-browser}
BASE=${VISUAL_BASE_URL:-http://localhost:5173/}
OUT=${1:?usage: run-capture.sh <out dir> [route ...]}
shift

"$HERE/setup-browser.sh" >&2
# shellcheck disable=SC1091
. "$ROOT/env.sh"

SERVER=
if ! curl -fs "$BASE" >/dev/null 2>&1; then
  (cd "$HERE/../.." && exec npx vite --port 5173 --strictPort >"$ROOT/dev.log" 2>&1) &
  SERVER=$!
  trap '[ -n "$SERVER" ] && kill "$SERVER" 2>/dev/null || true' EXIT
  for _ in $(seq 60); do curl -fs "$BASE" >/dev/null 2>&1 && break; sleep 0.5; done
fi
node "$HERE/capture.mjs" "$BASE" "$OUT" "$@"
