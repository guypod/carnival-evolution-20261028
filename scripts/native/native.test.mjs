// Fixture tests for the native intake. The adapter here is an in-memory
// GitHub and tessl that records every call, so these tests show which writes
// each decision makes. They are not a test of the live platform.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BACKLOG_LABEL,
  BATCH_SIZE,
  BOT_ID,
  CI_APP_ID,
  OWNER_ID,
  REPOSITORY_ID,
  REVIEWER_ID,
  REVIEWER_LOGIN,
  backlogSlot,
  claimMarker,
  deployState,
  dispatch,
  dispatchSlot,
  itemMarker,
  mergeGate,
  mergeOne,
  produceBacklog,
  requestId,
  triggerArgs,
} from './native.mjs';

const bot = { id: BOT_ID, login: 'tessl-app[bot]', type: 'Bot' };
const owner = { id: OWNER_ID, login: 'guypod', type: 'User' };
const reviewer = { id: REVIEWER_ID, login: REVIEWER_LOGIN, type: 'Bot' };
const HEAD = 'a'.repeat(40);
const OLD = 'b'.repeat(40);

const candidates = (n, prefix = 'Polish') =>
  Array.from({ length: n }, (_, i) => ({
    title: `${prefix} booth ${i}`,
    scope: `${prefix} booth ${i}`,
    body: `Refine booth ${i}.\n\nDone when:\n- it reads clearly`,
    evidence: `src/games/water-cannon/game.ts line ${i}`,
  }));

function fakeGitHub({ issues = [], comments = {}, links = {}, failCreateAt, landUncertain } = {}) {
  const calls = [];
  let next = 1000;
  const state = { issues: structuredClone(issues), comments: structuredClone(comments), links };
  const adapter = {
    calls,
    state,
    listIssues: async ({ state: s, label }) => {
      calls.push(['listIssues', s, label]);
      if (adapter.failList) return { items: [], complete: false };
      return {
        complete: true,
        items: state.issues.filter(
          (i) =>
            (s === 'all' || i.state === s) && (!label || i.labels.some((l) => l.name === label)),
        ),
      };
    },
    listComments: async (n) => ({ complete: true, items: state.comments[n] ?? [] }),
    getIssue: async (n) => structuredClone(state.issues.find((i) => i.number === n)),
    ensureLabel: async (name) => calls.push(['ensureLabel', name]),
    createIssue: async (issue) => {
      calls.push(['createIssue', issue.title]);
      const number = next++;
      const made = {
        ...issue,
        number,
        state: 'open',
        user: bot,
        labels: issue.labels.map((name) => ({ name })),
      };
      if (failCreateAt === calls.filter((c) => c[0] === 'createIssue').length) {
        if (landUncertain) state.issues.push(made);
        throw new Error('timeout');
      }
      state.issues.push(made);
      return { number };
    },
    comment: async (n, body) => {
      calls.push(['comment', n]);
      (state.comments[n] ??= []).push({ user: bot, body });
    },
    addLabel: async (n, label) => {
      calls.push(['addLabel', n, label]);
      state.issues.find((i) => i.number === n).labels.push({ name: label });
    },
    wasLabelledTessl: async (n) => Boolean(state.links[`labelled:${n}`]),
    linkedPullRequests: async (n) => ({ complete: true, items: state.links[n] ?? [] }),
    triggerAction: async (args) => {
      calls.push(['trigger', ...args]);
      return { id: 'run' };
    },
  };
  return adapter;
}

const backlogIssue = (number, extra = {}) => ({
  number,
  state: 'open',
  user: bot,
  title: `Item ${number}`,
  created_at: `2026-10-30T0${number % 10}:00:00Z`,
  labels: [{ name: BACKLOG_LABEL }],
  assignees: [],
  body: `x\n${itemMarker('backlog-2026-10-30T00', number % 18, `item-${number}`)}`,
  ...extra,
});

// ---------- slots ----------

