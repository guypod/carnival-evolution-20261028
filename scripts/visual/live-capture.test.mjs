import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { deflateSync } from 'node:zlib';

import { BROKER_LIMITS, LIVE_BASE, LIVE_ORIGIN, createBroker } from './live-broker.mjs';
import { LIVE_FLOWS, browserArgs, buildManifest, liveCapture } from './live-capture.mjs';
import { FLOWS } from './trusted-publish.mjs';

const sha = (b) => createHash('sha256').update(b).digest('hex');
const MERGE = 'b'.repeat(40);
const FLOW = 'mini-putt-hole-next';
const SITE = {
  'index.html': Buffer.from('<script type="module" src="./assets/index-abc.js"></script>'),
  'assets/index-abc.js': Buffer.from('console.log("mini putt")'),
};

function dist(site = SITE) {
  const d = mkdtempSync(join(tmpdir(), 'live-dist-'));
  mkdirSync(join(d, 'assets'));
  for (const [k, v] of Object.entries(site)) writeFileSync(join(d, k), v);
  return d;
}

/** A fake origin; `serve(key, n)` may change bytes per call. Records URLs and init. */
function origin(serve = (k) => SITE[k]) {
  const asked = [];
  const counts = {};
  const upstream = async (url) => {
    asked.push(url);
    const key = url.slice(`${LIVE_ORIGIN}${LIVE_BASE}`.length) || 'index.html';
    counts[key] = (counts[key] ?? 0) + 1;
    const body = serve(key, counts[key]);
    return body ? new Response(body, { status: 200 }) : new Response('no', { status: 404 });
  };
  return { asked, upstream };
}

function png(tag) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    return Buffer.concat([len, Buffer.from(type), data, Buffer.alloc(4)]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1280, 0);
  ihdr.writeUInt32BE(800, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.from(tag))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function get(sock, path, method = 'GET') {
  return new Promise((ok) => {
    const req = request({ socketPath: sock, path, method }, (res) => {
      const c = [];
      res.on('data', (x) => c.push(x));
      res.on('end', () => ok({ status: res.statusCode, body: Buffer.concat(c) }));
    });
    req.on('error', () => ok({ status: 0 }));
    req.end();
  });
}

/** A controlled browser fixture: fetches through the socket, then writes a passing report. */
function browser({ paths = [LIVE_BASE, `${LIVE_BASE}assets/index-abc.js`], tamper } = {}) {
  const seen = [];
  const fn = async ({ socketDir, report }) => {
    for (const p of paths) seen.push(await get(join(socketDir, 'broker.sock'), p));
    const spec = FLOWS[FLOW];
    const shots = spec.states.map((s) => {
      const file = `${FLOW}-${s}.png`;
      const bytes = png(s);
      writeFileSync(join(report, file), bytes);
      return { file, sha256: sha(bytes) };
    });
    const r = {
      flow: FLOW,
      result: 'pass',
      errors: [],
      checks: spec.checks.map((check) => ({ check, result: 'pass' })),
      screenshots: shots,
    };
    writeFileSync(join(report, 'flow.json'), JSON.stringify(r));
    await tamper?.({ socketDir, report });
    return 0;
  };
  return { fn, seen };
}

test('valid mediated static capture produces read-back evidence under evidence/live/<merge>/<flow>', async () => {
  const d = dist();
  const o = origin();
  const b = browser();
  const r = await liveCapture({
    mergeSha: MERGE,
    flow: FLOW,
    dist: d,
    browser: b.fn,
    upstream: o.upstream,
  });
  assert.deepEqual(r.problems, []);
  assert.ok(r.ok);
  assert.deepEqual(
    b.seen.map((s) => s.status),
    [200, 200],
  );
  assert.deepEqual(b.seen[1].body, SITE['assets/index-abc.js']);
  const prefix = `evidence/live/${MERGE}/${FLOW}/`;
  for (const n of ['before.json', 'after.json', 'requests.json', 'identity.json', 'flow.json'])
    assert.ok(r.evidence[prefix + n], n);
  for (const [p, { sha256, bytes }] of Object.entries(r.evidence)) {
    assert.ok(p.startsWith(prefix));
    assert.equal(sha(bytes), sha256);
  }
  assert.equal(r.identity.mergeSha, MERGE);
  assert.equal(r.identity.mediation, 'localhost-socket');
  assert.ok(r.identity.before.finishedAt <= r.identity.after.startedAt);
  // Only the fixed origin and exact manifest keys were fetched.
  for (const u of o.asked) assert.ok(u.startsWith(`${LIVE_ORIGIN}${LIVE_BASE}`));
  rmSync(d, { recursive: true, force: true });
});

