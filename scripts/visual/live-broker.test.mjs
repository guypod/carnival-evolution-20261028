import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, lstatSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  BROKER_LIMITS,
  LIVE_BASE,
  LIVE_ORIGIN,
  createBroker,
  manifestKey,
} from './live-broker.mjs';

const run = (cmd, args, opts) =>
  new Promise((ok) =>
    execFile(cmd, args, opts, (e, stdout, stderr) =>
      ok({ status: e ? (e.code ?? 1) : 0, stdout, stderr }),
    ),
  );
const sha = (b) => createHash('sha256').update(b).digest('hex');
const MERGE = 'a'.repeat(40);
const SITE = {
  'index.html': Buffer.from('<script type="module" src="./assets/index-abc.js"></script>'),
  'assets/index-abc.js': Buffer.from('console.log("mini putt")'),
};
const MANIFEST = Object.fromEntries(Object.entries(SITE).map(([k, v]) => [k, sha(v)]));

/** A fake origin: serves `site` and records every URL it was asked for. */
function origin(site = SITE, extra = {}) {
  const asked = [];
  const upstream = async (url, signal) => {
    asked.push(url);
    if (extra.hang)
      await new Promise((_, no) => signal.addEventListener('abort', () => no(signal.reason)));
    if (extra.redirect)
      return new Response(null, { status: 301, headers: { location: 'http://169.254.169.254/' } });
    const key = url.slice(`${LIVE_ORIGIN}${LIVE_BASE}`.length) || 'index.html';
    const body = typeof site === 'function' ? site(key) : site[key];
    return body ? new Response(body, { status: 200 }) : new Response('no', { status: 404 });
  };
  return { asked, upstream };
}

function setup(opts = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'broker-test-'));
  const receipts = join(dir, 'receipts');
  spawnSync('mkdir', ['-m', '700', receipts]);
  const sock = join(dir, 'sock', 'broker.sock');
  spawnSync('mkdir', ['-m', '700', join(dir, 'sock')]);
  const o = origin(opts.site, opts);
  const broker = createBroker({
    manifest: MANIFEST,
    mergeSha: MERGE,
    receiptDir: receipts,
    upstream: o.upstream,
    limits: { ...BROKER_LIMITS, ...opts.limits },
  });
  return { dir, receipts, sock, broker, asked: o.asked };
}

function get(sock, path, method = 'GET', body) {
  return new Promise((ok, no) => {
    const req = request(
      { socketPath: sock, path, method, headers: { host: 'evil.example' } },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => ok({ status: res.statusCode, body: Buffer.concat(chunks) }));
      },
    );
    req.on('error', no);
    req.end(body);
  });
}

test('manifestKey: only exact manifest paths under the fixed base', () => {
  assert.equal(manifestKey(LIVE_BASE, MANIFEST), 'index.html');
  assert.equal(manifestKey(`${LIVE_BASE}assets/index-abc.js`, MANIFEST), 'assets/index-abc.js');
  for (const bad of [
    '/',
    '/other-repo/',
    `${LIVE_BASE}assets/missing.js`,
    `${LIVE_BASE}assets/../index.html`,
    `${LIVE_BASE}./index.html`,
    `${LIVE_BASE}assets%2findex-abc.js`,
    `${LIVE_BASE}assets/index-abc.js?x=1`,
    `${LIVE_BASE}assets/index-abc.js#x`,
    `${LIVE_BASE}assets\\index-abc.js`,
    `${LIVE_BASE}assets//index-abc.js`,
    `http://169.254.169.254${LIVE_BASE}`,
    `//evil.example${LIVE_BASE}`,
    `${LIVE_BASE}constructor`,
    undefined,
  ])
    assert.equal(manifestKey(bad, MANIFEST), null, String(bad));
});

