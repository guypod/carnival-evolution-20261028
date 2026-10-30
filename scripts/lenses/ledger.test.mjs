// Tests for the review-lens improvement ledger and decision interface.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { checkContract, EXPECTED_SCHEDULES, WRITER_KEY } from '../factory/contract.mjs';
import {
  configuredLenses,
  dueSlot,
  emptyLedger,
  fingerprint,
  implementationIssue,
  LEDGER_BRANCH,
  pendingProposals,
  readLedger,
  recordDecision,
  recordRun,
  REPOSITORY_URL,
  slotAt,
  summary,
  validateDecision,
  validateRun,
  writeLedger,
} from './ledger.mjs';

const root = new URL('../../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('tessl.json', root), 'utf8'));
const lenses = configuredLenses(readFileSync(new URL('.tessl-code-review.yml', root), 'utf8'));

const evidence = (kind, ref, path = `pull/${ref.replace('#', '')}`) => ({
  kind,
  ref,
  url: `${REPOSITORY_URL}/${path}`,
});
const proposal = (extra = {}) => ({
  lens: './review-lenses/carnival-house-rules/SKILL.md',
  kind: 'amend',
  title: 'Check that start removes resize listeners',
  change: 'Add a rule 5 check for window resize listeners.',
  rationale: 'Two merged games leaked a resize listener after leaving.',
  weakens: false,
  evidence: [evidence('pr', '#283')],
  ...extra,
});
const run = (extra = {}) => ({
  runId: 'run-1',
  slot: '2026-10-30T11:40 Europe/London',
  startedAt: '2026-10-30T11:41:02Z',
  finishedAt: '2026-10-30T11:55:40Z',
  coverage: { status: 'complete', inspected: ['#283', '#304'] },
  proposals: [proposal()],
  ...extra,
});
const decision = (ledger, extra = {}) => ({
  fingerprint: ledger.proposals[0].fingerprint,
  decision: 'apply',
  rationale: 'The leak is real and the check is cheap.',
  evidence: [evidence('pr', '#304')],
  decidedBy: 'external block coordinator',
  slot: '2026-10-30T12:00 Europe/London',
  ...extra,
});

test('the schedule is native Europe/London at :40 before each six-hour block ends', () => {
  assert.deepEqual(EXPECTED_SCHEDULES['review-lens-improvement-six-hourly'], {
    cron: '40 5,11,17,23 * * *',
    timezone: 'Europe/London',
    description:
      'Twenty minutes before each six-hour London block ends: propose evidence-based review lens improvements to the fallback ledger',
    action: 'review-lens-improvement',
  });
  assert.deepEqual(checkContract(manifest), []);
  // It holds the shared writer key like every other writing action.
  assert.equal(manifest.actions['review-lens-improvement'].concurrency.keys[0].key, WRITER_KEY);
  assert.equal(manifest.actions['review-lens-improvement'].concurrency.mode, 'queue');
});

test('the existing schedules, guards and visual loop are unchanged', () => {
  assert.equal(manifest.schedules['visual-repair-six-hourly'].cron, '17 */6 * * *');
  assert.equal(manifest.schedules['test-health-weekly'].cron, '0 9 * * 1');
  for (const name of ['implement-github-issue', 'shepherd', 'test-health', 'visual-repair']) {
    assert.deepEqual(manifest.actions[name].concurrency, {
      keys: [{ key: WRITER_KEY, limit: 1 }],
      mode: 'queue',
    });
  }
  assert.equal(manifest.triggers['github-issue-labelled'].when['event.sender.type'], 'User');
  const m = structuredClone(manifest);
  delete m.schedules['review-lens-improvement-six-hourly'].timezone;
  assert.notDeepEqual(checkContract(m), [], 'dropping the timezone fails the contract');
  const n = structuredClone(manifest);
  delete n.actions['review-lens-improvement'].concurrency;
  assert.notDeepEqual(checkContract(n), [], 'dropping the writer key fails the contract');
});

test('slots follow London wall-clock time across both DST changes', () => {
  // Winter: London is UTC.
  assert.equal(slotAt('2026-01-15T05:40:00Z'), '2026-01-15T05:40 Europe/London');
  // Summer: London is UTC+1, so 17:40 London is 16:40 UTC.
  assert.equal(slotAt('2026-07-01T16:40:00Z'), '2026-07-01T17:40 Europe/London');
  assert.equal(slotAt('2026-07-01T17:40:00Z'), null);
  // Day after the spring change (29 March 2026) and the autumn one (25 October 2026).
  assert.equal(slotAt('2026-03-29T04:45:00Z'), '2026-03-29T05:40 Europe/London');
  assert.equal(slotAt('2026-10-25T05:40:00Z'), '2026-10-25T05:40 Europe/London');
  assert.equal(slotAt('2026-10-24T22:40:00Z'), '2026-10-24T23:40 Europe/London');
  // Inside the window counts, at its edge it does not.
  assert.equal(slotAt('2026-01-15T05:59:59Z'), '2026-01-15T05:40 Europe/London');
  assert.equal(slotAt('2026-01-15T06:00:00Z'), null);
  assert.equal(slotAt('2026-01-15T05:39:59Z'), null);
});

test('every London day, DST change days included, has exactly four distinct slots', () => {
  for (const day of ['2026-03-29', '2026-10-25', '2026-06-01']) {
    const slots = new Set();
    const start = Date.parse(`${day}T00:00:00Z`) - 2 * 3600_000;
    for (let t = start; t < start + 28 * 3600_000; t += 60_000) {
      const slot = slotAt(t);
      if (slot?.startsWith(day)) slots.add(slot);
    }
    assert.deepEqual(
      [...slots].sort(),
      ['05', '11', '17', '23'].map((h) => `${day}T${h}:40 Europe/London`),
      day,
    );
  }
});

test('a covered slot is not run twice, a partial one may retry, a missed one never runs late', () => {
  const ledger = recordRun(emptyLedger(), run());
  assert.equal(dueSlot(ledger, '2026-10-30T11:45:00Z').due, false);
  const partial = recordRun(
    emptyLedger(),
    run({ coverage: { status: 'partial', inspected: ['#283'], gaps: 'gh list hit its limit' } }),
  );
  assert.equal(dueSlot(partial, '2026-10-30T11:45:00Z').due, true);
  // Twelve minutes after the window closed: not due, and nothing to record.
  assert.deepEqual(dueSlot(emptyLedger(), '2026-10-30T12:12:00Z'), {
    due: false,
    slot: null,
    reason: 'outside every London slot window',
  });
});

test('fingerprints are stable across whitespace and case and differ by lens', () => {
  const a = fingerprint(proposal());
  assert.equal(
    a,
    fingerprint(proposal({ title: '  check that START removes   resize listeners ' })),
  );
  assert.notEqual(a, fingerprint(proposal({ lens: './review-lenses/visual-design/SKILL.md' })));
  assert.match(a, /^[0-9a-f]{16}$/);
});

test('a repeated proposal is kept once, gains evidence and keeps its decision', () => {
  let ledger = recordRun(emptyLedger(), run());
  ledger = recordDecision(ledger, decision(ledger, { decision: 'defer' }), '2026-10-30T12:01Z');
  ledger = recordRun(
    ledger,
    run({
      runId: 'run-2',
      slot: '2026-10-30T17:40 Europe/London',
      proposals: [proposal({ evidence: [evidence('pr', '#283'), evidence('pr', '#304')] })],
    }),
  );
  assert.equal(ledger.proposals.length, 1);
  assert.equal(ledger.proposals[0].status, 'deferred');
  assert.deepEqual(
    ledger.proposals[0].evidence.map((e) => e.ref),
    ['#283', '#304'],
  );
  assert.deepEqual(ledger.proposals[0].seenIn, ['run-1', 'run-2']);
  // Recording the same run again changes nothing.
  assert.equal(recordRun(ledger, run({ runId: 'run-2' })), ledger);
});

test('evidence must be public and in this repository', () => {
  assert.deepEqual(validateRun(run(), lenses), []);
  const bad = [
    { kind: 'pr', ref: '#1', url: 'https://example.com/private-log' },
    { kind: 'chat', ref: 'x', url: `${REPOSITORY_URL}/pull/1` },
    { kind: 'pr', ref: '', url: `${REPOSITORY_URL}/pull/1`, commit: 'not-a-sha' },
  ];
  for (const item of bad) {
    assert.notDeepEqual(
      validateRun(run({ proposals: [proposal({ evidence: [item] })] }), lenses),
      [],
    );
  }
  assert.notDeepEqual(validateRun(run({ proposals: [proposal({ evidence: [] })] }), lenses), []);
});

test('proposals name a configured lens or a new one, and declare whether they weaken it', () => {
  assert.ok(lenses.includes('./review-lenses/visual-design/SKILL.md'));
  assert.notDeepEqual(
    validateRun(run({ proposals: [proposal({ lens: './nope.md' })] }), lenses),
    [],
  );
  assert.deepEqual(
    validateRun(run({ proposals: [proposal({ kind: 'new', lens: 'new:audio-cues' })] }), lenses),
    [],
  );
  const undeclared = proposal();
  delete undeclared.weakens;
  assert.notDeepEqual(validateRun(run({ proposals: [undeclared] }), lenses), []);
});

test('partial and failed coverage are recorded honestly', () => {
  assert.notDeepEqual(
    validateRun(run({ coverage: { status: 'partial', inspected: [] } }), lenses),
    [],
    'partial coverage must name its gaps',
  );
  const failed = run({
    coverage: { status: 'failed', inspected: [], gaps: 'git fetch failed' },
    proposals: [],
  });
  assert.deepEqual(validateRun(failed, lenses), []);
  const ledger = recordRun(emptyLedger(), failed);
  assert.equal(ledger.runs[0].coverage.status, 'failed');
  assert.equal(ledger.runs[0].startedAt, '2026-10-30T11:41:02Z');
  assert.notDeepEqual(validateRun({ ...failed, proposals: [proposal()] }, lenses), []);
  assert.notDeepEqual(validateRun(run({ startedAt: 'soon' }), lenses), []);
});

test('decisions need rationale, evidence and a decider other than the loop', () => {
  const ledger = recordRun(emptyLedger(), run());
  assert.deepEqual(validateDecision(ledger, decision(ledger)), []);
  assert.notDeepEqual(validateDecision(ledger, decision(ledger, { rationale: '' })), []);
  assert.notDeepEqual(validateDecision(ledger, decision(ledger, { evidence: [] })), []);
  assert.notDeepEqual(validateDecision(ledger, decision(ledger, { decision: 'merge' })), []);
  assert.notDeepEqual(
    validateDecision(ledger, decision(ledger, { decidedBy: 'review-lens-improvement' })),
    [],
  );
  assert.notDeepEqual(validateDecision(ledger, decision(ledger, { fingerprint: 'nope' })), []);
});

test('an applied or rejected proposal leaves the pending list and cannot be decided again', () => {
  let ledger = recordRun(emptyLedger(), run());
  assert.equal(pendingProposals(ledger).length, 1);
  ledger = recordDecision(ledger, decision(ledger, { decision: 'reject' }), '2026-10-30T12:01Z');
  assert.equal(pendingProposals(ledger).length, 0);
  assert.equal(ledger.proposals[0].decisions[0].decision, 'reject');
  assert.notDeepEqual(validateDecision(ledger, decision(ledger)), []);
});

test('weakening a lens needs evidence from two pull requests', () => {
  const ledger = recordRun(emptyLedger(), run({ proposals: [proposal({ weakens: true })] }));
  assert.notDeepEqual(
    validateDecision(ledger, decision(ledger, { evidence: [evidence('pr', '#283')] })),
    [],
  );
  assert.deepEqual(validateDecision(ledger, decision(ledger)), []);
});

test('an accepted proposal becomes a factory issue, not an applied change', () => {
  let ledger = recordRun(emptyLedger(), run());
  ledger = recordDecision(ledger, decision(ledger), '2026-10-30T12:01Z');
  assert.equal(ledger.proposals[0].status, 'accepted');
  const issue = implementationIssue(ledger.proposals[0]);
  assert.equal(issue.title, 'Review lens: Check that start removes resize listeners');
  assert.match(issue.body, /pr #304/);
  assert.match(issue.body, /external block coordinator/);
});

test('the run summary labels itself as the fallback and lists pending proposals', () => {
  const ledger = recordRun(emptyLedger(), run());
  const text = summary(ledger, 'run-1');
  assert.match(text, /fallback ledger, not the native findings UI/);
  assert.match(text, new RegExp(`blob/${LEDGER_BRANCH}/ledger.json`));
  assert.match(text, /1 proposal\(s\) awaiting a decision/);
});

test('the ledger round-trips through a branch and refuses a stale write', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lens-ledger-test-'));
  const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  try {
    const remote = join(dir, 'remote.git');
    const work = join(dir, 'work');
    sh(dir, 'init', '--quiet', '--bare', remote);
    sh(dir, 'init', '--quiet', work);
    sh(work, 'config', 'user.email', 'test@example.com');
    sh(work, 'config', 'user.name', 'test');
    sh(work, 'remote', 'add', 'origin', remote);
    const first = readLedger(work);
    assert.equal(first.base, null);
    const saved = recordRun(first.ledger, run());
    writeLedger(work, saved, first.base, 'first');
    const second = readLedger(work);
    assert.deepEqual(second.ledger, saved);
    writeLedger(work, saved, second.base, 'second');
    assert.throws(() => writeLedger(work, saved, second.base, 'stale'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
