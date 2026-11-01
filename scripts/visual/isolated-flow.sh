#!/usr/bin/env bash
# Plays a flow on one exact pull request commit without running any of that
# commit's code on this host. Capture only: it publishes nothing.
#
# - The candidate is built by isolated-build.sh in a disposable container.
# - The built files, the page's JavaScript and Chromium run in a second
#   disposable container from a digest-pinned Playwright image, with
#   --network none (loopback only), no host environment, home, token, Git
#   directory or Docker socket, every capability dropped and a read-only root.
#   Chromium's own sandbox cannot start under Docker's default seccomp profile
#   and this runner changes no security settings, so it runs with
#   chromiumSandbox off; the container is the boundary, and provenance.json
#   says so.
# - The trusted harness (flow.mjs, static-serve.mjs) and the dependency
#   snapshot are mounted read-only, the built files read-only, and the report
#   goes to a fresh output directory that the build never saw. The record is
#   checked on the host by isolated-record.mjs, which runs no candidate code.
# - The candidate's own flow.json, tests or screenshots are never read.
#
# The runner checkout must be clean, and its commit is recorded as the
# runner in provenance.json. Publishing an authoritative browser-flow check
# from this runner needs an operator-pinned, independently reviewed runner
# commit (see scripts/native/README.md); this script has no publish mode.
# Images are never pulled here: the operator pulls them by digest first.
#
#   scripts/visual/isolated-flow.sh <out dir> <flow> <candidate sha>
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
RUNNER=$(cd "$HERE/../.." && pwd)
OUT=${1:?usage: isolated-flow.sh <out dir> <flow> <candidate sha>}
FLOW=${2:?usage: isolated-flow.sh <out dir> <flow> <candidate sha>}
SHA=${3:?usage: isolated-flow.sh <out dir> <flow> <candidate sha>}
PW_IMAGE=${CARNIVAL_PLAYWRIGHT_IMAGE:-mcr.microsoft.com/playwright@sha256:5b8f294aff9041b7191c34a4bab3ac270157a28774d4b0660e9743297b697e48}

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
cleanup() { rm -rf "$WORK" "$WORK.deps" "$WORK.harness" "$WORK.report"; }
trap cleanup EXIT

docker image inspect "$PW_IMAGE" >/dev/null 2>&1 || { echo "image $PW_IMAGE is not present: refusing" >&2; exit 3; }
"$HERE/isolated-deps.sh" "$RUNNER" "$WORK.deps"
"$HERE/isolated-build.sh" "$(git -C "$RUNNER" rev-parse --git-common-dir)" "$SHA" "$WORK" "$WORK.deps"
# The harness is copied out of the runner so the container sees exactly the
# committed files, read-only.
mkdir -p "$WORK.harness" "$WORK.report"
git -C "$RUNNER" show "$RUNNER_SHA:scripts/visual/flow.mjs" >"$WORK.harness/flow.mjs"
git -C "$RUNNER" show "$RUNNER_SHA:scripts/visual/static-serve.mjs" >"$WORK.harness/static-serve.mjs"
"$HERE/isolated-browser.sh" "$PW_IMAGE" "$WORK.harness" "$WORK.deps/pw" "$WORK/dist" "$WORK.report" "$FLOW"
cp "$WORK.report"/* "$OUT"/
node "$HERE/isolated-record.mjs" "$OUT" "$FLOW" "$SHA" "$RUNNER_SHA" >"$WORK/provenance.json"
mv "$WORK/provenance.json" "$OUT/provenance.json"
echo "$OUT"
