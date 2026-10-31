// The trusted host wrapper for a mediated live capture of one merge and one
// flow. It never runs candidate code on this host:
//
//   1. The manifest comes from the isolated (network-none) build of the exact
//      merge: index.html and dist/assets, read without following links.
//   2. The broker (live-broker.mjs) listens on a socket in a fresh directory
//      that holds nothing else. Only that directory is given to the browser.
//   3. Before the flow the broker scans the whole manifest against the fixed
//      Pages origin and writes before.json; after the flow it scans again and
//      writes after.json. Receipts go to a separate 0700 directory the
//      browser never mounts.
//   4. The browser step runs the pinned harness plus socket-adapter.mjs in a
//      network-none container (see browserArgs). Its report is validated with
//      the same no-follow, single-link, size, PNG and sha256 rules as premerge.
//   5. Evidence is assembled for evidence/live/<merge>/<flow>/ and read back
//      by sha256 before it counts.
//
// Limit: this exercises the actual deployed static bytes through localhost
// mediation. It is not equivalent to the browser visiting the origin: CORS,
// service workers, cookies and auth are not exercised, so any flow needing an
// external service or auth stays owed. Publishing the result needs the
// operator authority anchor; this module only produces and verifies it.
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  BROKER_LIMITS,
  LIVE_BASE,
  LIVE_ORIGIN,
  createBroker,
  manifestProblems,
} from './live-broker.mjs';
import { FLOWS, LIMITS, privateDir, readPlain, validateReport } from './trusted-publish.mjs';

const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const SHA = /^[0-9a-f]{40}$/;
/** Flows whose live checks are static only, so localhost mediation covers them. */
export const LIVE_FLOWS = new Set(['mini-putt-hole-next']);
const RECEIPT_MAX = 4 * 1024 * 1024;

/** The manifest of an isolated build: index.html and every file under assets/. */
export function buildManifest(dist, limits = BROKER_LIMITS) {
  const manifest = {};
  const add = (key) => {
    manifest[key] = sha256(readPlain(join(dist, key), BROKER_LIMITS.bytes));
  };
  add('index.html');
  const st = lstatSync(join(dist, 'assets'));
  if (!st.isDirectory() || st.isSymbolicLink()) throw new Error('dist/assets is not a directory');
  const names = readdirSync(join(dist, 'assets'));
  if (names.length >= limits.entries) throw new Error('too many assets');
  for (const n of names.sort()) add(`assets/${n}`);
  const bad = manifestProblems(manifest, limits);
  if (bad.length) throw new Error(bad.join('; '));
  return manifest;
}

/** Reads and checks one broker receipt: a plain, single-link, bounded file for this merge. */
export function readReceipt(dir, name, mergeSha) {
  const value = JSON.parse(readPlain(join(dir, name), RECEIPT_MAX).toString('utf8'));
  if (value?.mergeSha !== mergeSha) throw new Error(`${name} names another merge`);
  return value;
}

/**
 * The docker arguments for the browser step: network none, read-only root,
 * no capabilities, the pinned harness and Playwright read-only, the socket
 * directory read-only, and only the empty report directory writable. No
 * host home, Git, Docker socket or receipt directory is mounted.
 */
export function browserArgs({ image, harness, pw, socketDir, report, flow, label }) {
  return [
    'run',
    '--rm',
    '--pull',
    'never',
    '--init',
    '--network',
    'none',
    '--label',
    label,
    '--user',
    `${process.getuid()}:${process.getgid()}`,
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '--read-only',
    '--tmpfs',
    '/tmp:rw,size=512m',
    '--memory',
    '2g',
    '--memory-swap',
    '2g',
    '--cpus',
    '2',
    '--pids-limit',
    '512',
    '--shm-size',
    '256m',
    '-e',
    'HOME=/tmp/home',
    '-e',
    'PLAYWRIGHT_DIR=/pw',
    '-e',
    `FLOW=${flow}`,
    '-v',
    `${harness}:/harness:ro`,
    '-v',
    `${pw}:/pw:ro`,
    '-v',
    `${socketDir}:/sock:ro`,
    '-v',
    `${report}:/report:rw`,
    image,
    'sh',
    '-c',
    'node /harness/socket-adapter.mjs /sock/broker.sock >/tmp/port & ' +
      'for i in $(seq 40); do [ -s /tmp/port ] && break; sleep 0.25; done; ' +
      `exec node /harness/flow.mjs "http://127.0.0.1:$(cat /tmp/port)${LIVE_BASE}" /report "$FLOW"`,
  ];
}

