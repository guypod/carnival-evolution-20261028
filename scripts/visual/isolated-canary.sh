#!/usr/bin/env bash
# Boundary test for isolated-build.sh with nonsecret canaries. It makes a
# throwaway repository whose one commit is a hostile "candidate": its npm
# install script and its build try to read a controller canary file, write
# into a trusted-code canary and the controller's Git directory, reach the
# Docker socket and the host, and leave a forged flow.json and screenshot in
# the output. Then it checks, from the host, that every attempt failed.
# Exits non-zero naming any boundary that did not hold. Needs Docker.
#
#   scripts/visual/isolated-canary.sh [--unboxed]
#
# --unboxed is the control: it runs the same candidate install on the host,
# outside any container, and must report breaches.
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
T=$(mktemp -d "${TMPDIR:-/tmp}/carnival-canary.XXXXXX")
trap 'rm -rf "$T"' EXIT
CANARY="canary-$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')"
mkdir -p "$T/controller" "$T/trusted" "$T/repo"
echo "$CANARY" >"$T/controller/token"
echo trusted >"$T/trusted/flow.mjs"
git -C "$T/repo" init -q
echo shared >"$T/repo/.git/canary"

# The hostile candidate. Every probe writes what it managed into /out so the
# host can see a breach; the build itself still succeeds.
cat >"$T/repo/package.json" <<JSON
{ "name": "hostile", "version": "1.0.0", "private": true,
  "scripts": { "postinstall": "node probe.cjs" } }
JSON
echo '{"name":"hostile","version":"1.0.0","lockfileVersion":3,"requires":true,"packages":{"":{"name":"hostile","version":"1.0.0","hasInstallScript":true}}}' >"$T/repo/package-lock.json"
cat >"$T/repo/probe.cjs" <<JS
const fs = require('fs');
const SRC = process.cwd();
const hits = [];
const tryRead = (p) => { try { hits.push('read ' + p + ': ' + fs.readFileSync(p, 'utf8')); } catch {} };
const tryWrite = (p) => { try { fs.writeFileSync(p, 'pwned'); hits.push('wrote ' + p); } catch {} };
for (const p of ['$T/controller/token', '/host/controller/token']) tryRead(p);
for (const p of ['$T/trusted/flow.mjs', '$T/repo/.git/canary', '/src/.git/canary']) tryWrite(p);
for (const p of ['/var/run/docker.sock', '/run/docker.sock']) if (fs.existsSync(p)) hits.push('socket ' + p);
for (const k of Object.keys(process.env)) if (/TOKEN|GH_|GITHUB/.test(k)) hits.push('env ' + k);
if (fs.existsSync('/src/.git')) hits.push('git dir /src/.git');
try { fs.mkdirSync('/out', { recursive: true }); fs.writeFileSync('/out/hits.txt', hits.join('\n')); } catch {}
fs.writeFileSync(SRC + '/install-hits.txt', hits.join('\n'));
// The candidate controls its own build binary.
fs.mkdirSync(SRC + '/node_modules/.bin', { recursive: true });
fs.copyFileSync(SRC + '/vite.sh', SRC + '/node_modules/.bin/vite');
fs.chmodSync(SRC + '/node_modules/.bin/vite', 0o755);
JS
# The build step runs the candidate's own vite binary, which the probe
# writes at install time.
cat >"$T/repo/vite.sh" <<'SH'
#!/bin/sh
node probe.cjs
touch /out/build-ran
echo '{"flow":"mini-putt-hole-next","result":"pass","screenshots":[{"file":"../../etc/passwd","sha256":"0"}]}' >/out/flow.json
ln -s /etc/passwd /out/mini-putt-hole-next-hole-done.png
SH
git -C "$T/repo" add -A
git -C "$T/repo" -c user.name=canary -c user.email=canary@example.invalid commit -qm hostile
SHA=$(git -C "$T/repo" rev-parse HEAD)

if [ "${1:-}" = --unboxed ]; then
  mkdir -p "$T/work/dist" && git -C "$T/repo" archive "$SHA" | (mkdir -p "$T/work/src" && tar -x -C "$T/work/src")
  (cd "$T/work/src" && node probe.cjs && cp install-hits.txt "$T/work/dist/hits.txt") >"$T/build.log" 2>&1 || true
else
  "$HERE/isolated-build.sh" "$T/repo/.git" "$SHA" "$T/work" >"$T/build.log" 2>&1 || true
  [ -e "$T/work/dist/build-ran" ] || { echo "candidate build never ran: the test proves nothing"; cat "$T/build.log"; exit 1; }
fi

FAIL=0
grep -qr "$CANARY" "$T/work" "$T/build.log" 2>/dev/null && { echo "BREACH: controller canary reached the candidate"; FAIL=1; }
[ "$(cat "$T/trusted/flow.mjs")" = trusted ] || { echo "BREACH: trusted code changed"; FAIL=1; }
[ "$(cat "$T/repo/.git/canary")" = shared ] || { echo "BREACH: controller Git changed"; FAIL=1; }
for f in "$T/work/src/install-hits.txt" "$T/work/dist/hits.txt"; do
  [ -s "$f" ] && { echo "BREACH in $f:"; sed "s/$CANARY/<canary>/g" "$f"; FAIL=1; }
done
[ -e "$T/work/src/install-hits.txt" ] || { echo "probe never ran: the test proves nothing"; FAIL=1; }
# The forged report and symlinked screenshot must never pass the record check.
if [ -d "$T/work/dist" ]; then
  if node "$HERE/isolated-record.mjs" "$T/work/dist" mini-putt-hole-next "$SHA" "$SHA" >/dev/null 2>&1; then
    echo "BREACH: forged flow.json accepted"; FAIL=1
  fi
fi
[ "$FAIL" = 0 ] && echo "boundary held: canary unread, trusted and Git canaries unchanged, no socket, no token, forged report refused"
exit "$FAIL"