test('broker serves matching live bytes over one Unix socket and writes its own receipts', async () => {
  const t = setup();
  try {
    await t.broker.listen(t.sock);
    const before = await t.broker.identity('before');
    assert.equal(before.matched, true);
    const r = await get(t.sock, `${LIVE_BASE}assets/index-abc.js`);
    assert.equal(r.status, 200);
    assert.equal(sha(r.body), MANIFEST['assets/index-abc.js']);
    const after = await t.broker.identity('after');
    assert.equal(after.matched, true);
    const verdict = await t.broker.close();
    assert.equal(verdict.failed, false);
    // Only the fixed origin was ever asked, whatever Host the client sent.
    assert.ok(t.asked.every((u) => u.startsWith(`${LIVE_ORIGIN}${LIVE_BASE}`)));
    for (const f of ['before.json', 'after.json', 'requests.json']) {
      const st = lstatSync(join(t.receipts, f));
      assert.ok(st.isFile() && st.nlink === 1 && (st.mode & 0o777) === 0o600);
    }
    const kept = JSON.parse(readFileSync(join(t.receipts, 'requests.json'), 'utf8'));
    assert.equal(kept.requests[0].sha256, MANIFEST['assets/index-abc.js']);
    // A receipt is never overwritten: a second close cannot replace it.
    await assert.rejects(t.broker.close());
  } finally {
    rmSync(t.dir, { recursive: true, force: true });
  }
});

test('broker refuses methods, bodies, queries, traversal and paths outside the manifest', async () => {
  const t = setup();
  try {
    await t.broker.listen(t.sock);
    assert.equal((await get(t.sock, LIVE_BASE, 'POST')).status, 405);
    assert.equal((await get(t.sock, LIVE_BASE, 'PUT', 'x')).status, 405);
    for (const p of [
      `${LIVE_BASE}?q=1`,
      `${LIVE_BASE}assets/../../etc/passwd`,
      `${LIVE_BASE}assets%2F..%2Findex.html`,
      '/latest/meta-data/',
      'http://169.254.169.254/latest/meta-data/',
      `${LIVE_BASE}assets/other.js`,
    ])
      assert.equal((await get(t.sock, p)).status, 404, p);
    assert.equal(t.asked.length, 0);
    // Refusals of browser requests are recorded but do not fail the capture.
    assert.equal(t.broker.failed, false);
    await t.broker.close();
  } finally {
    rmSync(t.dir, { recursive: true, force: true });
  }
});

test('broker fails on a redirect, an oversized response, a hang or an unreachable origin', async () => {
  const cases = [
    [{ redirect: true }, /http 301/],
    [{ site: { ...SITE, 'index.html': Buffer.alloc(64) }, limits: { bytes: 32 } }, /too large/],
    [{ hang: true, limits: { requestMs: 200 } }, /timed out/],
    [{ site: {} }, /http 404/],
  ];
  for (const [opts, why] of cases) {
    const t = setup(opts);
    try {
      const t0 = Date.now();
      const r = await t.broker.identity('before');
      assert.equal(r.matched, false);
      assert.ok(Date.now() - t0 < 5_000);
      const v = await t.broker.close();
      assert.equal(v.failed, true);
      assert.match(v.failures.map((f) => f.why).join('|'), why);
    } finally {
      rmSync(t.dir, { recursive: true, force: true });
    }
  }
});

