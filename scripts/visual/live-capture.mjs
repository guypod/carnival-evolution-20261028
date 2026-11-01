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
import { execFile, execFileSync, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { lstatSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CAPTURE_PIN,
  LIVE_CHECK,
  PLAYWRIGHT_IMAGE,
  REPOSITORY as REPO,
  deployContext,
  triggerEvents,
  trustedAuthority,
} from '../native/native.mjs';

import {
  BROKER_LIMITS,
  LIVE_BASE,
  LIVE_ORIGIN,
  createBroker,
  manifestProblems,
} from './live-broker.mjs';
import {
  CONTROL_MS,
  DEADLINES,
  FLOWS,
  LIMITS,
  PRIMITIVES,
  STEP_LABEL,
  checkoutProblems,
  ghApi,
  git,
  isolatedBuild,
  privateDir,
  readPlain,
  readback,
  upload,
  validateReport,
} from './trusted-publish.mjs';

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

/** Files a live capture retains besides the screenshots and flow.json. */
export const RECEIPTS = ['before.json', 'after.json', 'requests.json', 'identity.json'];

/**
 * Runs the browser container asynchronously, so the broker in this event loop
 * keeps answering it. `spawn` and `control` are injected by tests. The child
 * is the docker client; at `seconds` it is killed and every container with
 * this step's label is killed, then listed again. Resolves to the exit code,
 * 124 on timeout or a container left running, 125 when Docker could not be
 * read or stopped. Never touches a container without this step's label.
 */
export function runBrowser(args, { step, seconds, spawn: sp = spawn, control = dockerControl }) {
  return new Promise((resolve) => {
    const child = sp('docker', args, { stdio: ['ignore', 'ignore', 'inherit'] });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, seconds * 1000);
    const finish = async (code) => {
      clearTimeout(timer);
      const left = await control([
        'ps',
        '-q',
        '--no-trunc',
        '--filter',
        `label=${STEP_LABEL}=${step}`,
      ]);
      if (left === null) return resolve(125);
      if (left.length) {
        if ((await control(['kill', ...left])) === null) return resolve(125);
        const still = await control([
          'ps',
          '-q',
          '--no-trunc',
          '--filter',
          `label=${STEP_LABEL}=${step}`,
        ]);
        return resolve(still === null || still.length ? 125 : 124);
      }
      resolve(timedOut ? 124 : code);
    };
    child.on('error', () => finish(125));
    child.on('exit', (code) => finish(code ?? 124));
  });
}

/** One bounded Docker control call: its output lines as ids, or null on any failure. */
export function dockerControl(args) {
  return new Promise((resolve) => {
    execFile('docker', args, { timeout: CONTROL_MS, killSignal: 'SIGKILL' }, (err, out) => {
      if (err) return resolve(null);
      resolve(
        String(out)
          .split('\n')
          .filter((id) => /^[0-9a-f]{64}$/.test(id)),
      );
    });
  });
}

/**
 * Why this merge is not the current deployment, from the Pages history read
 * now: its first successful deploy time and no later deploy.
 */
export function deploymentProblems(mergeSha, ctx) {
  if (ctx?.incomplete) return ['Pages deploy history not read'];
  if (!ctx?.deployedAt) return [`${mergeSha} has no successful Pages deploy`];
  if (ctx.supersededBy) return [`${mergeSha} was replaced on Pages by ${ctx.supersededBy}`];
  return [];
}

/** The check run record a live pass carries, with every retained file listed by digest. */
export function liveRecord(mergeSha, flow, evidence, capturedAt) {
  const prefix = `evidence/live/${mergeSha}/${flow}`;
  const identity = JSON.parse(evidence[`${prefix}/identity.json`].bytes.toString('utf8'));
  return {
    mergeSha,
    deployedSha: mergeSha,
    url: `${LIVE_ORIGIN}${LIVE_BASE}`,
    capturedAt,
    identity,
    screenshots: Object.entries(evidence)
      .filter(([p]) => p !== `${prefix}/flow.json`)
      .map(([path, f]) => ({ path, sha256: f.sha256 })),
  };
}

