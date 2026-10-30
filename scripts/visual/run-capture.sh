#!/usr/bin/env bash
# Sets up the browser, loads its environment and captures, all in one shell, so
# the capture never depends on exports from an earlier process. It always
# starts its own dev server for this checkout on a free port, and stops it
# after, so a server left over from another checkout can never stand in for
# this one. Servers it did not start are left alone.
#
#   scripts/visual/run-capture.sh <out dir> [route ...]
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
CHECKOUT=$(cd "$HERE/../.." && pwd)
ROOT=${CARNIVAL_BROWSER_DIR:-/tmp/carnival-browser}
OUT=${1:?usage: run-capture.sh <out dir> [route ...]}
shift

"$HERE/setup-browser.sh" >&2
# shellcheck disable=SC1091
. "$ROOT/env.sh"

PORT=$(node -e "const s=require('net').createServer().listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})")
BASE="http://127.0.0.1:$PORT/"
(cd "$CHECKOUT" && exec node_modules/.bin/vite --host 127.0.0.1 --port "$PORT" --strictPort) >"$ROOT/dev.log" 2>&1 &
SERVER=$!
trap 'kill "$SERVER" 2>/dev/null || true' EXIT
for _ in $(seq 60); do
  kill -0 "$SERVER" 2>/dev/null || { cat "$ROOT/dev.log" >&2; exit 1; }
  curl -fs "$BASE" >/dev/null 2>&1 && break
  sleep 0.5
done
# Answering is not enough: the server that answered must be the one started
# above, still running, from this checkout.
kill -0 "$SERVER" 2>/dev/null && curl -fs "$BASE" >/dev/null || {
  echo "no dev server of this checkout answered on port $PORT" >&2
  exit 1
}
echo "capturing $(git -C "$CHECKOUT" rev-parse HEAD) from $BASE" >&2
node "$HERE/capture.mjs" "$BASE" "$OUT" "$@"
