#!/usr/bin/env bash
# Prepares the trusted dependency snapshot for isolated-build.sh and
# isolated-flow.sh, before any candidate code exists on disk. It installs the
# runner checkout's own package.json and package-lock.json (never a
# candidate's) with --ignore-scripts, and the pinned Playwright package, in a
# disposable digest-pinned Node container. This is the only networked step,
# and it runs no candidate code.
#
#   scripts/visual/isolated-deps.sh <runner dir> <deps dir>
#
# Writes <deps dir>/{package.json,package-lock.json,node_modules,pw}. A
# candidate whose package.json, package-lock.json or .npmrc differs from the
# snapshot is refused by isolated-build.sh and stays owed.
set -euo pipefail

RUNNER=${1:?usage: isolated-deps.sh <runner dir> <deps dir>}
DEPS=${2:?usage: isolated-deps.sh <runner dir> <deps dir>}
NODE_IMAGE=${CARNIVAL_ISOLATED_IMAGE:-node@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da}
PLAYWRIGHT_VERSION=1.61.1

if [ -L "$DEPS" ] || [ -e "$DEPS" ]; then
  echo "$DEPS must not exist yet" >&2
  exit 2
fi
[ "$(id -u)" != 0 ] || { echo "run as a non-root user" >&2; exit 2; }
mkdir -p "$DEPS/pw"
cp "$RUNNER/package.json" "$RUNNER/package-lock.json" "$DEPS/"
[ ! -e "$RUNNER/.npmrc" ] || cp "$RUNNER/.npmrc" "$DEPS/.npmrc"
echo '{"private":true}' >"$DEPS/pw/package.json"
BOX=(docker run --rm --pull never --init --user "$(id -u):$(id -g)" --cap-drop ALL
  --security-opt no-new-privileges --read-only --tmpfs /tmp:rw,size=512m
  --memory 2g --memory-swap 2g --cpus 2 --pids-limit 512
  -e HOME=/tmp/home -e npm_config_cache=/tmp/npm -e CI=1)
"${BOX[@]}" -v "$DEPS:/deps:rw" -w /deps "$NODE_IMAGE" \
  npm ci --ignore-scripts --no-audit --no-fund >&2
"${BOX[@]}" -v "$DEPS/pw:/pw:rw" -w /pw "$NODE_IMAGE" \
  npm install --ignore-scripts --no-audit --no-fund --save-exact "playwright@$PLAYWRIGHT_VERSION" >&2
# Vite bundles its config into node_modules/.vite-temp; the build mounts a
# tmpfs here because the snapshot is read-only to the candidate.
mkdir -p "$DEPS/node_modules/.vite-temp"
[ -x "$DEPS/node_modules/vite/bin/vite.js" ] || [ -f "$DEPS/node_modules/vite/bin/vite.js" ] || { echo "snapshot has no vite" >&2; exit 3; }
[ -f "$DEPS/pw/node_modules/playwright/package.json" ] || { echo "snapshot has no playwright" >&2; exit 3; }
