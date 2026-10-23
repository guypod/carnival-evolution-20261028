import assert from 'node:assert/strict';
import test from 'node:test';
import { decimal, decimalText, reportCosts, REPOSITORY } from './cost-report.mjs';

const bill = (total = '12.5', platform = '10', ai = '2.5', usage = '0', finality = 'unknown') => ({
  total,
  platform,
  ai,
  usage,
  finality,
});
const operation = (over = {}) => ({
  repository: REPOSITORY,
  operationId: 'synthetic-op-1',
  category: 'implementation',
  issueNumber: 101,
  prNumber: null,
  status: 'completed',
  outcome: 'succeeded',
  observedAt: '2026-01-01T10:00:00Z',
  billing: bill(),
  ...over,
});
const input = (
  observations = [operation()],
  relationships = [{ issueNumber: 101, prNumber: 202 }],
) => ({ schemaVersion: 1, repository: REPOSITORY, relationships, observations });
const report = (observations, relationships) => reportCosts(input(observations, relationships));

test('accounts one operation with exact split and explicit lifecycle', () => {
  const r = report();
  assert.equal(r.totals.operationCount, 1);
  assert.deepEqual(r.totals.credits.total, { known: '12.5', missingOperations: 0 });
  assert.equal(r.byLifecycle['issue:101'].credits.platform.known, '10');
  assert.equal(r.byCategory.implementation.credits.ai.known, '2.5');
  assert.equal(r.totals.unsettledCount, 1);
});
test('reconciles later billing without double counting repeated snapshots', () => {
  const missing = operation({ billing: null });
  const populated = operation({ observedAt: '2026-01-01T10:01:00Z' });
  const r = report([missing, populated, structuredClone(populated)]);
  assert.equal(r.observationCount, 3);
  assert.equal(r.duplicateObservations, 1);
  assert.equal(r.totals.operationCount, 1);
  assert.equal(r.totals.credits.total.known, '12.5');
  assert.equal(r.totals.pendingBillingCount, 0);
});
test('missing billing remains pending, including for terminal runs', () => {
  const r = report([operation({ billing: null })]);
  assert.equal(r.totals.pendingBillingCount, 1);
  assert.equal(r.totals.unsettledCount, 1);
  assert.deepEqual(r.totals.credits.total, { known: '0', missingOperations: 1 });
});
test('retains but marks earlier known billing after a missing latest read', () => {
  const r = report([operation(), operation({ observedAt: '2026-01-01T11:00:00Z', billing: null })]);
  assert.equal(r.totals.credits.total.known, '12.5');
  assert.equal(r.totals.pendingBillingCount, 1);
  assert.equal(r.operations[0].billingStale, true);
  assert.equal(r.operations[0].billingObservedAt, '2026-01-01T10:00:00Z');
});
test('does not combine partial components from different billing observations', () => {
  const r = report([
    operation(),
    operation({ observedAt: '2026-01-01T11:00:00Z', billing: bill('13', null, '3', '0') }),
  ]);
  assert.equal(r.totals.credits.total.known, '13');
  assert.deepEqual(r.totals.credits.platform, { known: '0', missingOperations: 1 });
  assert.equal(r.totals.pendingBillingCount, 1);
});
test('keeps a reported total unknown when all category amounts are populated', () => {
  const r = report([operation({ billing: bill(null) })]);
  assert.deepEqual(r.totals.credits.total, { known: '0', missingOperations: 1 });
  assert.equal(r.totals.credits.platform.known, '10');
});
test('finality is explicit and impossible active/final combinations reject', () => {
  const r = report([operation({ billing: bill('12.5', '10', '2.5', '0', 'final') })]);
  assert.equal(r.totals.unsettledCount, 0);
  assert.throws(
    () =>
      report([
        operation({
          status: 'running',
          outcome: null,
          billing: bill('12.5', '10', '2.5', '0', 'final'),
        }),
      ]),
    /active operation/,
  );
  assert.throws(
    () => report([operation({ billing: bill('12.5', null, '2.5', '0', 'final') })]),
    /complete split/,
  );
});
test('includes failed and cancelled work rather than filtering successes only', () => {
  const r = report([
    operation({ outcome: 'failed' }),
    operation({ operationId: 'cancelled', status: 'cancelled', outcome: 'cancelled' }),
  ]);
  assert.equal(r.totals.credits.total.known, '25');
  assert.equal(r.failed.credits.total.known, '12.5');
  assert.equal(r.cancelled.credits.total.known, '12.5');
});
test('distinguishes explicit no_action from successful but explicitly idle effects', () => {
  const r = report([
    operation({ outcome: 'no_action', effects: 'none' }),
    operation({ operationId: 'idle-success', effects: 'none' }),
    operation({ operationId: 'unknown-effects' }),
  ]);
  assert.equal(r.explicitNoAction.operationCount, 1);
  assert.equal(r.semanticEffects.none.operationCount, 2);
  assert.equal(r.semanticEffects.unknownCount, 1);
});
test('attributes PR-only reviews through explicit mapping, never number offsets', () => {
  const r = report([
    operation(),
    operation({ operationId: 'review', category: 'review', issueNumber: null, prNumber: 202 }),
  ]);
  assert.equal(r.byLifecycle['issue:101'].operationCount, 2);
  const unmapped = report([operation({ issueNumber: null, prNumber: 999 })], []);
  assert.equal(unmapped.byLifecycle['unmapped-pr:999'].operationCount, 1);
});
test('permits explicit later identity enrichment without erasing earlier issue identity', () => {
  const r = report([operation(), operation({ observedAt: '2026-01-01T11:00:00Z', prNumber: 202 })]);
  assert.equal(r.operations[0].issueNumber, 101);
  assert.equal(r.operations[0].prNumber, 202);
});
test('rejects conflicting identity, category and explicit relationships', () => {
  assert.throws(
    () =>
      report([operation(), operation({ observedAt: '2026-01-01T11:00:00Z', issueNumber: 102 })]),
    /conflicting identity/,
  );
  assert.throws(
    () =>
      report([operation(), operation({ observedAt: '2026-01-01T11:00:00Z', category: 'review' })]),
    /conflicting identity/,
  );
  assert.throws(
    () => report([operation({ issueNumber: 102, prNumber: 202 })]),
    /conflicting explicit/,
  );
  assert.throws(
    () =>
      report(
        [],
        [
          { issueNumber: 101, prNumber: 202 },
          { issueNumber: 102, prNumber: 202 },
        ],
      ),
    /conflicting issue mapping/,
  );
});
test('rejects contradictory observations at the same time', () => {
  assert.throws(
    () => report([operation(), operation({ billing: bill('13', '10', '3') })]),
    /conflicting simultaneous/,
  );
});
test('results do not depend on observation order', () => {
  const observations = [
    operation({ billing: null }),
    operation({ observedAt: '2026-01-01T11:00:00Z' }),
    operation({ operationId: 'other', category: 'review', issueNumber: null, prNumber: 202 }),
  ];
  assert.deepEqual(report(observations), report([...observations].reverse()));
});
test('accounts huge and tiny decimals exactly', () => {
  const huge = '999999999999999999999999999999999999999999999999999999999999';
  const tiny = '0.000000000000000000000000000001';
  const r = report([
    operation({ billing: bill(huge, huge, '0', '0') }),
    operation({ operationId: 'tiny', billing: bill(tiny, '0', '0', tiny) }),
  ]);
  assert.equal(r.totals.credits.total.known, `${huge}.000000000000000000000000000001`);
  assert.equal(decimalText(decimal('0.10') + decimal('0.20')), '0.3');
});
test('rejects negative, numeric, exponent, nonfinite and overprecision credits', () => {
  for (const value of [
    '-1',
    'NaN',
    'Infinity',
    '1e3',
    1,
    null,
    '0.0000000000000000000000000000001',
  ])
    assert.throws(() => decimal(value), /decimal strings/);
});
test('rejects inconsistent complete splits and missing split fields', () => {
  assert.throws(() => report([operation({ billing: bill('15') })]), /does not equal total/);
  const bad = bill();
  delete bad.ai;
  assert.throws(() => report([operation({ billing: bad })]), /explicitly null/);
});
test('rejects unrelated repository records and missing attribution', () => {
  assert.throws(
    () => report([operation({ repository: 'unrelated/repository' })]),
    /unrelated repository/,
  );
  assert.throws(
    () => reportCosts({ ...input(), repository: 'unrelated/repository' }),
    /approved repository/,
  );
  assert.throws(
    () => report([operation({ issueNumber: null, prNumber: null })]),
    /explicit issue or PR attribution/,
  );
});
test('rejects ambiguous timestamps and unsafe identifiers', () => {
  for (const observedAt of ['2026-01-01T10:00:00', '2026-02-30T10:00:00Z'])
    assert.throws(() => report([operation({ observedAt })]), /valid UTC/);
  assert.throws(
    () => report([operation({ issueNumber: Number.MAX_SAFE_INTEGER + 1 })]),
    /invalid issueNumber/,
  );
});
test('unknown fields and non-credit telemetry cannot silently enter totals', () => {
  assert.throws(() => report([operation({ modelUsd: '1.5' })]), /unknown field modelUsd/);
  assert.throws(
    () => report([operation({ billing: { ...bill(), tokenCount: 200 } })]),
    /unknown field tokenCount/,
  );
});
test('active work retains accrued credits and remains unsettled', () => {
  const r = report([operation({ status: 'running', outcome: null })]);
  assert.equal(r.totals.credits.total.known, '12.5');
  assert.equal(r.totals.nonterminalCount, 1);
  assert.equal(r.totals.unsettledCount, 1);
});

test('rejects a partial category split already exceeding its reported total', () => {
  assert.throws(
    () => report([operation({ billing: bill('5', '10', null, null) })]),
    /exceed total/,
  );
});

test('preserves unknown operation status and missing cancelled outcome without inventing facts', () => {
  const r = report([
    operation({ status: 'unknown', outcome: null }),
    operation({ operationId: 'cancelled-no-outcome', status: 'cancelled', outcome: null }),
  ]);
  assert.equal(r.totals.unknownStatusCount, 1);
  assert.equal(r.totals.unsettledCount, 2);
  assert.equal(r.cancelled.operationCount, 1);
  assert.equal(r.operations.find((o) => o.operationId === 'cancelled-no-outcome').outcome, null);
});
