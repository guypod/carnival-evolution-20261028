// The trusted premerge browser-evidence wrapper. One invocation plays one
// registered flow on one exact pull request commit with the pinned capture
// primitives, validates what came out, and (only with --publish) reports it
// as the factory's browser-flow check run. It offers no way to publish a
// report directory it did not just capture itself.
//
// Trust roots never come from the candidate:
// - The capture primitives (isolated-deps/build/browser.sh, flow.mjs,
//   static-serve.mjs) run from a separate, clean checkout of CAPTURE_PIN, the
//   independently reviewed runner commit. Each file is checked against the
//   pinned blob before use.
// - Images are the pinned digests below. The primitives run with a fixed
//   environment, so no CARNIVAL_* image override reaches them.
// - The expected checks and screenshots for each flow are listed here, not
//   read from the candidate. A flow the candidate adds stays owed until a
//   reviewed update to this file registers it.
// - The operator's authority record (control/operator-browser-authority.json
//   on factory-state/browser-evidence, read through the GitHub API, never from
//   any checkout) must name this checkout's own clean HEAD as the wrapper, the
//   capture pin, the image digests, the boundary and the flow. The wrapper may
//   be the candidate only under that record's exact bootstrap entry. This run
//   never writes that record and uploads only under evidence/<candidate>/<flow>.
//
// The report directory is fresh and private. After the browser container
// exits, the original directory is validated without following links (plain
// regular files, one link each, bounded sizes, exact names), the report must
// name the flow with every expected check passing and no errors, and every
// PNG must have a valid signature, the viewport width and its recorded
// digest. Only those validated bytes are copied to fresh staging and
// validated again. Any failure concludes the attempt's check run as a
// failure; an older pass is never reused.
//
//   node scripts/visual/trusted-publish.mjs --pr <n> --candidate <sha> --flow <flow>
//     --runner <clean checkout of CAPTURE_PIN> [--publish]
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AUTHORITY_PATH,
  BOUNDARY,
  CAPTURE_PIN,
  NODE_IMAGE,
  PLAYWRIGHT_IMAGE,
  REPOSITORY as REPO,
  BOT_APP_ID,
  authorityProblems,
  trustedAuthority,
  triggerEvents,
  wrapperProblems,
} from '../native/native.mjs';

export { CAPTURE_PIN, NODE_IMAGE, PLAYWRIGHT_IMAGE, REPO };
export const EVIDENCE_BRANCH = 'factory-state/browser-evidence';
export const PRIMITIVES = [
  'scripts/visual/isolated-deps.sh',
  'scripts/visual/isolated-build.sh',
  'scripts/visual/isolated-browser.sh',
  'scripts/visual/flow.mjs',
  'scripts/visual/static-serve.mjs',
];
/** What each registered flow must produce. Anything else is owed. */
export const FLOWS = {
  'mini-putt-hole-next': {
    checks: [
      'hole ends with the result banner below the green',
      'Next moves to the next hole',
      'aim help and meter return after Next',
    ],
    states: ['aiming', 'hole-done', 'after-next'],
  },
};
export const LIMITS = { entries: 8, report: 64 * 1024, png: 8 * 1024 * 1024, total: 32 << 20 };
const VIEWPORT_WIDTH = 1280;
const MAX_HEIGHT = 8000;
const SHA = /^[0-9a-f]{40}$/;
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const sha256 = (b) => createHash('sha256').update(b).digest('hex');

/** Reads a file without following a link, refusing anything but one plain file within `max` bytes. */
export function readPlain(path, max) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const st = fstatSync(fd);
    if (!st.isFile()) throw new Error(`${path} is not a regular file`);
    if (st.nlink !== 1) throw new Error(`${path} is hardlinked`);
    if (st.size > max) throw new Error(`${path} is larger than ${max} bytes`);
    const buf = Buffer.alloc(st.size);
    let off = 0;
    while (off < st.size) {
      const n = readSync(fd, buf, off, st.size - off, off);
      if (!n) break;
      off += n;
    }
    if (off !== st.size) throw new Error(`${path} changed while read`);
    return buf;
  } finally {
    closeSync(fd);
  }
}

