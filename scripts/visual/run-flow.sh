#!/usr/bin/env bash
# Plays a changed flow on a clean checkout of a pull request's head and, with
# --publish, retains the screenshots and reports the result as the factory's
# browser-flow check run on that head: the evidence the native merge gate reads.
# A failed flow is published as a failure, never skipped.
#
#   scripts/visual/run-flow.sh <out dir> <flow> [--publish]
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
# Evidence is for a commit, so the working tree must be that commit.
if [ -n "$(git -C "$CHECKOUT" status --porcelain -- index.html src public package.json vite.config.ts)" ]; then
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
trap 'kill "$SERVER" 2>/dev/null || true' EXIT
for _ in $(seq 60); do
  kill -0 "$SERVER" 2>/dev/null || { cat "$ROOT/flow-dev.log" >&2; exit 1; }
  curl -fs "$BASE" >/dev/null 2>&1 && break
  sleep 0.5
done
mkdir -p "$OUT"
STATUS=0
node "$HERE/flow.mjs" "$BASE" "$OUT" "$FLOW" || STATUS=$?
[ "$PUBLISH" = --publish ] || exit "$STATUS"

# Retain the screenshots on the evidence branch, one commit per capture.
DIR="evidence/$HEAD/$FLOW"
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
git -C "$CHECKOUT" worktree remove --force "$WORK"

node "$HERE/flow-check.mjs" "$OUT/flow.json" "$HEAD" "$EVIDENCE" "$DIR" >"$OUT/check-run.json"
gh api -X POST "repos/$REPO/check-runs" --input "$OUT/check-run.json" --jq '.html_url'
exit "$STATUS"