/**
 * Captures one live flow. `browser({ socketDir, report })` runs the browser
 * step and resolves to its exit code; the default is the network-none
 * container above, injected so tests can play a hostile candidate. Returns
 * { ok, problems, evidence } where evidence maps each retained path under
 * evidence/live/<merge>/<flow>/ to its bytes, already read back by sha256.
 */
export async function liveCapture({ mergeSha, flow, dist, browser, upstream, limits, now }) {
  if (!SHA.test(mergeSha ?? '')) return { ok: false, problems: ['merge sha must be a full sha'] };
  if (!LIVE_FLOWS.has(flow) || !FLOWS[flow])
    return { ok: false, owed: true, problems: [`flow ${flow} has no live capture: owed`] };
  let manifest;
  try {
    manifest = buildManifest(dist, limits);
  } catch (e) {
    return { ok: false, problems: [`build manifest: ${e.message}`] };
  }
  const base = privateDir('carnival-live-');
  const receipts = join(base, 'receipts');
  const socketDir = join(base, 'sock');
  const report = join(base, 'report');
  for (const d of [receipts, socketDir, report]) mkdirSync(d, { mode: 0o700 });
  const broker = createBroker({ manifest, mergeSha, receiptDir: receipts, upstream, limits, now });
  const problems = [];
  try {
    const before = await broker.identity('before');
    if (!before.matched) problems.push('live site does not serve the merge build before the flow');
    let code = null;
    if (!problems.length) {
      await broker.listen(join(socketDir, 'broker.sock'));
      code = await browser({ socketDir, report });
      if (code !== 0) problems.push(`browser step exited ${code}`);
    }
    const after = await broker.identity('after');
    if (!after.matched) problems.push('live site does not serve the merge build after the flow');
    const verdict = await broker.close();
    if (verdict.failed) problems.push(...verdict.failures.map((f) => `broker: ${f.why}`));
    if (problems.length) return { ok: false, problems: problems.slice(0, 60) };

    // Read the receipts back from disk: the broker's word, not memory, decides.
    const files = {};
    for (const name of ['before.json', 'after.json', 'requests.json']) {
      files[name] = readPlain(join(receipts, name), RECEIPT_MAX);
      readReceipt(receipts, name, mergeSha);
    }
    const b = JSON.parse(files['before.json']);
    const a = JSON.parse(files['after.json']);
    if (!b.matched || !a.matched || b.buildDigest !== a.buildDigest)
      return { ok: false, problems: ['receipts do not show the same matching build'] };
    if (!(b.startedAt <= b.finishedAt && b.finishedAt <= a.startedAt))
      return { ok: false, problems: ['receipt timestamps are out of order'] };
    const validated = validateReport(report, flow);
    if (validated.problems.length) return { ok: false, problems: validated.problems };
    Object.assign(files, validated.files);
    const identity = {
      mergeSha,
      flow,
      origin: LIVE_ORIGIN,
      base: LIVE_BASE,
      mediation: 'localhost-socket',
      buildDigest: b.buildDigest,
      before: { startedAt: b.startedAt, finishedAt: b.finishedAt },
      after: { startedAt: a.startedAt, finishedAt: a.finishedAt },
      receipts: Object.fromEntries(
        ['before.json', 'after.json', 'requests.json'].map((n) => [n, sha256(files[n])]),
      ),
      screenshots: Object.fromEntries(
        Object.keys(validated.files)
          .filter((n) => n.endsWith('.png'))
          .map((n) => [n, sha256(files[n])]),
      ),
    };
    files['identity.json'] = Buffer.from(`${JSON.stringify(identity, null, 2)}\n`);
    return { ok: true, problems: [], evidence: retain(mergeSha, flow, files), identity };
  } catch (e) {
    return { ok: false, problems: [String(e?.message ?? e).slice(0, 300)] };
  } finally {
    if (!broker.closed) await broker.close().catch(() => {});
    rmSync(base, { recursive: true, force: true });
  }
}

/**
 * Stages the evidence under evidence/live/<merge>/<flow>/ in a fresh private
 * directory and reads every file back (no-follow, single link) by sha256.
 */
export function retain(mergeSha, flow, files) {
  const prefix = `evidence/live/${mergeSha}/${flow}`;
  const dir = privateDir('carnival-live-stage-');
  try {
    const want = {};
    for (const [name, bytes] of Object.entries(files)) {
      writeFileSync(join(dir, name), bytes, { flag: 'wx', mode: 0o600 });
      want[name] = sha256(bytes);
    }
    const out = {};
    for (const [name, digest] of Object.entries(want)) {
      const back = readPlain(join(dir, name), LIMITS.png);
      if (sha256(back) !== digest) throw new Error(`${name} did not read back`);
      out[`${prefix}/${name}`] = { sha256: digest, bytes: back };
    }
    return out;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
