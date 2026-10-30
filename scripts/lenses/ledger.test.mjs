// Tests for the factory learning ledger and decision interface.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { checkContract, EXPECTED_SCHEDULES, WRITER_KEY } from '../factory/contract.mjs';
import {
  checkpoint,
  configuredLenses,
  dueSlot,
  emptyLedger,
  fingerprint,
  implementationIssue,
  LEARNERS,
  LEDGER_BRANCH,
  manualStart,
  pendingProposals,
  readLedger,
  recordDecision,
  recordRun,
  REPOSITORY_URL,
  SAFETY_STANDARDS,
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
  target: './review-lenses/carnival-house-rules/SKILL.md',
  kind: 'amend-lens',
  title: 'Check that start removes resize listeners',
  change: 'Add a rule 5 check for window resize listeners.',
  rationale: 'Two merged games leaked a resize listener after leaving.',
  weakens: false,
  standards: [],
  netLines: 1,
  evidence: [evidence('pr', '#283')],
  ...extra,
});
const run = (extra = {}) => ({
  runId: 'run-1',
  learner: 'lens-tuning',
  trigger: 'schedule',
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
  validation: 'current',
  checkedAt: '014c68819fda74e66e0579b4cf1033436b963fd5',
  ...extra,
});
// The recording time for run(): shortly after it finished.
const opts = (extra = {}) => ({ lenses, now: '2026-10-30T11:56:00Z', ...extra });

test('the schedule is native Europe/London at :40 before each six-hour block ends', () => {
  assert.deepEqual(EXPECTED_SCHEDULES['review-lens-improvement-six-hourly'], {
    cron: '40 5,11,17,23 * * *',
    timezone: 'Europe/London',
    description:
      'Twenty minutes before each six-hour London block ends: propose evidence-based review lens improvements to the fallback ledger',
    action: { use: 'review-lens-improvement', inputs: { LEARNER: 'lens-tuning' } },
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
    reason: 'outside every lens-tuning slot window',
  });
});

test('fingerprints are stable across whitespace and case and differ by lens', () => {
  const a = fingerprint(proposal());
  assert.equal(
    a,
    fingerprint(proposal({ title: '  check that START removes   resize listeners ' })),
  );
  assert.notEqual(a, fingerprint(proposal({ target: './review-lenses/visual-design/SKILL.md' })));
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
  assert.deepEqual(validateRun(run(), opts()), []);
  const bad = [
    { kind: 'pr', ref: '#1', url: 'https://example.com/private-log' },
    { kind: 'chat', ref: 'x', url: `${REPOSITORY_URL}/pull/1` },
    { kind: 'pr', ref: '', url: `${REPOSITORY_URL}/pull/1`, commit: 'not-a-sha' },
  ];
  for (const item of bad) {
    assert.notDeepEqual(
      validateRun(run({ proposals: [proposal({ evidence: [item] })] }), opts()),
      [],
    );
  }
  assert.notDeepEqual(validateRun(run({ proposals: [proposal({ evidence: [] })] }), opts()), []);
});

test('proposals name a configured lens or a new one, and declare whether they weaken it', () => {
  assert.ok(lenses.includes('./review-lenses/visual-design/SKILL.md'));
  assert.notDeepEqual(
    validateRun(run({ proposals: [proposal({ target: './nope.md' })] }), opts()),
    [],
  );
  assert.deepEqual(
    validateRun(
      run({ proposals: [proposal({ kind: 'new-lens', target: 'new:audio-cues' })] }),
      opts(),
    ),
    [],
  );
  const undeclared = proposal();
  delete undeclared.weakens;
  assert.notDeepEqual(validateRun(run({ proposals: [undeclared] }), opts()), []);
});

