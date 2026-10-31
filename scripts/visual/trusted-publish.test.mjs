import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { linkSync, mkdtempSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  CAPTURE_PIN,
  FLOWS,
  LIMITS,
  parseArgs,
  NODE_IMAGE,
  PLAYWRIGHT_IMAGE,
  checkoutProblems,
  invocationProblems,
  uploadPaths,
  privateDir,
  provenance,
  publish,
  stage,
  validateReport,
} from './trusted-publish.mjs';
import { AUTHORITY_PATH, BOUNDARY, REPOSITORY, authorityProblems } from '../native/native.mjs';

const FLOW = 'mini-putt-hole-next';
const SHA = 'a'.repeat(40);
const WRAPPER = 'c'.repeat(40);
const sha256 = (b) => createHash('sha256').update(b).digest('hex');

/** A PNG header of the given size; enough for signature and IHDR checks. */
function png(w = 1280, h = 800, tag = '') {
  const b = Buffer.alloc(64);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  b.write(tag, 40, 'latin1');
  return b;
}

/** A report directory as the pinned flow.mjs writes it, then edited. */
function report(edit = () => {}) {
  const dir = mkdtempSync(join(tmpdir(), 'tp-test-'));
  const r = { flow: FLOW, result: 'pass', checks: [], screenshots: [], errors: [] };
  for (const c of FLOWS[FLOW].checks) r.checks.push({ check: c, result: 'pass' });
  for (const s of FLOWS[FLOW].states) {
    const file = `${FLOW}-${s}.png`;
    const bytes = png(1280, 800, s);
    writeFileSync(join(dir, file), bytes);
    r.screenshots.push({ file, sha256: sha256(bytes) });
  }
  edit(dir, r);
  writeFileSync(join(dir, 'flow.json'), JSON.stringify(r));
  return dir;
}

test('a capture from the pinned flow validates and stages', () => {
  const v = validateReport(report(), FLOW);
  assert.deepEqual(v.problems, []);
  const s = stage(v, FLOW);
  assert.deepEqual(s.problems, []);
  assert.equal(statSync(s.dir).mode & 0o777, 0o700);
  assert.deepEqual(Object.keys(s.files).sort(), Object.keys(v.files).sort());
});

test('an unsafe or forged report never validates', () => {
  const shot = `${FLOW}-hole-done.png`;
  const cases = {
    'an extra symlink': (d) => symlinkSync('/etc/passwd', join(d, `${FLOW}-x.png`)),
    'a screenshot replaced by a symlink': (d) => {
      const p = join(d, shot);
      writeFileSync(join(d, '..', `${shot}.${process.pid}`), png());
      rmSync(p);
      symlinkSync(join(d, '..', `${shot}.${process.pid}`), p);
    },
    'a hardlinked screenshot': (d) =>
      linkSync(join(d, shot), join(tmpdir(), `tp-link-${Date.now()}-${Math.random()}`)),
    'an unexpected file': (d) => writeFileSync(join(d, 'extra.txt'), 'x'),
    'an oversized screenshot': (d, r) => {
      const big = Buffer.concat([png(), Buffer.alloc(LIMITS.png)]);
      writeFileSync(join(d, shot), big);
      r.screenshots[1].sha256 = sha256(big);
    },
    'a malformed PNG': (d, r) => {
      writeFileSync(join(d, shot), 'not a png');
      r.screenshots[1].sha256 = sha256(Buffer.from('not a png'));
    },
    'a PNG of the wrong width': (d, r) => {
      writeFileSync(join(d, shot), png(640));
      r.screenshots[1].sha256 = sha256(png(640));
    },
    'a digest that does not match': (_, r) => (r.screenshots[0].sha256 = '0'.repeat(64)),
    'a missing screenshot': (d) => rmSync(join(d, shot)),
    'a failed check': (_, r) => (r.checks[1].result = 'fail'),
    'a missing check': (_, r) => r.checks.pop(),
    'no checks at all': (_, r) => (r.checks = []),
    'a renamed check': (_, r) => (r.checks[0].check = 'anything passes'),
    'a page error': (_, r) => r.errors.push('TypeError'),
    'a failed result': (_, r) => (r.result = 'fail'),
    'another flow': (_, r) => (r.flow = 'skee-ball-roll'),
    'a path escape in the report': (_, r) => (r.screenshots[0].file = '../../etc/passwd'),
  };
  for (const [name, edit] of Object.entries(cases))
    assert.notDeepEqual(validateReport(report(edit), FLOW).problems, [], name);
});

test('a malformed or oversized flow.json never validates', () => {
  const d = report();
  writeFileSync(join(d, 'flow.json'), '{not json');
  assert.notDeepEqual(validateReport(d, FLOW).problems, []);
  writeFileSync(join(d, 'flow.json'), ' '.repeat(LIMITS.report + 1));
  assert.match(validateReport(d, FLOW).problems.join(), /too large/);
});