test('backlog slots follow London 00, 06, 12 and 18 across the clock change', () => {
  // 25 October 2026: BST ends at 01:00 UTC.
  assert.equal(backlogSlot(new Date('2026-10-24T23:30:00Z')), 'backlog-2026-10-25T00');
  assert.equal(backlogSlot(new Date('2026-10-25T05:59:00Z')), 'backlog-2026-10-25T00');
  assert.equal(backlogSlot(new Date('2026-10-25T06:00:00Z')), 'backlog-2026-10-25T06');
  assert.equal(backlogSlot(new Date('2026-07-01T17:00:00Z')), 'backlog-2026-07-01T18');
  assert.equal(backlogSlot(new Date('2026-07-01T16:59:00Z')), 'backlog-2026-07-01T12');
});

test('dispatch slots are London twenty-minute blocks, stable within a block', () => {
  assert.equal(dispatchSlot(new Date('2026-10-30T23:59:59Z')), 'dispatch-2026-10-30T2340');
  assert.equal(dispatchSlot(new Date('2026-10-31T00:00:00Z')), 'dispatch-2026-10-31T0000');
  assert.equal(dispatchSlot(new Date('2026-07-01T10:19:00Z')), 'dispatch-2026-07-01T1100');
  assert.equal(dispatchSlot(new Date('2026-07-01T10:20:00Z')), 'dispatch-2026-07-01T1120');
});

// ---------- producer ----------

const SLOT = 'backlog-2026-10-31T00';

test('a slot files exactly 18 issues labelled auto backlog, none tessl', async () => {
  const gh = fakeGitHub();
  const r = await produceBacklog(gh, SLOT, candidates(BATCH_SIZE));
  assert.equal(r.status, 'complete');
  assert.equal(r.issues.length, 18);
  const made = gh.state.issues;
  assert.equal(made.length, 18);
  for (const i of made) assert.deepEqual(i.labels, [{ name: BACKLOG_LABEL }]);
  assert.deepEqual(
    gh.calls.find((c) => c[0] === 'ensureLabel'),
    ['ensureLabel', BACKLOG_LABEL],
  );
});

test('a repeat of a completed slot files nothing', async () => {
  const gh = fakeGitHub();
  await produceBacklog(gh, SLOT, candidates(18));
  const before = gh.calls.filter((c) => c[0] === 'createIssue').length;
  const r = await produceBacklog(gh, SLOT, candidates(18, 'Other'));
  assert.equal(r.status, 'complete');
  assert.equal(gh.calls.filter((c) => c[0] === 'createIssue').length, before);
});

test('fewer than 18 usable candidates reports partial with the remaining count and files none', async () => {
  const gh = fakeGitHub();
  const r = await produceBacklog(gh, SLOT, candidates(17));
  assert.equal(r.status, 'partial');
  assert.equal(r.remaining, 18);
  assert.equal(gh.calls.filter((c) => c[0] === 'createIssue').length, 0);
});

