#!/usr/bin/env bash
# Runs the trusted flow harness against built candidate files inside a
# disposable container with --network none, so the candidate's page
# JavaScript and the Chromium that runs it never reach the host's network,
# environment, files or Docker socket.
#
#   scripts/visual/isolated-browser.sh <image> <harness dir> <playwright dir> <dist dir> <report dir> <flow>
#
# <harness dir> holds flow.mjs and static-serve.mjs and is mounted read-only,
# as are <playwright dir> and <dist dir>. Only <report dir>, which must be an
# empty directory the build never saw, is writable.
set -euo pipefail

USAGE="usage: isolated-browser.sh <image> <harness> <playwright> <dist> <report> <flow>"
IMAGE=${1:?$USAGE}
HARNESS=${2:?$USAGE}
PW=${3:?$USAGE}
DIST=${4:?$USAGE}
REPORT=${5:?$USAGE}
FLOW=${6:?$USAGE}

[ "$(id -u)" != 0 ] || { echo "run as a non-root user" >&2; exit 2; }
if [ -L "$REPORT" ] || [ ! -d "$REPORT" ] || [ -n "$(ls -A "$REPORT")" ]; then
  echo "$REPORT must be an empty plain directory" >&2
  exit 2
fi
docker image inspect "$IMAGE" >/dev/null 2>&1 || { echo "image $IMAGE is not present: refusing" >&2; exit 3; }
docker run --rm --pull never --init --network none --user "$(id -u):$(id -g)" --cap-drop ALL \
  --security-opt no-new-privileges --read-only \
  --tmpfs /tmp:rw,size=512m --memory 2g --memory-swap 2g --cpus 2 --pids-limit 512 --shm-size 256m \
  -e HOME=/tmp/home -e PLAYWRIGHT_DIR=/pw -e FLOW="$FLOW" \
  -v "$HARNESS:/harness:ro" -v "$PW:/pw:ro" -v "$DIST:/site:ro" -v "$REPORT:/report:rw" \
  "$IMAGE" sh -c '
    node /harness/static-serve.mjs /site >/tmp/port & 
    for i in $(seq 40); do [ -s /tmp/port ] && break; sleep 0.25; done
    exec node /harness/flow.mjs "http://127.0.0.1:$(cat /tmp/port)/" /report "$FLOW"' >&2
