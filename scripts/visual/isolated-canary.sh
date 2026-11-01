#!/usr/bin/env bash
# Boundary test for isolated-build.sh and isolated-browser.sh with nonsecret
# canaries. It makes a throwaway repository whose one commit is this runner's
# tree with a hostile Vite config and a hostile page script, so it passes the
# dependency snapshot check and reaches both candidate phases:
#
# - build: the Vite config tries to read a controller canary file, write a
#   trusted-code canary, the controller's Git directory and the dependency
#   snapshot, reach the Docker socket, and open TCP connections to a listener
#   on the host's Docker gateway, the cloud metadata address and a private
#   address. It also leaves a forged flow.json and a symlinked screenshot.
# - page: the built page's JavaScript fetches the same host listener,
#   metadata and private addresses, and file URLs for the canary and socket.
#
# The host listener counts every connection, so a refused or unroutable
# connection is observed from outside, not inferred from a missing variable.
# Exits non-zero naming any boundary that did not hold. Needs Docker and the
# pinned images already pulled.
#
#   scripts/visual/isolated-canary.sh [--unboxed]
#
# --unboxed is the control: it runs the same build probe on the host and the
# same page with a bridge network, and must report breaches.
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
RUNNER=$(cd "$HERE/../.." && pwd)
PW_IMAGE=${CARNIVAL_PLAYWRIGHT_IMAGE:-mcr.microsoft.com/playwright@sha256:5b8f294aff9041b7191c34a4bab3ac270157a28774d4b0660e9743297b697e48}
T=$(mktemp -d "${TMPDIR:-/tmp}/carnival-canary.XXXXXX")
LISTENER=
trap '[ -n "$LISTENER" ] && kill "$LISTENER" 2>/dev/null; rm -rf "$T"' EXIT
CANARY="canary-$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')"
GATEWAY=$(docker network inspect bridge -f '{{(index .IPAM.Config 0).Gateway}}')
mkdir -p "$T/controller" "$T/trusted" "$T/repo"
echo "$CANARY" >"$T/controller/token"
echo trusted >"$T/trusted/flow.mjs"

# A host listener on every interface: any connection from a candidate is a breach.
node -e '
  const s = require("net").createServer((c) => { require("fs").appendFileSync(process.argv[1], "hit\n"); c.end("HTTP/1.0 200 OK\r\nAccess-Control-Allow-Origin: *\r\n\r\nok"); });
  s.listen(0, "0.0.0.0", () => console.log(s.address().port));' "$T/listener-hits" >"$T/port" &
LISTENER=$!
for _ in $(seq 40); do [ -s "$T/port" ] && break; sleep 0.25; done
PORT=$(cat "$T/port")
touch "$T/listener-hits"

git -C "$RUNNER" archive HEAD | tar -x -C "$T/repo"
git -C "$T/repo" init -q
echo shared >"$T/repo/.git/canary"
TARGETS="['$GATEWAY:$PORT', '169.254.169.254:80', '10.0.0.1:80', '127.0.0.1:2375']"
cat >"$T/repo/vite.config.ts" <<JS
import { defineConfig } from 'vite';
import fs from 'node:fs';
import net from 'node:net';
const hits: string[] = [];
const tryRead = (p: string) => { try { hits.push('read ' + p + ': ' + fs.readFileSync(p, 'utf8')); } catch {} };
const tryWrite = (p: string) => { try { fs.writeFileSync(p, 'pwned'); hits.push('wrote ' + p); } catch {} };
tryRead('$T/controller/token');
for (const p of ['$T/trusted/flow.mjs', '$T/repo/.git/canary', '/src/.git/canary', '/src/node_modules/vite/package.json']) tryWrite(p);
for (const p of ['/var/run/docker.sock', '/run/docker.sock']) if (fs.existsSync(p)) hits.push('socket ' + p);
for (const k of Object.keys(process.env)) if (/TOKEN|GH_|GITHUB/.test(k)) hits.push('env ' + k);
const connect = (t: string) => new Promise<void>((done) => {
  const [host, port] = t.split(':');
  const s = net.connect({ host, port: Number(port), timeout: 2000 });
  s.on('connect', () => { hits.push('connected ' + t); s.destroy(); done(); });
  s.on('error', () => done()); s.on('timeout', () => { s.destroy(); done(); });
});
await Promise.all(${TARGETS}.map(connect));
const out = process.env.CANARY_OUT ?? '/out';
// Written after Vite empties the output directory.
export default defineConfig({ base: './', plugins: [{ name: 'forge', writeBundle() {
  fs.writeFileSync(out + '/build-hits.txt', hits.join('\n'));
  fs.writeFileSync(out + '/build-ran', '');
  fs.writeFileSync(out + '/flow.json', JSON.stringify({ flow: 'mini-putt-hole-next', result: 'pass', screenshots: [{ file: '../../etc/passwd', sha256: '0' }] }));
  fs.symlinkSync('/etc/passwd', out + '/mini-putt-hole-next-hole-done.png');
} }] });
JS
cat >"$T/repo/src/probe.ts" <<JS
const hits: string[] = [];
const urls = ${TARGETS}.map((t) => 'http://' + t + '/').concat(['file://$T/controller/token', 'file:///var/run/docker.sock']);
const tryFetch = (u: string) => Promise.race([
  fetch(u, { mode: 'no-cors' }).then(() => { hits.push('fetched ' + u); }, () => {}),
  new Promise((r) => setTimeout(r, 3000)),
]);
(window as unknown as { probe: Promise<string[]> }).probe = Promise.all(urls.map(tryFetch)).then(() => hits);
JS
sed -i 's|<script type="module" src="/src/main.ts"></script>|<script type="module" src="/src/probe.ts"></script>|' "$T/repo/index.html"
git -C "$T/repo" add -A
git -C "$T/repo" -c user.name=canary -c user.email=canary@example.invalid commit -qm hostile
SHA=$(git -C "$T/repo" rev-parse HEAD)

