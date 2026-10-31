import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { attemptProblems } from './isolated-record.mjs';
import { resolveUnder } from './static-serve.mjs';

const SHA = 'a'.repeat(40);
const RUNNER = 'b'.repeat(40);
const FLOW = 'mini-putt-hole-next';
const sha256 = (b) => createHash('sha256').update(b).digest('hex');

/** An attempt directory as the trusted flow.mjs writes it. */
function attempt(edit = () => {}) {
  const dir = mkdtempSync(join(tmpdir(), 'iso-test-'));
  const png = Buffer.from('png bytes');
  writeFileSync(join(dir, `${FLOW}-hole-done.png`), png);
  const report = {
    flow: FLOW,
    result: 'pass',
    screenshots: [{ file: `${FLOW}-hole-done.png`, sha256: sha256(png) }],
  };
  edit(dir, report);
  writeFileSync(join(dir, 'flow.json'), JSON.stringify(report));
  return dir;
}

test('a trusted attempt directory goes into a record', () => {
  assert.deepEqual(attemptProblems(attempt(), FLOW, SHA, RUNNER), []);
});

test('forged or redirected artifacts never go into a record', () => {
  const cases = {
    'a screenshot path outside the attempt': (_, r) => (r.screenshots[0].file = '../../etc/passwd'),
    'a screenshot path with a directory': (_, r) => (r.screenshots[0].file = `x/${FLOW}-a.png`),
    'a digest that does not match': (_, r) => (r.screenshots[0].sha256 = '0'.repeat(64)),
    'a symlinked screenshot': (d) => symlinkSync('/etc/hostname', join(d, `${FLOW}-linked.png`)),
    'an unexpected file': (d) => writeFileSync(join(d, 'run.sh'), 'x'),
    'a directory': (d) => mkdirSync(join(d, `${FLOW}-dir.png`)),
    'another flow': (_, r) => (r.flow = 'skee-ball'),
    'no screenshots': (_, r) => (r.screenshots = []),
    'a malformed screenshots field': (_, r) => (r.screenshots = 'x'),
  };
  for (const [name, edit] of Object.entries(cases))
    assert.notDeepEqual(attemptProblems(attempt(edit), FLOW, SHA, RUNNER), [], name);
  assert.notDeepEqual(attemptProblems(attempt(), FLOW, 'HEAD', RUNNER), [], 'a ref, not a sha');
  assert.notDeepEqual(attemptProblems(attempt(), FLOW, SHA, ''), [], 'no runner sha');
});

test('the static server serves only plain files under its root', () => {
  const root = mkdtempSync(join(tmpdir(), 'iso-serve-'));
  mkdirSync(join(root, 'assets'));
  writeFileSync(join(root, 'index.html'), 'ok');
  writeFileSync(join(root, 'assets', 'a.js'), 'ok');
  symlinkSync('/etc/hostname', join(root, 'leak.txt'));
  symlinkSync('/etc', join(root, 'etc'));
  assert.equal(resolveUnder(root, '/'), join(root, 'index.html'));
  assert.equal(resolveUnder(root, '/assets/a.js?v=1'), join(root, 'assets', 'a.js'));
  for (const bad of [
    '/../../etc/hostname',
    '/%2e%2e/%2e%2e/etc/hostname',
    '/assets/..%2f..%2fetc',
    '/leak.txt',
    '/etc/hostname',
    '/missing.js',
    '/assets',
    '/%00',
    '/%E0%A4%A',
  ])
    assert.equal(resolveUnder(root, bad), null, bad);
});
