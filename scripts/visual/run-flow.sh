#!/usr/bin/env bash
# Local, nonauthoritative developer mode: plays a flow on a clean checkout
# with the checkout's own Vite and writes the report and screenshots into
# <out dir>. It never publishes, and nothing it writes is evidence the gate
# accepts.
#
# --publish and --live are disabled. Both ran the candidate's (or merge's)
# Vite and scripts on the host that holds the GitHub credentials. They refuse
# with exit 3 before any checkout, build, server, network read or check run.
# Authoritative evidence comes only from scripts/visual/trusted-publish.mjs
# (premerge) and scripts/visual/live-capture.mjs (live), run from the
# operator's reviewed wrapper checkout (see scripts/native/README.md).
#
# Each attempt writes into a fresh directory made with mktemp inside <out
# dir>, so a report from an earlier attempt is never read. Nothing in <out
# dir> is ever removed.
#
#   scripts/visual/run-flow.sh <out dir> <flow>
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
CHECKOUT=$(cd "$HERE/../.." && pwd)
ROOT=${CARNIVAL_BROWSER_DIR:-/tmp/carnival-browser}
OUT=${1:?usage: run-flow.sh <out dir> <flow>}
FLOW=${2:?usage: run-flow.sh <out dir> <flow>}
PUBLISH=${3:-}

HEAD=$(git -C "$CHECKOUT" rev-parse HEAD)
if [ "$PUBLISH" = --live ]; then
  # Live capture built and served the merge on the host that holds the writer
  # key. It stays off until a reviewed, pinned broker replaces it: refuse
  # before touching the network, a build or a check run.
  echo "run-flow.sh --live is disabled: live capture needs the reviewed mediated broker; owed" >&2
  exit 3
fi
if [ "$PUBLISH" = --publish ]; then
  # Publishing ran the candidate's Vite with the host's credentials and wrote
  # recordless evidence the gate refuses. Refuse before anything runs.
  echo "run-flow.sh --publish is disabled: publish through trusted-publish.mjs from the reviewed wrapper; owed" >&2
  exit 3
fi
if [ -n "$PUBLISH" ]; then
  echo "unknown option $PUBLISH" >&2
  exit 2
fi
# A report or screenshot left by an earlier run must never be published: each
# attempt gets its own new directory, and the caller's directory is never
# emptied.
if [ -L "$OUT" ] || { [ -e "$OUT" ] && [ ! -d "$OUT" ]; }; then
  echo "$OUT is not a plain directory" >&2
  exit 2
fi
mkdir -p "$OUT"
OUT=$(mktemp -d "$OUT/attempt.XXXXXX")
echo "attempt directory $OUT" >&2
SERVER=
finish() {
  local status=$?
  [ -n "$SERVER" ] && kill "$SERVER" 2>/dev/null || true
  exit "$status"
}
trap finish EXIT

# Evidence is for a commit, so the whole working tree must be that commit:
# any tracked or untracked change, including package-lock.json, tsconfig.json
# or a config file, could change what is installed, built or served.
# Only this attempt's own directory is left out, when it sits in the checkout.
case "$OUT/" in
  "$CHECKOUT"/*) MINE=(":(exclude,top)${OUT#"$CHECKOUT"/}") ;;
  *) MINE=() ;;
esac
if [ -n "$(git -C "$CHECKOUT" status --porcelain --untracked-files=all -- . "${MINE[@]}")" ]; then
  echo "uncommitted app changes: evidence would not be for $HEAD" >&2
  exit 1
fi

"$HERE/setup-browser.sh" >&2
# shellcheck disable=SC1091
. "$ROOT/env.sh"
PORT=$(node -e "const s=require('net').createServer().listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})")
BASE="http://127.0.0.1:$PORT/"
(cd "$CHECKOUT" && exec node_modules/.bin/vite --host 127.0.0.1 --port "$PORT" --strictPort) >"$ROOT/flow-dev.log" 2>&1 &
SERVER=$!
UP=
for _ in $(seq 60); do
  kill -0 "$SERVER" 2>/dev/null || { cat "$ROOT/flow-dev.log" >&2; exit 1; }
  curl -fs "$BASE" >/dev/null 2>&1 && { UP=1; break; }
  sleep 0.5
done
[ -n "$UP" ] || { echo "dev server did not answer" >&2; exit 1; }
STATUS=0
node "$HERE/flow.mjs" "$BASE" "$OUT" "$FLOW" || STATUS=$?
exit "$STATUS"
