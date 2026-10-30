// Execution tests for the visual repair loop's lifecycle: coverage, findings,
// its own pull requests and the stored ledger. Each test runs the same
// functions the loop's command line runs.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  BATCH_SIZE,
  LEDGER_BRANCH,
  affectedRoutes,
  allRoutes,
  emptyLedger,
  planRun,
  readLedger,
  reconcileOwnPrs,
  recordReview,
  repairable,
  routeModules,
  writeLedger,
} from './ledger.mjs';

const mainSource = readFileSync(new URL('../../src/main.ts', import.meta.url), 'utf8');
const games = ['water-cannon', 'ring-toss'];
const routes = allRoutes(mainSource, games);
const NOW = '2026-10-30T00:00:00Z';
const base = { mainSource, routes, others: [], openPr: null, changedFiles: [] };
const finding = (route, criterion, extra = {}) => ({
  route,
  state: 'desktop-clean',
  criterion,
  note: `${criterion} on ${route}`,
  ...extra,
});

/** Run every batch the plan asks for, as successive runs would. */
function reviewAll(ledger, head, changedFiles, findingsFor = () => []) {
  let runs = 0;
  for (;;) {
    const plan = planRun(ledger, { ...base, head, changedFiles });
    if (plan.action !== 'review') return { ledger: plan.ledger, runs };
    ledger = recordReview(plan.ledger, {
      reviewed: plan.batch,
      findings: plan.batch.flatMap(findingsFor),
      now: NOW,
    });
    runs++;
  }
}

test('the route list covers the midway, every standalone screen and every game', () => {
  for (const r of ['#/', '#/balloon', '#/snack', '#/workshop', '#/play/water-cannon']) {
    assert.ok(routes.includes(r), r);
  }
  assert.equal(routeModules(mainSource).get('src/wish-balloon.ts')?.[0], '#/balloon');
});

test('a shared style change owes every route a look, not three', () => {
  assert.deepEqual(affectedRoutes(['src/style.css'], mainSource, routes), routes);
  assert.deepEqual(affectedRoutes(['src/carnival/theme.ts'], mainSource, routes), routes);
  assert.deepEqual(affectedRoutes(['src/wish-balloon.ts'], mainSource, routes), ['#/balloon']);
  assert.deepEqual(affectedRoutes(['src/games/ring-toss/game.ts'], mainSource, routes), [
    '#/play/ring-toss',
  ]);
  assert.deepEqual(
    affectedRoutes(['src/snack-stand.test.ts', 'README.md'], mainSource, routes),
    [],
  );
});

test('the first run owes every route a look instead of starting from the skill commit', () => {
  const plan = planRun(emptyLedger(), { ...base, head: 'h1' });
  assert.equal(plan.action, 'review');
  assert.equal(plan.batch.length, BATCH_SIZE);
  assert.deepEqual([...plan.ledger.pending].sort(), [...routes].sort());
});

test('coverage moves only after every owed route is reviewed, batch by batch', () => {
  let ledger = recordReview(planRun(emptyLedger(), { ...base, head: 'h1' }).ledger, {
    reviewed: routes,
    findings: [],
    now: NOW,
  });
  assert.equal(ledger.reviewedThrough, 'h1');
  const plan = planRun(ledger, { ...base, head: 'h2', changedFiles: ['src/style.css'] });
  ledger = recordReview(plan.ledger, { reviewed: plan.batch, findings: [], now: NOW });
  assert.equal(ledger.reviewedThrough, 'h1', 'partial coverage does not move the checkpoint');
  const done = reviewAll(ledger, 'h2', ['src/style.css']);
  assert.equal(done.ledger.reviewedThrough, 'h2');
  assert.deepEqual(done.ledger.pending, []);
  assert.equal(done.runs, Math.ceil((routes.length - BATCH_SIZE) / BATCH_SIZE));
});

test('an interrupted run leaves the ledger as it was, and the next run starts again', () => {
  const ledger = recordReview(planRun(emptyLedger(), { ...base, head: 'h1' }).ledger, {
    reviewed: routes,
    findings: [],
    now: NOW,
  });
  const first = planRun(ledger, { ...base, head: 'h2', changedFiles: ['src/style.css'] });
  // The run stops before `record`: nothing is saved, so the stored ledger is unchanged.
  const again = planRun(ledger, { ...base, head: 'h2', changedFiles: ['src/style.css'] });
  assert.deepEqual(again.batch, first.batch);
});

