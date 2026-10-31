// Fixture tests for the implementation entry guard. The adapter is an
// in-memory GitHub with an atomic create-ref, so these show which claims
// each decision makes. They are not a test of the live platform or the hook.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entryRef, guard, identity, runIssue } from './entry-guard.mjs';
import {
  BOT_APP_ID,
  BOT_ID,
  OWNER_ID,
  admissionMarker,
  contentDigest,
  requestId,
} from './native.mjs';

const RUN_A = '01a18fbd-b655-76b8-8205-e02bcf023b11';
const RUN_B = '01a18fbd-b655-76b8-8205-e02bcf023b22';
const bot = { id: BOT_ID, login: 'tessl-app[bot]', type: 'Bot' };
const owner = { id: OWNER_ID, login: 'guypod', type: 'User' };
const issue = (extra = {}) => ({
  number: 40,
  node_id: 'I_node40',
  repository_url: 'https://api.github.com/repos/guypod/carnival-evolution-20261028',
  state: 'open',
  title: 'Item',
  body: 'Do it.',
  labels: [{ name: 'tessl' }],
  ...extra,
});
const labelled = (actor, id = 9001) => ({
  complete: true,
  items: [{ id, event: 'labeled', label: { name: 'tessl' }, actor }],
});
const DIGEST = contentDigest('Item', 'Do it.');
const admission = (event = 9001, node = 'I_node40', digest = DIGEST) => ({
  user: bot,
  performed_via_github_app: { id: BOT_APP_ID },
  body: admissionMarker({
    issue: 40,
    node,
    slot: 'dispatch-2026-10-31T0020',
    digest,
    event,
    request: requestId(40, event),
  }),
});

function world({ i = issue(), events = labelled(owner), comments = [] } = {}) {
  const refs = new Map();
  const calls = [];
  return {
    refs,
    calls,
    getIssue: async () => structuredClone(i),
    listEvents: async () => events,
    listComments: async () => ({ complete: true, items: comments }),
    readEntry: async (ref) => (refs.has(ref) ? { record: refs.get(ref) } : {}),
    createEntry: async (ref, message) => {
      calls.push(['create', ref]);
      if (refs.has(ref)) throw new Error('Reference already exists');
      refs.set(ref, JSON.parse(message.replace(/^tessl-entry:v1 /, '')));
    },
  };
}
const go = (w, runId, inputs = { GITHUB_ISSUE_NUMBER: '40' }, events = []) =>
  guard(w, { inputs, events, runId });

test('the owner hand-off claims one immutable key before coding', async () => {
  const w = world();
  const r = await go(w, RUN_A);
  assert.equal(r.status, 'claimed', JSON.stringify(r));
  assert.equal(r.ref, entryRef(40, 9001));
  assert.deepEqual(w.refs.get(r.ref), {
    repository: 1437265009,
    issue: 40,
    node: 'I_node40',
    digest: contentDigest('Item', 'Do it.'),
    generation: 9001,
    run: RUN_A,
  });
});

test('a second accepted request for the same work never enters, however many retries', async () => {
  const w = world();
  assert.equal((await go(w, RUN_A)).status, 'claimed');
  for (let i = 0; i < 3; i++) {
    const r = await go(w, RUN_B);
    assert.equal(r.status, 'refused');
    assert.match(r.reason, new RegExp(`owned by run ${RUN_A}`));
  }
  assert.equal(w.refs.size, 1);
  assert.equal(w.refs.get(entryRef(40, 9001)).run, RUN_A, 'never taken over');
});

test('the owning run resumes with the same identity, and an edit in between refuses it', async () => {
  const w = world();
  await go(w, RUN_A);
  assert.equal((await go(w, RUN_A)).status, 'resumed');
  const edited = world({ i: issue({ body: 'Changed.' }) });
  edited.refs.set(entryRef(40, 9001), w.refs.get(entryRef(40, 9001)));
  const r = await go(edited, RUN_A);
  assert.equal(r.status, 'refused');
  assert.match(r.reason, /different identity/);
});

