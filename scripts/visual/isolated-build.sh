#!/usr/bin/env bash
# Builds one exact commit of a pull request inside a disposable Docker
# container, so the candidate's npm ci, install scripts, Vite config and build
# never run on the credentialed host.
#
# Trusted code: run it from the reviewed runner checkout, never from the
# candidate. The candidate is exported with `git archive` (no .git) into a
# fresh directory; only that copy, the trusted dependency snapshot from
# isolated-deps.sh (read-only) and a fresh output directory are mounted.
# Nothing is installed from the candidate: a candidate whose package.json,
# package-lock.json or .npmrc differs from the snapshot is refused (exit 5)
# and its flows stay owed. No candidate code ever has a network: the build,
# which runs the candidate's Vite config, runs with --network none. No host
# home, gh config, token, Git directory or Docker socket is visible, no host
# environment is passed in, and the container runs as the calling non-root
# uid with every capability dropped, no-new-privileges, a read-only root, and
# memory, CPU and process limits. Images are never pulled here (--pull never):
# a missing image fails closed.
#
#   scripts/visual/isolated-build.sh <git dir> <sha> <work dir> <deps dir>
#
# Writes <work dir>/dist. Exits non-zero, writing nothing usable, on any
# failure, including a capability the boundary needs being absent.
set -euo pipefail

USAGE="usage: isolated-build.sh <git dir> <sha> <work dir> <deps dir>"
GIT_DIR=${1:?$USAGE}
SHA=${2:?$USAGE}
WORK=${3:?$USAGE}
DEPS=${4:?$USAGE}
IMAGE=${CARNIVAL_ISOLATED_IMAGE:-node@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da}

[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "not a full commit sha: $SHA" >&2; exit 2; }
if [ -L "$WORK" ] || [ -e "$WORK" ]; then
  echo "$WORK must not exist yet" >&2
  exit 2
fi
if [ -L "$DEPS" ] || [ ! -d "$DEPS/node_modules" ] || [ ! -f "$DEPS/node_modules/vite/bin/vite.js" ]; then
  echo "no trusted dependency snapshot at $DEPS: refusing" >&2
  exit 3
fi
# Fail closed when the daemon lacks the isolation this boundary relies on.
SEC=$(docker info --format '{{json .SecurityOptions}}')
case "$SEC" in *seccomp*) ;; *) echo "docker has no seccomp: refusing" >&2; exit 3 ;; esac
case "$SEC" in *rootless*|*userns*|*cgroupns*) ;; *) echo "docker has no namespace isolation option: refusing" >&2; exit 3 ;; esac
docker image inspect "$IMAGE" >/dev/null 2>&1 || { echo "image $IMAGE is not present: refusing" >&2; exit 3; }

mkdir -p "$WORK/src" "$WORK/dist"
git --git-dir="$GIT_DIR" cat-file -e "$SHA^{commit}"
git --git-dir="$GIT_DIR" archive --format=tar "$SHA" | tar -x -C "$WORK/src"
# A symlink in the tree could point the build or the server outside the copy.
if [ -n "$(find "$WORK/src" -type l -print -quit)" ]; then
  echo "candidate tree contains a symlink: refusing" >&2
  exit 4
fi
for f in package.json package-lock.json .npmrc; do
  if ! cmp -s "$WORK/src/$f" "$DEPS/$f" && { [ -e "$WORK/src/$f" ] || [ -e "$DEPS/$f" ]; }; then
    echo "candidate $f differs from the trusted dependency snapshot: owed" >&2
    exit 5
  fi
done
[ ! -e "$WORK/src/node_modules" ] || { echo "candidate tree has node_modules: refusing" >&2; exit 4; }
mkdir "$WORK/src/node_modules"

[ "$(id -u)" != 0 ] || { echo "run as a non-root user" >&2; exit 2; }
docker run --rm --pull never --init --network none --user "$(id -u):$(id -g)" --cap-drop ALL \
  --security-opt no-new-privileges --read-only \
  --tmpfs /tmp:rw,size=512m --memory 2g --memory-swap 2g --cpus 2 --pids-limit 512 \
  -e HOME=/tmp/home -e CI=1 \
  -v "$WORK/src:/src:rw" -v "$DEPS/node_modules:/src/node_modules:ro" \
  --tmpfs /src/node_modules/.vite-temp:rw,size=64m,mode=1777 \
  -v "$WORK/dist:/out:rw" -w /src "$IMAGE" \
  node /src/node_modules/vite/bin/vite.js build --outDir /out --emptyOutDir >&2
