#!/usr/bin/env bash
# Builds one exact commit of a pull request inside a disposable Docker
# container, so the candidate's npm ci, install scripts, Vite config and build
# never run on the credentialed host.
#
# Trusted code: run it from the reviewed runner checkout, never from the
# candidate. The candidate is exported with `git archive` (no .git) into a
# fresh directory; only that copy and a fresh output directory are mounted.
# No host home, gh config, token, Git directory or Docker socket is visible,
# no host environment is passed in, and the container runs as the calling non-root uid with
# every capability dropped, no-new-privileges, a read-only root, and memory,
# CPU and process limits. `npm ci` has public registry networking; the build
# runs with --network none.
#
#   scripts/visual/isolated-build.sh <git dir> <sha> <work dir>
#
# Writes <work dir>/dist. Exits non-zero, writing nothing usable, on any
# failure, including a capability the boundary needs being absent.
set -euo pipefail

GIT_DIR=${1:?usage: isolated-build.sh <git dir> <sha> <work dir>}
SHA=${2:?usage: isolated-build.sh <git dir> <sha> <work dir>}
WORK=${3:?usage: isolated-build.sh <git dir> <sha> <work dir>}
IMAGE=${CARNIVAL_ISOLATED_IMAGE:-node@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da}

[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "not a full commit sha: $SHA" >&2; exit 2; }
if [ -L "$WORK" ] || [ -e "$WORK" ]; then
  echo "$WORK must not exist yet" >&2
  exit 2
fi
# Fail closed when the daemon lacks the isolation this boundary relies on.
SEC=$(docker info --format '{{json .SecurityOptions}}')
case "$SEC" in *seccomp*) ;; *) echo "docker has no seccomp: refusing" >&2; exit 3 ;; esac
case "$SEC" in *rootless*|*userns*|*cgroupns*) ;; *) echo "docker has no namespace isolation option: refusing" >&2; exit 3 ;; esac

mkdir -p "$WORK/src" "$WORK/dist"
git --git-dir="$GIT_DIR" cat-file -e "$SHA^{commit}"
git --git-dir="$GIT_DIR" archive --format=tar "$SHA" | tar -x -C "$WORK/src"
# A symlink in the tree could point the build or the server outside the copy.
if [ -n "$(find "$WORK/src" -type l -print -quit)" ]; then
  echo "candidate tree contains a symlink: refusing" >&2
  exit 4
fi

[ "$(id -u)" != 0 ] || { echo "run as a non-root user" >&2; exit 2; }
BOX=(docker run --rm --init --user "$(id -u):$(id -g)" --cap-drop ALL
  --security-opt no-new-privileges --read-only
  --tmpfs /tmp:rw,size=512m --memory 2g --memory-swap 2g --cpus 2 --pids-limit 512
  -e HOME=/tmp/home -e npm_config_cache=/tmp/npm -e CI=1
  -v "$WORK/src:/src:rw" -w /src)

"${BOX[@]}" --network bridge "$IMAGE" npm ci --no-audit --no-fund >&2
"${BOX[@]}" --network none -v "$WORK/dist:/out:rw" "$IMAGE" \
  node_modules/.bin/vite build --outDir /out --emptyOutDir >&2