/** Width and height of a PNG, or a problem. */
export function pngProblems(name, bytes) {
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(PNG_SIG)) return [`${name} is not a PNG`];
  if (bytes.toString('latin1', 12, 16) !== 'IHDR') return [`${name} has no IHDR`];
  const w = bytes.readUInt32BE(16);
  const h = bytes.readUInt32BE(20);
  if (w !== VIEWPORT_WIDTH) return [`${name} is ${w} wide, not ${VIEWPORT_WIDTH}`];
  if (h < 1 || h > MAX_HEIGHT) return [`${name} is ${h} high`];
  return [];
}

/**
 * Validates a report directory in place. Returns { problems, files } where
 * files maps each accepted name to its validated bytes. Nothing is followed
 * or read before its lstat says it is a plain, singly linked, bounded file.
 */
export function validateReport(dir, flow) {
  const spec = FLOWS[flow];
  if (!spec) return { problems: [`flow ${flow} is not registered in the trusted runner: owed`] };
  const problems = [];
  const expected = new Set(['flow.json', ...spec.states.map((s) => `${flow}-${s}.png`)]);
  let names;
  try {
    const st = lstatSync(dir);
    if (!st.isDirectory() || st.isSymbolicLink())
      return { problems: [`${dir} is not a directory`] };
    names = readdirSync(dir);
  } catch {
    return { problems: [`${dir} cannot be read`] };
  }
  if (names.length > LIMITS.entries) return { problems: [`${names.length} entries in the report`] };
  let total = 0;
  for (const name of names) {
    if (!expected.has(name)) {
      problems.push(`${JSON.stringify(name)} is not expected`);
      continue;
    }
    const st = lstatSync(join(dir, name));
    if (!st.isFile()) problems.push(`${name} is not a plain file`);
    else if (st.nlink !== 1) problems.push(`${name} is hardlinked`);
    else if (st.size > (name === 'flow.json' ? LIMITS.report : LIMITS.png))
      problems.push(`${name} is too large`);
    else total += st.size;
  }
  for (const name of expected) if (!names.includes(name)) problems.push(`${name} is missing`);
  if (total > LIMITS.total) problems.push('report is too large');
  if (problems.length) return { problems };

  const files = {};
  try {
    for (const name of expected)
      files[name] = readPlain(join(dir, name), name === 'flow.json' ? LIMITS.report : LIMITS.png);
  } catch (e) {
    return { problems: [String(e.message)] };
  }
  let report;
  try {
    report = JSON.parse(files['flow.json'].toString('utf8'));
  } catch {
    return { problems: ['flow.json is not JSON'] };
  }
  if (report?.flow !== flow) problems.push(`report is for ${report?.flow}, not ${flow}`);
  if (report?.result !== 'pass') problems.push(`report result is ${report?.result}`);
  if (!Array.isArray(report?.errors) || report.errors.length) problems.push('report has errors');
  const checks = Array.isArray(report?.checks) ? report.checks : [];
  const got = checks.map((c) => c?.check);
  if (got.length !== spec.checks.length || spec.checks.some((c, i) => got[i] !== c))
    problems.push(`report checks ${JSON.stringify(got)} are not the expected ones`);
  for (const c of checks) if (c?.result !== 'pass') problems.push(`check ${c?.check} did not pass`);
  const shots = Array.isArray(report?.screenshots) ? report.screenshots : [];
  const want = spec.states.map((s) => `${flow}-${s}.png`);
  if (shots.length !== want.length || want.some((f, i) => shots[i]?.file !== f))
    problems.push('report screenshots are not the expected ones');
  for (const s of shots) {
    const bytes = files[s?.file];
    if (!bytes) continue;
    problems.push(...pngProblems(s.file, bytes));
    if (sha256(bytes) !== s.sha256) problems.push(`${s.file} does not match its sha256`);
  }
  return problems.length ? { problems } : { problems, files, report };
}

