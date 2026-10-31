// Fixture tests for the implementation entry guard. The adapter is an
// in-memory GitHub with an atomic create-ref, so these show which claims
// each decision makes. They are not a test of the live platform or the hook.
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { entryRef, guard, identity, runIssue } from './entry-guard.mjs';
import {
  BOT_APP_ID,
  BOT_ID,
  OWNER_ID,
  admissionMarker,
  claimMarker,
  contentDigest,
  itemMarker,
  journalMarker,
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
const CSLOT = 'dispatch-2026-10-31T0020';
const app = (body, at = '2026-10-31T00:21:00Z') => ({
  user: bot,
  performed_via_github_app: { id: BOT_APP_ID },
  issue_url: 'https://api.github.com/repos/guypod/carnival-evolution-20261028/issues/40',
  created_at: at,
  body,
});
const admission = (event = 9001, node = 'I_node40', digest = BOT_DIGEST, slot = CSLOT) =>
  app(
    admissionMarker({ issue: 40, node, slot, digest, event, request: requestId(40, event) }),
    '2026-10-31T00:23:00Z',
  );

// A bot backlog issue exactly as admission left it: filed and journalled by
// the producer, claimed for a slot, labelled once by the bot, then admitted.
const BOT_BODY = `Do it.\n\n${itemMarker('backlog-2026-10-31T00', 3, 'item-40')}`;
const BOT_DIGEST = contentDigest('Item', BOT_BODY);
const botIssue = (extra = {}) =>
  issue({
    user: bot,
    body: BOT_BODY,
    labels: [{ name: 'auto backlog' }, { name: 'tessl' }],
    ...extra,
  });
const botEvents = (extra = []) => ({
  complete: true,
  items: [
    { id: 8999, event: 'labeled', label: { name: 'auto backlog' }, actor: bot },
    { id: 9001, event: 'labeled', label: { name: 'tessl' }, actor: bot },
    ...extra,
  ],
});
const botComments = (extra = []) => [
  app(journalMarker('backlog-2026-10-31T00', 3, 40, BOT_DIGEST), '2026-10-31T00:01:00Z'),
  app(claimMarker(CSLOT, 40)),
  admission(),
  ...extra,
];
const admitted = (o = {}) =>
  world({ i: botIssue(o.i), events: botEvents(o.events), comments: botComments(o.comments) });

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

test('the native handoff enters only with one app admission for that exact label event and node', async () => {
  assert.equal((await go(admitted(), RUN_A)).status, 'claimed');
  const strip = (cs) => cs.filter((c) => !/carnival-admission/.test(c.body));
  for (const extra of [[], [admission(9002)], [admission(9001, 'I_other')]]) {
    const w = world({
      i: botIssue(),
      events: botEvents(),
      comments: [...strip(botComments()), ...extra],
    });
    const r = await go(w, RUN_A);
    assert.equal(r.status, 'refused');
    assert.match(r.reason, /no admission/);
  }
  const forged = { ...admission(), performed_via_github_app: null };
  const w = world({
    i: botIssue(),
    events: botEvents(),
    comments: [...strip(botComments()), forged],
  });
  assert.equal((await go(w, RUN_A)).status, 'refused');
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

// The envelope `tessl action trigger` gives an implementation run, in the
// shape a real native handoff receives, with sanitized ids and no instructions.
const LOOP = {
  id: '00000000-0000-7000-8000-000000000001',
  projectId: '00000000-0000-7000-8000-000000000002',
  workspaceId: '00000000-0000-7000-8000-000000000003',
};
const ISSUE_INPUTS = { GITHUB_ISSUE_NUMBER: '428', GITHUB_ISSUE_LABEL: 'tessl' };
const action = (payload = {}) => ({
  event: 'tessl:trigger',
  payload: {
    key: 'implement-github-issue',
    loop: LOOP,
    inputs: ISSUE_INPUTS,
    overrides: { timeout: '45m' },
    concurrency: { keys: [{ key: 'carnival-app-writer', limit: 1 }], mode: 'queue' },
    parentLaunchRunId: '00000000-0000-7000-8000-000000000004',
    ...payload,
  },
});
const ACTION_TRIGGER = action();

test('an action trigger envelope with an explicit issue input names that issue', () => {
  assert.deepEqual(runIssue(ISSUE_INPUTS, [ACTION_TRIGGER]), { number: 428 });
  assert.deepEqual(runIssue({ GITHUB_ISSUE_NUMBER: '428' }, [ACTION_TRIGGER]), { number: 428 });
  // Defaults: null or empty inputs, empty overrides, no parent run.
  const noParent = { ...ACTION_TRIGGER.payload };
  delete noParent.parentLaunchRunId;
  for (const e of [
    action({ inputs: null }),
    action({ inputs: {}, overrides: {} }),
    { event: 'tessl:trigger', payload: noParent },
  ])
    assert.deepEqual(runIssue(ISSUE_INPUTS, [e]), { number: 428 }, JSON.stringify(e));
  assert.deepEqual(
    runIssue({ GITHUB_ISSUE_NUMBER: '40' }, [
      action({ inputs: { GITHUB_ISSUE_NUMBER: '40' } }),
      { payload: { issue: { number: 40 } } },
    ]),
    { number: 40 },
  );
});

test('action trigger envelopes still fail closed', () => {
  const I = ISSUE_INPUTS;
  const cases = [
    // No issue input, or an invalid one: the envelope never names the issue,
    // even when its own inputs repeat one.
    [{}, [ACTION_TRIGGER], /no issue/],
    [{ GITHUB_ISSUE_NUMBER: '' }, [ACTION_TRIGGER], /no issue/],
    [{ GITHUB_ISSUE_NUMBER: '0' }, [action({ inputs: null })], /no issue/],
    [{ GITHUB_ISSUE_NUMBER: '4x' }, [action({ inputs: null })], /no issue/],
    [{ GITHUB_ISSUE_NUMBER: '-3' }, [action({ inputs: null })], /no issue/],
    // Payload inputs that disagree with the run inputs.
    [{ GITHUB_ISSUE_NUMBER: '427' }, [ACTION_TRIGGER], /inputs differ.*GITHUB_ISSUE_NUMBER/],
    [{ ...I, GITHUB_ISSUE_LABEL: 'other' }, [ACTION_TRIGGER], /inputs differ/],
    // Malformed envelopes.
    [I, [{ event: 'tessl:trigger' }], /not an object/],
    [I, [{ event: 'tessl:trigger', payload: null }], /not an object/],
    [I, [{ event: 'tessl:trigger', payload: [] }], /not an object/],
    [I, [{ event: 'tessl:trigger', payload: {} }], /missing/],
    [I, [action({ key: undefined })], /key/],
    [I, [action({ key: '' })], /key/],
    [I, [action({ loop: null })], /loop/],
    [I, [action({ loop: { ...LOOP, projectId: 7 } })], /loop/],
    [I, [action({ loop: { id: LOOP.id } })], /loop/],
    [I, [action({ inputs: [] })], /string map/],
    [I, [action({ inputs: { GITHUB_ISSUE_NUMBER: 428 } })], /string map/],
    [I, [action({ inputs: undefined })], /string map/],
    [I, [action({ overrides: null })], /overrides/],
    [I, [action({ concurrency: 'queue' })], /concurrency/],
    [I, [action({ parentLaunchRunId: '' })], /parent run/],
    // A payload that tries to carry an issue or an action name is not the envelope.
    [I, [action({ issue: { number: 428 } })], /unknown fields: issue/],
    [I, [action({ action: 'implement' })], /unknown fields: action/],
    [I, [ACTION_TRIGGER, ACTION_TRIGGER], /more than one action trigger/],
    // Unknown events.
    [I, [{ event: 'tessl:other', payload: ACTION_TRIGGER.payload }], /unknown tessl trigger/],
    [I, [null], /exactly one issue/],
    [I, [ACTION_TRIGGER, {}], /exactly one issue/],
    // Conflicting or multiple GitHub issue identities.
    [
      { GITHUB_ISSUE_NUMBER: '40' },
      [action({ inputs: null }), { payload: { issue: { number: 41 } } }],
      /differs/,
    ],
    [
      I,
      [
        ACTION_TRIGGER,
        { payload: { issue: { number: 428 } } },
        { payload: { issue: { number: 41 } } },
      ],
      /exactly one issue/,
    ],
    [I, ACTION_TRIGGER, /malformed/],
  ];
  for (const [inputs, events, pattern] of cases)
    assert.match(runIssue(inputs, events).error ?? '', pattern, JSON.stringify([inputs, events]));
});

test('the action trigger envelope reaches the same identity checks and claim', async () => {
  const w = world();
  const env = action({ inputs: { GITHUB_ISSUE_NUMBER: '40' } });
  const r = await go(w, RUN_A, { GITHUB_ISSUE_NUMBER: '40' }, [env]);
  assert.equal(r.status, 'claimed', JSON.stringify(r));
  assert.equal(w.refs.size, 1);
  assert.equal((await go(w, RUN_A, { GITHUB_ISSUE_NUMBER: '40' }, [env])).status, 'resumed');
  assert.match((await go(w, RUN_B, { GITHUB_ISSUE_NUMBER: '40' }, [env])).reason, /owned by run/);
  // Identity checks still apply: a closed issue refuses with no claim.
  const closed = world({ i: issue({ state: 'closed' }) });
  const c = await go(closed, RUN_A, { GITHUB_ISSUE_NUMBER: '40' }, [env]);
  assert.match(c.reason, /closed/);
  assert.equal(closed.refs.size, 0);
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
  const strip = botComments().filter((c) => !/carnival-admission/.test(c.body));
  const w = world({
    i: botIssue(),
    events: botEvents(),
    comments: [...strip, admission(9001, 'I_node40', 'b'.repeat(64))],
  });
  const r = await go(w, RUN_A);
  assert.equal(r.status, 'refused');
  assert.match(r.reason, /content changed since admission/);
  assert.equal(w.refs.size, 0);
});

test('fields from separate admission records never combine into one match', async () => {
  // One record has the right digest but another slot, the other the right
  // slot but an old digest: neither alone matches the entry.
  const strip = botComments().filter((c) => !/carnival-admission/.test(c.body));
  const w = world({
    i: botIssue(),
    events: botEvents(),
    comments: [
      ...strip,
      admission(9001, 'I_node40', BOT_DIGEST, 'dispatch-2026-10-30T2340'),
      admission(9001, 'I_node40', 'b'.repeat(64), CSLOT),
    ],
  });
  const r = await go(w, RUN_A);
  assert.equal(r.status, 'refused');
  assert.match(r.reason, /original claim slot/);
  assert.equal(w.refs.size, 0);
});

// Each row starts from a valid admission, then changes one thing while the
// run waits in the queue. Entry must refuse every one, with no claim ref.
const person = { id: 7, login: 'someone', type: 'User' };
const personComment = (body) => ({ user: person, body, created_at: '2026-10-31T00:30:00Z' });
const QUEUE_DELAY = [
  [
    'held label',
    { i: { labels: [{ name: 'auto backlog' }, { name: 'tessl' }, { name: 'held' }] } },
    /held/,
  ],
  [
    'on hold label',
    { i: { labels: [{ name: 'auto backlog' }, { name: 'tessl' }, { name: 'On hold' }] } },
    /held/,
  ],
  ['person assigned', { i: { assignees: [person] } }, /assigned/],
  ['single assignee field', { i: { assignee: person } }, /assigned/],
  ['person says stop', { comments: [personComment('Please stop')] }, /comment not from the app/],
  [
    'owner comment',
    { comments: [{ ...personComment('wait'), user: owner }] },
    /comment not from the app/,
  ],
  ['auto backlog removed', { i: { labels: [{ name: 'tessl' }] } }, /not in auto backlog/],
  ['tessl removed', { i: { labels: [{ name: 'auto backlog' }] } }, /tessl label/],
  [
    'person label event',
    { events: [{ id: 9050, event: 'labeled', label: { name: 'later' }, actor: person }] },
    /person acted/,
  ],
  [
    'person hold then unhold',
    {
      events: [
        { id: 9050, event: 'labeled', label: { name: 'held' }, actor: person },
        { id: 9051, event: 'unlabeled', label: { name: 'held' }, actor: person },
      ],
    },
    /person acted/,
  ],
  [
    'person assigned then unassigned',
    {
      events: [
        { id: 9052, event: 'assigned', actor: owner },
        { id: 9053, event: 'unassigned', actor: owner },
      ],
    },
    /person acted/,
  ],
  [
    'tessl taken back and relabelled by the bot',
    {
      events: [
        { id: 9060, event: 'unlabeled', label: { name: 'tessl' }, actor: bot },
        { id: 9061, event: 'labeled', label: { name: 'tessl' }, actor: bot },
      ],
    },
    /taken back|labelled exactly once/,
  ],
  ['closed', { i: { state: 'closed' } }, /closed/],
  [
    'body edited',
    { i: { body: `Other.\n\n${itemMarker('backlog-2026-10-31T00', 3, 'item-40')}` } },
    /content changed/,
  ],
  ['title edited', { i: { title: 'Other' } }, /content changed/],
  ['backlog marker removed', { i: { body: 'Do it.' } }, /no backlog marker/],
  ['author is not the bot', { i: { user: person } }, /author/],
  [
    'moved to another repository',
    { i: { repository_url: 'https://api.github.com/repos/x/y' } },
    /another repository/,
  ],
];

test('every disqualifying change after admission, before coding, refuses entry', async () => {
  for (const [name, change, pattern] of QUEUE_DELAY) {
    const w = admitted(change);
    const r = await go(w, RUN_A);
    assert.equal(r.status, 'refused', `${name}: ${JSON.stringify(r)}`);
    assert.match(r.reason, pattern, name);
    assert.equal(w.refs.size, 0, `${name}: no claim`);
  }
});

test('a change after admission also stops the run that already claimed entry from resuming', async () => {
  const w = admitted();
  assert.equal((await go(w, RUN_A)).status, 'claimed');
  assert.equal((await go(w, RUN_A)).status, 'resumed');
  const stopped = admitted({ comments: [personComment('Please stop')] });
  stopped.refs = w.refs;
  stopped.readEntry = w.readEntry;
  assert.equal((await go(stopped, RUN_A)).status, 'refused');
  const other = await go(w, RUN_B);
  assert.match(other.reason, new RegExp(`owned by run ${RUN_A}`), 'completed claim never stolen');
});

test('the bot-only conditions never apply to the owner hand-off', async () => {
  // A person's comment, an assignee, a hold and person events are all fine
  // when the owner labelled the issue: that is the owner's own route.
  const w = world({
    i: issue({ assignees: [owner], labels: [{ name: 'tessl' }, { name: 'held' }] }),
    events: {
      complete: true,
      items: [
        { id: 8000, event: 'assigned', actor: owner },
        { id: 9001, event: 'labeled', label: { name: 'tessl' }, actor: owner },
      ],
    },
    comments: [personComment('Please do this carefully')],
  });
  assert.equal((await go(w, RUN_A)).status, 'claimed');
});

test('incomplete bot reads refuse entry and claim nothing', async () => {
  const ev = admitted();
  ev.listEvents = async () => ({ complete: false, items: botEvents().items });
  const cm = admitted();
  cm.listComments = async () => ({ complete: false, items: botComments() });
  const gi = admitted();
  gi.getIssue = async () => {
    throw new Error('502');
  };
  for (const w of [ev, cm, gi]) {
    const r = await go(w, RUN_A);
    assert.equal(r.status, 'refused');
    assert.equal(w.refs.size, 0);
  }
});

test('the setup hook runs the guard only when SKILL ends in #implement-github-issue', () => {
  // Runs the real hook with npm and node stubbed on PATH, so it shows the
  // dispatch on SKILL, not the platform executing the hook.
  const dir = mkdtempSync(join(tmpdir(), 'hook-'));
  for (const cmd of ['npm', 'node']) {
    writeFileSync(join(dir, cmd), `#!/bin/sh\necho "${cmd} $*"\n`);
    chmodSync(join(dir, cmd), 0o755);
  }
  const run = (SKILL) =>
    execFileSync('bash', ['.tessl/cloud-launch-setup.sh'], {
      encoding: 'utf8',
      env: { PATH: `${dir}:${process.env.PATH}`, SKILL },
    });
  assert.match(
    run('tessl-labs/factory#implement-github-issue'),
    /node scripts\/native\/entry-guard\.mjs/,
  );
  for (const skill of ['tessl-labs/factory#shepherd', 'implement-github-issue-x', ''])
    assert.doesNotMatch(run(skill), /entry-guard/, skill);
});

test('the setup hook passes an action trigger envelope through to the identity reads', () => {
  // Runs the real hook and the real guard with npm stubbed and gh failing, so
  // the guard gets past parsing the run's files and stops at the first read.
  const dir = mkdtempSync(join(tmpdir(), 'hook-'));
  writeFileSync(join(dir, 'npm'), '#!/bin/sh\necho "npm $*"\n');
  writeFileSync(join(dir, 'gh'), '#!/bin/sh\necho "HTTP 502" >&2\nexit 1\n');
  chmodSync(join(dir, 'npm'), 0o755);
  chmodSync(join(dir, 'gh'), 0o755);
  const run = (inputs, events) => {
    writeFileSync(join(dir, 'inputs.json'), JSON.stringify(inputs));
    writeFileSync(join(dir, 'events.json'), JSON.stringify(events));
    try {
      execFileSync('bash', ['.tessl/cloud-launch-setup.sh'], {
        encoding: 'utf8',
        stdio: 'pipe',
        env: {
          PATH: `${dir}:${process.env.PATH}`,
          SKILL: 'tessl-labs/factory#implement-github-issue',
          INPUTS: join(dir, 'inputs.json'),
          TRIGGER_EVENTS: join(dir, 'events.json'),
          TESSL_LAUNCH_RUN_ID: RUN_A,
        },
      });
      return { code: 0 };
    } catch (e) {
      return { code: e.status, out: e.stdout };
    }
  };
  const ok = run(ISSUE_INPUTS, [ACTION_TRIGGER]);
  assert.notEqual(ok.code, 0, 'no claim without fresh reads');
  assert.match(ok.out, /"reason":"issue not read"/);
  const bad = run(ISSUE_INPUTS, [{ event: 'tessl:other', payload: ACTION_TRIGGER.payload }]);
  assert.notEqual(bad.code, 0);
  assert.match(bad.out, /unknown tessl trigger event/);
  const conflict = run({ GITHUB_ISSUE_NUMBER: '427' }, [ACTION_TRIGGER]);
  assert.notEqual(conflict.code, 0);
  assert.match(conflict.out, /inputs differ/);
});
