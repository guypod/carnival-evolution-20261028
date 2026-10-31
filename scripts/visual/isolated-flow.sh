#!/usr/bin/env bash
# Plays a flow on one exact pull request commit without running any of that
# commit's code on this host. Capture only: it publishes nothing.
#
# - The candidate is built by isolated-build.sh in a disposable container.
# - This host only serves the built files with the trusted static-serve.mjs
#   (127.0.0.1, no Vite, no symlinks, nothing outside dist).
# - The flow, its assertions and the report come from this runner checkout
#   (flow.mjs), never from the candidate, and drive Chromium from outside the
#   page: page code cannot reach Node, the host or any token.
# - The candidate's own flow.json, tests or screenshots are never read.
#
# The runner checkout must be clean, and its commit is recorded as the
# runner in provenance.json. Publishing an authoritative browser-flow check
# from this runner needs an operator-pinned, independently reviewed runner
# commit (see scripts/native/README.md); this script has no publish mode.
#
#   scripts/visual/isolated-flow.sh <out dir> <flow> <candidate sha>
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
RUNNER=$(cd "$HERE/../.." && pwd)
OUT=${1:?usage: isolated-flow.sh <out dir> <flow> <candidate sha>}
FLOW=${2:?usage: isolated-flow.sh <out dir> <flow> <candidate sha>}
SHA=${3:?usage: isolated-flow.sh <out dir> <flow> <candidate sha>}
ROOT=${CARNIVAL_BROWSER_DIR:-/tmp/carnival-browser}

if [ -L "$OUT" ] || { [ -e "$OUT" ] && [ ! -d "$OUT" ]; }; then
  echo "$OUT is not a plain directory" >&2
  exit 2
fi
if [ -n "$(git -C "$RUNNER" status --porcelain --untracked-files=all)" ]; then
  echo "runner checkout has uncommitted changes: refusing" >&2
  exit 2
fi
RUNNER_SHA=$(git -C "$RUNNER" rev-parse HEAD)
mkdir -p "$OUT"
OUT=$(mktemp -d "$OUT/attempt.XXXXXX")
WORK=$(mktemp -u -d "${TMPDIR:-/tmp}/carnival-iso.XXXXXX")
SERVER=
cleanup() {
  [ -n "$SERVER" ] && kill "$SERVER" 2>/dev/null || true
  rm -rf "$WORK"
}
trap cleanup EXIT

"$HERE/isolated-build.sh" "$(git -C "$RUNNER" rev-parse --git-common-dir)" "$SHA" "$WORK"
"$HERE/setup-browser.sh" >&2
# shellcheck disable=SC1091
. "$ROOT/env.sh"
node "$HERE/static-serve.mjs" "$WORK/dist" >"$WORK/port" &
SERVER=$!
for _ in $(seq 40); do [ -s "$WORK/port" ] && break; sleep 0.25; done
BASE="http://127.0.0.1:$(cat "$WORK/port")/"
node "$HERE/flow.mjs" "$BASE" "$OUT" "$FLOW"
node "$HERE/isolated-record.mjs" "$OUT" "$FLOW" "$SHA" "$RUNNER_SHA" >"$WORK/provenance.json"
mv "$WORK/provenance.json" "$OUT/provenance.json"
echo "$OUT"