export function parseLiveArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--publish') o.publish = true;
    else if (/^--(merge|flow|runner)$/.test(k)) o[k.slice(2)] = argv[++i];
    else throw new Error(`unknown argument ${k}`);
  }
  return o;
}

/**
 * Problems before anything runs. For --publish, `authority` must be the
 * anchored, approved record with a supported run route, and this checkout
 * must be its wrapper. Without the anchor every live flow stays owed.
 */
export function liveInvocationProblems(o, wrapper, authority) {
  const p = [];
  if (!SHA.test(o.merge ?? '')) p.push('--merge is not a full sha');
  if (!LIVE_FLOWS.has(o.flow) || !FLOWS[o.flow]) p.push(`flow ${o.flow} has no live capture: owed`);
  if (!o.runner) p.push('--runner is missing');
  if (o.publish) {
    if (!authority) p.push('authority record not read: owed');
    else if (!authority.complete) p.push('authority record not read: owed');
    else if (authority.problems?.length) p.push(...authority.problems.map((x) => `${x}: owed`));
    else if (authority.record?.wrapper !== wrapper)
      p.push(`wrapper ${wrapper} is not the approved ${authority.record?.wrapper}: owed`);
    else if (JSON.stringify(authority.record.flows?.[o.flow]) !== JSON.stringify(FLOWS[o.flow]))
      p.push(`flow ${o.flow} is not the operator-approved spec: owed`);
  }
  return p;
}

/** The pinned harness for the live browser: flow.mjs and socket-adapter.mjs at CAPTURE_PIN. */
export const LIVE_HARNESS = ['flow.mjs', 'socket-adapter.mjs'];