test('an asset that differs before, during or after the flow fails the capture', async () => {
  const d = dist();
  const bad = Buffer.from('console.log("stale")');
  const js = 'assets/index-abc.js';
  // call 1 = before scan, call 2 = browser request, call 3 = after scan
  for (const which of [1, 2, 3]) {
    const o = origin((k, n) => (k === js && n === which ? bad : SITE[k]));
    const b = browser();
    const r = await liveCapture({
      mergeSha: MERGE,
      flow: FLOW,
      dist: d,
      browser: b.fn,
      upstream: o.upstream,
    });
    assert.equal(r.ok, false, `mismatch on call ${which}`);
    assert.ok(
      r.problems.some((p) => /differ|does not serve/.test(p)),
      r.problems.join(),
    );
    assert.equal(r.evidence, undefined);
  }
  rmSync(d, { recursive: true, force: true });
});

test('a malformed or traversal manifest is refused before any upstream fetch', async () => {
  const o = origin();
  for (const key of ['../etc/passwd', 'a//b', '/abs', 'x?y', '.', 'a\\b', '%2e%2e/x'])
    assert.throws(() =>
      createBroker({
        manifest: { 'index.html': sha('x'), [key]: sha('y') },
        mergeSha: MERGE,
        receiptDir: tmpdir(),
        upstream: o.upstream,
      }),
    );
  const many = { 'index.html': sha('x') };
  for (let i = 0; i < BROKER_LIMITS.entries + 1; i++) many[`assets/a${i}.js`] = sha('y');
  assert.throws(() => createBroker({ manifest: many, mergeSha: MERGE, receiptDir: tmpdir() }));
  // An isolated build with a non-canonical asset name never reaches the network.
  const d = dist({ ...SITE, 'assets/a b.js': Buffer.from('x') });
  const r = await liveCapture({
    mergeSha: MERGE,
    flow: FLOW,
    dist: d,
    browser: browser().fn,
    upstream: o.upstream,
  });
  assert.equal(r.ok, false);
  assert.match(r.problems[0], /canonical/);
  assert.deepEqual(o.asked, []);
  rmSync(d, { recursive: true, force: true });
});

test('request spam stops intake and keeps a bounded failure summary', async () => {
  const d = dist();
  const o = origin();
  const spam = Array.from({ length: 400 }, (_, i) => `${LIVE_BASE}nope-${i}`);
  const b = browser({ paths: spam });
  const r = await liveCapture({
    mergeSha: MERGE,
    flow: FLOW,
    dist: d,
    browser: b.fn,
    upstream: o.upstream,
    limits: { ...BROKER_LIMITS, requests: 50, failures: 5 },
  });
  assert.equal(r.ok, false);
  assert.ok(r.problems.includes('broker: request limit reached'));
  assert.ok(r.problems.length <= 60);
  assert.ok(b.seen.slice(51).every((s) => s.status !== 200));
  // Spam never fetched anything beyond the two identity scans.
  assert.equal(o.asked.length, 4);
  rmSync(d, { recursive: true, force: true });
});

test('a hung identity scan is bounded by the whole capture deadline', async () => {
  const d = dist();
  const hang = () => new Promise(() => {}); // ignores its abort signal
  const t0 = Date.now();
  const b = browser();
  const r = await liveCapture({
    mergeSha: MERGE,
    flow: FLOW,
    dist: d,
    browser: b.fn,
    upstream: hang,
    limits: { ...BROKER_LIMITS, totalMs: 400, requestMs: 10_000 },
  });
  assert.equal(r.ok, false);
  assert.ok(Date.now() - t0 < 3000, 'capture finished within its bound');
  assert.deepEqual(b.seen, [], 'the browser never ran on an unverified site');
  rmSync(d, { recursive: true, force: true });
});