/** A fresh private directory (0700), never a predicted name. */
export const privateDir = (prefix) => mkdtempSync(join(tmpdir(), prefix));

/** Copies only validated bytes into fresh staging and validates the copy again. */
export function stage(validated, flow) {
  const dir = privateDir('carnival-stage-');
  for (const [name, bytes] of Object.entries(validated.files))
    writeFileSync(join(dir, name), bytes, { flag: 'wx', mode: 0o600 });
  const again = validateReport(dir, flow);
  if (again.problems.length) throw new Error(`staging failed validation: ${again.problems}`);
  return { dir, ...again };
}

/** Problems with a checkout that must be exactly `sha`, clean, with these files unmodified. */
export function checkoutProblems(git, dir, sha, files = []) {
  const problems = [];
  const head = git(dir, ['rev-parse', 'HEAD']);
  if (head !== sha) problems.push(`${dir} is at ${head}, not ${sha}`);
  if (git(dir, ['status', '--porcelain', '--untracked-files=all', '--ignored=no']) !== '')
    problems.push(`${dir} has uncommitted changes`);
  for (const f of files)
    if (git(dir, ['hash-object', '--no-filters', f]) !== git(dir, ['rev-parse', `${sha}:${f}`]))
      problems.push(`${f} in ${dir} is not the pinned file`);
  return problems;
}

/** The provenance stored with the evidence, bound to the authority's spec for the flow. */
export const provenance = (o) => ({
  repository: REPO,
  pr: Number(o.pr),
  flow: o.flow,
  candidate: o.candidate,
  captureRunner: CAPTURE_PIN,
  wrapper: o.wrapper,
  images: o.images,
  boundary: BOUNDARY,
  spec: o.spec ?? FLOWS[o.flow],
  kind: 'premerge-loopback-capture',
  authorityCommit: o.authority?.anchor ?? null,
  run: o.authority?.run ?? null,
});

/** Where an attempt may write: only its own evidence/<candidate>/<flow> folder. */
export function uploadPaths(candidate, flow, names) {
  const dir = `evidence/${candidate}/${flow}`;
  if (!/^[0-9a-f]{40}$/.test(candidate) || !FLOWS[flow])
    throw new Error(`refusing to write ${dir}`);
  return names.map((n) => {
    if (!/^[A-Za-z0-9._-]+$/.test(n) || n.startsWith('.')) throw new Error(`refusing name ${n}`);
    const path = `${dir}/${n}`;
    if (path === AUTHORITY_PATH || path.startsWith('control/')) throw new Error(`refusing ${path}`);
    return path;
  });
}

/**
 * Publishes a staged, validated capture. `gh` is (method, path, body) =>
 * parsed JSON, `upload` retains files on the evidence branch and returns the
 * commit, `readback` returns { path: sha256 } from that commit. The check
 * run must already be open (`checkId`). Throws on any failure; the caller
 * concludes the check run as a failure.
 */
export async function publish({
  gh,
  upload,
  readback,
  checkId,
  pr,
  candidate,
  flow,
  staged,
  prov,
}) {
  const head = (await gh('GET', `repos/${REPO}/pulls/${pr}`)).head?.sha;
  if (head !== candidate) throw new Error(`pull request head moved to ${head}`);
  const dir = `evidence/${candidate}/${flow}`;
  const provBytes = Buffer.from(JSON.stringify(prov, null, 2));
  const files = { ...staged.files, 'provenance.json': provBytes };
  uploadPaths(candidate, flow, Object.keys(files));
  const commit = await upload(dir, files);
  if (!SHA.test(commit ?? '')) throw new Error('evidence upload returned no commit');
  const back = await readback(commit, dir);
  for (const [name, bytes] of Object.entries(files))
    if (back?.[`${dir}/${name}`] !== sha256(bytes)) throw new Error(`readback of ${name} differs`);
  const again = (await gh('GET', `repos/${REPO}/pulls/${pr}`)).head?.sha;
  if (again !== candidate) throw new Error(`pull request head moved to ${again}`);
  const { flowCheckRun } = await import('./flow-check.mjs');
  const body = flowCheckRun(staged.report, candidate, commit, dir, 0, {
    provenance: prov,
    provenanceSha256: sha256(provBytes),
  });
  delete body.head_sha;
  return gh('PATCH', `repos/${REPO}/check-runs/${checkId}`, body);
}