test('two runs racing on the same key: the atomic create admits exactly one', async () => {
  const w = world();
  const [a, b] = await Promise.all([go(w, RUN_A), go(w, RUN_B)]);
  assert.deepEqual([a.status, b.status].sort(), ['claimed', 'refused']);
  assert.equal(w.refs.size, 1);
});

test('an uncertain create is read back: landed resumes, lost refuses', async () => {
  const landed = world();
  const create = landed.createEntry;
  landed.createEntry = async (ref, m) => {
    await create(ref, m);
    throw new Error('timeout');
  };
  assert.equal((await go(landed, RUN_A)).status, 'resumed');
  const lost = world();
  lost.createEntry = async () => {
    throw new Error('timeout');
  };
  const r = await go(lost, RUN_A);
  assert.equal(r.status, 'refused');
  assert.match(r.reason, /uncertain/);
});

test('the native handoff enters only with the app admission for that exact label event and node', async () => {
  assert.equal(
    (await go(world({ events: labelled(bot), comments: [admission()] }), RUN_A)).status,
    'claimed',
  );
  for (const comments of [[], [admission(9002)], [admission(9001, 'I_other')]]) {
    const r = await go(world({ events: labelled(bot), comments }), RUN_A);
    assert.equal(r.status, 'refused');
    assert.match(r.reason, /no admission/);
  }
  const forged = { ...admission(), performed_via_github_app: null };
  assert.equal(
    (await go(world({ events: labelled(bot), comments: [forged] }), RUN_A)).status,
    'refused',
  );
});

test('it fails closed when identity cannot be established', async () => {
  const cases = [
    [world({ events: { complete: false, items: [] } }), RUN_A, /not read in full/],
    [world({ i: issue({ state: 'closed' }) }), RUN_A, /closed/],
    [world({ i: issue({ labels: [] }) }), RUN_A, /no tessl label/],
    [world({ i: issue({ pull_request: {} }) }), RUN_A, /not this repository issue/],
    [world({ events: labelled({ id: 7, type: 'User' }) }), RUN_A, /not added by the owner/],
    [world(), undefined, /no launch run id/],
    [world(), 'not-a-run', /no launch run id/],
  ];
  for (const [w, run, pattern] of cases) {
    const r = await go(w, run);
    assert.equal(r.status, 'refused', JSON.stringify(r));
    assert.match(r.reason, pattern);
    assert.equal(w.refs.size, 0, 'no claim');
  }
  const unreadable = world();
  unreadable.readEntry = async () => ({ error: 'claim read failed' });
  assert.equal((await go(unreadable, RUN_A)).status, 'refused');
});

test('the run issue comes from inputs and events, and they must agree', () => {
  assert.deepEqual(runIssue({ GITHUB_ISSUE_NUMBER: '40' }, []), { number: 40 });
  assert.deepEqual(runIssue({}, [{ payload: { issue: { number: 40 } } }]), { number: 40 });
  assert.match(
    runIssue({ GITHUB_ISSUE_NUMBER: '40' }, [{ payload: { issue: { number: 41 } } }]).error,
    /differs/,
  );
  assert.match(runIssue({}, []).error, /no issue/);
  assert.match(runIssue({}, {}).error, /malformed/);
});

test('a new label generation is a new key, and an old generation stays claimed', async () => {
  const w = world();
  await go(w, RUN_A);
  const next = world({ events: labelled(owner, 9100) });
  next.refs = w.refs;
  next.readEntry = w.readEntry;
  next.createEntry = w.createEntry;
  assert.equal((await go(next, RUN_B)).status, 'claimed');
  assert.equal(w.refs.size, 2);
  assert.ok(identity(40, issue(), labelled(owner), { complete: true, items: [] }).key);
});

test('a bot handoff whose content changed after admission never enters', async () => {
  const w = world({
    events: labelled(bot),
    comments: [admission(9001, 'I_node40', 'b'.repeat(64))],
  });
  const r = await go(w, RUN_A);
  assert.equal(r.status, 'refused');
  assert.match(r.reason, /content changed since admission/);
  assert.equal(w.refs.size, 0);
});
