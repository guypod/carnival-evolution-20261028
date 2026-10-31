// Fixture tests for the native intake. The adapter here is an in-memory
// GitHub and tessl that records every call, so these tests show which writes
// each decision makes. They are not a test of the live platform.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BACKLOG_LABEL,
  BATCH_SIZE,
  BOT_APP_ID,
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
  admissionMarker,
  admit,
  contentDigest,
  journalMarker,
  readAdmissions,
  readDeferrals,
  readItem,
  readJournal,
  requestId,
  executionState,
  launchRuns,
  runLabel,
  issueUrl,
} from './native.mjs';

const bot = { id: BOT_ID, login: 'tessl-app[bot]', type: 'Bot' };
const app = { id: BOT_APP_ID };
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
  autoJournal = true,
} = {}) {
  const calls = [];
  let next = 1000;
  const state = { issues: structuredClone(issues), comments: structuredClone(comments), links };
  // Backlog issues given to the fixture were filed by the producer, so each
  // has its journal entry unless the test says otherwise.
  for (const i of autoJournal ? state.issues : []) {
    const item = readItem(i);
    if (!item || readJournal(state.comments[i.number] ?? []).length) continue;
    (state.comments[i.number] ??= []).unshift({
      user: bot,
      performed_via_github_app: { id: BOT_APP_ID },
      created_at: '2026-10-30T00:00:00Z',
      body: journalMarker(item.slot, item.index, i.number, contentDigest(i.title, i.body)),
    });
  }
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
      (state.comments[n] ??= []).push({
        user: bot,
        performed_via_github_app: { id: BOT_APP_ID },
        created_at: `2026-10-31T00:0${(state.comments[n] ?? []).length}:00Z`,
        body,
      });
    },
    labelAsBot: async (n, label) => {
      calls.push(['addLabel', n, label]);
      state.issues.find((i) => i.number === n).labels.push({ name: label });
      state.links[`actor:${n}`] = bot;
    },
    wasLabelledTessl: async (n) => Boolean(state.links[`labelled:${n}`]),
    labelActor: async (n) => state.links[`actor:${n}`],
    linkedPullRequests: async (n) => ({ complete: true, items: state.links[n] ?? [] }),
    listEvents: async (n) => ({ complete: true, items: state.links[`events:${n}`] ?? [] }),
  };
  // Tessl launch runs, as launchRuns returns them: state.runs, filtered the
  // way the API filters them. failRuns makes every listing incomplete.
  state.runs = [];
  adapter.launchRuns = async ({ status, issue }) => {
    calls.push(['launchRuns', status ?? `issue:${issue}`]);
    if (adapter.failRuns) return { items: [], complete: false };
    return {
      complete: true,
      items: state.runs.filter(
        (r) => (!status || r.status === status) && (issue === undefined || r.issue === issue),
      ),
    };
  };
  if (!ownerRoute) delete adapter.labelAsBot;
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