function git(dir, args) {
  const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : `error: ${r.stderr.trim()}`;
}

/** Elapsed-time cap per primitive, and for a whole capture, in seconds. */
export const DEADLINES = { step: 600, total: 900 };

/** Ids of running containers from the capture images, so a timeout can stop exactly the new ones. */
function captureContainers(run = spawnSync) {
  const r = run(
    'docker',
    [
      'ps',
      '-q',
      '--no-trunc',
      '--filter',
      `ancestor=${NODE_IMAGE}`,
      '--filter',
      `ancestor=${PLAYWRIGHT_IMAGE}`,
    ],
    { encoding: 'utf8' },
  );
  return new Set((r.stdout ?? '').split('\n').filter(Boolean));
}

/**
 * Runs a pinned primitive with a fixed environment: no image or path override
 * passes in. `timeout` runs it in its own process group and kills the whole
 * group at the deadline; any container it started is then stopped explicitly,
 * because killing the docker client leaves its container running. A timeout
 * is a failure. Its private HOME is removed afterwards.
 */
export function primitive(runner, name, args, { seconds = DEADLINES.step, run = spawnSync } = {}) {
  const home = privateDir('carnival-home-');
  const env = { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: home };
  const before = captureContainers(run);
  try {
    const r = run(
      'timeout',
      [
        '-k',
        '10',
        String(Math.max(1, Math.floor(seconds))),
        'bash',
        join(runner, 'scripts/visual', name),
        ...args,
      ],
      { env, stdio: ['ignore', 'inherit', 'inherit'] },
    );
    if (r.status === 124 || r.status === 137 || r.status === null) {
      const left = [...captureContainers(run)].filter((id) => !before.has(id));
      if (left.length) run('docker', ['kill', ...left], { stdio: 'ignore' });
      return 124;
    }
    return r.status;
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

/** Captures one flow on one candidate with the pinned runner, and validates it. */
export function capture(o) {
  const base = privateDir('carnival-capture-');
  try {
    return captureIn(base, o);
  } finally {
    // Dependencies, the exported candidate, the build and the report are
    // disposable: only the validated, staged copy outlives the capture.
    rmSync(base, { recursive: true, force: true });
  }
}

function captureIn(base, { runner, candidate, flow }) {
  const started = Date.now();
  const left = () => Math.min(DEADLINES.step, DEADLINES.total - (Date.now() - started) / 1000);
  const step = (name, args) => {
    if (left() < 1) return 124;
    return primitive(runner, name, args, { seconds: left() });
  };
  const images = {};
  for (const img of [NODE_IMAGE, PLAYWRIGHT_IMAGE]) {
    const r = spawnSync('docker', ['image', 'inspect', '--format', '{{.Id}}', img], {
      encoding: 'utf8',
    });
    if (r.status !== 0)
      throw Object.assign(new Error(`image ${img} is not present`), { step: 'images' });
    images[img] = r.stdout.trim();
  }
  const deps = join(base, 'deps');
  const work = join(base, 'build');
  if (step('isolated-deps.sh', [runner, deps]) !== 0)
    throw Object.assign(new Error('dependency snapshot failed'), { step: 'deps' });
  const gitDir = git(runner, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  const built = step('isolated-build.sh', [gitDir, candidate, work, deps]);
  if (built === 5)
    throw Object.assign(new Error('candidate dependencies differ from the runner: owed'), {
      step: 'build',
      owed: true,
    });
  if (built !== 0) throw Object.assign(new Error(`build exited ${built}`), { step: 'build' });
  const harness = join(base, 'harness');
  mkdirSync(harness, { mode: 0o700 });
  for (const f of ['flow.mjs', 'static-serve.mjs']) {
    const r = spawnSync('git', ['-C', runner, 'show', `${CAPTURE_PIN}:scripts/visual/${f}`]);
    if (r.status !== 0) throw Object.assign(new Error(`no pinned ${f}`), { step: 'harness' });
    writeFileSync(join(harness, f), r.stdout, { flag: 'wx', mode: 0o644 });
  }
  const report = join(base, 'report');
  mkdirSync(report, { mode: 0o700 });
  const ran = step('isolated-browser.sh', [
    PLAYWRIGHT_IMAGE,
    harness,
    join(deps, 'pw'),
    join(work, 'dist'),
    report,
    flow,
  ]);
  if (ran !== 0) throw Object.assign(new Error(`flow exited ${ran}`), { step: 'flow' });
  const validated = validateReport(report, flow);
  if (validated.problems.length)
    throw Object.assign(new Error(validated.problems.join('; ')), { step: 'validate' });
  return { images, staged: stage(validated, flow) };
}

export function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--publish') o.publish = true;
    else if (/^--(pr|candidate|flow|runner)$/.test(k)) o[k.slice(2)] = argv[++i];
    else throw new Error(`unknown argument ${k}`);
  }
  return o;
}

/**
 * Problems with an invocation before anything runs. `authority` is the
 * operator's record as read from the trusted location ({ record, problems }),
 * required for --publish. Nothing on the command line or in a checkout can
 * stand in for it.
 */
export function invocationProblems(o, wrapper, authority) {
  const problems = [];
  if (!/^[1-9][0-9]*$/.test(o.pr ?? '')) problems.push('--pr is not a number');
  if (!SHA.test(o.candidate ?? '')) problems.push('--candidate is not a full sha');
  if (!FLOWS[o.flow]) problems.push(`flow ${o.flow} is not registered in the trusted runner: owed`);
  if (!o.runner) problems.push('--runner is missing');
  if (o.publish) {
    const p = authority?.problems ?? authorityProblems(authority?.record);
    if (authority && !authority.complete) problems.push('authority record not read');
    else if (p.length) problems.push(...p);
    else {
      const a = authority.record;
      problems.push(...wrapperProblems(a, o.pr, o.candidate, wrapper));
      if (JSON.stringify(a.flows?.[o.flow]) !== JSON.stringify(FLOWS[o.flow]))
        problems.push(`flow ${o.flow} is not the operator-approved spec: owed`);
    }
  }
  return problems;
}

/**
 * Whether the newest factory browser-flow attempt for this candidate and flow
 * already passed under the same anchor and wrapper, so recapturing would only
 * repeat it. A newer failed or running attempt is never skipped; the gate
 * still validates the passing record in full.
 */
export function alreadyCaptured(checks, o, wrapper, anchor) {
  const newest = (checks ?? [])
    .filter(
      (c) =>
        c.name === 'browser-flow' &&
        c.head_sha === o.candidate &&
        c.app?.id === BOT_APP_ID &&
        c.external_id === `browser-flow:${o.flow}`,
    )
    .sort((a, b) => a.id - b.id)
    .at(-1);
  if (newest?.status !== 'completed' || newest.conclusion !== 'success') return false;
  const m = /<!-- carnival-browser-flow:v1 (\{.*?\}) -->/s.exec(newest.output?.text ?? '');
  let rec;
  try {
    rec = m ? JSON.parse(m[1]) : undefined;
  } catch {
    return false;
  }
  const p = rec?.provenance;
  return (
    !!anchor &&
    p?.authorityCommit === anchor &&
    p?.wrapper === wrapper &&
    p?.candidate === o.candidate
  );
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const self = join(dirname(fileURLToPath(import.meta.url)), '../..');
  const wrapper = git(self, ['rev-parse', 'HEAD']);
  // The record at the environment's anchor commit, refused unless this run's
  // Tessl provenance is a supported route. Checked before any capture runs.
  const authority = o.publish ? trustedAuthority({ pr: o.pr, events: triggerEvents() }) : undefined;
  const problems = [
    ...invocationProblems(o, wrapper, authority),
    ...(o.publish ? checkoutProblems(git, self, authority?.record?.wrapper) : []),
    ...(o.runner ? checkoutProblems(git, o.runner, CAPTURE_PIN, PRIMITIVES) : []),
  ];
  if (problems.length) {
    for (const p of problems) console.error(p);
    process.exit(2);
  }
  const gh = ghApi;
  if (o.publish) {
    const runs = await gh(
      'GET',
      `repos/${REPO}/commits/${o.candidate}/check-runs?check_name=browser-flow&filter=all&per_page=100`,
    );
    if (alreadyCaptured(runs.check_runs, o, wrapper, authority?.anchor)) {
      console.log(
        `${o.flow} already passed on ${o.candidate} under this authority: not recaptured`,
      );
      return;
    }
  }
  let checkId;
  let staging;
  if (o.publish) {
    const { startCheckRun } = await import('./flow-check.mjs');
    checkId = (await gh('POST', `repos/${REPO}/check-runs`, startCheckRun(o.flow, o.candidate))).id;
  }
  let step = 'capture';
  try {
    const { images, staged } = capture(o);
    staging = staged.dir;
    const prov = provenance({ ...o, wrapper, images, authority });
    console.log(JSON.stringify({ staging: staged.dir, provenance: prov }, null, 2));
    if (!o.publish) return;
    step = 'publish';
    await publish({ gh, upload, readback, checkId, ...o, staged, prov });
    step = 'published';
  } catch (e) {
    console.error(`${e.step ?? step}: ${e.message}`);
    process.exitCode = 1;
  } finally {
    if (staging && o.publish) rmSync(staging, { recursive: true, force: true });
    if (checkId && step !== 'published') {
      const { failCheckRun } = await import('./flow-check.mjs');
      await gh('PATCH', `repos/${REPO}/check-runs/${checkId}`, failCheckRun(o.flow, step, 1)).catch(
        () => console.error(`check run ${checkId} stays in progress; the gate refuses`),
      );
    }
  }
}

async function ghApi(method, path, body) {
  const args = ['api', '-X', method, path];
  if (body) args.push('--input', '-');
  const r = spawnSync('gh', args, {
    input: body ? JSON.stringify(body) : undefined,
    encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error(`gh ${method} ${path} failed`);
  return JSON.parse(r.stdout || '{}');
}

/** Commits the files to the evidence branch through the API, on top of its current tip. */
async function upload(dir, files) {
  const ref = await ghApi('GET', `repos/${REPO}/git/ref/heads/${EVIDENCE_BRANCH}`);
  const parent = ref.object.sha;
  const base = (await ghApi('GET', `repos/${REPO}/git/commits/${parent}`)).tree.sha;
  const tree = [];
  for (const [name, bytes] of Object.entries(files)) {
    const blob = await ghApi('POST', `repos/${REPO}/git/blobs`, {
      content: bytes.toString('base64'),
      encoding: 'base64',
    });
    // base_tree keeps every other path, including the reserved control record.
    tree.push({ path: `${dir}/${name}`, mode: '100644', type: 'blob', sha: blob.sha });
  }
  const t = await ghApi('POST', `repos/${REPO}/git/trees`, { base_tree: base, tree });
  const c = await ghApi('POST', `repos/${REPO}/git/commits`, {
    message: `Browser evidence: ${dir}`,
    tree: t.sha,
    parents: [parent],
  });
  await ghApi('PATCH', `repos/${REPO}/git/refs/heads/${EVIDENCE_BRANCH}`, { sha: c.sha });
  return c.sha;
}

/** sha256 of each retained file, read back from the evidence commit. */
async function readback(commit, dir) {
  const out = {};
  const list = await ghApi('GET', `repos/${REPO}/contents/${dir}?ref=${commit}`);
  for (const f of list) {
    const blob = await ghApi('GET', `repos/${REPO}/git/blobs/${f.sha}`);
    out[f.path] = sha256(Buffer.from(blob.content, 'base64'));
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