/** Builds the exact merge in isolation and plays the flow through the broker. */
export async function liveFromMerge({ runner, mergeSha, flow, upstream, seconds }) {
  const base = privateDir('carnival-live-build-');
  try {
    const { images, deps, dist, left } = isolatedBuild(base, { runner, candidate: mergeSha });
    const harness = join(base, 'harness');
    mkdirSync(harness, { mode: 0o700 });
    for (const f of LIVE_HARNESS) {
      const bytes = execFileSync('git', [
        '-C',
        runner,
        'show',
        `${CAPTURE_PIN}:scripts/visual/${f}`,
      ]);
      writeFileSync(join(harness, f), bytes, { flag: 'wx', mode: 0o644 });
    }
    const step = randomUUID();
    const browser = ({ socketDir, report }) =>
      runBrowser(
        browserArgs({
          image: PLAYWRIGHT_IMAGE,
          harness,
          pw: join(deps, 'pw'),
          socketDir,
          report,
          flow,
          label: `${STEP_LABEL}=${step}`,
        }),
        { step, seconds: Math.max(1, Math.min(seconds ?? DEADLINES.step, left())) },
      );
    const out = await liveCapture({ mergeSha, flow, dist, browser, upstream });
    return { ...out, images };
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

/**
 * Why the merge is not the current Pages deployment, read now. Every read,
 * the runs listing and each attempt's jobs, goes through the bounded ghApi,
 * so the before and after reads share the publication budget and a hung
 * read is a failure, never a wait.
 */
export async function liveDeployment(mergeSha, gh = ghApi) {
  const runs = await gh('GET', `repos/${REPO}/actions/workflows/pages.yml/runs?per_page=50`);
  // deployContext asks for the jobs of the same runs whatever they hold, so a
  // dry pass names exactly the runs the old lazy reads touched.
  const wanted = [];
  deployContext(mergeSha, runs.workflow_runs, (run) => (wanted.push(run), []));
  const jobs = new Map();
  for (const run of wanted) {
    const out = [];
    for (let n = 1; n <= Math.max(1, Number(run.run_attempt) || 1); n++)
      out.push(
        ...(await gh('GET', `repos/${REPO}/actions/runs/${run.id}/attempts/${n}/jobs?per_page=100`))
          .jobs,
      );
    jobs.set(run.id, out);
  }
  return deploymentProblems(
    mergeSha,
    deployContext(mergeSha, runs.workflow_runs, (run) => jobs.get(run.id)),
  );
}

async function main() {
  const o = parseLiveArgs(process.argv.slice(2));
  const self = join(dirname(fileURLToPath(import.meta.url)), '../..');
  const wrapper = git(self, ['rev-parse', 'HEAD']);
  const authority = o.publish ? trustedAuthority({ events: triggerEvents() }) : undefined;
  const problems = [
    ...liveInvocationProblems(o, wrapper, authority),
    ...(o.publish ? checkoutProblems(git, self, authority?.record?.wrapper) : []),
    ...(o.runner
      ? checkoutProblems(git, o.runner, CAPTURE_PIN, [
          ...PRIMITIVES,
          'scripts/visual/socket-adapter.mjs',
        ])
      : []),
  ];
  if (problems.length) {
    for (const p of problems) console.error(p);
    process.exit(o.publish && problems.some((p) => p.endsWith('owed')) ? 3 : 2);
  }
  const live = () => liveDeployment(o.merge);
  if (o.publish) {
    const before = await live().catch((e) => [`Pages deploy history not read (${e.message})`]);
    if (before.length) {
      for (const p of before) console.error(`${p}: owed`);
      process.exit(3);
    }
  }
  let checkId;
  let step = 'capture';
  try {
    if (o.publish) {
      process.env.FLOW_CHECK_NAME = LIVE_CHECK;
      const { startCheckRun } = await import('./flow-check.mjs');
      checkId = (await ghApi('POST', `repos/${REPO}/check-runs`, startCheckRun(o.flow, o.merge)))
        .id;
    }
    const out = await liveFromMerge({ runner: o.runner, mergeSha: o.merge, flow: o.flow });
    console.log(
      JSON.stringify({ ok: out.ok, problems: out.problems, identity: out.identity }, null, 2),
    );
    if (!out.ok) throw Object.assign(new Error(out.problems.join('; ')), { step: 'capture' });
    if (!o.publish) return;
    step = 'publish';
    const capturedAt = new Date().toISOString();
    const dir = `evidence/live/${o.merge}/${o.flow}`;
    const files = Object.fromEntries(
      Object.entries(out.evidence).map(([p, f]) => [p.slice(dir.length + 1), f.bytes]),
    );
    const commit = await upload(dir, files);
    const back = await readback(commit, dir);
    for (const [p, f] of Object.entries(out.evidence))
      if (back?.[p] !== f.sha256) throw new Error(`readback of ${p} differs`);
    const after = await live();
    if (after.length) throw new Error(after.join('; '));
    const { flowCheckRun } = await import('./flow-check.mjs');
    const report = JSON.parse(files['flow.json'].toString('utf8'));
    const body = flowCheckRun(
      report,
      o.merge,
      commit,
      dir,
      0,
      liveRecord(o.merge, o.flow, out.evidence, capturedAt),
    );
    delete body.head_sha;
    await ghApi('PATCH', `repos/${REPO}/check-runs/${checkId}`, body);
    step = 'published';
  } catch (e) {
    console.error(`${e.step ?? step}: ${e.message}`);
    process.exitCode = 1;
  } finally {
    if (checkId && step !== 'published') {
      const { failCheckRun } = await import('./flow-check.mjs');
      await ghApi('PATCH', `repos/${REPO}/check-runs/${checkId}`, failCheckRun(o.flow, step, 1), {
        final: true,
      }).catch(() => console.error(`check run ${checkId} stays in progress; shipState refuses`));
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