test('redirects, private destinations, other methods and queries are refused', async () => {
  const d = dist();
  const redirect = async () =>
    new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } });
  let r = await liveCapture({
    mergeSha: MERGE,
    flow: FLOW,
    dist: d,
    browser: browser().fn,
    upstream: redirect,
  });
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => /http 302/.test(p)));

  const o = origin();
  const results = [];
  const probe = async ({ socketDir }) => {
    const s = join(socketDir, 'broker.sock');
    results.push((await get(s, `${LIVE_BASE}?x=1`)).status);
    results.push((await get(s, 'http://169.254.169.254/latest/meta-data/')).status);
    results.push((await get(s, '/other/index.html')).status);
    results.push((await get(s, `${LIVE_BASE}assets/index-abc.js`, 'POST')).status);
    return 0;
  };
  await liveCapture({
    mergeSha: MERGE,
    flow: FLOW,
    dist: d,
    browser: probe,
    upstream: o.upstream,
  });
  assert.deepEqual(results, [404, 404, 404, 405]);
  for (const u of o.asked)
    assert.ok(u.startsWith(`${LIVE_ORIGIN}${LIVE_BASE}`) && !u.includes('?'));
  rmSync(d, { recursive: true, force: true });
});

test('a forged, symlinked or hardlinked report is rejected', async () => {
  const d = dist();
  const shot = `${FLOW}-hole-done.png`;
  const tampers = [
    ({ report }) =>
      writeFileSync(join(report, 'flow.json'), '{"flow":"mini-putt-hole-next","result":"pass"}'),
    ({ report }) => {
      rmSync(join(report, shot));
      symlinkSync('/etc/passwd', join(report, shot));
    },
    ({ report }) => {
      linkSync(join(report, shot), join(report, '..', 'outside.png'));
    },
    ({ report }) => writeFileSync(join(report, shot), png('forged')),
  ];
  for (const tamper of tampers) {
    const r = await liveCapture({
      mergeSha: MERGE,
      flow: FLOW,
      dist: d,
      browser: browser({ tamper }).fn,
      upstream: origin().upstream,
    });
    assert.equal(r.ok, false);
    assert.equal(r.evidence, undefined);
  }
  rmSync(d, { recursive: true, force: true });
});

test('the browser step cannot reach or alter the host-owned receipts', async () => {
  const d = dist();
  let listing;
  const tamper = ({ socketDir }) => {
    listing = readdirSync(socketDir);
    // The receipts live in a sibling 0700 directory that is never mounted;
    // a forged before.json in the socket directory is ignored.
    writeFileSync(
      join(socketDir, 'before.json'),
      JSON.stringify({ mergeSha: MERGE, matched: true }),
    );
  };
  const r = await liveCapture({
    mergeSha: MERGE,
    flow: FLOW,
    dist: d,
    browser: browser({ tamper }).fn,
    upstream: origin().upstream,
  });
  assert.deepEqual(listing, ['broker.sock']);
  assert.ok(r.ok, r.problems.join());
  const before = JSON.parse(r.evidence[`evidence/live/${MERGE}/${FLOW}/before.json`].bytes);
  assert.equal(before.entries['index.html'].sha256, sha(SITE['index.html']));
  // A symlink planted where a receipt goes is refused rather than followed.
  const receipts = mkdtempSync(join(tmpdir(), 'live-rcpt-'));
  symlinkSync('/tmp/elsewhere', join(receipts, 'before.json'));
  const br = createBroker({
    manifest: buildManifest(d),
    mergeSha: MERGE,
    receiptDir: receipts,
    upstream: origin().upstream,
  });
  await assert.rejects(br.identity('before'));
  await br.close().catch(() => {});
  rmSync(receipts, { recursive: true, force: true });
  rmSync(d, { recursive: true, force: true });
});