# A trusted probe harness in place of flow.mjs: it loads the page and records
# what the page's script managed. The page itself cannot write files.
mkdir -p "$T/harness" "$T/report"
cp "$HERE/static-serve.mjs" "$T/harness/"
cat >"$T/harness/flow.mjs" <<'JS'
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const [base, out] = process.argv.slice(2);
const { chromium } = createRequire('/pw/package.json')('playwright');
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(base);
const hits = await page.evaluate(() => window.probe);
writeFileSync(out + '/page-hits.json', JSON.stringify(hits));
await browser.close();
JS

"$HERE/isolated-deps.sh" "$RUNNER" "$T/deps" >"$T/deps.log" 2>&1
SNAPSHOT=$(cd "$T/deps" && find node_modules pw -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum)
if [ "${1:-}" = --unboxed ]; then
  mkdir -p "$T/work/src" "$T/work/dist"
  git -C "$T/repo" archive "$SHA" | tar -x -C "$T/work/src"
  cp -r "$T/deps/node_modules" "$T/work/src/node_modules"
  (cd "$T/work/src" && CANARY_OUT="$T/work/dist" node node_modules/vite/bin/vite.js build --outDir "$T/work/dist") >"$T/build.log" 2>&1 || true
  docker run --rm --pull never --network bridge --user "$(id -u):$(id -g)" -e HOME=/tmp \
    -v "$T/harness:/harness:ro" -v "$T/deps/pw:/pw:ro" -v "$T/work/dist:/site:ro" -v "$T/report:/report" \
    "$PW_IMAGE" sh -c 'node /harness/static-serve.mjs /site >/tmp/port & sleep 1; node /harness/flow.mjs "http://127.0.0.1:$(cat /tmp/port)/" /report' >"$T/browser.log" 2>&1 || true
else
  "$HERE/isolated-build.sh" "$T/repo/.git" "$SHA" "$T/work" "$T/deps" >"$T/build.log" 2>&1 || true
  "$HERE/isolated-browser.sh" "$PW_IMAGE" "$T/harness" "$T/deps/pw" "$T/work/dist" "$T/report" probe >"$T/browser.log" 2>&1 || true
fi

FAIL=0
[ -e "$T/work/dist/build-ran" ] || { echo "candidate build never ran: the test proves nothing"; cat "$T/build.log"; exit 1; }
[ -e "$T/report/page-hits.json" ] || { echo "candidate page never ran: the test proves nothing"; cat "$T/browser.log"; exit 1; }
grep -qr "$CANARY" "$T/work" "$T/report" "$T/build.log" "$T/browser.log" 2>/dev/null && { echo "BREACH: controller canary reached the candidate"; FAIL=1; }
[ "$(cat "$T/trusted/flow.mjs")" = trusted ] || { echo "BREACH: trusted code changed"; FAIL=1; }
[ "$(cat "$T/repo/.git/canary")" = shared ] || { echo "BREACH: controller Git changed"; FAIL=1; }
[ "$SNAPSHOT" = "$(cd "$T/deps" && find node_modules pw -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum)" ] || { echo "BREACH: dependency snapshot changed"; FAIL=1; }
[ -s "$T/work/dist/build-hits.txt" ] && { echo "BREACH in the build:"; sed "s/$CANARY/<canary>/g" "$T/work/dist/build-hits.txt"; echo; FAIL=1; }
[ "$(cat "$T/report/page-hits.json")" = "[]" ] || { echo "BREACH in the page: $(cat "$T/report/page-hits.json")"; FAIL=1; }
[ -s "$T/listener-hits" ] && { echo "BREACH: host listener got $(wc -l <"$T/listener-hits") connection(s)"; FAIL=1; }
# The forged report and symlinked screenshot must never pass the record check.
if node "$HERE/isolated-record.mjs" "$T/work/dist" mini-putt-hole-next "$SHA" "$SHA" >/dev/null 2>&1; then
  echo "BREACH: forged flow.json accepted"; FAIL=1
fi
[ ! -e "$T/report/flow.json" ] || { echo "BREACH: a report appeared in the report directory"; FAIL=1; }
[ "$FAIL" = 0 ] && echo "boundary held in build and page: canary unread, trusted, Git and snapshot canaries unchanged, no socket, no token, host listener, metadata and private addresses unreachable, forged report refused"
exit "$FAIL"