test('a flow the trusted runner does not register stays owed', () => {
  assert.match(validateReport(report(), 'skee-ball-roll').problems.join(), /owed/);
  assert.match(
    invocationProblems(
      { pr: '1', candidate: SHA, flow: 'candidate-added', runner: '/r' },
      WRAPPER,
    ).join(),
    /owed/,
  );
});

/** An operator authority record as the coordinator would install it. */
const authority = (extra = {}) => {
  const record = {
    schema: 'carnival-browser-authority',
    version: 1,
    approved: true,
    approvedBy: 'operator',
    repository: REPOSITORY,
    wrapper: WRAPPER,
    captureRunner: CAPTURE_PIN,
    images: { node: NODE_IMAGE, playwright: PLAYWRIGHT_IMAGE },
    boundary: BOUNDARY,
    flows: { [FLOW]: FLOWS[FLOW] },
    bootstrap: null,
    ...extra,
  };
  return { complete: true, record, problems: authorityProblems(record) };
};

test('publishing needs the operator authority naming this wrapper', () => {
  const ok = { pr: '450', candidate: SHA, flow: FLOW, runner: '/r' };
  const pub = { ...ok, publish: true };
  assert.deepEqual(invocationProblems(ok, WRAPPER), []);
  assert.deepEqual(invocationProblems(pub, WRAPPER, authority()), []);
  assert.match(invocationProblems(pub, WRAPPER).join(), /authority record missing/);
  assert.match(invocationProblems(pub, WRAPPER, { complete: false }).join(), /not read/);
  assert.match(invocationProblems(pub, 'd'.repeat(40), authority()).join(), /not the approved/);
  assert.match(
    invocationProblems(pub, WRAPPER, authority({ approved: false })).join(),
    /not operator-approved/,
  );
  assert.match(
    invocationProblems(pub, WRAPPER, authority({ repository: 'x/y' })).join(),
    /another repository/,
  );
  assert.match(
    invocationProblems(pub, WRAPPER, authority({ captureRunner: SHA })).join(),
    /capture pin/,
  );
  assert.match(
    invocationProblems(
      pub,
      WRAPPER,
      authority({ images: { node: 'node:22', playwright: PLAYWRIGHT_IMAGE } }),
    ).join(),
    /images/,
  );
  assert.match(
    invocationProblems(
      pub,
      WRAPPER,
      authority({ flows: { [FLOW]: { checks: ['x'], states: ['y'] } } }),
    ).join(),
    /not the operator-approved spec/,
  );
  // A --approved-wrapper argument is no longer accepted: only the record decides.
  assert.throws(() => parseArgs(['--approved-wrapper', WRAPPER]), /unknown argument/);
  assert.match(invocationProblems({ ...ok, candidate: 'HEAD' }, WRAPPER).join(), /full sha/);
});

test('the wrapper may be the candidate only under the exact 449 bootstrap', () => {
  const pub = { pr: '449', candidate: WRAPPER, flow: FLOW, runner: '/r', publish: true };
  assert.match(invocationProblems(pub, WRAPPER, authority()).join(), /without an exact bootstrap/);
  const boot = authority({ bootstrap: { pr: 449, head: WRAPPER } });
  assert.deepEqual(invocationProblems(pub, WRAPPER, boot), []);
  assert.match(invocationProblems({ ...pub, pr: '450' }, WRAPPER, boot).join(), /bootstrap/);
  assert.match(
    invocationProblems(pub, WRAPPER, authority({ bootstrap: { pr: 450, head: WRAPPER } })).join(),
    /may only name pull request 449/,
  );
  assert.match(
    invocationProblems(pub, WRAPPER, authority({ bootstrap: { pr: 449, head: SHA } })).join(),
    /bootstrap head is not the wrapper/,
  );
  // An ordinary candidate under a bootstrap record still runs.
  assert.deepEqual(invocationProblems({ ...pub, candidate: SHA }, WRAPPER, boot), []);
});

test('an attempt writes only its own evidence folder, never the control record', () => {
  assert.deepEqual(uploadPaths(SHA, FLOW, ['flow.json']), [`evidence/${SHA}/${FLOW}/flow.json`]);
  assert.throws(() => uploadPaths(SHA, FLOW, ['../../control/x.json']));
  assert.throws(() => uploadPaths('control', FLOW, ['x']));
  assert.throws(() => uploadPaths(SHA, 'candidate-added', ['x']));
  assert.ok(AUTHORITY_PATH.startsWith('control/'));
});

test('the runner checkout must be the pin, clean, with pinned primitives', () => {
  const git = (state) => (_, args) => {
    if (args[0] === 'rev-parse' && args[1] === 'HEAD') return state.head ?? CAPTURE_PIN;
    if (args[0] === 'status') return state.dirty ? ' M scripts/visual/flow.mjs' : '';
    if (args[0] === 'hash-object') return state.changed ? 'x' : 'blob';
    return 'blob';
  };
  const f = ['scripts/visual/flow.mjs'];
  assert.deepEqual(checkoutProblems(git({}), '/r', CAPTURE_PIN, f), []);
  assert.match(checkoutProblems(git({ head: SHA }), '/r', CAPTURE_PIN, f).join(), /not 3dbcc6d/);
  assert.match(checkoutProblems(git({ dirty: true }), '/r', CAPTURE_PIN, f).join(), /uncommitted/);
  assert.match(
    checkoutProblems(git({ changed: true }), '/r', CAPTURE_PIN, f).join(),
    /not the pinned/,
  );
});

