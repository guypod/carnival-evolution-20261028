#!/usr/bin/env bash
# Sets up the browser, loads its environment and captures, all in one shell, so
# the capture never depends on exports from an earlier process. It always
# starts its own dev server for this checkout on a free port, and stops it
# after, so a server left over from another checkout can never stand in for
# this one. Servers it did not start are left alone.
#
# VISUAL_REV=<commit> renders that commit from a temporary worktree instead of
# the working tree, so a baseline review shows exactly the main commit the
# ledger will credit. The commit captured is written to <out dir>/commit.
#
#   [VISUAL_REV=<commit>] scripts/visual/run-capture.sh <out dir> [route ...]
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
CHECKOUT=$(cd "$HERE/../.." && pwd)
ROOT=${CARNIVAL_BROWSER_DIR:-/tmp/carnival-browser}
OUT=${1:?usage: run-capture.sh <out dir> [route ...]}
shift

"$HERE/setup-browser.sh" >&2
# shellcheck disable=SC1091
. "$ROOT/env.sh"

SERVE=$CHECKOUT
REV=$(git -C "$CHECKOUT" rev-parse HEAD)
CLEANUP=()
if [ -n "${VISUAL_REV:-}" ]; then
  REV=$(git -C "$CHECKOUT" rev-parse --verify "$VISUAL_REV^{commit}")
  SERVE=$(mktemp -d)
  git -C "$CHECKOUT" worktree add --quiet --detach "$SERVE" "$REV"
  ln -s "$CHECKOUT/node_modules" "$SERVE/node_modules"
  CLEANUP+=("git -C '$CHECKOUT' worktree remove --force '$SERVE'")
elif [ -n "$(git -C "$CHECKOUT" status --porcelain -- index.html src)" ]; then
  REV="$REV+uncommitted"
fi

PORT=$(node -e "const s=require('net').createServer().listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})")
BASE="http://127.0.0.1:$PORT/"
(cd "$SERVE" && exec node_modules/.bin/vite --host 127.0.0.1 --port "$PORT" --strictPort) >"$ROOT/dev.log" 2>&1 &
SERVER=$!
cleanup() {
  kill "$SERVER" 2>/dev/null || true
  for c in "${CLEANUP[@]}"; do eval "$c" || true; done
}
trap cleanup EXIT
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
echo "capturing $REV from $BASE" >&2
mkdir -p "$OUT"
echo "$REV" >"$OUT/commit"
node "$HERE/capture.mjs" "$BASE" "$OUT" "$@"