test('unsupported flows and a bad merge sha stay owed', async () => {
  const d = dist();
  const r = await liveCapture({
    mergeSha: MERGE,
    flow: 'skee-ball-roll',
    dist: d,
    browser: browser().fn,
  });
  assert.equal(r.owed, true);
  assert.equal((await liveCapture({ mergeSha: 'abc', flow: FLOW, dist: d })).ok, false);
  assert.deepEqual([...LIVE_FLOWS], [FLOW]);
  rmSync(d, { recursive: true, force: true });
});

test('the browser container gets only the socket directory: network none, no host secrets', () => {
  const a = browserArgs({
    image: 'img',
    harness: '/h',
    pw: '/pw',
    socketDir: '/s',
    report: '/r',
    flow: FLOW,
    label: 'carnival.capture-step=x',
  });
  assert.equal(a[a.indexOf('--network') + 1], 'none');
  const mounts = a.filter((_, i) => a[i - 1] === '-v');
  assert.deepEqual(mounts, ['/h:/harness:ro', '/pw:/pw:ro', '/s:/sock:ro', '/r:/report:rw']);
  assert.ok(!a.some((x) => /docker\.sock|\.git|HOME=\/(home|root)|GITHUB_TOKEN|GH_TOKEN/.test(x)));
});

const NODE = 'node@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da';
const haveNode = spawnSync('docker', ['image', 'inspect', NODE], { stdio: 'ignore' }).status === 0;

test(
  'real Docker: the adapter in a network-none container gets live bytes only through the socket',
  { skip: !haveNode && `needs Docker with ${NODE}` },
  async () => {
    const d = dist();
    const harness = mkdtempSync(join(tmpdir(), 'live-harness-'));
    writeFileSync(
      join(harness, 'socket-adapter.mjs'),
      spawnSync('cat', [new URL('./socket-adapter.mjs', import.meta.url).pathname]).stdout,
    );
    writeFileSync(
      join(harness, 'probe.mjs'),
      `const p=process.argv[2];const r=await fetch('http://127.0.0.1:'+p+'${LIVE_BASE}assets/index-abc.js');
let out=r.status+' '+(await r.text());
try{await fetch('http://1.1.1.1/',{signal:AbortSignal.timeout(2000)});out+=' NET'}catch{out+=' nonet'}
console.log(out)`,
    );
    chmodSync(harness, 0o755);
    const container = new Promise((ok) => {
      const run = async ({ socketDir }) => {
        chmodSync(socketDir, 0o755);
        chmodSync(join(socketDir, 'broker.sock'), 0o777);
        const { execFile } = await import('node:child_process');
        return new Promise((done) =>
          execFile(
            'docker',
            [
              'run',
              '--rm',
              '--network',
              'none',
              '--cap-drop',
              'ALL',
              '--read-only',
              '--tmpfs',
              '/tmp',
              '--user',
              `${process.getuid()}:${process.getgid()}`,
              '-v',
              `${harness}:/harness:ro`,
              '-v',
              `${socketDir}:/sock:ro`,
              NODE,
              'sh',
              '-c',
              'node /harness/socket-adapter.mjs /sock/broker.sock >/tmp/port & ' +
                'for i in $(seq 40); do [ -s /tmp/port ] && break; sleep 0.25; done; ' +
                'node /harness/probe.mjs $(cat /tmp/port)',
            ],
            { timeout: 60_000 },
            (e, stdout, stderr) => {
              if (e) console.error(e.message, stderr);
              ok(stdout.trim());
              done(e ? 1 : 0);
            },
          ),
        );
      };
      liveCapture({
        mergeSha: MERGE,
        flow: FLOW,
        dist: d,
        browser: run,
        upstream: origin().upstream,
      });
    });
    assert.equal(await container, `200 ${SITE['assets/index-abc.js']} nonet`);
    rmSync(harness, { recursive: true, force: true });
    rmSync(d, { recursive: true, force: true });
  },
);