test('one dispatch claims and labels exactly one issue as the bot, the oldest', async () => {
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

test('without a bot label route, dispatch fails closed before any write', async () => {
  const gh = fakeGitHub({ issues: [backlogIssue(11)], ownerRoute: false });
  gh.addLabel = async (n, l) => gh.calls.push(['addLabel', n, l]);
  const r = await dispatch(gh, DSLOT);
  assert.equal(r.status, 'blocked');
  assert.equal(r.reason, MISSING_LABEL_ROUTE);
  assert.deepEqual(writes(gh), []);
});

test('a label that lands but not from the bot is reported, not counted as dispatched', async () => {
  const gh = fakeGitHub({ issues: [backlogIssue(11)] });
  const route = gh.labelAsBot;
  gh.labelAsBot = async (n, l) => {
    await route(n, l);
    gh.state.links[`actor:${n}`] = owner;
  };
  const r = await dispatch(gh, DSLOT);
  assert.equal(r.status, 'failed');
  assert.match(r.reason, /not added by the bot/);
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
  gh.labelAsBot = async () => {
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
  gh.listComments = async (n) => (reads++, assert.equal(n, 11), list(n));
  assert.equal((await dispatch(gh, DSLOT)).status, 'busy');
  // Only the waiting issue's own comments, for its admission record.
  assert.equal(reads, 1);
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
    assert.equal(gh.state.comments[11][1].body, claimMarker(EARLIER, 11));
    assert.match(gh.state.comments[11][2].body, new RegExp(claimMarker(DSLOT, 11)));
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
  const gh2 = fakeGitHub({ issues: gh.state.issues, comments: gh.state.comments });
  const r = await produceBacklog(gh2, after.slot, after.candidates);
  assert.equal(r.status, 'complete');
  assert.equal(r.slot, SLOT);
  assert.equal(gh2.state.issues.length, 18);
  assert.deepEqual(
    gh2.calls.filter((c) => c[0] === 'createIssue').map((c) => c[1]),
    file.candidates.slice(7).map((c) => c.title),
  );
  // Once that slot is complete, the same file files nothing in any later run.
  const gh3 = fakeGitHub({ issues: gh2.state.issues, comments: gh2.state.comments });
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
    'backlog-2026-02-30T00',
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
    assert.match(g.reasons.join(), /source issue label|admission/);
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

// ---------- admission (native-bot-backlog-labelled -> MODE=admit) ----------
//
// Fixture events shaped like GitHub's issues.labeled webhook. They show the
// decisions admit makes; they are not a live webhook delivery.

const ASLOT = 'backlog-2026-10-30T18';
const CSLOT = 'dispatch-2026-10-31T0020';
const NOW = new Date('2026-10-31T00:30:00Z');
const LABEL_EVENT = 9001;
const fileIssue = (n, extra = {}) => {
  const title = `Backlog item ${n}`;
  const body = `Do it.\n\n${itemMarker(ASLOT, 3, `item-${n}`)}`;
  return {
    number: n,
    id: 50_000 + n,
    node_id: `I_node${n}`,
    repository_url: 'https://api.github.com/repos/guypod/carnival-evolution-20261028',
    state: 'open',
    user: bot,
    title,
    body,
    assignees: [],
    labels: [{ name: BACKLOG_LABEL }, { name: 'tessl' }],
    ...extra,
  };
};
const appComment = (body, created_at) => ({
  user: bot,
  performed_via_github_app: app,
  created_at,
  body,
});

/** A world where #40 is a valid, dispatched backlog issue awaiting admission. */
function admitWorld({ issue = fileIssue(40), comments, events, branch = false, prs = [] } = {}) {
  const n = issue.number;
  const fresh = fileIssue(n);
  const gh = fakeGitHub({
    autoJournal: false,
    issues: [issue],
    comments: {
      [n]: comments ?? [
        appComment(
          journalMarker(ASLOT, 3, n, contentDigest(fresh.title, fresh.body)),
          '2026-10-30T18:05:00Z',
        ),
        appComment(claimMarker(CSLOT, n), '2026-10-31T00:21:00Z'),
      ],
    },
    links: { [n]: prs },
  });
  gh.listEvents = async () => ({
    complete: true,
    items: events ?? [
      { id: 1, event: 'labeled', label: { name: BACKLOG_LABEL }, actor: bot },
      {
        id: LABEL_EVENT,
        event: 'labeled',
        label: { name: 'tessl' },
        actor: bot,
        created_at: '2026-10-31T00:21:30Z',
      },
    ],
  });
  gh.branchExists = async () => branch;
  gh.triggerImplementation = async (num, request) => gh.calls.push(['handoff', num, request]);
  return gh;
}
const labelledEvent = (issue = fileIssue(40), extra = {}) => [
  {
    event: 'issues',
    payload: {
      action: 'labeled',
      label: { name: 'tessl' },
      sender: bot,
      issue,
      repository: {
        id: REPOSITORY_ID,
        full_name: 'guypod/carnival-evolution-20261028',
        fork: false,
      },
      ...extra,
    },
  },
];
const handoffs = (gh) => gh.calls.filter((c) => c[0] === 'handoff');

test('admit: a valid bot-labelled backlog issue is recorded once, then handed off once', async () => {
  const gh = admitWorld();
  const r = await admit(gh, labelledEvent(), NOW);
  assert.equal(r.status, 'admitted', JSON.stringify(r));
  assert.equal(r.how, 'new');
  assert.equal(r.event, LABEL_EVENT);
  assert.deepEqual(handoffs(gh), [['handoff', 40, requestId(40, LABEL_EVENT)]]);
  // The admission record lands before the handoff, from the app.
  const order = gh.calls.filter((c) => ['comment', 'handoff'].includes(c[0])).map((c) => c[0]);
  assert.deepEqual(order, ['comment', 'handoff']);
  const records = readAdmissions(gh.state.comments[40]);
  assert.equal(records.length, 1);
  assert.equal(records[0].request, requestId(40, LABEL_EVENT));
});

test('admit: a retry after a crash reuses the record and the same request id', async () => {
  const gh = admitWorld();
  gh.triggerImplementation = async () => {
    throw new Error('socket hang up');
  };
  const first = await admit(gh, labelledEvent(), NOW);
  assert.equal(first.status, 'uncertain');
  const gh2 = admitWorld({ comments: gh.state.comments[40] });
  const again = await admit(gh2, labelledEvent(), NOW);
  assert.equal(again.status, 'admitted');
  assert.equal(again.how, 'resumed');
  assert.ok(!gh2.calls.some((c) => c[0] === 'comment'), 'no second record');
  assert.deepEqual(handoffs(gh2), [['handoff', 40, requestId(40, LABEL_EVENT)]]);
  // Once the run has made its branch, a further retry hands off nothing.
  const gh3 = admitWorld({ comments: gh.state.comments[40], branch: true });
  const done = await admit(gh3, labelledEvent(), NOW);
  assert.equal(done.how, 'already running');
  assert.deepEqual(handoffs(gh3), []);
});

test('admit: an uncertain record write is read back, and a missing record hands off nothing', async () => {
  let gh = admitWorld();
  const post = gh.comment;
  gh.comment = async (n, b) => {
    await post(n, b);
    throw new Error('timeout');
  };
  assert.equal((await admit(gh, labelledEvent(), NOW)).status, 'admitted');
  assert.equal(handoffs(gh).length, 1);
  gh = admitWorld();
  gh.comment = async () => {
    throw new Error('timeout');
  };
  const r = await admit(gh, labelledEvent(), NOW);
  assert.equal(r.status, 'uncertain');
  assert.deepEqual(handoffs(gh), []);
});

const refusedWith = async (gh, events, pattern) => {
  const r = await admit(gh, events, NOW);
  assert.notEqual(r.status, 'admitted', JSON.stringify(r));
  assert.match((r.reasons ?? []).join('; '), pattern);
  assert.deepEqual(handoffs(gh), [], 'no handoff');
  assert.ok(!gh.calls.some((c) => c[0] === 'comment'), 'no write');
  assert.ok(!gh.calls.some((c) => c[0] === 'addLabel'), 'no label');
};

test('admit refuses an event that is not the approved bot label route', async () => {
  const person = { id: 7, login: 'someone', type: 'User' };
  const cases = [
    [[], /exactly one event/],
    [[...labelledEvent(), ...labelledEvent()], /exactly one event/],
    [labelledEvent(fileIssue(40), { action: 'unlabeled' }), /not labeled/],
    [labelledEvent(fileIssue(40), { label: { name: 'bug' } }), /not tessl/],
    [labelledEvent(fileIssue(40), { sender: owner }), /sender/],
    [labelledEvent(fileIssue(40), { sender: { ...bot, type: 'User' } }), /sender/],
    [labelledEvent(fileIssue(40), { sender: { ...bot, id: 1 } }), /sender/],
    [labelledEvent(fileIssue(40, { user: person })), /author/],
    [labelledEvent(fileIssue(40, { state: 'closed' })), /not open/],
    [labelledEvent(fileIssue(40, { pull_request: {} })), /pull request/],
    [labelledEvent(fileIssue(40, { labels: [{ name: 'tessl' }] })), /auto backlog/],
    [labelledEvent(fileIssue(40, { node_id: undefined })), /node id/],
    [
      labelledEvent(fileIssue(40), {
        repository: { id: 1, full_name: 'x/y', fork: false },
      }),
      /another repository/,
    ],
    [
      labelledEvent(fileIssue(40), {
        repository: {
          id: REPOSITORY_ID,
          full_name: 'guypod/carnival-evolution-20261028',
          fork: true,
        },
      }),
      /fork/,
    ],
    [[{ event: 'issue_comment', payload: labelledEvent()[0].payload }], /not issues.labeled/],
  ];
  for (const [events, pattern] of cases) await refusedWith(admitWorld(), events, pattern);
});

test('admit refuses on fresh issue state: identity, author, closed, unlabelled, held, assigned', async () => {
  const person = { id: 7, login: 'someone', type: 'User' };
  const cases = [
    [fileIssue(40, { node_id: 'I_other' }), /identity/],
    [fileIssue(40, { id: 1 }), /identity/],
    [fileIssue(40, { repository_url: 'https://api.github.com/repos/x/y' }), /another repository/],
    [fileIssue(40, { user: person }), /author/],
    [fileIssue(40, { state: 'closed' }), /closed/],
    [fileIssue(40, { labels: [{ name: BACKLOG_LABEL }] }), /tessl label is gone/],
    [fileIssue(40, { labels: [{ name: 'tessl' }] }), /auto backlog/],
    [
      fileIssue(40, { labels: [{ name: BACKLOG_LABEL }, { name: 'tessl' }, { name: 'On Hold' }] }),
      /held/,
    ],
    [fileIssue(40, { assignees: [person] }), /assigned/],
    [fileIssue(40, { body: 'no marker' }), /backlog marker|content/],
  ];
  for (const [issue, pattern] of cases)
    await refusedWith(admitWorld({ issue }), labelledEvent(), pattern);
});

test('admit refuses edited content and a journal that is missing, forged or for another item', async () => {
  const fresh = fileIssue(40);
  const digest = contentDigest(fresh.title, fresh.body);
  const claim = appComment(claimMarker(CSLOT, 40), '2026-10-31T00:21:00Z');
  const cases = [
    [{ issue: fileIssue(40, { title: 'Edited title' }) }, /content changed/],
    [
      { issue: fileIssue(40, { body: `Edited.\n\n${itemMarker(ASLOT, 3, 'item-40')}` }) },
      /content changed/,
    ],
    [{ comments: [claim] }, /journal/],
    // The marker text without GitHub's app stamp is not the producer.
    [
      {
        comments: [
          { ...appComment(journalMarker(ASLOT, 3, 40, digest)), performed_via_github_app: null },
          claim,
        ],
      },
      /journal/,
    ],
    [{ comments: [appComment(journalMarker(ASLOT, 4, 40, digest)), claim] }, /another item/],
    [
      {
        comments: [
          appComment(journalMarker(ASLOT, 3, 40, digest)),
          appComment(journalMarker(ASLOT, 3, 40, digest)),
          claim,
        ],
      },
      /single producer journal/,
    ],
  ];
  for (const [world, pattern] of cases)
    await refusedWith(admitWorld(world), labelledEvent(), pattern);
});

test('admit refuses after a person comments, acts, or takes the issue back', async () => {
  const fresh = fileIssue(40);
  const journal = appComment(
    journalMarker(ASLOT, 3, 40, contentDigest(fresh.title, fresh.body)),
    '2026-10-30T18:05:00Z',
  );
  const claim = appComment(claimMarker(CSLOT, 40), '2026-10-31T00:21:00Z');
  const label = {
    id: LABEL_EVENT,
    event: 'labeled',
    label: { name: 'tessl' },
    actor: bot,
    created_at: '2026-10-31T00:21:30Z',
  };
  await refusedWith(
    admitWorld({ comments: [journal, claim, { user: owner, body: 'wait', created_at: 'z' }] }),
    labelledEvent(),
    /comment not from the app/,
  );
  // A comment by the bot account without the app stamp (another integration) counts as a person's.
  await refusedWith(
    admitWorld({ comments: [journal, claim, { user: bot, body: 'x', created_at: 'z' }] }),
    labelledEvent(),
    /comment not from the app/,
  );
  await refusedWith(
    admitWorld({ events: [{ id: 2, event: 'renamed', actor: owner }, label] }),
    labelledEvent(),
    /person acted/,
  );
  await refusedWith(
    admitWorld({
      events: [
        { ...label, id: 1 },
        { id: 2, event: 'unlabeled', label: { name: 'tessl' }, actor: bot },
        label,
      ],
    }),
    labelledEvent(),
    /taken back|exactly once/,
  );
});

test('admit refuses without a durable scheduled claim before the label, or with a shared slot', async () => {
  const fresh = fileIssue(40);
  const journal = appComment(
    journalMarker(ASLOT, 3, 40, contentDigest(fresh.title, fresh.body)),
    '2026-10-30T18:05:00Z',
  );
  await refusedWith(admitWorld({ comments: [journal] }), labelledEvent(), /no scheduled claim/);
  await refusedWith(
    admitWorld({
      comments: [journal, { user: bot, body: claimMarker(CSLOT, 40), created_at: 'a' }],
    }),
    labelledEvent(),
    /no scheduled claim/,
  );
  await refusedWith(
    admitWorld({ comments: [journal, appComment(claimMarker(CSLOT, 40), '2026-10-31T00:22:00Z')] }),
    labelledEvent(),
    /precede/,
  );
  await refusedWith(
    admitWorld({
      comments: [
        journal,
        appComment(claimMarker('dispatch-2026-11-02T0000', 40), '2026-10-31T00:21:00Z'),
      ],
    }),
    labelledEvent(),
    /future/,
  );
  const gh = admitWorld();
  gh.state.comments[41] = [appComment(claimMarker(CSLOT, 41), '2026-10-31T00:20:30Z')];
  await refusedWith(gh, labelledEvent(), /also claimed #41/);
});

test('admit refuses an existing run: a linked pull request, a branch, or an earlier admission', async () => {
  await refusedWith(
    admitWorld({ prs: [{ event: 'cross-referenced' }] }),
    labelledEvent(),
    /linked pull/,
  );
  await refusedWith(admitWorld({ branch: true }), labelledEvent(), /branch already exists/);
  const gh = admitWorld();
  gh.state.comments[40].push(
    appComment(
      admissionMarker({
        issue: 40,
        node: 'I_node40',
        slot: CSLOT,
        digest: 'f'.repeat(64),
        event: 1,
        request: requestId(40, 1),
      }),
      '2026-10-31T00:22:00Z',
    ),
  );
  await refusedWith(gh, labelledEvent(), /another label event/);
});

test('admit fails closed when any listing is incomplete or unknown', async () => {
  for (const breakIt of [
    (gh) => (gh.listComments = async () => ({ items: [], complete: false })),
    (gh) => (gh.listEvents = async () => ({ items: [], complete: false })),
    (gh) => (gh.failHistory = true),
    (gh) => (gh.linkedPullRequests = async () => ({ items: [], complete: false })),
    (gh) => (gh.branchExists = async () => undefined),
    (gh) => (gh.getIssue = async () => undefined),
  ]) {
    const gh = admitWorld();
    breakIt(gh);
    await refusedWith(gh, labelledEvent(), /incomplete|unknown|not read/);
  }
});

test('the producer journals every filed item with its digest, from the app, and recovers a missed one', async () => {
  const gh = fakeGitHub();
  assert.equal((await produceBacklog(gh, SLOT, candidates(18))).status, 'complete');
  for (const issue of gh.state.issues) {
    const j = readJournal(gh.state.comments[issue.number] ?? []);
    assert.equal(j.length, 1, `#${issue.number}`);
    assert.equal(j[0].digest, contentDigest(issue.title, issue.body));
  }
  // A crash between a create and its journal: the rerun journals it, once.
  const gh2 = fakeGitHub({ issues: gh.state.issues, comments: { ...gh.state.comments } });
  const first = gh.state.issues[0].number;
  delete gh2.state.comments[first];
  assert.equal((await produceBacklog(gh2, SLOT, candidates(18))).status, 'complete');
  assert.deepEqual(writes(gh2), [['comment', first]]);
  // The dispatcher's claim on a journaled item still dispatches it.
  assert.equal(readJournal(gh2.state.comments[first]).length, 1);
});

test('merge gate: a bot hand-off counts only with an admission for that exact label event', () => {
  const record = (event, node = 'I_node29') =>
    appComment(
      admissionMarker({
        issue: 29,
        node,
        slot: CSLOT,
        digest: 'f'.repeat(64),
        event,
        request: requestId(29, event),
      }),
      'x',
    );
  const base = { issue: { ...sourceIssue(), node_id: 'I_node29' } };
  const ok = mergeGate(
    snapshot({
      ...base,
      issueLabelActor: { complete: true, actor: bot, eventId: 77 },
      admissions: { complete: true, items: [record(77)] },
    }),
  );
  assert.equal(ok.merge, true, ok.reasons.join());
  for (const extra of [
    { admissions: { complete: true, items: [] } },
    { admissions: { complete: false, items: [record(77)] } },
    { admissions: { complete: true, items: [record(76)] } },
    { admissions: { complete: true, items: [record(77, 'I_other')] } },
    { admissions: { complete: true, items: [{ ...record(77), performed_via_github_app: null }] } },
    { admissions: { complete: true, items: [{ ...record(77), user: owner }] } },
  ]) {
    const g = mergeGate(
      snapshot({ ...base, issueLabelActor: { complete: true, actor: bot, eventId: 77 }, ...extra }),
    );
    assert.equal(g.merge, false, JSON.stringify(extra));
  }
  // The owner's own hand-off needs no admission record.
  assert.equal(mergeGate(snapshot()).merge, true);
});

test('dispatch skips a backlog item with no producer journal, since admission would refuse it', async () => {
  const gh = fakeGitHub({ issues: [backlogIssue(11), backlogIssue(12)] });
  gh.state.comments[11] = [];
  const r = await dispatch(gh, DSLOT);
  assert.equal(r.issue, 12);
});

test('a bot-labelled claim never admitted stops holding the queue after the grace, and is not relabelled', async () => {
  const waiting = backlogIssue(11, { labels: [{ name: BACKLOG_LABEL }, { name: 'tessl' }] });
  const labelAt = '2026-10-31T00:00:00Z';
  const world = (extra = {}) => {
    const gh = fakeGitHub({
      issues: [waiting, backlogIssue(12)],
      comments: { 11: [claimed(EARLIER, 11)] },
    });
    gh.state.links['events:11'] = [
      { event: 'labeled', label: { name: 'tessl' }, actor: bot, created_at: labelAt },
    ];
    Object.assign(gh.state.links, extra);
    gh.branchExists = async () => false;
    gh.triggerImplementation = async (n, req) => gh.calls.push(['handoff', n, req]);
    return gh;
  };
  // Inside the grace its admit run may still be queued.
  let gh = world();
  let r = await dispatch(gh, DSLOT, new Date('2026-10-31T00:30:00Z'));
  assert.deepEqual(r, { status: 'busy', waitingOn: 11 });
  // Admitted: its run is going, so it holds the queue whatever the time.
  gh = world();
  gh.state.comments[11].push({
    user: bot,
    performed_via_github_app: { id: BOT_APP_ID },
    body: admissionMarker({
      issue: 11,
      node: 'n',
      slot: EARLIER,
      digest: 'f'.repeat(64),
      event: 1,
      request: 'r',
    }),
  });
  r = await dispatch(gh, DSLOT, new Date('2026-10-31T00:50:00Z'));
  assert.deepEqual(r, { status: 'busy', waitingOn: 11 });
  // Age alone never frees it: with no run visible, it still holds the queue.
  r = await dispatch(gh, 'dispatch-2026-10-31T0400', new Date('2026-10-31T04:00:00Z'));
  assert.notEqual(r.status, 'dispatched');
  // Its own run ended without a pull request: the queue moves on.
  gh.state.runs.push({ id: 'run-11', status: 'failed', label: runLabel('r'), issue: 11 });
  r = await dispatch(gh, 'dispatch-2026-10-31T0400', new Date('2026-10-31T04:00:00Z'));
  assert.equal(r.status, 'dispatched');
  assert.equal(r.issue, 12);
  // Past the grace with no admission: the original admission is retried with
  // fresh guards, it refuses (no journal), so the next issue goes and #11 is left alone.
  gh = world();
  r = await dispatch(gh, DSLOT, new Date('2026-10-31T03:00:00Z'));
  assert.equal(r.status, 'dispatched');
  assert.equal(r.issue, 12);
  assert.ok(!writes(gh).some((c) => c[1] === 11));
  assert.ok(!gh.calls.some((c) => c[0] === 'handoff'));
  // The owner's own label is the owner trigger's run: it still holds the queue.
  gh = world({
    'events:11': [
      { event: 'labeled', label: { name: 'tessl' }, actor: owner, created_at: labelAt },
    ],
  });
  r = await dispatch(gh, DSLOT, new Date('2026-10-31T03:00:00Z'));
  assert.deepEqual(r, { status: 'busy', waitingOn: 11 });
});

test('dispatch skips an item whose content changed since its journal', async () => {
  const gh = fakeGitHub({ issues: [backlogIssue(11), backlogIssue(12)] });
  gh.state.issues.find((i) => i.number === 11).title = 'Edited by someone';
  const r = await dispatch(gh, DSLOT);
  assert.equal(r.issue, 12);
});

test('journal recovery certifies only the batch content still on the issue, never an edit', async () => {
  const gh = fakeGitHub();
  const file = candidates(18);
  assert.equal((await produceBacklog(gh, SLOT, file)).status, 'complete');
  const first = gh.state.issues[0];
  // Crash before the journal, then someone edits the issue keeping its marker.
  const comments = { ...gh.state.comments };
  delete comments[first.number];
  const edited = structuredClone(gh.state.issues);
  edited[0].title = 'Quietly edited';
  let gh2 = fakeGitHub({ issues: edited, comments, autoJournal: false });
  let r = await produceBacklog(gh2, SLOT, file);
  assert.equal(r.status, 'partial');
  assert.match(r.errors.join(), /cannot be confirmed/);
  assert.deepEqual(writes(gh2), []);
  // A shortened file cannot vouch for the original content either.
  gh2 = fakeGitHub({ issues: gh.state.issues, comments, autoJournal: false });
  r = await produceBacklog(gh2, SLOT, file.slice(0, 3));
  assert.equal(r.status, 'partial');
  // The original full file, with the issue unchanged, recovers it.
  gh2 = fakeGitHub({ issues: gh.state.issues, comments, autoJournal: false });
  r = await produceBacklog(gh2, SLOT, file);
  assert.equal(r.status, 'complete');
  assert.deepEqual(writes(gh2), [['comment', first.number]]);
});

test('a batch slot with an impossible month is refused, not a crash', () => {
  const r = readBatch(
    { slot: 'backlog-2026-00-10T00', candidates: [] },
    new Date('2026-10-31T12:00:00Z'),
  );
  assert.match(r.error, /calendar date/);
});

// ---------- actual execution state ----------
//
// A missing branch is not proof that no implementation is queued or running.
// admit and dispatch read Tessl's launch runs and fail closed.

const OWN = requestId(40, LABEL_EVENT);
const implRun = (id, status, extra = {}) => ({
  id,
  status,
  label: 'implement-github-issue',
  skill: 'tessl-labs/factory@0.6.0#implement-github-issue',
  ...extra,
});

test('admit defers, with only a deferral record and no handoff, while another implementation is queued or running', async () => {
  for (const phase of ['queued', 'starting', 'running']) {
    const gh = admitWorld();
    // An owner or manual run for #40, before any branch exists.
    gh.state.runs.push(implRun('foreign-1', 'pending', { phase, issue: 40 }));
    const r = await admit(gh, labelledEvent(), NOW);
    assert.equal(r.status, 'deferred', JSON.stringify(r));
    assert.match(r.reasons.join(), /foreign-1/);
    assert.deepEqual(handoffs(gh), []);
    assert.deepEqual(readAdmissions(gh.state.comments[40]), [], 'no admission record');
    assert.equal(readDeferrals(gh.state.comments[40]).length, 1, 'one deferral record');
  }
  // A pending run in this repository whose issue cannot be told still defers.
  const gh = admitWorld();
  gh.state.runs.push(implRun('foreign-2', 'pending', { label: 'implement-github-issue other' }));
  assert.equal((await admit(gh, labelledEvent(), NOW)).status, 'deferred');
  assert.deepEqual(handoffs(gh), []);
});

test('admit refuses when any earlier implementation run exists for the issue, whatever its outcome', async () => {
  for (const status of ['completed', 'failed', 'cancelled']) {
    const gh = admitWorld();
    gh.state.runs.push(implRun('foreign-3', status, { issue: 40 }));
    await refusedWith(gh, labelledEvent(), /earlier implementation run foreign-3/);
  }
});

test('admit fails closed when the run listing is incomplete or denied', async () => {
  const gh = admitWorld();
  gh.failRuns = true;
  await refusedWith(gh, labelledEvent(), /implementation runs incomplete/);
});

test('admit: its own stable request already queued or running is reconciled, never re-triggered', async () => {
  const gh = admitWorld();
  gh.triggerImplementation = async () => {
    throw new Error('socket hang up');
  };
  assert.equal((await admit(gh, labelledEvent(), NOW)).status, 'uncertain');
  // The uncertain handoff did land: its run is queued under the same key.
  const gh2 = admitWorld({ comments: gh.state.comments[40] });
  gh2.state.runs.push(implRun('own-1', 'pending', { label: runLabel(OWN), issue: 40 }));
  const r = await admit(gh2, labelledEvent(), NOW);
  assert.equal(r.status, 'admitted');
  assert.equal(r.how, 'already running');
  assert.equal(r.request, OWN);
  assert.deepEqual(handoffs(gh2), []);
  assert.ok(!gh2.calls.some((c) => c[0] === 'comment'), 'no second record');
});

test('admit: its own run that already ended is never restarted, success or failure', async () => {
  for (const status of ['completed', 'failed', 'cancelled']) {
    const gh = admitWorld();
    gh.state.runs.push(implRun('own-2', status, { label: runLabel(OWN), issue: 40 }));
    await refusedWith(gh, labelledEvent(), /own run own-2 already ended/);
  }
});

test('admit with no conflicting run hands off once under its stable key, after reading runs', async () => {
  const gh = admitWorld();
  // Another repository's or another action's runs are not conflicts.
  gh.state.runs.push({ id: 's', status: 'pending', label: 'shepherd', skill: 'x#shepherd' });
  const r = await admit(gh, labelledEvent(), NOW);
  assert.equal(r.status, 'admitted');
  assert.deepEqual(handoffs(gh), [['handoff', 40, OWN]]);
  const order = gh.calls
    .filter((c) => ['launchRuns', 'comment', 'handoff'].includes(c[0]))
    .map((c) => c[0]);
  assert.deepEqual(order, ['launchRuns', 'launchRuns', 'comment', 'handoff']);
});

test('executionState: classification is explicit and fails closed', () => {
  const ok = (items) => ({ complete: true, items });
  assert.equal(executionState(ok([]), { complete: false, items: [] }, OWN).state, 'unknown');
  assert.equal(executionState(ok([]), ok([]), OWN).state, 'clear');
  const own = implRun('o', 'pending', { label: runLabel(OWN) });
  assert.equal(executionState(ok([own]), ok([own]), OWN).state, 'own-pending');
  // Its own pending run wins over a foreign one, so a retry never stalls on itself.
  assert.equal(
    executionState(ok([own, implRun('f', 'pending')]), ok([own]), OWN).state,
    'own-pending',
  );
});

test('dispatch claims nothing new while an implementation or admission run is pending, however old', async () => {
  for (const run of [
    implRun('impl', 'pending'),
    { id: 'adm', status: 'pending', label: 'native-bot-backlog-labelled #11', skill: 'x' },
  ]) {
    const gh = fakeGitHub({ issues: [backlogIssue(11)] });
    gh.state.runs.push(run);
    const r = await dispatch(gh, DSLOT, new Date('2026-11-02T00:00:00Z'));
    assert.equal(r.status, 'busy', JSON.stringify(r));
    assert.deepEqual(writes(gh), []);
  }
  const gh = fakeGitHub({ issues: [backlogIssue(11)] });
  gh.failRuns = true;
  assert.equal((await dispatch(gh, DSLOT)).status, 'blocked');
  assert.deepEqual(writes(gh), []);
});

test('a labelled claim whose admit run is still queued past the admit grace keeps holding the queue', async () => {
  const waiting = backlogIssue(11, { labels: [{ name: BACKLOG_LABEL }, { name: 'tessl' }] });
  const gh = fakeGitHub({
    issues: [waiting, backlogIssue(12)],
    comments: { 11: [claimed(EARLIER, 11)] },
  });
  gh.state.links['events:11'] = [
    { event: 'labeled', label: { name: 'tessl' }, actor: bot, created_at: '2026-10-31T00:00:00Z' },
  ];
  gh.state.runs.push({ id: 'adm', status: 'pending', label: 'native-bot-backlog-labelled #11' });
  const r = await dispatch(gh, DSLOT, new Date('2026-10-31T06:00:00Z'));
  assert.deepEqual(r, { status: 'busy', waitingOn: 11 });
  assert.deepEqual(writes(gh), []);
});

test('an admitted claim with no visible run after the run grace is blocked for a person, not idle', async () => {
  const waiting = backlogIssue(11, { labels: [{ name: BACKLOG_LABEL }, { name: 'tessl' }] });
  const gh = fakeGitHub({
    issues: [waiting, backlogIssue(12)],
    comments: { 11: [claimed(EARLIER, 11)] },
  });
  gh.state.comments[11].push({
    user: bot,
    performed_via_github_app: { id: BOT_APP_ID },
    created_at: '2026-10-31T00:00:00Z',
    body: admissionMarker({
      issue: 11,
      node: 'n',
      slot: EARLIER,
      digest: 'f'.repeat(64),
      event: 1,
      request: 'r',
    }),
  });
  const r = await dispatch(gh, DSLOT, new Date('2026-10-31T05:00:00Z'));
  assert.equal(r.status, 'blocked');
  assert.match(r.reason, /no run for r is visible/);
  assert.deepEqual(writes(gh), []);
});

test('launchRuns reads every page, keeps only this repository, and fails closed on a bad page', () => {
  const repo = 'https://github.com/guypod/carnival-evolution-20261028';
  const run = (id, repoUrl = repo) => ({
    id,
    type: 'launch-run',
    attributes: {
      status: 'pending',
      label: 'implement-github-issue',
      config: { repoUrl, skillRef: 'tessl-labs/factory@0.6.0#implement-github-issue' },
      liveness: { phase: 'queued' },
    },
  });
  const paths = [];
  const pagesOf = {
    1: {
      links: { next: 'https://api.tessl.io/experimental/launch-runs?page%5Bafter%5D=c2' },
      data: [run('a'), run('x', 'https://github.com/other/repo')],
    },
    2: { links: { next: null }, data: [run('b')] },
  };
  const call = (path) => (paths.push(path), JSON.stringify(pagesOf[paths.length]));
  const r = launchRuns({ issue: 40 }, call);
  assert.equal(r.complete, true);
  assert.deepEqual(
    r.items.map((i) => i.id),
    ['a', 'b'],
  );
  assert.match(decodeURIComponent(paths[0]), /filter\[linkType\]=github_issue/);
  assert.ok(decodeURIComponent(paths[0]).includes(`filter[linkValue]=${issueUrl(40)}`));
  assert.equal(paths[1], '/experimental/launch-runs?page%5Bafter%5D=c2');
  // A failing or malformed page makes the whole listing incomplete.
  const failing = () => {
    throw new Error('HTTP 403');
  };
  assert.deepEqual(launchRuns({ status: 'pending' }, failing), { items: [], complete: false });
  assert.equal(launchRuns({ status: 'pending' }, () => '{"error":{}}').complete, false);
});

// ---------- deferred admission recovery ----------
//
// An admission deferred by another pending run, or by a read that failed, is
// still owed. A later dispatch retries the original admission, keyed to the
// original label event, with every guard read fresh. It never relabels.

/** #40 dispatched and bot-labelled at 00:21, with dispatch now two hours later. */
const LATER = new Date('2026-10-31T02:30:00Z');
const LSLOT = 'dispatch-2026-10-31T0220';
function owedWorld() {
  const gh = admitWorld();
  gh.wasLabelledTessl = async () => true;
  gh.state.issues.push(fileIssue(41, { labels: [{ name: BACKLOG_LABEL }] }));
  return gh;
}

test('a deferred admission is retried by a later dispatch once the foreign run ends, without relabel', async () => {
  const gh = owedWorld();
  gh.state.runs.push(implRun('foreign-1', 'pending', { issue: 7 }));
  assert.equal((await admit(gh, labelledEvent(), NOW)).status, 'deferred');
  assert.deepEqual(handoffs(gh), []);
  // The foreign run ends. Two hours later, no new event arrives.
  gh.state.runs[0].status = 'completed';
  const r = await dispatch(gh, LSLOT, LATER);
  assert.equal(r.status, 'busy', JSON.stringify(r));
  assert.equal(r.retried.status, 'admitted');
  assert.equal(r.retried.request, OWN, 'the original label event keys the request');
  assert.deepEqual(handoffs(gh), [['handoff', 40, OWN]]);
  assert.ok(!gh.calls.some((c) => c[0] === 'addLabel'), 'never relabelled');
  assert.ok(!gh.calls.some((c) => c[0] === 'comment' && c[1] === 41), 'no second issue is claimed');
  // Repeated dispatches: the run is now visible under its own key, so nothing repeats.
  gh.state.runs.push(implRun('own-1', 'pending', { label: runLabel(OWN), issue: 40 }));
  for (let i = 0; i < 3; i++) {
    const again = await dispatch(gh, LSLOT, LATER);
    assert.equal(again.status, 'busy');
  }
  assert.equal(handoffs(gh).length, 1, 'one handoff');
  assert.equal(readAdmissions(gh.state.comments[40]).length, 1, 'one admission record');
  assert.equal(readDeferrals(gh.state.comments[40]).length, 1, 'one deferral record');
});

test('a retry while the foreign run is still pending stays owed and writes nothing new', async () => {
  const gh = owedWorld();
  gh.state.runs.push(implRun('foreign-1', 'pending', { issue: 7 }));
  await admit(gh, labelledEvent(), NOW);
  const before = gh.calls.filter((c) => c[0] === 'comment').length;
  for (let i = 0; i < 3; i++) {
    const r = await dispatch(gh, LSLOT, LATER);
    assert.equal(r.status, 'busy', JSON.stringify(r));
  }
  assert.equal(gh.calls.filter((c) => c[0] === 'comment').length, before, 'no new writes');
  assert.deepEqual(handoffs(gh), []);
});

test('incomplete reads at admission leave it owed, and a later dispatch recovers it', async () => {
  const gh = owedWorld();
  const listEvents = gh.listEvents;
  // The run listing fails at admission: deferred, not refused.
  gh.failRuns = true;
  const r = await admit(gh, labelledEvent(), NOW);
  assert.equal(r.status, 'deferred', JSON.stringify(r));
  assert.deepEqual(handoffs(gh), []);
  // An unreadable comment list is also owed, not refused.
  gh.failRuns = false;
  const listComments = gh.listComments;
  gh.listComments = async () => ({ complete: false, items: [] });
  assert.equal((await admit(gh, labelledEvent(), NOW)).status, 'deferred');
  gh.listComments = listComments;
  gh.listEvents = listEvents;
  // The deferral record was not written on a failed read, so dispatch sees a
  // bot label with no admission and no record: it waits out the grace, then
  // moves on. With the record (from a pending-run deferral) it retries.
  gh.state.runs.push(implRun('foreign-1', 'pending', { issue: 7 }));
  await admit(gh, labelledEvent(), NOW);
  gh.state.runs = [];
  gh.failRuns = true;
  assert.equal((await dispatch(gh, LSLOT, LATER)).status, 'blocked', 'unknown runs block');
  gh.failRuns = false;
  const ok = await dispatch(gh, LSLOT, LATER);
  assert.equal(ok.retried?.status, 'admitted', JSON.stringify(ok));
  assert.equal(handoffs(gh).length, 1);
});

test('a person taking the issue back after a deferral is never resumed', async () => {
  for (const takeBack of ['unlabel', 'hold', 'assign', 'comment']) {
    const gh = owedWorld();
    gh.state.runs.push(implRun('foreign-1', 'pending', { issue: 7 }));
    await admit(gh, labelledEvent(), NOW);
    gh.state.runs = [];
    const issue = gh.state.issues.find((i) => i.number === 40);
    if (takeBack === 'hold') issue.labels.push({ name: 'held' });
    if (takeBack === 'assign') issue.assignees = [owner];
    if (takeBack === 'comment') gh.state.comments[40].push({ user: owner, body: 'wait' });
    if (takeBack === 'unlabel') {
      issue.labels = issue.labels.filter((l) => l.name !== 'tessl');
    }
    await dispatch(gh, LSLOT, LATER);
    assert.deepEqual(handoffs(gh), [], takeBack);
    assert.equal(readAdmissions(gh.state.comments[40]).length, 0, takeBack);
  }
});

test('merge gate: a failed check superseded by a successful rerun on the same head no longer blocks', () => {
  const base = snapshot();
  base.checks.items = base.checks.items.filter((c) => c.name !== 'check');
  const failed = ci({ id: 1, conclusion: 'failure' });
  const rerun = ci({ id: 2 });
  const s = { ...base, checks: { complete: true, items: [...base.checks.items, failed, rerun] } };
  assert.equal(mergeGate(s).merge, true, JSON.stringify(mergeGate(s).reasons));
  // The newest run is the one that counts: a later failure still blocks.
  const worse = ci({ id: 3, conclusion: 'failure' });
  const t = { ...base, checks: { complete: true, items: [...base.checks.items, rerun, worse] } };
  assert.equal(mergeGate(t).merge, false);
});

test('a read failure at admission alone, with no deferral record, is retried after the grace', async () => {
  const gh = owedWorld();
  gh.failRuns = true;
  assert.equal((await admit(gh, labelledEvent(), NOW)).status, 'deferred');
  assert.equal(readDeferrals(gh.state.comments[40]).length, 0, 'the failed read wrote nothing');
  gh.failRuns = false;
  // Within the 90-minute grace the admit run may still be in flight: busy, no retry.
  const early = await dispatch(gh, LSLOT, new Date('2026-10-31T01:00:00Z'));
  assert.equal(early.status, 'busy');
  assert.deepEqual(handoffs(gh), []);
  const r = await dispatch(gh, LSLOT, LATER);
  assert.equal(r.retried?.status, 'admitted', JSON.stringify(r));
  assert.deepEqual(handoffs(gh), [['handoff', 40, OWN]]);
  assert.ok(!gh.calls.some((c) => c[0] === 'addLabel'), 'never relabelled');
});
