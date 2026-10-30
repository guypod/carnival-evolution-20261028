#!/usr/bin/env bash
# Sets up headless Chromium for scripts/visual/capture.mjs without sudo and
# without touching the carnival's dependencies. Everything goes under one
# directory outside the clone (default /tmp/carnival-browser):
#
# - Playwright, pinned, in its own package, and its matching Chromium build.
# - The shared libraries Chromium needs, downloaded with apt-get download and
#   unpacked with dpkg-deb -x, so nothing is installed system wide.
# - A fontconfig file pointing at the unpacked DejaVu fonts.
#
# Prints the environment to source. Exits non-zero if Chromium still cannot
# start, so a caller reports a capability failure instead of inventing images.
set -euo pipefail

PLAYWRIGHT_VERSION=1.61.1
ROOT=${CARNIVAL_BROWSER_DIR:-/tmp/carnival-browser}
LIBS="$ROOT/libs"
APT="-o Dir::State::Lists=$ROOT/apt/lists -o Dir::Cache=$ROOT/apt/cache -o Debug::NoLocking=1"
PACKAGES="libglib2.0-0t64 libnspr4 libnss3 libatk1.0-0t64 libatk-bridge2.0-0t64 libdbus-1-3
  libx11-6 libxcomposite1 libxdamage1 libxext6 libxfixes3 libxrandr2 libgbm1 libxcb1
  libxkbcommon0 libasound2t64 libatspi2.0-0t64 libxau6 libxdmcp6 libdrm2 libwayland-server0
  libxrender1 libxi6 libbsd0 libmd0 libffi8 libpcre2-8-0 libexpat1 libxres1
  fonts-dejavu-core fontconfig-config libfontconfig1 libfreetype6"

mkdir -p "$ROOT/pw" "$LIBS/debs" "$ROOT/apt/lists/partial" "$ROOT/apt/cache/archives/partial"
if [ ! -d "$ROOT/pw/node_modules/playwright" ]; then
  (cd "$ROOT/pw" && npm init -y >/dev/null && npm install --no-audit --no-fund "playwright@$PLAYWRIGHT_VERSION" >/dev/null)
fi
(cd "$ROOT/pw" && npx playwright install chromium >/dev/null)

if command -v apt-get >/dev/null && command -v dpkg-deb >/dev/null; then
  # The marker is written only after every package downloaded, so an
  # interrupted download is retried instead of reused.
  if [ ! -f "$LIBS/debs/.complete" ]; then
    rm -f "$LIBS"/debs/*.deb
    # shellcheck disable=SC2086
    apt-get $APT update >/dev/null 2>&1 || true
    # shellcheck disable=SC2086
    (cd "$LIBS/debs" && apt-get $APT download $PACKAGES >/dev/null)
    touch "$LIBS/debs/.complete"
  fi
  for deb in "$LIBS"/debs/*.deb; do dpkg-deb -x "$deb" "$LIBS/root"; done
fi

cat > "$ROOT/fonts.conf" <<CONF
<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig><dir>$LIBS/root/usr/share/fonts</dir><dir>/usr/share/fonts</dir><cachedir>$ROOT/fc-cache</cachedir></fontconfig>
CONF
cat > "$ROOT/env.sh" <<ENV
export LD_LIBRARY_PATH=$LIBS/root/usr/lib/x86_64-linux-gnu:$LIBS/root/lib/x86_64-linux-gnu\${LD_LIBRARY_PATH:+:\$LD_LIBRARY_PATH}
export FONTCONFIG_FILE=$ROOT/fonts.conf
export PLAYWRIGHT_DIR=$ROOT/pw
ENV

# shellcheck disable=SC1091
. "$ROOT/env.sh"
node -e "
const { chromium } = require('$ROOT/pw/node_modules/playwright');
chromium.launch().then(async (b) => { console.log('chromium ' + b.version()); await b.close(); });
"
echo "source $ROOT/env.sh"
