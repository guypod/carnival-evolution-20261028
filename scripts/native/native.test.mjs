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
  readBatch,
  slotProgress,
  MISSING_LABEL_ROUTE,
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

function fakeGitHub({
  issues = [],
  comments = {},
  links = {},
  failCreateAt,
  landUncertain,
  ownerRoute = true,
} = {}) {
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
    listClaimComments: async () => {
      calls.push(['listClaimComments']);
      if (adapter.failHistory) return { items: [], complete: false };
      return {
        complete: true,
        items: Object.entries(state.comments).flatMap(([n, cs]) =>
          cs.map((c) => ({ issue_url: `https://api.github.com/repos/x/issues/${n}`, ...c })),
        ),
      };
    },
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
    labelAsOwner: async (n, label) => {
      calls.push(['addLabel', n, label]);
      state.issues.find((i) => i.number === n).labels.push({ name: label });
      state.links[`actor:${n}`] = owner;
    },
    wasLabelledTessl: async (n) => Boolean(state.links[`labelled:${n}`]),
    labelActor: async (n) => state.links[`actor:${n}`],
    linkedPullRequests: async (n) => ({ complete: true, items: state.links[n] ?? [] }),
  };
  if (!ownerRoute) delete adapter.labelAsOwner;
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

test('rerunning the original 18-item file after a crash files only the missing items', async () => {
  const gh = fakeGitHub({ failCreateAt: 8 });
  const file = candidates(18);
  await produceBacklog(gh, SLOT, file);
  const gh2 = fakeGitHub({ issues: gh.state.issues });
  const r = await produceBacklog(gh2, SLOT, file);
  assert.equal(r.status, 'complete');
  assert.deepEqual(
    gh2.calls.filter((c) => c[0] === 'createIssue').map((c) => c[1]),
    file.slice(7).map((c) => c.title),
  );
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

const writes = (gh) =>
  gh.calls.filter((c) => ['comment', 'addLabel', 'createIssue'].includes(c[0]));
const claimed = (slot, n) => ({ user: bot, body: claimMarker(slot, n) });
const EARLIER = 'dispatch-2026-10-31T0000';

test('one dispatch claims and has the owner label exactly one issue, the oldest', async () => {
  const gh = fakeGitHub({ issues: [backlogIssue(12), backlogIssue(11), backlogIssue(13)] });
  const r = await dispatch(gh, DSLOT);
  assert.equal(r.status, 'dispatched');
  assert.equal(r.issue, 11);
  assert.deepEqual(
    writes(gh).map((c) => c.slice(0, 3)),
    [
      ['comment', 11],
      ['addLabel', 11, 'tessl'],
    ],
  );
});

test('dispatch never starts implementation directly: the label is the only start', async () => {
  const gh = fakeGitHub({ issues: [backlogIssue(11)] });
  gh.triggerAction = async (args) => gh.calls.push(['trigger', ...args]);
  await dispatch(gh, DSLOT);
  assert.equal(gh.calls.filter((c) => c[0] === 'trigger').length, 0);
});

test('without an owner label route, dispatch fails closed before any write', async () => {
  const gh = fakeGitHub({ issues: [backlogIssue(11)], ownerRoute: false });
  gh.addLabel = async (n, l) => gh.calls.push(['addLabel', n, l]);
  const r = await dispatch(gh, DSLOT);
  assert.equal(r.status, 'blocked');
  assert.equal(r.reason, MISSING_LABEL_ROUTE);
  assert.deepEqual(writes(gh), []);
});

test('a label that lands but not from the owner is reported, not counted as dispatched', async () => {
  const gh = fakeGitHub({ issues: [backlogIssue(11)] });
  const route = gh.labelAsOwner;
  gh.labelAsOwner = async (n, l) => {
    await route(n, l);
    gh.state.links[`actor:${n}`] = bot;
  };
  const r = await dispatch(gh, DSLOT);
  assert.equal(r.status, 'failed');
  assert.match(r.reason, /not added by the owner/);
});

test('a retried slot resumes its own claim and writes nothing new', async () => {
  const gh = fakeGitHub({ issues: [backlogIssue(11), backlogIssue(12)] });
  await dispatch(gh, DSLOT);
  const gh2 = fakeGitHub({ issues: gh.state.issues, comments: gh.state.comments });
  const r = await dispatch(gh2, DSLOT);
  assert.equal(r.how, 'resumed');
  assert.equal(r.issue, 11);
  assert.deepEqual(writes(gh2), []);
});

test('a slot whose claimed issue was closed or unlabelled never claims a second issue', async () => {
  for (const change of [
    { state: 'closed' },
    { labels: [] },
    { labels: [{ name: 'tessl' }] },
    { state: 'closed', labels: [] },
  ]) {
    const issues = [backlogIssue(11, change), backlogIssue(12)];
    const gh = fakeGitHub({ issues, comments: { 11: [claimed(DSLOT, 11)] } });
    const r = await dispatch(gh, DSLOT);
    assert.equal(r.issue, 11, JSON.stringify(change));
    assert.deepEqual(writes(gh), [], JSON.stringify(change));
  }
});

test('a crash between claim and label finishes the same issue in the same slot', async () => {
  const comments = { 11: [claimed(DSLOT, 11)] };
  const gh = fakeGitHub({ issues: [backlogIssue(11), backlogIssue(12)], comments });
  const r = await dispatch(gh, DSLOT);
  assert.equal(r.issue, 11);
  assert.deepEqual(writes(gh), [['addLabel', 11, 'tessl']]);
});

test('a claim from an earlier slot that never got its label is recovered later', async () => {
  const comments = { 11: [claimed(EARLIER, 11)] };
  const gh = fakeGitHub({ issues: [backlogIssue(11), backlogIssue(12)], comments });
  const r = await dispatch(gh, DSLOT);
  assert.equal(r.status, 'dispatched');
  assert.equal(r.how, 'recovered');
  assert.equal(r.issue, 11);
  assert.deepEqual(writes(gh), [
    ['comment', 11],
    ['addLabel', 11, 'tessl'],
  ]);
});

test('an unfinished claim a person has since held is released, not labelled', async () => {
  for (const extra of [
    { labels: [{ name: BACKLOG_LABEL }, { name: 'held' }] },
    { assignees: [owner] },
  ]) {
    const comments = { 11: [claimed(EARLIER, 11)] };
    const gh = fakeGitHub({ issues: [backlogIssue(11, extra), backlogIssue(12)], comments });
    const r = await dispatch(gh, DSLOT);
    assert.equal(r.issue, 12, JSON.stringify(extra));
    assert.ok(!writes(gh).some((c) => c[1] === 11));
  }
  const comments = { 11: [claimed(DSLOT, 11), { user: owner, body: 'wait for me' }] };
  const gh = fakeGitHub({ issues: [backlogIssue(11), backlogIssue(12)], comments });
  const r = await dispatch(gh, DSLOT);
  assert.equal(r.status, 'stopped');
  assert.equal(r.reason, 'has a person comment');
  assert.deepEqual(writes(gh), []);
});

test('a claimed issue a person unlabelled is not relabelled', async () => {
  const comments = { 11: [claimed(DSLOT, 11)] };
  const gh = fakeGitHub({ issues: [backlogIssue(11)], comments, links: { 'labelled:11': true } });
  const r = await dispatch(gh, DSLOT);
  assert.equal(r.status, 'stopped');
  assert.deepEqual(writes(gh), []);
  const gh2 = fakeGitHub({
    issues: [backlogIssue(11), backlogIssue(12)],
    comments: { 11: [claimed(EARLIER, 11)] },
    links: { 'labelled:11': true },
  });
  assert.equal((await dispatch(gh2, DSLOT)).issue, 12);
  assert.ok(!writes(gh2).some((c) => c[1] === 11));
});

test('an uncertain claim or label write is read back before anything else', async () => {
  let gh = fakeGitHub({ issues: [backlogIssue(11), backlogIssue(12)] });
  const post = gh.comment;
  gh.comment = async (n, b) => {
    await post(n, b);
    throw new Error('timeout');
  };
  let r = await dispatch(gh, DSLOT);
  assert.equal(r.issue, 11);
  assert.equal(r.status, 'dispatched');
  gh = fakeGitHub({ issues: [backlogIssue(11), backlogIssue(12)] });
  gh.comment = async () => {
    throw new Error('timeout');
  };
  r = await dispatch(gh, DSLOT);
  assert.equal(r.status, 'blocked');
  assert.ok(!gh.calls.some((c) => c[0] === 'addLabel'));
  gh = fakeGitHub({ issues: [backlogIssue(11)], comments: { 11: [claimed(DSLOT, 11)] } });
  gh.labelAsOwner = async () => {
    throw new Error('timeout');
  };
  r = await dispatch(gh, DSLOT);
  assert.equal(r.status, 'blocked');
  assert.match(r.reason, /later slot recovers/);
});

test('an earlier claim still waiting for its pull request keeps the queue busy', async () => {
  const waiting = backlogIssue(11, { labels: [{ name: BACKLOG_LABEL }, { name: 'tessl' }] });
  const gh = fakeGitHub({
    issues: [waiting, backlogIssue(12)],
    comments: { 11: [claimed(EARLIER, 11)] },
  });
  const r = await dispatch(gh, DSLOT);
  assert.equal(r.status, 'busy');
  assert.deepEqual(writes(gh), []);
});

test('a busy dispatch does not scan comments of the whole backlog', async () => {
  const waiting = backlogIssue(11, { labels: [{ name: BACKLOG_LABEL }, { name: 'tessl' }] });
  const issues = [waiting, ...Array.from({ length: 50 }, (_, i) => backlogIssue(100 + i))];
  const gh = fakeGitHub({ issues, comments: { 11: [claimed(EARLIER, 11)] } });
  let reads = 0;
  const list = gh.listComments;
  gh.listComments = async (n) => (reads++, list(n));
  assert.equal((await dispatch(gh, DSLOT)).status, 'busy');
  assert.equal(reads, 0);
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
  const comments = { 4: [{ user: owner, body: 'wait' }] };
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

test('nothing eligible dispatches nothing; an incomplete listing or history blocks', async () => {
  let gh = fakeGitHub();
  assert.equal((await dispatch(gh, DSLOT)).status, 'idle');
  gh = fakeGitHub({ issues: [backlogIssue(11)] });
  gh.failList = true;
  assert.equal((await dispatch(gh, DSLOT)).status, 'blocked');
  assert.deepEqual(writes(gh), []);
  gh = fakeGitHub({ issues: [backlogIssue(11)] });
  gh.failHistory = true;
  assert.equal((await dispatch(gh, DSLOT)).status, 'blocked');
  assert.deepEqual(writes(gh), []);
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
const sourceIssue = (extra = {}) => ({
  number: 29,
  state: 'open',
  repository_url: 'https://api.github.com/repos/guypod/carnival-evolution-20261028',
  labels: [{ name: 'tessl' }],
  ...extra,
});
const RUN = '01a18ea8-6bcc-72d6-9187-e9d41e479ea8';
const reviewerRun = (extra = {}) => ({
  name: 'Tessl Reviewer',
  app: { id: 4850038 },
  head_sha: HEAD,
  external_id: `tessl-code-review-run:${RUN}`,
  status: 'completed',
  conclusion: 'neutral',
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
    body: 'Why.\n\nCloses #29\n\n<!-- tessl-factory:issue-label: tessl -->',
    labels: [{ name: 'tessl' }],
    base: { ref: 'main', repo: { id: REPOSITORY_ID } },
    head: { sha: HEAD, ref: 'tessl/issue-29', repo: { id: REPOSITORY_ID } },
  },
  reviews: { complete: true, items: [review()] },
  checks: {
    complete: true,
    items: [ci(), reviewerRun()],
  },
  combinedStatus: { state: 'pending', total_count: 0 },
  issue: sourceIssue(),
  issueLabelActor: { complete: true, actor: owner },
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
const withBody = (body) => snapshot({ pr: { ...snapshot().pr, body } });
refuses('Closes names another issue than the branch', withBody('Closes #28'), /does not match/);
refuses('two Closes lines', withBody('Closes #29\nCloses #28'), /single Closes/);
refuses('a second closing keyword', withBody('Closes #29\nAlso fixes #28.'), /single Closes/);
refuses(
  'a full-URL closing reference to another issue',
  withBody('Closes #29\nFixes https://github.com/guypod/carnival-evolution-20261028/issues/28'),
  /single Closes/,
);
refuses('source issue closed', snapshot({ issue: sourceIssue({ state: 'closed' }) }), /closed/);
refuses('source issue lost its label', snapshot({ issue: sourceIssue({ labels: [] }) }), /tessl/);
refuses(
  'source issue in another repository',
  snapshot({ issue: sourceIssue({ repository_url: 'https://api.github.com/repos/a/b' }) }),
  /another repository/,
);
refuses(
  'source issue is a PR',
  snapshot({ issue: sourceIssue({ pull_request: {} }) }),
  /branch issue/,
);
refuses('source issue not read', snapshot({ issue: undefined }), /not read/);
refuses(
  'source issue no longer carries tessl',
  snapshot({ issue: sourceIssue({ labels: [] }) }),
  /no longer carries tessl/,
);
refuses(
  'a later COMMENTED review does not clear a request for changes',
  snapshot({
    reviews: {
      complete: true,
      items: [
        review(),
        {
          id: 7,
          user: owner,
          state: 'CHANGES_REQUESTED',
          commit_id: HEAD,
          submitted_at: '2026-10-31T00:11:00Z',
        },
        {
          id: 8,
          user: owner,
          state: 'COMMENTED',
          commit_id: HEAD,
          submitted_at: '2026-10-31T00:12:00Z',
        },
      ],
    },
  }),
  /changes requested by guypod/,
);
refuses(
  'review run id has no reviewer check run on the head',
  snapshot({
    checks: {
      complete: true,
      items: [ci(), reviewerRun({ external_id: 'tessl-code-review-run:other' })],
    },
  }),
  /no matching reviewer run/,
);
refuses(
  'reviewer run from another app',
  snapshot({ checks: { complete: true, items: [ci(), reviewerRun({ app: { id: 1 } })] } }),
  /no matching reviewer run/,
);

test('a dismissed request for changes no longer blocks', () => {
  const s = snapshot({
    reviews: {
      complete: true,
      items: [
        {
          id: 7,
          user: owner,
          state: 'DISMISSED',
          commit_id: HEAD,
          submitted_at: '2026-10-31T00:09:00Z',
        },
        review(),
      ],
    },
  });
  assert.deepEqual(mergeGate(s).reasons, []);
});

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

const mergeAdapter = (extra = {}) => {
  const calls = [];
  return {
    calls,
    snapshot: async () => snapshot(),
    squashMerge: async (...a) => (calls.push(['merge', ...a]), { merged: true, sha: 'm' }),
    ...extra,
  };
};

test('the controller merges atomically pinned to the gated head and never arms auto-merge', async () => {
  const adapter = mergeAdapter();
  const r = await mergeOne(adapter, 30);
  assert.equal(r.status, 'merged');
  assert.equal(r.live, 'pending');
  assert.deepEqual(adapter.calls, [['merge', 30, HEAD]]);
});

test('an unverified head is never merged: refused gate or a head moving between reads', async () => {
  const moved = snapshot({ pr: { ...snapshot().pr, head: { ...snapshot().pr.head, sha: OLD } } });
  let reads = 0;
  let adapter = mergeAdapter({ snapshot: async () => (reads++ === 0 ? snapshot() : moved) });
  assert.equal((await mergeOne(adapter, 30)).status, 'refused');
  assert.deepEqual(adapter.calls, []);
  adapter = mergeAdapter({ snapshot: async () => snapshot({ writerKeyHeld: false }) });
  assert.equal((await mergeOne(adapter, 30)).status, 'refused');
  assert.deepEqual(adapter.calls, []);
});

test('a gate that fails only on the second read, just before merging, merges nothing', async () => {
  const pending = snapshot({
    checks: {
      complete: true,
      items: [...snapshot().checks.items, { name: 'late', head_sha: HEAD, status: 'in_progress' }],
    },
  });
  let reads = 0;
  const adapter = mergeAdapter({ snapshot: async () => (reads++ === 0 ? snapshot() : pending) });
  const r = await mergeOne(adapter, 30);
  assert.equal(r.status, 'refused');
  assert.match(r.reasons.join(), /late still running/);
  assert.deepEqual(adapter.calls, []);
});

test('GitHub refusing the expected-head merge is reported and nothing merges another way', async () => {
  for (const message of ['Head branch was modified', 'Pull request is not mergeable']) {
    const calls = [];
    const adapter = mergeAdapter({
      squashMerge: async (...a) => (calls.push(['merge', ...a]), { merged: false, message }),
    });
    const r = await mergeOne(adapter, 30);
    assert.equal(r.status, 'refused');
    assert.equal(r.reasons[0], message);
    assert.deepEqual(calls, [['merge', 30, HEAD]]);
  }
});

test('merged is not live until the Pages deploy job for that commit succeeds', () => {
  const done = { head_sha: 'm', status: 'completed', conclusion: 'success' };
  assert.equal(deployState('m', []), 'merged-not-deployed');
  assert.equal(deployState('m', [{ head_sha: 'm', status: 'in_progress' }]), 'deploying');
  assert.equal(deployState('m', [{ ...done, conclusion: 'failure' }]), 'deploy-failed');
  assert.equal(deployState('m', [done]), 'deploy-unknown');
  // Pages off: the workflow succeeds but skips its deploy job.
  const skipped = () => [
    { name: 'check', conclusion: 'success' },
    { name: 'deploy', conclusion: 'skipped' },
  ];
  assert.equal(deployState('m', [done], skipped), 'merged-not-deployed');
  const deployed = () => [{ name: 'deploy', conclusion: 'success' }];
  assert.equal(deployState('m', [done], deployed), 'deployed-needs-sanity');
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
  assert.deepEqual(manifest.triggers['github-issue-labelled'].when, {
    'event.label.name': 'tessl',
    'event.sender.type': 'User',
    'event.sender.id': OWNER_ID,
    'event.issue.state': 'open',
    'event.repository.id': REPOSITORY_ID,
  });
  const unserialized = structuredClone(manifest);
  delete unserialized.actions['native-intake'].concurrency;
  assert.match(checkContract(unserialized).join(), /native-intake\.concurrency/);
  const often = structuredClone(manifest);
  often.schedules['native-dispatch-twenty-minutes'].cron = '* * * * *';
  assert.match(checkContract(often).join(), /native-dispatch-twenty-minutes\.cron/);
});

test('after recovering an earlier claim, a retry of the same slot never dispatches a second issue', async () => {
  // Each case changes the recovered issue after its label: closed, label
  // removed by a person, or given a linked pull request.
  const after = {
    closed: (gh) => (gh.state.issues.find((i) => i.number === 11).state = 'closed'),
    'label removed': (gh) => {
      const i = gh.state.issues.find((x) => x.number === 11);
      i.labels = i.labels.filter((l) => l.name !== 'tessl');
      gh.state.links['labelled:11'] = true;
    },
    'linked pull request': (gh) => (gh.state.links[11] = [{ event: 'cross-referenced' }]),
  };
  for (const [name, change] of Object.entries(after)) {
    const gh = fakeGitHub({
      issues: [backlogIssue(11), backlogIssue(12)],
      comments: { 11: [claimed(EARLIER, 11)] },
    });
    const first = await dispatch(gh, DSLOT);
    assert.equal(first.status, 'dispatched', name);
    assert.equal(first.issue, 11, name);
    // The current slot is bound to the recovered issue before its label, and
    // the earlier claim stays in the history.
    assert.deepEqual(writes(gh), [
      ['comment', 11],
      ['addLabel', 11, 'tessl'],
    ]);
    assert.equal(gh.state.comments[11][0].body, claimMarker(EARLIER, 11));
    assert.match(gh.state.comments[11][1].body, new RegExp(claimMarker(DSLOT, 11)));
    change(gh);
    const again = await dispatch(gh, DSLOT);
    assert.equal(again.issue, 11, name);
    assert.ok(!gh.calls.some((c) => c[1] === 12), name);
  }
});

test('an uncertain bind of a recovery slot is read back, and a missing bind labels nothing', async () => {
  let gh = fakeGitHub({
    issues: [backlogIssue(11), backlogIssue(12)],
    comments: { 11: [claimed(EARLIER, 11)] },
  });
  const post = gh.comment;
  gh.comment = async (n, b) => {
    await post(n, b);
    throw new Error('timeout');
  };
  let r = await dispatch(gh, DSLOT);
  assert.equal(r.status, 'dispatched');
  assert.equal(r.issue, 11);
  gh = fakeGitHub({
    issues: [backlogIssue(11), backlogIssue(12)],
    comments: { 11: [claimed(EARLIER, 11)] },
  });
  gh.comment = async () => {
    throw new Error('timeout');
  };
  r = await dispatch(gh, DSLOT);
  assert.equal(r.status, 'blocked');
  assert.ok(!gh.calls.some((c) => c[0] === 'addLabel'));
});

test('a batch file keeps its slot across a six-hour boundary, so a rerun fills that slot', async () => {
  const file = { slot: SLOT, candidates: candidates(18) };
  const gh = fakeGitHub({ failCreateAt: 8 });
  const before = readBatch(file, new Date('2026-10-31T05:50:00Z'));
  assert.equal(before.slot, SLOT);
  assert.equal((await produceBacklog(gh, before.slot, before.candidates)).status, 'partial');
  // The rerun is after 06:00 London: the file's slot still decides.
  const after = readBatch(file, new Date('2026-10-31T06:10:00Z'));
  assert.equal(after.slot, SLOT);
  const gh2 = fakeGitHub({ issues: gh.state.issues });
  const r = await produceBacklog(gh2, after.slot, after.candidates);
  assert.equal(r.status, 'complete');
  assert.equal(r.slot, SLOT);
  assert.equal(gh2.state.issues.length, 18);
  assert.deepEqual(
    gh2.calls.filter((c) => c[0] === 'createIssue').map((c) => c[1]),
    file.candidates.slice(7).map((c) => c.title),
  );
  // Once that slot is complete, the same file files nothing in any later run.
  const gh3 = fakeGitHub({ issues: gh2.state.issues });
  assert.equal((await produceBacklog(gh3, after.slot, after.candidates)).status, 'complete');
  assert.deepEqual(writes(gh3), []);
});

test('a batch slot that is malformed, unscheduled or in the future is refused', () => {
  const now = new Date('2026-10-31T06:10:00Z');
  assert.equal(readBatch(candidates(18), now).slot, 'backlog-2026-10-31T06');
  for (const slot of [
    undefined,
    'backlog-2026-10-31T03',
    'dispatch-2026-10-31T0000',
    'backlog-2026-10-31T12',
  ])
    assert.ok(readBatch({ slot, candidates: candidates(18) }, now).error, String(slot));
});

test('reviews with equal timestamps are ordered by id, so a newer request for changes stands', () => {
  const at = '2026-10-31T00:20:00Z';
  const s = snapshot({
    reviews: {
      complete: true,
      items: [
        { id: 9, user: owner, state: 'CHANGES_REQUESTED', commit_id: HEAD, submitted_at: at },
        { id: 8, user: owner, state: 'APPROVED', commit_id: HEAD, submitted_at: at },
        review(),
      ],
    },
  });
  assert.match(mergeGate(s).reasons.join(), /changes requested by guypod/);
});

test('a candidate carrying a marker is refused, and only the last-line marker counts', async () => {
  const file = candidates(18);
  file[0].body += `\n${itemMarker(SLOT, 17, 'polish-booth-0')}`;
  const r = await produceBacklog(fakeGitHub(), SLOT, file);
  assert.equal(r.status, 'partial');
  assert.match(r.errors.join(), /item 0: must not contain a producer or dispatcher marker/);
  const early = backlogIssue(40, {
    body: `${itemMarker(SLOT, 17, 'x')}\ntext\n${itemMarker(SLOT, 2, 'y')}`,
  });
  assert.deepEqual([...slotProgress(SLOT, [early]).keys()], [2]);
});

test('a recovered claim whose issue now has a linked pull request is released, not labelled', async () => {
  const gh = fakeGitHub({
    issues: [backlogIssue(11), backlogIssue(12)],
    comments: { 11: [claimed(EARLIER, 11)] },
    links: { 11: [{ event: 'cross-referenced' }] },
  });
  const r = await dispatch(gh, DSLOT);
  assert.equal(r.issue, 12);
  assert.ok(!writes(gh).some((c) => c[1] === 11));
});

test('a source issue label restored by someone other than the owner, or unread, blocks the merge', () => {
  for (const issueLabelActor of [
    { complete: true, actor: { id: 7, login: 'triager', type: 'User' } },
    { complete: true, actor: bot },
    { complete: true, actor: undefined },
    { complete: false, actor: owner },
  ]) {
    const g = mergeGate(snapshot({ issueLabelActor }));
    assert.equal(g.merge, false, JSON.stringify(issueLabelActor));
    assert.match(g.reasons.join(), /source issue label/);
  }
});

test('a PR naming another issue label never stands in for the tessl hand-off', () => {
  const pr = {
    ...snapshot().pr,
    body: 'Why.\n\nCloses #29\n\n<!-- tessl-factory:issue-label: bug -->',
  };
  const g = mergeGate(snapshot({ pr, issue: sourceIssue({ labels: [{ name: 'bug' }] }) }));
  assert.equal(g.merge, false);
  assert.match(g.reasons.join(), /issue label bug is not tessl/);
});

test('a batch whose candidates are not an array is refused without writes', async () => {
  const gh = fakeGitHub();
  const r = await produceBacklog(gh, SLOT, { title: 'x' });
  assert.equal(r.status, 'partial');
  assert.deepEqual(r.errors, ['candidates must be an array']);
  assert.deepEqual(writes(gh), []);
});

test('a merge whose result is unknown is reported as uncertain, not refused or merged', async () => {
  const adapter = mergeAdapter({
    squashMerge: async () => ({ merged: false, uncertain: true, message: 'merge result unknown' }),
  });
  const r = await mergeOne(adapter, 30);
  assert.equal(r.status, 'uncertain');
});