test('a title or scope that repeats an open or closed issue refuses the batch', async () => {
  const closed = {
    number: 5,
    state: 'closed',
    user: bot,
    title: 'Polish booth 3',
    labels: [],
    body: '',
  };
  let r = await produceBacklog(fakeGitHub({ issues: [closed] }), SLOT, candidates(18));
  assert.equal(r.status, 'partial');
  assert.match(r.errors.join(), /duplicates #5/);
  const scoped = {
    number: 6,
    state: 'closed',
    user: bot,
    title: 'Different words',
    labels: [],
    body: itemMarker('backlog-2026-10-29T18', 0, 'polish-booth-4'),
  };
  r = await produceBacklog(fakeGitHub({ issues: [scoped] }), SLOT, candidates(18));
  assert.match(r.errors.join(), /scope polish-booth-4 duplicates #6/);
  const twin = candidates(18);
  twin[7].scope = twin[2].scope;
  r = await produceBacklog(fakeGitHub(), SLOT, twin);
  assert.match(r.errors.join(), /item 7: scope/);
});

test('a candidate carrying tessl is refused', async () => {
  const c = candidates(18);
  c[0].labels = ['tessl'];
  const r = await produceBacklog(fakeGitHub(), SLOT, c);
  assert.equal(r.status, 'partial');
});

test('a crash after 7 creates resumes at index 7 without refiling', async () => {
  const gh = fakeGitHub({ failCreateAt: 8 });
  const first = await produceBacklog(gh, SLOT, candidates(18));
  assert.equal(first.status, 'partial');
  assert.equal(first.remaining, 11);
  const gh2 = fakeGitHub({ issues: gh.state.issues });
  const r = await produceBacklog(gh2, SLOT, candidates(11, 'Later'));
  assert.equal(r.status, 'complete');
  assert.equal(gh2.state.issues.length, 18);
  assert.equal(gh2.calls.filter((c) => c[0] === 'createIssue').length, 11);
});

test('an uncertain create that landed is found by its marker, not refiled', async () => {
  const gh = fakeGitHub({ failCreateAt: 3, landUncertain: true });
  const r = await produceBacklog(gh, SLOT, candidates(18));
  assert.equal(r.status, 'complete');
  assert.equal(gh.state.issues.length, 18);
});

test("a forged item marker in a person's issue does not count toward the slot", async () => {
  const forged = {
    number: 9,
    state: 'open',
    user: owner,
    title: 'x',
    labels: [],
    body: itemMarker(SLOT, 0, 'x'),
  };
  const gh = fakeGitHub({ issues: [forged] });
  const r = await produceBacklog(gh, SLOT, candidates(18));
  assert.equal(r.status, 'complete');
  assert.ok(!r.issues.includes(9));
  assert.equal(gh.calls.filter((c) => c[0] === 'createIssue').length, 18);
});

test('an incomplete issue listing blocks the producer before any write', async () => {
  const gh = fakeGitHub();
  gh.failList = true;
  const r = await produceBacklog(gh, SLOT, candidates(18));
  assert.equal(r.status, 'blocked');
  assert.equal(gh.calls.filter((c) => c[0] !== 'listIssues').length, 0);
});

// ---------- dispatcher ----------

const DSLOT = 'dispatch-2026-10-31T0020';

test('one dispatch labels exactly one issue, the oldest, and admits it once', async () => {
  const gh = fakeGitHub({ issues: [backlogIssue(12), backlogIssue(11), backlogIssue(13)] });
  const r = await dispatch(gh, DSLOT);
  assert.equal(r.status, 'dispatched');
  assert.equal(r.issue, 11);
  const writes = gh.calls.filter((c) => ['comment', 'addLabel', 'trigger'].includes(c[0]));
  assert.deepEqual(
    writes.map((c) => c.slice(0, 3)),
    [
      ['comment', 11],
      ['addLabel', 11, 'tessl'],
      ['trigger', 'action', 'trigger'],
    ],
  );
  const trigger = writes[2];
  assert.ok(trigger.includes(requestId(DSLOT, 11)));
  assert.ok(trigger.includes('carnival-app-writer=1'));
  assert.ok(trigger.includes('implement-github-issue'));
});

test('a retried slot resumes its own claim and labels nothing new', async () => {
  const gh = fakeGitHub({ issues: [backlogIssue(11), backlogIssue(12)] });
  await dispatch(gh, DSLOT);
  const gh2 = fakeGitHub({ issues: gh.state.issues, comments: gh.state.comments });
  const r = await dispatch(gh2, DSLOT);
  assert.equal(r.how, 'resumed');
  assert.equal(r.issue, 11);
  assert.equal(gh2.calls.filter((c) => c[0] === 'addLabel' || c[0] === 'comment').length, 0);
  // The repeat uses the same request id, so the platform starts no second run.
  assert.deepEqual(gh2.calls.find((c) => c[0] === 'trigger').slice(1), triggerArgs(DSLOT, 11));
});

test('a crash between claim and label finishes the same issue', async () => {
  const comments = { 11: [{ user: bot, body: claimMarker(DSLOT, 11) }] };
  const gh = fakeGitHub({ issues: [backlogIssue(11), backlogIssue(12)], comments });
  const r = await dispatch(gh, DSLOT);
  assert.equal(r.issue, 11);
  assert.deepEqual(
    gh.calls.find((c) => c[0] === 'addLabel'),
    ['addLabel', 11, 'tessl'],
  );
});

test('a claimed issue a person unlabelled is not relabelled', async () => {
  const comments = { 11: [{ user: bot, body: claimMarker(DSLOT, 11) }] };
  const gh = fakeGitHub({ issues: [backlogIssue(11)], comments, links: { 'labelled:11': true } });
  const r = await dispatch(gh, DSLOT);
  assert.equal(r.status, 'stopped');
  assert.equal(gh.calls.filter((c) => c[0] === 'addLabel' || c[0] === 'trigger').length, 0);
});

test('an earlier claim still waiting for its pull request keeps the queue busy', async () => {
  const waiting = backlogIssue(11, { labels: [{ name: BACKLOG_LABEL }, { name: 'tessl' }] });
  const comments = { 11: [{ user: bot, body: claimMarker('dispatch-2026-10-31T0000', 11) }] };
  const gh = fakeGitHub({ issues: [waiting, backlogIssue(12)], comments });
  const r = await dispatch(gh, DSLOT);
  assert.equal(r.status, 'busy');
  assert.equal(gh.calls.filter((c) => ['comment', 'addLabel', 'trigger'].includes(c[0])).length, 0);
});

test('ineligible issues are skipped: tessl, held, assigned, person comment, linked PR, foreign author', async () => {
  const issues = [
    backlogIssue(1, { labels: [{ name: BACKLOG_LABEL }, { name: 'tessl' }] }),
    backlogIssue(2, { labels: [{ name: BACKLOG_LABEL }, { name: 'held' }] }),
    backlogIssue(3, { assignees: [owner] }),
    backlogIssue(4),
    backlogIssue(5),
    backlogIssue(6, { user: owner }),
    backlogIssue(7),
  ];
  const comments = { 4: [{ user: owner, body: 'wait' }], 1: [] };
  const links = { 5: [{ event: 'cross-referenced' }] };
  const gh = fakeGitHub({ issues, comments, links });
  const r = await dispatch(gh, DSLOT);
  assert.equal(r.issue, 7);
});

test("a forged claim in a person's comment does not make an issue claimed", async () => {
  const comments = { 11: [{ user: owner, body: claimMarker(DSLOT, 11) }] };
  const gh = fakeGitHub({ issues: [backlogIssue(11), backlogIssue(12)], comments });
  const r = await dispatch(gh, DSLOT);
  assert.equal(r.issue, 12);
});

test('nothing eligible dispatches nothing; an incomplete listing blocks', async () => {
  let gh = fakeGitHub();
  assert.equal((await dispatch(gh, DSLOT)).status, 'idle');
  gh = fakeGitHub({ issues: [backlogIssue(11)] });
  gh.failList = true;
  assert.equal((await dispatch(gh, DSLOT)).status, 'blocked');
  assert.equal(gh.calls.filter((c) => c[0] !== 'listIssues').length, 0);
});

test('an issue closed between listing and claim is skipped', async () => {
  const gh = fakeGitHub({ issues: [backlogIssue(11), backlogIssue(12)] });
  const get = gh.getIssue;
  gh.getIssue = async (n) => (n === 11 ? { ...(await get(n)), state: 'closed' } : get(n));
  const r = await dispatch(gh, DSLOT);
  assert.equal(r.issue, 12);
});

// ---------- merge gate ----------

const reviewBody = (approved = true, total = 2, unplaced = 0) =>
  `## Tessl Reviewer\n<!-- tessl-code-review:workflow-run:v1 id=01a18ea8-6bcc-72d6-9187-e9d41e479ea8 -->\n<!-- tessl-code-review:result:v1 approved=${approved} findings-total=${total} findings-unplaced=${unplaced} -->`;
const review = (extra = {}) => ({
  id: 1,
  user: reviewer,
  state: 'COMMENTED',
  commit_id: HEAD,
  submitted_at: '2026-10-31T00:10:00Z',
  body: reviewBody(),
  ...extra,
});
const ci = (extra = {}) => ({
  name: 'check',
  app: { id: CI_APP_ID },
  head_sha: HEAD,
  status: 'completed',
  conclusion: 'success',
  ...extra,
});
const snapshot = (extra = {}) => ({
  writerKeyHeld: true,
  pr: {
    number: 30,
    state: 'open',
    draft: false,
    merged: false,
    user: bot,
    body: 'Why.\n\nCloses #29\n',
    labels: [{ name: 'tessl' }],
    base: { ref: 'main', repo: { id: REPOSITORY_ID } },
    head: { sha: HEAD, ref: 'tessl/issue-29', repo: { id: REPOSITORY_ID } },
  },
  reviews: { complete: true, items: [review()] },
  checks: {
    complete: true,
    items: [ci(), ci({ name: 'Tessl Reviewer', app: { id: 4850038 }, conclusion: 'neutral' })],
  },
  combinedStatus: { state: 'pending', total_count: 0 },
  ...extra,
});

test('a reviewer pass with advisory findings and green CI on the head may merge', () => {
  const g = mergeGate(snapshot());
  assert.deepEqual(g.reasons, []);
  assert.equal(g.merge, true);
});

const refuses = (name, s, pattern) =>
  test(`refuses: ${name}`, () => {
    const g = mergeGate(s);
    assert.equal(g.merge, false);
    assert.match(g.reasons.join('; '), pattern);
  });

refuses(
  'blocking review',
  snapshot({ reviews: { complete: true, items: [review({ body: reviewBody(false) })] } }),
  /blocking/,
);
refuses(
  'stale review on an older head',
  snapshot({ reviews: { complete: true, items: [review({ commit_id: OLD })] } }),
  /older head/,
);
refuses(
  'dismissed review',
  snapshot({ reviews: { complete: true, items: [review({ state: 'DISMISSED' })] } }),
  /dismissed/,
);
refuses(
  'newer conflicting review supersedes an older pass',
  snapshot({
    reviews: {
      complete: true,
      items: [
        review(),
        review({ id: 2, submitted_at: '2026-10-31T00:20:00Z', body: reviewBody(false) }),
      ],
    },
  }),
  /blocking/,
);
refuses(
  'forged markers from another author',
  snapshot({ reviews: { complete: true, items: [review({ user: owner })] } }),
  /no trusted review/,
);
refuses(
  'reviewer login without the reviewer id',
  snapshot({ reviews: { complete: true, items: [review({ user: { ...reviewer, id: 1 } })] } }),
  /no trusted review/,
);
refuses(
  'missing markers',
  snapshot({ reviews: { complete: true, items: [review({ body: 'LGTM' })] } }),
  /markers/,
);
refuses(
  'repeated result markers',
  snapshot({
    reviews: { complete: true, items: [review({ body: reviewBody() + reviewBody(false) })] },
  }),
  /markers/,
);
refuses(
  'malformed counts',
  snapshot({ reviews: { complete: true, items: [review({ body: reviewBody(true, 1, 3) })] } }),
  /malformed/,
);
refuses(
  'incomplete review pagination',
  snapshot({ reviews: { complete: false, items: [review()] } }),
  /review listing/,
);
refuses(
  'incomplete check pagination',
  snapshot({ checks: { complete: false, items: [ci()] } }),
  /check listing/,
);
refuses(
  'a person requested changes',
  snapshot({
    reviews: {
      complete: true,
      items: [
        review(),
        { id: 3, user: owner, state: 'CHANGES_REQUESTED', submitted_at: '2026-10-31T00:11:00Z' },
      ],
    },
  }),
  /changes requested/,
);
refuses(
  'no CI on the head',
  snapshot({ checks: { complete: true, items: [ci({ head_sha: OLD })] } }),
  /no CI/,
);
refuses(
  'CI still running',
  snapshot({
    checks: { complete: true, items: [ci({ status: 'in_progress', conclusion: null })] },
  }),
  /CI is not green/,
);
refuses(
  'a false green: a check named check from another app',
  snapshot({ checks: { complete: true, items: [ci({ app: { id: 1 } })] } }),
  /no CI/,
);
refuses(
  'another check failed',
  snapshot({
    checks: { complete: true, items: [ci(), ci({ name: 'extra', conclusion: 'failure' })] },
  }),
  /extra failure/,
);
refuses(
  'a failing commit status',
  snapshot({ combinedStatus: { state: 'failure', total_count: 1 } }),
  /commit status/,
);
refuses('a draft', snapshot({ pr: { ...snapshot().pr, draft: true } }), /draft/);
refuses(
  'a fork head',
  snapshot({ pr: { ...snapshot().pr, head: { ...snapshot().pr.head, repo: { id: 99 } } } }),
  /fork/,
);
refuses(
  'a pull request a person opened',
  snapshot({ pr: { ...snapshot().pr, user: owner } }),
  /factory bot/,
);
refuses('no writer key', snapshot({ writerKeyHeld: false }), /writer key/);
refuses('no Closes line', snapshot({ pr: { ...snapshot().pr, body: 'x' } }), /Closes/);

test('a formal APPROVE from someone else does not stand in for the reviewer', () => {
  const s = snapshot({
    reviews: {
      complete: true,
      items: [
        {
          id: 4,
          user: owner,
          state: 'APPROVED',
          commit_id: HEAD,
          submitted_at: '2026-10-31T00:30:00Z',
        },
      ],
    },
  });
  assert.match(mergeGate(s).reasons.join(), /no trusted review/);
});

test('merge is pinned to the gated head and refused when the head moves between reads', async () => {
  const calls = [];
  const moved = snapshot({ pr: { ...snapshot().pr, head: { ...snapshot().pr.head, sha: OLD } } });
  let reads = 0;
  const adapter = {
    snapshot: async () => (reads++ === 0 ? snapshot() : moved),
    squashMerge: async (...a) => (calls.push(a), { merged: true }),
  };
  const r = await mergeOne(adapter, 30);
  assert.equal(r.status, 'refused');
  assert.equal(calls.length, 0);
  const ok = {
    snapshot: async () => snapshot(),
    squashMerge: async (...a) => (calls.push(a), { merged: true, sha: 'm' }),
  };
  const done = await mergeOne(ok, 30);
  assert.equal(done.status, 'merged');
  assert.equal(done.live, 'pending');
  assert.deepEqual(calls, [[30, HEAD]]);
});

test('GitHub refusing a moved head is reported, not retried', async () => {
  const adapter = {
    snapshot: async () => snapshot(),
    squashMerge: async () => ({ merged: false, message: 'Head branch was modified' }),
  };
  const r = await mergeOne(adapter, 30);
  assert.equal(r.status, 'refused');
  assert.match(r.reasons[0], /modified/);
});

test('merged is not live until the Pages run for that commit succeeds', () => {
  assert.equal(deployState('m', []), 'merged-not-deployed');
  assert.equal(deployState('m', [{ head_sha: 'm', status: 'in_progress' }]), 'deploying');
  assert.equal(
    deployState('m', [{ head_sha: 'm', status: 'completed', conclusion: 'failure' }]),
    'deploy-failed',
  );
  assert.equal(
    deployState('m', [{ head_sha: 'm', status: 'completed', conclusion: 'success' }]),
    'deployed-needs-sanity',
  );
});

// ---------- manifest ----------

test('the native action holds the writer key and its schedules are London slots', async () => {
  const { readFileSync } = await import('node:fs');
  const { checkContract } = await import('../factory/contract.mjs');
  const manifest = JSON.parse(readFileSync(new URL('../../tessl.json', import.meta.url), 'utf8'));
  assert.deepEqual(manifest.actions['native-intake'].concurrency, {
    keys: [{ key: 'carnival-app-writer', limit: 1 }],
    mode: 'queue',
  });
  assert.equal(manifest.schedules['native-backlog-six-hourly'].cron, '0 0,6,12,18 * * *');
  assert.equal(manifest.schedules['native-dispatch-twenty-minutes'].cron, '*/20 * * * *');
  // The label webhook still needs the owner: native labels cannot start it.
  assert.equal(manifest.triggers['github-issue-labelled'].when['event.sender.id'], OWNER_ID);
  assert.equal(manifest.triggers['github-issue-labelled'].when['event.sender.type'], 'User');
  const unserialized = structuredClone(manifest);
  delete unserialized.actions['native-intake'].concurrency;
  assert.match(checkContract(unserialized).join(), /native-intake\.concurrency/);
  const often = structuredClone(manifest);
  often.schedules['native-dispatch-twenty-minutes'].cron = '* * * * *';
  assert.match(checkContract(often).join(), /native-dispatch-twenty-minutes\.cron/);
});