test('a deferred run changes nothing and keeps everything owed', () => {
  const ledger = planRun(emptyLedger(), { ...base, head: 'h1' }).ledger;
  const plan = planRun(ledger, { ...base, head: 'h2', others: ['open Tessl pull request #9'] });
  assert.equal(plan.action, 'defer');
  assert.deepEqual(plan.ledger, ledger);
});

test('findings on routes the repair did not touch survive later commits', () => {
  const findings = (r) =>
    r === '#/snack' || r === '#/balloon' ? [finding(r, 'controls'), finding(r, 'composition')] : [];
  let { ledger } = reviewAll(emptyLedger(), 'h1', [], findings);
  assert.equal(repairable(ledger, NOW).length, 4);
  // Four unrelated commits later, nothing about #/snack changed.
  for (const head of ['h2', 'h3', 'h4', 'h5']) {
    ledger = reviewAll(ledger, head, ['src/games/ring-toss/game.ts'], findings).ledger;
  }
  assert.deepEqual(
    repairable(ledger, NOW)
      .map((f) => f.fingerprint)
      .sort(),
    [
      '#/balloon:desktop-clean:composition',
      '#/balloon:desktop-clean:controls',
      '#/snack:desktop-clean:composition',
      '#/snack:desktop-clean:controls',
    ],
  );
  // Open findings are revisited first, ahead of newly owed routes.
  const plan = planRun(ledger, { ...base, head: 'h6', changedFiles: ['src/style.css'] });
  assert.deepEqual(plan.batch.slice(0, 2).sort(), ['#/balloon', '#/snack']);
});

test('a finding that no longer shows on a re-reviewed route is resolved', () => {
  let { ledger } = reviewAll(emptyLedger(), 'h1', [], (r) =>
    r === '#/snack' ? [finding(r, 'controls')] : [],
  );
  const plan = planRun(ledger, { ...base, head: 'h2' });
  assert.ok(plan.batch.includes('#/snack'));
  ledger = recordReview(plan.ledger, { reviewed: plan.batch, findings: [], now: NOW });
  assert.equal(ledger.findings[0].status, 'resolved');
  assert.equal(repairable(ledger, NOW).length, 0);
});

const ownPr = (state, extra = {}) => ({
  number: 41,
  state,
  headRefName: 'tessl/visual-repair-snack-20261030',
  body: 'fixes\n<!-- tessl-visual-finding: #/snack:desktop-clean:controls -->',
  closedAt: state === 'OPEN' ? null : '2026-10-29T00:00:00Z',
  ...extra,
});
const withSnackFinding = () =>
  reviewAll(emptyLedger(), 'h1', [], (r) => (r === '#/snack' ? [finding(r, 'controls')] : []))
    .ledger;

test('the loop recovers its own open pull request instead of deferring on it', () => {
  const { ledger, openPr } = reconcileOwnPrs(withSnackFinding(), [ownPr('OPEN')], NOW);
  assert.equal(openPr, 41);
  const plan = planRun(ledger, { ...base, head: 'h2', openPr });
  assert.deepEqual([plan.action, plan.pr], ['monitor', 41]);
  assert.equal(repairable(ledger, NOW).length, 0, 'no second repair of the same finding');
});

test('a merged own pull request is recorded and its route re-checked on main', () => {
  const { ledger, openPr } = reconcileOwnPrs(withSnackFinding(), [ownPr('MERGED')], NOW);
  assert.equal(openPr, null);
  assert.equal(ledger.findings[0].status, 'merged');
  const plan = planRun(ledger, { ...base, head: 'h2', openPr });
  assert.equal(plan.action, 'review');
  assert.ok(plan.batch.includes('#/snack'));
  // On main the finding is gone: merged becomes resolved, the repair held.
  const after = recordReview(plan.ledger, { reviewed: plan.batch, findings: [], now: NOW });
  assert.equal(after.findings[0].status, 'resolved');
  // Or it is back: the repair did not hold, and it may be repaired again.
  const back = recordReview(plan.ledger, {
    reviewed: plan.batch,
    findings: [finding('#/snack', 'controls')],
    now: NOW,
  });
  assert.equal(repairable(back, NOW).length, 1);
});

test('a retained branch from a merged or declined pull request never blocks a run', () => {
  for (const state of ['MERGED', 'CLOSED']) {
    const { ledger, openPr } = reconcileOwnPrs(withSnackFinding(), [ownPr(state)], NOW);
    const plan = planRun(ledger, { ...base, head: 'h2', openPr });
    assert.notEqual(plan.action, 'defer', state);
    assert.notEqual(plan.action, 'monitor', state);
  }
});