test('private directories are fresh and 0700', () => {
  const a = privateDir('tp-');
  const b = privateDir('tp-');
  assert.notEqual(a, b);
  assert.equal(statSync(a).mode & 0o777, 0o700);
});

/** A mocked GitHub that records writes; nothing leaves the process. */
function mock({ heads = [SHA, SHA], uploadSha = 'e'.repeat(40), corrupt = false } = {}) {
  const writes = [];
  const gh = async (method, path, body) => {
    if (method === 'GET') return { head: { sha: heads.shift() } };
    writes.push({ method, path, body });
    return { html_url: 'x' };
  };
  const stored = {};
  const uploads = [];
  const upload = async (dir, files) => {
    if (!uploadSha) throw new Error('upload unavailable');
    uploads.push(...Object.keys(files).map((n) => `${dir}/${n}`));
    for (const [n, b] of Object.entries(files)) stored[`${dir}/${n}`] = sha256(b);
    return uploadSha;
  };
  const readback = async () => {
    if (corrupt) return { ...stored, [Object.keys(stored)[0]]: '0'.repeat(64) };
    return stored;
  };
  return { gh, upload, readback, writes, uploads };
}

const staged = () => stage(validateReport(report(), FLOW), FLOW);
const args = (m) => ({
  ...m,
  checkId: 7,
  pr: '449',
  candidate: SHA,
  flow: FLOW,
  staged: staged(),
  prov: { candidate: SHA, captureRunner: CAPTURE_PIN, wrapper: WRAPPER, images: { n: 'sha256:1' } },
});

test('a validated capture is published with its record and provenance', async () => {
  const m = mock();
  await publish(args(m));
  assert.equal(m.writes.length, 1);
  const body = m.writes[0].body;
  assert.equal(m.writes[0].path.endsWith('check-runs/7'), true);
  assert.equal(body.conclusion, 'success');
  assert.equal(body.external_id, `browser-flow:${FLOW}`);
  const record = JSON.parse(body.output.text.match(/v1 (\{.*\}) -->/s)[1]);
  assert.equal(record.head, SHA);
  assert.equal(record.provenance.captureRunner, CAPTURE_PIN);
  assert.match(record.provenanceSha256, /^[0-9a-f]{64}$/);
  // Routine publishing writes the evidence folder only, never the authority record.
  assert.ok(m.uploads.every((p) => p.startsWith(`evidence/${SHA}/${FLOW}/`)));
  assert.ok(!m.uploads.includes(AUTHORITY_PATH));
  assert.ok(m.writes.every((w) => !w.path.includes('contents/control')));
  assert.equal(record.screenshots.length, 3);
  assert.ok(record.screenshots.every((s) => s.path.startsWith(`evidence/${SHA}/${FLOW}/`)));
});

test('a head race, failed upload or bad readback publishes nothing', async () => {
  for (const [name, m] of Object.entries({
    'head moved before upload': mock({ heads: ['f'.repeat(40)] }),
    'head moved after upload': mock({ heads: [SHA, 'f'.repeat(40)] }),
    'upload unavailable': mock({ uploadSha: null }),
    'readback differs': mock({ corrupt: true }),
  })) {
    await assert.rejects(publish(args(m)), undefined, name);
    assert.equal(m.writes.length, 0, name);
  }
});

test('provenance binds the anchored authority commit and the supported run', () => {
  const anchor = 'a1'.repeat(20);
  const run = { id: 'r1', route: 'owner-action', environment: 'env', authorityCommit: anchor };
  const p = provenance({
    pr: '449',
    flow: 'mini-putt-hole-next',
    candidate: 'e'.repeat(40),
    wrapper: 'e'.repeat(40),
    images: {},
    authority: { anchor, run, problems: [] },
  });
  assert.equal(p.authorityCommit, anchor);
  assert.deepEqual(p.run, run);
  // Without an anchored authority, nothing is bound and the gate refuses it.
  const bare = provenance({ pr: '449', flow: 'mini-putt-hole-next', candidate: 'e'.repeat(40) });
  assert.equal(bare.authorityCommit, null);
  assert.equal(bare.run, null);
});

test('publishing refuses an authority without an anchor or a supported run', () => {
  const o = {
    pr: '449',
    candidate: 'e'.repeat(40),
    flow: 'mini-putt-hole-next',
    runner: '/r',
    publish: true,
  };
  for (const problems of [
    ['authority anchor CARNIVAL_AUTHORITY_COMMIT missing or invalid'],
    ['run is not the native scheduled dispatch or the owner bootstrap action'],
  ])
    assert.match(
      invocationProblems(o, 'e'.repeat(40), { complete: true, record: undefined, problems }).join(),
      new RegExp(problems[0].split(' ').slice(0, 3).join(' ')),
    );
});
