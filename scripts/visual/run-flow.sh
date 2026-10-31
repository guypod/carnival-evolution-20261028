#!/usr/bin/env bash
# Plays a changed flow on a clean checkout of a pull request's head and, with
# --publish, retains the screenshots and reports the result as the factory's
# browser-flow check run on that head: the evidence the native merge gate reads.
#
# With --publish the check run is created in progress before anything else,
# and every exit that is not a published pass concludes it as a failure:
# browser setup, an unknown flow, a missing screenshot or a failed upload.
#
# With --live <merge sha> it plays the flow on the deployed site instead and
# reports it as the browser-flow-live check run on the merge commit, which
# `native.mjs deploy` needs before it calls a merge shipped.
#
#   scripts/visual/run-flow.sh <out dir> <flow> [--publish | --live <merge sha>]
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
CHECKOUT=$(cd "$HERE/../.." && pwd)
ROOT=${CARNIVAL_BROWSER_DIR:-/tmp/carnival-browser}
OUT=${1:?usage: run-flow.sh <out dir> <flow> [--publish]}
FLOW=${2:?usage: run-flow.sh <out dir> <flow> [--publish]}
PUBLISH=${3:-}
REPO=guypod/carnival-evolution-20261028
BRANCH=factory-state/browser-evidence

HEAD=$(git -C "$CHECKOUT" rev-parse HEAD)
LIVE=
export FLOW_CHECK_NAME=browser-flow
if [ "$PUBLISH" = --live ]; then
  HEAD=${4:?usage: run-flow.sh <out dir> <flow> --live <merge sha>}
  LIVE=${CARNIVAL_LIVE_URL:-https://guypod.github.io/carnival-evolution-20261028/}
  FLOW_CHECK_NAME=browser-flow-live
  PUBLISH=--publish
fi
# A report or screenshot left by an earlier run must never be published.
rm -rf "$OUT"
mkdir -p "$OUT"
CHECK=
STEP=start
SERVER=
WORK=
finish() {
  local status=$?
  [ -n "$SERVER" ] && kill "$SERVER" 2>/dev/null || true
  [ -n "$WORK" ] && git -C "$CHECKOUT" worktree remove --force "$WORK" 2>/dev/null || true
  if [ -n "$CHECK" ] && [ "$STEP" != published ]; then
    node "$HERE/flow-check.mjs" --fail "$FLOW" "$STEP" "$status" >"$OUT/check-fail.json" &&
      gh api -X PATCH "repos/$REPO/check-runs/$CHECK" --input "$OUT/check-fail.json" >/dev/null ||
      echo "could not conclude check run $CHECK: it stays in progress and the gate refuses" >&2
    [ "$status" = 0 ] && status=1
  fi
  exit "$status"
}
trap finish EXIT

if [ "$PUBLISH" = --publish ]; then
  node "$HERE/flow-check.mjs" --start "$FLOW" "$HEAD" >"$OUT/check-start.json"
  CHECK=$(gh api -X POST "repos/$REPO/check-runs" --input "$OUT/check-start.json" --jq .id)
  echo "browser-flow check run $CHECK in progress for $FLOW on $HEAD" >&2
fi

STEP=checkout
[ -n "$LIVE" ] || {
# Evidence is for a commit, so the working tree must be that commit.
if [ -n "$(git -C "$CHECKOUT" status --porcelain -- index.html src public package.json vite.config.ts scripts/visual)" ]; then
  echo "uncommitted app changes: evidence would not be for $HEAD" >&2
  exit 1
fi
}

STEP=browser-setup
"$HERE/setup-browser.sh" >&2
# shellcheck disable=SC1091
. "$ROOT/env.sh"
STEP=serve
if [ -n "$LIVE" ]; then
  BASE=$LIVE
  curl -fs "$BASE" >/dev/null || { echo "live site $BASE did not answer" >&2; exit 1; }
else
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
fi
STEP=flow
STATUS=0
node "$HERE/flow.mjs" "$BASE" "$OUT" "$FLOW" || STATUS=$?
[ "$PUBLISH" = --publish ] || exit "$STATUS"
# A failed flow publishes its report as a failure; a crash publishes nothing.
[ "$STATUS" = 0 ] || [ "$STATUS" = 1 ] || { echo "flow exited $STATUS" >&2; exit "$STATUS"; }
[ -s "$OUT/flow.json" ] || { echo "flow wrote no report" >&2; exit 1; }
ls "$OUT"/*.png >/dev/null 2>&1 || { echo "flow wrote no screenshot" >&2; exit 1; }

# Retain the screenshots on the evidence branch, one commit per capture.
STEP=evidence-upload
DIR="evidence/$HEAD/$FLOW"
[ -n "$LIVE" ] && DIR="evidence/live/$HEAD/$FLOW"
WORK=$(mktemp -d)
if git -C "$CHECKOUT" fetch --quiet origin "$BRANCH" 2>/dev/null; then
  git -C "$CHECKOUT" worktree add --quiet --detach "$WORK" FETCH_HEAD
else
  git -C "$CHECKOUT" worktree add --quiet --detach "$WORK" HEAD
  git -C "$WORK" checkout --quiet --orphan evidence-tmp
  git -C "$WORK" rm -rf --quiet .
fi
mkdir -p "$WORK/$DIR"
cp "$OUT"/*.png "$OUT/flow.json" "$WORK/$DIR/"
git -C "$WORK" add "$DIR"
git -C "$WORK" commit --quiet -m "Browser evidence: $FLOW on $HEAD"
EVIDENCE=$(git -C "$WORK" rev-parse HEAD)
git -C "$WORK" push --quiet origin "HEAD:refs/heads/$BRANCH"

STEP=conclude
node "$HERE/flow-check.mjs" "$OUT/flow.json" "$HEAD" "$EVIDENCE" "$DIR" "$STATUS" >"$OUT/check-run.json"
gh api -X PATCH "repos/$REPO/check-runs/$CHECK" --input "$OUT/check-run.json" --jq '.html_url'
STEP=published
exit "$STATUS"