test('a declined repair is kept declined for 30 days, even when seen again', () => {
  let { ledger } = reconcileOwnPrs(withSnackFinding(), [ownPr('CLOSED')], NOW);
  assert.equal(ledger.findings[0].status, 'declined');
  const plan = planRun(ledger, { ...base, head: 'h2', changedFiles: ['src/snack-stand.ts'] });
  ledger = recordReview(plan.ledger, {
    reviewed: plan.batch,
    findings: [finding('#/snack', 'controls')],
    now: NOW,
  });
  assert.equal(ledger.findings[0].status, 'declined');
  assert.equal(repairable(ledger, NOW).length, 0);
  assert.equal(repairable(ledger, '2026-12-15T00:00:00Z').length, 1);
});

test('repeating a reconcile with the same pull requests changes nothing', () => {
  const once = reconcileOwnPrs(withSnackFinding(), [ownPr('MERGED')], NOW).ledger;
  const twice = reconcileOwnPrs(once, [ownPr('MERGED')], NOW).ledger;
  assert.deepEqual(twice, once);
});

test('other people’s and other loops’ pull requests are not the loop’s own', () => {
  const { openPr } = reconcileOwnPrs(
    withSnackFinding(),
    [ownPr('OPEN', { headRefName: 'tessl/issue-303' })],
    NOW,
  );
  assert.equal(openPr, null);
});

function originRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'ledger-test-'));
  const run = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  run(dir, 'init', '--quiet', '--bare', 'origin.git');
  run(dir, 'init', '--quiet', 'a');
  run(dir, 'init', '--quiet', 'b');
  for (const clone of ['a', 'b']) {
    run(join(dir, clone), 'remote', 'add', 'origin', join(dir, 'origin.git'));
    run(join(dir, clone), 'config', 'user.email', 'test@example.com');
    run(join(dir, clone), 'config', 'user.name', 'test');
  }
  return { a: join(dir, 'a'), b: join(dir, 'b'), origin: join(dir, 'origin.git'), run };
}

test('the ledger round-trips through an ordinary branch on origin', () => {
  const { a, b, origin, run } = originRepo();
  assert.deepEqual(readLedger(a), { ledger: emptyLedger(), base: null });
  const saved = { ...emptyLedger(), reviewedThrough: 'h1' };
  const commit = writeLedger(a, saved, null, 'first');
  assert.equal(run(origin, 'rev-parse', `refs/heads/${LEDGER_BRANCH}`), commit);
  assert.deepEqual(readLedger(b), { ledger: saved, base: commit });
});

test('a stale writer cannot overwrite a newer ledger', () => {
  const { a, b } = originRepo();
  writeLedger(a, emptyLedger(), null, 'first');
  const fromB = readLedger(b);
  const fromA = readLedger(a);
  writeLedger(a, { ...fromA.ledger, reviewedThrough: 'h2' }, fromA.base, 'a wins');
  assert.throws(() =>
    writeLedger(b, { ...fromB.ledger, reviewedThrough: 'h-old' }, fromB.base, 'stale'),
  );
  assert.equal(readLedger(b).ledger.reviewedThrough, 'h2');
});

test('the independent pixel check reads committed screenshots without a browser', async () => {
  const { decodePng, isBlank, summarise } = await import('./pixels.mjs');
  const real = summarise(
    decodePng(
      readFileSync(
        new URL('../../docs/visual-baseline/after/balloon-desktop-clean.png', import.meta.url),
      ),
    ),
  );
  assert.equal(real.width, 1280);
  assert.equal(isBlank(real), false);
  const { deflateSync } = await import('node:zlib');
  const png = (w, h, rows) => {
    const chunk = (type, body) => {
      const head = Buffer.alloc(8);
      head.writeUInt32BE(body.length);
      head.write(type, 4, 'ascii');
      return Buffer.concat([head, body, Buffer.alloc(4)]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w);
    ihdr.writeUInt32BE(h, 4);
    ihdr.set([8, 2, 0, 0, 0], 8);
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(Buffer.concat(rows))),
      chunk('IEND', Buffer.alloc(0)),
    ]);
  };
  const flat = Buffer.concat([Buffer.from([0]), Buffer.alloc(8 * 3, 40)]);
  assert.equal(isBlank(summarise(decodePng(png(8, 8, Array(8).fill(flat))))), true);
});