test('partial and failed coverage are recorded honestly', () => {
  assert.notDeepEqual(
    validateRun(run({ coverage: { status: 'partial', inspected: [] } }), opts()),
    [],
    'partial coverage must name its gaps',
  );
  const failed = run({
    coverage: { status: 'failed', inspected: [], gaps: 'git fetch failed' },
    proposals: [],
  });
  assert.deepEqual(validateRun(failed, opts()), []);
  const ledger = recordRun(emptyLedger(), failed);
  assert.equal(ledger.runs[0].coverage.status, 'failed');
  assert.equal(ledger.runs[0].startedAt, '2026-10-30T11:41:02Z');
  assert.notDeepEqual(validateRun({ ...failed, proposals: [proposal()] }, opts()), []);
  assert.notDeepEqual(validateRun(run({ startedAt: 'soon' }), opts()), []);
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
  assert.equal(issue.title, 'lens-tuning: Check that start removes resize listeners');
  assert.match(issue.body, /pr #304/);
  assert.match(issue.body, /external block coordinator/);
});

test('the run summary labels itself as the fallback and lists pending proposals', () => {
  const ledger = recordRun(emptyLedger(), run());
  const text = summary(ledger, 'run-1');
  assert.match(text, /runtime scheduled-findings integration is disabled/);
  assert.doesNotMatch(text, /native findings UI/);
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

test('each learner has its own London default slots', () => {
  // 30 October 2026 is a Friday, after the autumn change, so London is UTC.
  assert.equal(slotAt('2026-10-30T05:10:00Z', 'review-feedback'), '2026-10-30T05:10 Europe/London');
  assert.equal(slotAt('2026-10-30T05:20:00Z', 'run-learning'), '2026-10-30T05:20 Europe/London');
  assert.equal(slotAt('2026-10-30T11:10:00Z', 'review-feedback'), null, 'daily, not six-hourly');
  // The tidy runs on Mondays only.
  assert.equal(slotAt('2026-10-30T05:30:00Z', 'instruction-tidy'), null);
  assert.equal(
    slotAt('2026-11-02T05:30:00Z', 'instruction-tidy'),
    '2026-11-02T05:30 Europe/London',
  );
  // Summer: 05:10 London is 04:10 UTC.
  assert.equal(slotAt('2026-07-01T04:10:00Z', 'review-feedback'), '2026-07-01T05:10 Europe/London');
  assert.equal(slotAt('2026-10-30T05:10:00Z', 'nope'), null);
  assert.equal(dueSlot(emptyLedger(), '2026-10-30T05:10:00Z', 'nope').due, false);
  // A lens-tuning run does not cover the feedback slot.
  const ledger = recordRun(emptyLedger(), run());
  assert.equal(dueSlot(ledger, '2026-10-30T05:12:00Z', 'review-feedback').due, true);
});

test('the learners share one schema, and each makes only its own kinds', () => {
  const feedback = run({
    learner: 'review-feedback',
    slot: '2026-10-30T05:10 Europe/London',
    startedAt: '2026-10-30T05:11:00Z',
    finishedAt: '2026-10-30T05:20:00Z',
    proposals: [
      proposal({
        kind: 'amend-instruction',
        target: 'AGENTS.md',
        evidence: [evidence('review-finding', '#304 thread 1')],
      }),
    ],
  });
  const at = opts({ now: '2026-10-30T05:21:00Z' });
  assert.deepEqual(validateRun(feedback, at), []);
  const missing = opts({ now: '2026-10-30T05:21:00Z', exists: () => false });
  assert.notDeepEqual(validateRun(feedback, missing), [], 'the target must exist');
  const escape = { ...feedback, proposals: [proposal({ kind: 'add-check', target: '../x' })] };
  assert.notDeepEqual(validateRun(escape, at), [], 'targets stay in the repository');
  // run-learning cannot propose lens changes; lens-tuning cannot touch instructions.
  const runLearning = {
    ...feedback,
    learner: 'run-learning',
    slot: '2026-10-30T05:20 Europe/London',
  };
  runLearning.startedAt = '2026-10-30T05:21:00Z';
  runLearning.finishedAt = '2026-10-30T05:25:00Z';
  assert.deepEqual(validateRun(runLearning, opts({ now: '2026-10-30T05:26:00Z' })), []);
  assert.notDeepEqual(
    validateRun({ ...runLearning, proposals: [proposal()] }, opts({ now: '2026-10-30T05:26:00Z' })),
    [],
  );
  assert.notDeepEqual(
    validateRun(
      run({ proposals: [proposal({ kind: 'amend-instruction', target: 'AGENTS.md' })] }),
      opts(),
    ),
    [],
  );
  const recorded = recordRun(emptyLedger(), feedback);
  assert.equal(recorded.proposals[0].learner, 'review-feedback');
  assert.equal(recorded.runs[0].learner, 'review-feedback');
  // The fingerprint keys on kind and target, so the same title elsewhere is new.
  assert.notEqual(
    fingerprint(proposal()),
    fingerprint(proposal({ kind: 'amend-instruction', target: 'AGENTS.md' })),
  );
});

test('an instruction tidy never grows the instructions and names its replacement check', () => {
  const tidy = (p) =>
    run({
      learner: 'instruction-tidy',
      slot: '2026-11-02T05:30 Europe/London',
      startedAt: '2026-11-02T05:31:00Z',
      finishedAt: '2026-11-02T05:40:00Z',
      proposals: [
        proposal({
          kind: 'replace-with-check',
          target: 'AGENTS.md',
          check: 'eslint.config.js',
          netLines: -3,
          ...p,
        }),
      ],
    });
  const at = opts({ now: '2026-11-02T05:41:00Z' });
  assert.deepEqual(validateRun(tidy(), at), []);
  assert.notDeepEqual(validateRun(tidy({ netLines: 2 }), at), [], 'no growth');
  assert.notDeepEqual(validateRun(tidy({ check: undefined }), at), [], 'names the check');
  assert.notDeepEqual(validateRun(tidy({ netLines: 'few' }), at), []);
  assert.deepEqual(
    validateRun(
      tidy({ kind: 'scope-instruction', target: 'src/games/AGENTS.md', check: undefined }),
      at,
    ),
    [],
  );
});

test('a scheduled run claims only the slot its real start fell in, recorded promptly', () => {
  // Claiming 17:40 from an 11:41 start, or 11:40 from a 12:30 start, is refused.
  assert.notDeepEqual(validateRun(run({ slot: '2026-10-30T17:40 Europe/London' }), opts()), []);
  const late = run({ startedAt: '2026-10-30T12:30:00Z', finishedAt: '2026-10-30T12:40:00Z' });
  assert.notDeepEqual(validateRun(late, opts({ now: '2026-10-30T12:41:00Z' })), []);
  // Old times recorded much later are refused, as are future or reversed ones.
  assert.notDeepEqual(validateRun(run(), opts({ now: '2026-10-30T13:30:00Z' })), []);
  assert.notDeepEqual(validateRun(run(), opts({ now: '2026-10-30T11:50:00Z' })), []);
  assert.notDeepEqual(validateRun(run({ finishedAt: '2026-10-30T11:40:00Z' }), opts()), []);
  assert.notDeepEqual(validateRun(run({ trigger: undefined }), opts()), []);
  assert.notDeepEqual(validateRun(run({ manualId: 'manual-x' }), opts()), []);
});

test('a manual initial inspection is bounded, real-timed and separate from slot coverage', () => {
  const manual = (extra = {}) => ({
    runId: 'run-m1',
    learner: 'lens-tuning',
    trigger: 'manual',
    manualId: 'manual-setup-check-1',
    since: '2026-10-29T12:40:00Z',
    startedAt: '2026-10-30T12:40:00Z',
    finishedAt: '2026-10-30T12:52:00Z',
    coverage: { status: 'complete', inspected: ['#304', '#375'] },
    proposals: [proposal()],
    ...extra,
  });
  const at = opts({ now: '2026-10-30T12:53:00Z' });
  assert.deepEqual(validateRun(manual(), at), []);
  // It never names a slot, so it cannot pass for 11:40 or 17:40.
  assert.notDeepEqual(validateRun(manual({ slot: '2026-10-30T11:40 Europe/London' }), at), []);
  assert.notDeepEqual(validateRun(manual({ manualId: undefined }), at), []);
  assert.notDeepEqual(validateRun(manual({ manualId: 'run-x' }), at), []);
  // Its window is bounded.
  assert.notDeepEqual(validateRun(manual({ since: '2026-10-28T12:00:00Z' }), at), []);
  assert.notDeepEqual(validateRun(manual({ since: undefined }), at), []);
  // A complete manual run leaves the scheduled slot uncovered and due.
  const ledger = recordRun(
    emptyLedger(),
    manual({ startedAt: '2026-10-30T17:41:00Z', since: '2026-10-30T00:00:00Z' }),
  );
  assert.equal(ledger.runs[0].slot, undefined);
  assert.equal(ledger.runs[0].manualId, 'manual-setup-check-1');
  assert.equal(dueSlot(ledger, '2026-10-30T17:45:00Z').due, true);
  // At most two a London day per learner.
  const start = manualStart(emptyLedger(), '2026-10-30T12:40:00Z', 'lens-tuning');
  assert.equal(start.allowed, true);
  assert.equal(start.startedAt, '2026-10-30T12:40:00.000Z');
  assert.equal(start.since, '2026-10-29T12:40:00.000Z');
  let used = recordRun(emptyLedger(), manual());
  used = recordRun(used, manual({ runId: 'run-m2', manualId: 'manual-setup-check-2' }));
  assert.equal(manualStart(used, '2026-10-30T13:00:00Z', 'lens-tuning').allowed, false);
  assert.notDeepEqual(
    validateRun(
      manual({
        runId: 'run-m3',
        startedAt: '2026-10-30T13:00:00Z',
        finishedAt: '2026-10-30T13:05:00Z',
      }),
      opts({ now: '2026-10-30T13:06:00Z', ledger: used }),
    ),
    [],
  );
  assert.equal(manualStart(used, '2026-10-30T13:00:00Z', 'run-learning').allowed, true);
  assert.match(summary(used, 'run-m1'), /manual manual-setup-check-1 \(no slot/);
});

test('every proposal is validated against current code before it is applied', () => {
  const ledger = recordRun(emptyLedger(), run());
  for (const validation of ['stale', 'already-fixed', 'unsupported']) {
    assert.notDeepEqual(validateDecision(ledger, decision(ledger, { validation })), [], validation);
    assert.deepEqual(
      validateDecision(ledger, decision(ledger, { validation, decision: 'reject' })),
      [],
    );
  }
  assert.notDeepEqual(validateDecision(ledger, decision(ledger, { validation: undefined })), []);
  assert.notDeepEqual(validateDecision(ledger, decision(ledger, { checkedAt: 'main' })), []);
  const done = recordDecision(
    ledger,
    decision(ledger, { validation: 'already-fixed', decision: 'reject' }),
    '2026-10-30T12:01Z',
  );
  assert.equal(done.proposals[0].decisions[0].validation, 'already-fixed');
  assert.equal(done.proposals[0].decisions[0].checkedAt.length, 40);
});

test('the safety standards cannot be weakened, even with evidence from many PRs', () => {
  const many = [evidence('pr', '#283'), evidence('pr', '#304'), evidence('pr', '#375')];
  const weakening = (p) =>
    recordRun(emptyLedger(), run({ proposals: [proposal({ weakens: true, ...p })] }));
  for (const standard of SAFETY_STANDARDS) {
    const ledger = weakening({ standards: [standard] });
    assert.notDeepEqual(
      validateDecision(ledger, decision(ledger, { evidence: many })),
      [],
      standard,
    );
    // It may still be rejected or deferred.
    assert.deepEqual(validateDecision(ledger, decision(ledger, { decision: 'reject' })), []);
  }
  // A weakening of a protected file counts, whatever standards it declares.
  for (const target of ['tessl.json', 'scripts/factory/contract.mjs', '.github/workflows/ci.yml']) {
    const ledger = recordRun(
      emptyLedger(),
      run({
        learner: 'run-learning',
        slot: '2026-10-30T05:20 Europe/London',
        startedAt: '2026-10-30T05:21:00Z',
        finishedAt: '2026-10-30T05:25:00Z',
        proposals: [proposal({ kind: 'add-check', target, weakens: true })],
      }),
    );
    assert.notDeepEqual(validateDecision(ledger, decision(ledger, { evidence: many })), [], target);
  }
  // Weakening the security lens is a safety weakening too.
  const security = weakening({ target: 'tessl/code-review@0.5.0#review-security-and-privacy' });
  assert.notDeepEqual(validateDecision(security, decision(security, { evidence: many })), []);
  // An unknown standard is refused at record time.
  assert.notDeepEqual(
    validateRun(run({ proposals: [proposal({ standards: ['vibes'] })] }), opts()),
    [],
  );
  assert.notDeepEqual(
    validateRun(run({ proposals: [proposal({ standards: undefined })] }), opts()),
    [],
  );
  // A strengthening that names a standard is still applicable.
  const stronger = weakening({ weakens: false, standards: ['public-input-guards'] });
  assert.deepEqual(validateDecision(stronger, decision(stronger)), []);
});

test('every learner has one London schedule whose cron matches its slots', () => {
  const byLearner = Object.values(manifest.schedules)
    .filter((s) => s.action?.use === 'review-lens-improvement')
    .map((s) => [s.action.inputs.LEARNER, s]);
  assert.deepEqual(byLearner.map(([name]) => name).sort(), Object.keys(LEARNERS).sort());
  for (const [name, schedule] of byLearner) {
    const { hours, minute, weekday } = LEARNERS[name];
    assert.equal(schedule.timezone, 'Europe/London', name);
    assert.equal(schedule.cron, `${minute} ${hours.join(',')} * * ${weekday ?? '*'}`, name);
  }
});

test('protected paths cannot be dodged by spelling, nor caution dropped by a repeat', () => {
  const runLearning = (p) =>
    run({
      learner: 'run-learning',
      slot: '2026-10-30T05:20 Europe/London',
      startedAt: '2026-10-30T05:21:00Z',
      finishedAt: '2026-10-30T05:25:00Z',
      proposals: [proposal({ kind: 'add-check', weakens: true, ...p })],
    });
  const at = opts({ now: '2026-10-30T05:26:00Z' });
  for (const target of ['./tessl.json', 'scripts//factory/contract.mjs', '/tessl.json', 'a/./b']) {
    assert.notDeepEqual(validateRun(runLearning({ target }), at), [], target);
  }
  // The same proposal seen later as weakening a standard stays weakening.
  let ledger = recordRun(emptyLedger(), run());
  ledger = recordRun(
    ledger,
    run({
      runId: 'run-2',
      slot: '2026-10-30T17:40 Europe/London',
      proposals: [proposal({ weakens: true, standards: ['mandatory-safety'] })],
    }),
  );
  assert.equal(ledger.proposals[0].weakens, true);
  assert.deepEqual(ledger.proposals[0].standards, ['mandatory-safety']);
  const many = [evidence('pr', '#304'), evidence('pr', '#375')];
  assert.notDeepEqual(validateDecision(ledger, decision(ledger, { evidence: many })), []);
});

test('a second scheduled run cannot claim a slot already covered', () => {
  const ledger = recordRun(emptyLedger(), run());
  const again = run({ runId: 'run-2', startedAt: '2026-10-30T11:50:00Z' });
  assert.notDeepEqual(validateRun(again, opts({ ledger })), []);
  // Saving the same run again is still allowed, and changes nothing.
  assert.deepEqual(validateRun(run(), opts({ ledger })), []);
  // A partial run leaves the slot open for a retry.
  const partial = recordRun(
    emptyLedger(),
    run({ coverage: { status: 'partial', inspected: [], gaps: 'gh list hit its limit' } }),
  );
  assert.deepEqual(validateRun(again, opts({ ledger: partial })), []);
});

test('failed and partial runs keep the last successful checkpoint, and the retry overlaps it', () => {
  const run = (runId, startedAt, status) => ({
    runId,
    learner: 'lens-tuning',
    trigger: 'schedule',
    startedAt,
    finishedAt: startedAt,
    coverage: { status, inspected: [], gaps: status === 'complete' ? undefined : 'x' },
  });
  const ledger = {
    ...emptyLedger(),
    runs: [
      run('a', '2026-10-30T05:41:00.000Z', 'complete'),
      run('b', '2026-10-30T11:41:00.000Z', 'failed'),
      run('c', '2026-10-30T17:41:00.000Z', 'partial'),
    ],
  };
  assert.equal(checkpoint(ledger, 'lens-tuning'), '2026-10-30T05:41:00.000Z');
  assert.equal(checkpoint(ledger, 'run-learning'), null);
  const due = dueSlot(ledger, '2026-10-30T23:41:00.000Z', 'lens-tuning');
  assert.equal(due.due, true);
  assert.equal(due.since, '2026-10-30T04:41:00.000Z');
});
