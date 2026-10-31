import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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

const HERE = dirname(fileURLToPath(import.meta.url));
/** Runs a runner script with a docker that must never be reached. */
function run(script, args, env = {}) {
  const bin = mkdtempSync(join(tmpdir(), 'iso-bin-'));
  writeFileSync(join(bin, 'docker'), '#!/bin/sh\necho "$@" >>"$0.calls"\nexit 1\n', {
    mode: 0o755,
  });
  const r = spawnSync(join(HERE, script), args, {
    encoding: 'utf8',
    env: { PATH: `${bin}:${process.env.PATH}`, HOME: tmpdir(), ...env },
  });
  return { ...r, calls: existsSync(join(bin, 'docker.calls')) };
}

test('the isolated build fails closed before any candidate code runs', () => {
  const work = () => join(mkdtempSync(join(tmpdir(), 'iso-work-')), 'w');
  const git = join(HERE, '../../.git');
  const noSnapshot = run('isolated-build.sh', [git, SHA, work(), join(tmpdir(), 'no-such-deps')]);
  assert.equal(noSnapshot.status, 3, 'no dependency snapshot');
  assert.match(noSnapshot.stderr, /no trusted dependency snapshot/);
  assert.equal(noSnapshot.calls, false, 'docker never called without a snapshot');
  const deps = mkdtempSync(join(tmpdir(), 'iso-deps-'));
  mkdirSync(join(deps, 'node_modules/vite/bin'), { recursive: true });
  writeFileSync(join(deps, 'node_modules/vite/bin/vite.js'), '');
  const noDaemon = run('isolated-build.sh', [git, SHA, work(), deps]);
  assert.equal(noDaemon.status === 0, false, 'docker unavailable');
  assert.equal(run('isolated-build.sh', [git, 'HEAD', work(), deps]).status, 2, 'a ref');
});

test('the isolated browser refuses a used report directory and a missing image', () => {
  const report = mkdtempSync(join(tmpdir(), 'iso-report-'));
  writeFileSync(join(report, 'flow.json'), '{"result":"pass"}');
  const used = run('isolated-browser.sh', ['img', report, report, report, report, FLOW]);
  assert.equal(used.status, 2, 'a seeded report directory');
  assert.equal(used.calls, false);
  const empty = mkdtempSync(join(tmpdir(), 'iso-report-'));
  assert.equal(
    run('isolated-browser.sh', ['img', empty, empty, empty, empty, FLOW]).status,
    3,
    'no image',
  );
});

test('the build never installs from the candidate or gives it a network', async () => {
  const { readFileSync } = await import('node:fs');
  const build = readFileSync(join(HERE, 'isolated-build.sh'), 'utf8');
  const browser = readFileSync(join(HERE, 'isolated-browser.sh'), 'utf8');
  for (const [name, src] of [
    ['build', build],
    ['browser', browser],
  ]) {
    const runs = src.split('\n').filter((l) => /docker run /.test(l));
    assert.ok(runs.length > 0, name);
    for (const l of runs) assert.match(l, /--network none/, `${name}: ${l}`);
    const code = src
      .split('\n')
      .filter((l) => !l.startsWith('#'))
      .join('\n');
    assert.doesNotMatch(code, /docker\.sock|--privileged|--network host|--pid[ =]/, name);
  }
  assert.doesNotMatch(
    build
      .split('\n')
      .filter((l) => !l.startsWith('#'))
      .join('\n'),
    /npm (ci|install)/,
    'build installs nothing',
  );
});
