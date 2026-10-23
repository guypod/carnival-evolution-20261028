#!/bin/sh
set -eu
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT=$(CDPATH= cd -- "$HERE/../.." && pwd)
PYTHON=$(command -v python3)
"$PYTHON" "$HERE/adapter.py" record-shell "$ROOT" "$1"
# env -i is deliberate. No caller credential variables or user HOME are inherited.
# This is a process convention, NOT an OS/network isolation boundary.
cd "$ROOT/repo"
exec env -i HOME="$ROOT/.replay-state/home" TMPDIR="$ROOT/.replay-state/tmp" \
  PATH="$ROOT/.replay-state/bin:/usr/local/bin:/usr/bin:/bin" \
  REPLAY_ROOT="$ROOT" REPLAY_ADAPTER="$HERE/adapter.py" REPLAY_PYTHON="$PYTHON" \
  GH_REPO="fixture-owner/carnival-replay" GIT_TERMINAL_PROMPT=0 \
  GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null LC_ALL=C \
  /bin/sh -c "$1"