test('assets that change before, during or after the flow, or a superseding merge, fail', async () => {
  const changed = { ...SITE, 'assets/index-abc.js': Buffer.from('console.log("next merge")') };
  // Before: the live site already serves a different build.
  let t = setup({ site: changed });
  try {
    assert.equal((await t.broker.identity('before')).matched, false);
    assert.equal((await t.broker.close()).failed, true);
  } finally {
    rmSync(t.dir, { recursive: true, force: true });
  }
  // During: the site changes between the before identity and a page request.
  let live = SITE;
  const o = origin((k) => live[k]);
  const dir = mkdtempSync(join(tmpdir(), 'broker-test-'));
  try {
    const b = createBroker({
      manifest: MANIFEST,
      mergeSha: MERGE,
      receiptDir: dir,
      upstream: o.upstream,
    });
    await b.listen(join(dir, 's.sock'));
    assert.equal((await b.identity('before')).matched, true);
    live = changed;
    assert.equal((await get(join(dir, 's.sock'), `${LIVE_BASE}assets/index-abc.js`)).status, 502);
    // Once failed, nothing more is served, even bytes that would match.
    live = SITE;
    assert.equal((await get(join(dir, 's.sock'), LIVE_BASE)).status, 503);
    assert.equal((await b.close()).failed, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  // After: the site moved on (a superseding merge deployed) before the after identity.
  live = SITE;
  t = setup({ site: (k) => live[k] });
  try {
    assert.equal((await t.broker.identity('before')).matched, true);
    live = changed;
    assert.equal((await t.broker.identity('after')).matched, false);
    assert.equal((await t.broker.close()).failed, true);
  } finally {
    rmSync(t.dir, { recursive: true, force: true });
  }
});

test('broker refuses a malformed manifest or merge and a receipt path it does not own', async () => {
  assert.throws(() => createBroker({ manifest: MANIFEST, mergeSha: 'main', receiptDir: tmpdir() }));
  assert.throws(() =>
    createBroker({ manifest: { 'a.js': 'x' }, mergeSha: MERGE, receiptDir: tmpdir() }),
  );
  // A file the browser (or anyone) placed first is never written through.
  const dir = mkdtempSync(join(tmpdir(), 'broker-test-'));
  try {
    spawnSync('ln', ['-s', '/dev/null', join(dir, 'before.json')]);
    const b = createBroker({
      manifest: MANIFEST,
      mergeSha: MERGE,
      receiptDir: dir,
      upstream: origin().upstream,
    });
    await assert.rejects(b.identity('before'), /EEXIST|ELOOP/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const dockerUp = spawnSync('docker', ['info'], { stdio: 'ignore' }).status === 0;
const BOX = 'busybox:1.36';
const NODE = 'node:22-alpine';
const have = (img) =>
  spawnSync('docker', ['image', 'inspect', img], { stdio: 'ignore' }).status === 0;
const haveBox = dockerUp && have(BOX) && have(NODE);

test(
  'a network-none container reaches the broker socket only, never the network, and cannot touch receipts',
  { skip: !haveBox && 'needs Docker with busybox:1.36 and node:22-alpine' },
  async () => {
    const t = setup();
    const sockDir = join(t.dir, 'sock');
    try {
      await t.broker.listen(t.sock);
      chmodSync(sockDir, 0o755);
      chmodSync(t.sock, 0o666);
      await t.broker.identity('before');
      // Only the socket directory is mounted; receipts are not.
      const box = (sh) =>
        spawnSync(
          'docker',
          [
            'run',
            '--rm',
            '--pull',
            'never',
            '--network',
            'none',
            '--cap-drop',
            'ALL',
            '-v',
            `${sockDir}:/broker`,
            BOX,
            'sh',
            '-c',
            sh,
          ],
          { encoding: 'utf8', timeout: 60_000 },
        );
      const net = box(
        'for h in 169.254.169.254 1.1.1.1 172.17.0.1 10.0.0.1; do wget -T 3 -q -O- http://$h/ && echo REACHED $h; done; echo done',
      );
      assert.equal(net.status, 0, net.stderr);
      assert.doesNotMatch(net.stdout, /REACHED/);
      assert.match(net.stdout, /done/);
      const touch = box('ls /broker; echo x > /broker/../receipts/before.json && echo WROTE; true');
      assert.doesNotMatch(touch.stdout, /WROTE/);
      assert.ok(existsSync(join(t.receipts, 'before.json')));
      assert.equal(JSON.parse(readFileSync(join(t.receipts, 'before.json'), 'utf8')).matched, true);
      // A real request over the socket from inside a network-none container,
      // as the localhost adapter makes it.
      const adapter = await run(
        'docker',
        [
          'run',
          '--rm',
          '--pull',
          'never',
          '--network',
          'none',
          '--cap-drop',
          'ALL',
          '-v',
          `${sockDir}:/broker:ro`,
          NODE,
          'node',
          '-e',
          `require('http').get({socketPath:'/broker/broker.sock',path:'${LIVE_BASE}assets/index-abc.js'},r=>{let b='';r.on('data',c=>b+=c);r.on('end',()=>console.log(r.statusCode,b))}).on('error',e=>console.log('ERR',e.code))`,
        ],
        { encoding: 'utf8', timeout: 60_000 },
      );
      assert.match(adapter.stdout, /^200 console\.log\("mini putt"\)/);
      assert.equal((await t.broker.close()).failed, false);
    } finally {
      rmSync(t.dir, { recursive: true, force: true });
    }
  },
);
