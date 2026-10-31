// The native creative intake (issue #425): a six-hour backlog producer, a
// twenty-minute dispatcher and an evolution-only merge gate.
//
//   backlog   at 00:00, 06:00, 12:00 and 18:00 Europe/London, file exactly 18
//             distinct enhancement issues labelled BACKLOG_LABEL, never tessl.
//   dispatch  every 20 minutes, label exactly one eligible backlog issue tessl
//             and admit implement-github-issue for it through the supported
//             action route with a stable request id.
//   merge     in the same twenty-minute run, squash-merge a Tessl pull request
//             only on a trusted reviewer pass and passing CI for its exact
//             current head, pinned to that head's SHA.
//
// Native writes come from tessl-app[bot] (BOT_ID). The github-issue-labelled
// trigger accepts only the owner (sender id OWNER_ID, type User), so a label
// the dispatcher adds starts nothing by webhook; the run starts only through
// `tessl action trigger`. That route is the single admission, so nothing runs
// twice. The webhook guard is not broadened.
//
// The record is GitHub itself, append-only: each backlog issue carries an item
// marker naming its slot, index and scope, and each dispatch leaves a claim
// comment naming its slot. A crashed or retried run re-reads those markers
// before any write, so it resumes rather than repeats.
//
// Everything here is plain functions over an adapter, tested in
// native.test.mjs with fixtures. The command line at the bottom wires them to
// gh and tessl. scripts/factory/decide.ts is the original lab's read-only
// readiness helper and is not used or changed here.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export const REPOSITORY = 'guypod/carnival-evolution-20261028';
export const REPOSITORY_ID = 1437265009;
export const OWNER_ID = 1106394;
export const REVIEWER_ID = 325629464;
export const REVIEWER_LOGIN = 'tessl-reviewer[bot]';
export const BOT_ID = 295179765;
export const BOT_LOGIN = 'tessl-app[bot]';
export const CI_APP_ID = 15368;
export const CI_CHECK = 'check';
export const BACKLOG_LABEL = 'auto backlog';
export const TRIGGER_LABEL = 'tessl';
export const BATCH_SIZE = 18;
export const BACKLOG_HOURS = [0, 6, 12, 18];
export const DISPATCH_MINUTES = 20;
export const TIMEZONE = 'Europe/London';
// Labels a person adds to keep an item out of dispatch.
export const HOLD_LABELS = ['held', 'manual', 'on hold', 'do not dispatch'];
export const WRITER_KEY = 'carnival-app-writer';
export const PR_WRITING_INSTRUCTIONS =
  'Before creating or editing a pull request description, read docs/pr-writing.md and apply its cold-reader pass. This changes presentation only; preserve required evidence, markers, scope and all existing checks.';

// ---------- time slots ----------

/** The wall-clock parts of `now` in Europe/London. */
export function londonParts(now) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: TIMEZONE,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

const pad = (n) => String(n).padStart(2, '0');

/** The backlog slot `now` falls in: the latest London 00, 06, 12 or 18 hour. */
export function backlogSlot(now) {
  const { date, hour } = londonParts(now);
  const start = [...BACKLOG_HOURS].reverse().find((h) => h <= hour);
  return `backlog-${date}T${pad(start)}`;
}

/** The twenty-minute dispatch slot `now` falls in, in London wall time. */
export function dispatchSlot(now) {
  const { date, hour, minute } = londonParts(now);
  return `dispatch-${date}T${pad(hour)}${pad(minute - (minute % DISPATCH_MINUTES))}`;
}

// ---------- markers ----------

const ITEM_RE = /<!-- carnival-backlog:item:v1 slot=(\S+) index=(\d+) scope=(\S+) -->/;
const CLAIM_RE = /<!-- carnival-dispatch:claim:v1 slot=(\S+) issue=(\d+) -->/;

export const itemMarker = (slot, index, scope) =>
  `<!-- carnival-backlog:item:v1 slot=${slot} index=${index} scope=${scope} -->`;
export const claimMarker = (slot, issue) =>
  `<!-- carnival-dispatch:claim:v1 slot=${slot} issue=${issue} -->`;

/** The item marker of an issue, honoured only on an issue the bot opened. */
export function readItem(issue) {
  if (issue.user?.id !== BOT_ID) return null;
  const m = ITEM_RE.exec(issue.body ?? '');
  return m ? { slot: m[1], index: Number(m[2]), scope: m[3] } : null;
}

/** Claim markers in the bot's own comments; anyone else's text is ignored. */
export function readClaims(comments) {
  return comments
    .filter((c) => c.user?.id === BOT_ID)
    .map((c) => CLAIM_RE.exec(c.body ?? ''))
    .filter(Boolean)
    .map((m) => ({ slot: m[1], issue: Number(m[2]) }));
}

/** A title reduced to the words that carry its meaning, for duplicate checks. */
export function normalTitle(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** A scope key: lowercase words joined by dashes, such as water-cannon-aim-feedback. */
export function scopeKey(scope) {
  return normalTitle(scope).replace(/ /g, '-');
}

const labelNames = (issue) => (issue.labels ?? []).map((l) => (typeof l === 'string' ? l : l.name));

// ---------- backlog producer ----------

/**
 * Validate a producer's proposed items against itself and every existing
 * issue, open or closed. Returns the problems; empty means usable.
 */
export function validateCandidates(candidates, existing) {
  const errors = [];
  if (!Array.isArray(candidates)) return ['candidates must be an array'];
  const titles = new Map();
  const scopes = new Map();
  for (const issue of existing) {
    titles.set(normalTitle(issue.title ?? ''), issue.number);
    const item = readItem(issue);
    if (item) scopes.set(item.scope, issue.number);
  }
  candidates.forEach((c, i) => {
    if (!c || typeof c.title !== 'string' || !c.title.trim()) errors.push(`item ${i}: no title`);
    if (!c || typeof c.scope !== 'string' || !scopeKey(c.scope)) errors.push(`item ${i}: no scope`);
    if (!c || typeof c.body !== 'string' || !c.body.includes('Done when'))
      errors.push(`item ${i}: body needs a "Done when" list`);
    if (!c || typeof c.evidence !== 'string' || !c.evidence.trim())
      errors.push(`item ${i}: no evidence`);
    if (errors.length) return;
    if ((c.labels ?? []).includes(TRIGGER_LABEL)) errors.push(`item ${i}: must not carry tessl`);
    const t = normalTitle(c.title);
    const s = scopeKey(c.scope);
    if (titles.has(t)) errors.push(`item ${i}: title duplicates #${titles.get(t)}`);
    if (scopes.has(s)) errors.push(`item ${i}: scope ${s} duplicates #${scopes.get(s)}`);
    titles.set(t, `item ${i}`);
    scopes.set(s, `item ${i}`);
  });
  return errors;
}

/** The issue body for one backlog item, ending with its durable marker. */
export function itemBody(slot, index, candidate) {
  return [
    candidate.body.trim(),
    '',
    `Evidence: ${candidate.evidence.trim()}`,
    '',
    `Filed by the native backlog producer for slot \`${slot}\`, item ${index + 1} of ${BATCH_SIZE}. It waits in \`${BACKLOG_LABEL}\` until the dispatcher hands it to Tessl.`,
    '',
    itemMarker(slot, index, scopeKey(candidate.scope)),
  ].join('\n');
}

/** Which of the slot's 18 indexes already exist, by marker. */
export function slotProgress(slot, issues) {
  const done = new Map();
  for (const issue of issues) {
    const item = readItem(issue);
    if (item?.slot === slot && !done.has(item.index)) done.set(item.index, issue.number);
  }
  return done;
}

/**
 * File the slot's backlog. Candidates are matched to indexes in order. A
 * failed or uncertain create is reconciled by re-reading the marker before
 * moving on, so a retry never files an index twice.
 */
export async function produceBacklog(adapter, slot, candidates) {
  const listed = await adapter.listIssues({ state: 'all' });
  if (!listed.complete) return { status: 'blocked', reason: 'issue listing incomplete' };
  const done = slotProgress(slot, listed.items);
  const todo = [];
  for (let i = 0; i < BATCH_SIZE; i++) if (!done.has(i)) todo.push(i);
  if (!todo.length) return { status: 'complete', slot, issues: [...done.values()], remaining: 0 };
  const pool = candidates.slice(0, todo.length);
  const errors = validateCandidates(pool, listed.items);
  if (pool.length < todo.length) errors.push(`need ${todo.length} candidates, got ${pool.length}`);
  if (errors.length) {
    return { status: 'partial', slot, issues: [...done.values()], remaining: todo.length, errors };
  }
  await adapter.ensureLabel(BACKLOG_LABEL);
  for (const [k, index] of todo.entries()) {
    const c = pool[k];
    const issue = {
      title: c.title.trim(),
      body: itemBody(slot, index, c),
      labels: [BACKLOG_LABEL],
    };
    let number;
    try {
      ({ number } = await adapter.createIssue(issue));
    } catch {
      // Uncertain: the create may have landed. Read before deciding.
      const again = await adapter.listIssues({ state: 'all' });
      number = again.complete ? slotProgress(slot, again.items).get(index) : undefined;
      if (number === undefined) {
        const remaining = BATCH_SIZE - done.size;
        return {
          status: 'partial',
          slot,
          issues: [...done.values()],
          remaining,
          errors: [`create of item ${index} is uncertain or failed; retry the slot`],
        };
      }
    }
    done.set(index, number);
  }
  return { status: 'complete', slot, issues: [...done.values()], remaining: 0 };
}

// ---------- dispatcher ----------

/** Why an open backlog issue cannot be dispatched, or null when it can. */
export function ineligible(issue, comments, linkedPrs) {
  if (issue.state !== 'open' && issue.state !== 'OPEN') return 'closed';
  if (issue.pull_request) return 'pull request';
  if (!readItem(issue)) return 'no backlog marker from the bot';
  const labels = labelNames(issue);
  if (!labels.includes(BACKLOG_LABEL)) return 'not in the backlog';
  if (labels.includes(TRIGGER_LABEL)) return 'already labelled tessl';
  if (labels.some((l) => HOLD_LABELS.includes(l.toLowerCase()))) return 'held';
  if ((issue.assignees ?? []).length) return 'assigned to a person';
  if (readClaims(comments).length) return 'already claimed';
  // A person commented: they may be steering it, so it waits for them.
  if (comments.some((c) => c.user?.id !== BOT_ID)) return 'has a person comment';
  if (linkedPrs.length) return 'has a linked pull request';
  return null;
}

export const requestId = (slot, issue) => `native-${slot}-issue-${issue}`;

/** The exact `tessl action trigger` arguments for one dispatch. */
export function triggerArgs(slot, issue) {
  return [
    'action',
    'trigger',
    'implement-github-issue',
    '--request-id',
    requestId(slot, issue),
    '--input',
    `GITHUB_ISSUE_NUMBER=${issue}`,
    '--input',
    `GITHUB_ISSUE_LABEL=${TRIGGER_LABEL}`,
    '--instructions',
    PR_WRITING_INSTRUCTIONS,
    '--concurrency-key',
    `${WRITER_KEY}=1`,
    '--concurrency-mode',
    'queue',
    '--json',
  ];
}

/**
 * Dispatch one backlog issue for the slot. The claim comment is written
 * first, then the label, then the admission; a retry finds the claim and
 * completes the same issue's remaining steps, so a slot never dispatches two.
 */
export async function dispatch(adapter, slot) {
  const listed = await adapter.listIssues({ state: 'open', label: BACKLOG_LABEL });
  if (!listed.complete) return { status: 'blocked', reason: 'backlog listing incomplete' };
  const sorted = [...listed.items]
    .filter((i) => !i.pull_request)
    .sort(
      (a, b) =>
        (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0) ||
        a.number - b.number,
    );
  const looked = [];
  for (const issue of sorted) {
    const comments = await adapter.listComments(issue.number);
    if (!comments.complete)
      return { status: 'blocked', reason: `comments of #${issue.number} incomplete` };
    looked.push({ issue, comments: comments.items });
  }
  // Resume a claim for this slot before anything else.
  const mine = looked.find(({ comments }) => readClaims(comments).some((c) => c.slot === slot));
  if (mine) return finish(adapter, slot, mine.issue, 'resumed');
  // A claim from an earlier slot whose issue is still waiting for its run to
  // open a pull request means the queue is busy: dispatch nothing more.
  for (const { issue, comments } of looked) {
    if (!readClaims(comments).length || !labelNames(issue).includes(TRIGGER_LABEL)) continue;
    const prs = await adapter.linkedPullRequests(issue.number);
    if (!prs.complete) return { status: 'blocked', reason: `links of #${issue.number} incomplete` };
    if (!prs.items.length) return { status: 'busy', waitingOn: issue.number };
  }
  for (const { issue, comments } of looked) {
    if (ineligible(issue, comments, [])) continue;
    const prs = await adapter.linkedPullRequests(issue.number);
    if (!prs.complete) return { status: 'blocked', reason: `links of #${issue.number} incomplete` };
    if (ineligible(issue, comments, prs.items)) continue;
    const fresh = await adapter.getIssue(issue.number);
    if (ineligible(fresh, comments, prs.items)) continue;
    await adapter.comment(
      issue.number,
      `Dispatcher slot \`${slot}\` hands this to Tessl.\n\n${claimMarker(slot, issue.number)}\n<!-- tessl-factory -->`,
    );
    return finish(adapter, slot, fresh, 'claimed');
  }
  return { status: 'idle', reason: 'no eligible backlog issue' };
}

async function finish(adapter, slot, issue, how) {
  const fresh = await adapter.getIssue(issue.number);
  if (fresh.state !== 'open' && fresh.state !== 'OPEN') {
    return { status: 'stopped', issue: issue.number, reason: 'closed after its claim' };
  }
  if (!labelNames(fresh).includes(TRIGGER_LABEL)) {
    if (how === 'resumed' && (await adapter.wasLabelledTessl(issue.number))) {
      // Labelled once and since removed: a person took it back.
      return { status: 'stopped', issue: issue.number, reason: 'taken back' };
    }
    await adapter.addLabel(issue.number, TRIGGER_LABEL);
  }
  // The request id is stable per slot and issue, so a repeat starts no run.
  const run = await adapter.triggerAction(triggerArgs(slot, issue.number));
  return {
    status: 'dispatched',
    how,
    issue: issue.number,
    requestId: requestId(slot, issue.number),
    run,
  };
}

// ---------- merge gate ----------

const RUN_RE = /<!-- tessl-code-review:workflow-run:v1 id=([0-9a-f-]{36}) -->/g;
const RESULT_RE =
  /<!-- tessl-code-review:result:v1 approved=(true|false) findings-total=(\d+) findings-unplaced=(\d+) -->/g;

/** The structured result of a trusted review, or why it has none. */
export function readReview(review) {
  if (review.user?.id !== REVIEWER_ID || review.user?.login !== REVIEWER_LOGIN)
    return { error: 'not the trusted reviewer' };
  if (review.user?.type !== 'Bot') return { error: 'reviewer is not a bot account' };
  const body = review.body ?? '';
  const runs = [...body.matchAll(RUN_RE)];
  const results = [...body.matchAll(RESULT_RE)];
  if (runs.length !== 1 || results.length !== 1) return { error: 'markers missing or repeated' };
  const [, approved, total, unplaced] = results[0];
  if (Number(unplaced) > Number(total)) return { error: 'malformed finding counts' };
  return {
    runId: runs[0][1],
    approved: approved === 'true',
    findingsTotal: Number(total),
    findingsUnplaced: Number(unplaced),
  };
}

/**
 * Whether a pull request may be squash-merged now, from a snapshot of its
 * current state. Every listing must be complete. Returns { merge, reasons }.
 */
export function mergeGate(s) {
  const reasons = [];
  const pr = s.pr;
  const head = pr?.head?.sha;
  if (!s.writerKeyHeld) reasons.push('not running under the writer key');
  if (!pr || pr.state !== 'open') reasons.push('pull request is not open');
  if (pr?.draft) reasons.push('pull request is a draft');
  if (pr?.merged) reasons.push('already merged');
  if (pr?.base?.ref !== 'main' || pr?.base?.repo?.id !== REPOSITORY_ID)
    reasons.push('base is not main of this repository');
  if (pr?.head?.repo?.id !== REPOSITORY_ID) reasons.push('head is a fork or another repository');
  if (!/^tessl\/issue-\d+$/.test(pr?.head?.ref ?? ''))
    reasons.push('head is not a tessl issue branch');
  if (pr?.user?.id !== BOT_ID) reasons.push("pull request is not the factory bot's");
  if (!labelNames(pr ?? {}).includes(TRIGGER_LABEL))
    reasons.push('pull request is not labelled tessl');
  if (!/^Closes #\d+$/m.test(pr?.body ?? '')) reasons.push('no Closes line');
  if (!/^[0-9a-f]{40}$/.test(head ?? '')) reasons.push('no head sha');
  if (!s.reviews?.complete) reasons.push('review listing incomplete');
  if (!s.checks?.complete) reasons.push('check listing incomplete');
  if (reasons.length) return { merge: false, reasons };

  const reviews = [...s.reviews.items].sort(
    (a, b) => (a.submitted_at < b.submitted_at ? -1 : 1) || a.id - b.id,
  );
  // A person's open request for changes blocks until they submit a later review.
  const latestByUser = new Map();
  for (const r of reviews) if (r.state !== 'PENDING') latestByUser.set(r.user?.id, r);
  for (const r of latestByUser.values()) {
    if (r.state === 'CHANGES_REQUESTED') reasons.push(`changes requested by ${r.user?.login}`);
  }
  const trusted = reviews.filter((r) => r.user?.id === REVIEWER_ID);
  const latest = trusted.at(-1);
  if (!latest) reasons.push('no trusted review');
  else if (latest.commit_id !== head) reasons.push('newest trusted review is for an older head');
  else if (latest.state === 'DISMISSED') reasons.push('newest trusted review was dismissed');
  else if (latest.state !== 'COMMENTED' && latest.state !== 'APPROVED')
    reasons.push(`newest trusted review is ${latest.state}`);
  else {
    const result = readReview(latest);
    if (result.error) reasons.push(`trusted review: ${result.error}`);
    else if (!result.approved) reasons.push('trusted review has blocking findings');
  }

  const runs = s.checks.items.filter((c) => c.head_sha === head);
  const ci = runs.filter((c) => c.name === CI_CHECK && c.app?.id === CI_APP_ID);
  if (!ci.length) reasons.push('no CI check on the head');
  else if (ci.some((c) => c.status !== 'completed' || c.conclusion !== 'success'))
    reasons.push('CI is not green on the head');
  for (const c of runs) {
    if (c.status !== 'completed') reasons.push(`${c.name} still running`);
    else if (!['success', 'neutral', 'skipped'].includes(c.conclusion))
      reasons.push(`${c.name} ${c.conclusion}`);
  }
  if (s.combinedStatus && !['success', 'pending'].includes(s.combinedStatus.state))
    reasons.push(`commit status ${s.combinedStatus.state}`);
  if (s.combinedStatus?.state === 'pending' && s.combinedStatus.total_count > 0)
    reasons.push('commit statuses pending');
  return { merge: reasons.length === 0, reasons, head };
}

/**
 * Re-read, gate, re-read again and merge pinned to the head the gate saw.
 * GitHub refuses the merge when the head moved since, so it never lands an
 * unreviewed commit. Nothing here submits a review or arms auto-merge.
 */
export async function mergeOne(adapter, number) {
  const first = mergeGate(await adapter.snapshot(number));
  if (!first.merge) return { status: 'refused', number, reasons: first.reasons };
  const second = mergeGate(await adapter.snapshot(number));
  if (!second.merge || second.head !== first.head)
    return {
      status: 'refused',
      number,
      reasons: second.reasons.length ? second.reasons : ['head moved'],
    };
  const result = await adapter.squashMerge(number, second.head);
  if (!result.merged)
    return { status: 'refused', number, reasons: [result.message ?? 'merge refused'] };
  return { status: 'merged', number, sha: result.sha, head: second.head, live: 'pending' };
}

/** Merged is not live: the Pages run for the merge commit decides. */
export function deployState(mergeSha, pagesRuns) {
  const run = pagesRuns.find((r) => r.head_sha === mergeSha);
  if (!run) return 'merged-not-deployed';
  if (run.status !== 'completed') return 'deploying';
  return run.conclusion === 'success' ? 'deployed-needs-sanity' : 'deploy-failed';
}

// ---------- gh and tessl adapter ----------

function gh(args, input) {
  return execFileSync('gh', args, { encoding: 'utf8', input, maxBuffer: 64 * 1024 * 1024 });
}

/** Every page of a REST list, or complete: false when any page failed. */
function pages(path) {
  try {
    const out = gh(['api', '--paginate', '--slurp', path]);
    return { items: JSON.parse(out).flat(), complete: true };
  } catch {
    return { items: [], complete: false };
  }
}

export function ghAdapter({ writerKeyHeld = false } = {}) {
  const base = `repos/${REPOSITORY}`;
  return {
    listIssues: async ({ state, label }) => {
      const q = `state=${state}&per_page=100${label ? `&labels=${encodeURIComponent(label)}` : ''}`;
      const r = pages(`${base}/issues?${q}`);
      return { ...r, items: r.items.filter((i) => !i.pull_request) };
    },
    listComments: async (n) => pages(`${base}/issues/${n}/comments?per_page=100`),
    getIssue: async (n) => JSON.parse(gh(['api', `${base}/issues/${n}`])),
    ensureLabel: async (name) => gh(['label', 'create', name, '--force', '-R', REPOSITORY]),
    createIssue: async ({ title, body, labels }) =>
      JSON.parse(
        gh(
          ['api', '-X', 'POST', `${base}/issues`, '--input', '-'],
          JSON.stringify({ title, body, labels }),
        ),
      ),
    comment: async (n, body) =>
      gh(
        ['api', '-X', 'POST', `${base}/issues/${n}/comments`, '--input', '-'],
        JSON.stringify({ body }),
      ),
    addLabel: async (n, label) =>
      gh(
        ['api', '-X', 'POST', `${base}/issues/${n}/labels`, '--input', '-'],
        JSON.stringify({ labels: [label] }),
      ),
    wasLabelledTessl: async (n) => {
      const r = pages(`${base}/issues/${n}/events?per_page=100`);
      if (!r.complete) throw new Error(`events of #${n} incomplete`);
      return r.items.some((e) => e.event === 'labeled' && e.label?.name === TRIGGER_LABEL);
    },
    linkedPullRequests: async (n) => {
      const r = pages(`${base}/issues/${n}/timeline?per_page=100`);
      return {
        complete: r.complete,
        items: r.items.filter(
          (e) => e.event === 'cross-referenced' && e.source?.issue?.pull_request,
        ),
      };
    },
    triggerAction: async (args) => JSON.parse(execFileSync('tessl', args, { encoding: 'utf8' })),
    snapshot: async (n) => {
      const pr = JSON.parse(gh(['api', `${base}/pulls/${n}`]));
      const sha = pr.head.sha;
      const checks = pages(`${base}/commits/${sha}/check-runs?per_page=100`);
      return {
        writerKeyHeld,
        pr,
        reviews: pages(`${base}/pulls/${n}/reviews?per_page=100`),
        checks: { ...checks, items: checks.items.flatMap((p) => p.check_runs ?? p) },
        combinedStatus: JSON.parse(gh(['api', `${base}/commits/${sha}/status`])),
      };
    },
    squashMerge: async (n, sha) => {
      try {
        const out = gh(
          ['api', '-X', 'PUT', `${base}/pulls/${n}/merge`, '--input', '-'],
          JSON.stringify({ sha, merge_method: 'squash' }),
        );
        return JSON.parse(out);
      } catch (e) {
        return { merged: false, message: String(e.stderr ?? e.message).slice(0, 300) };
      }
    },
  };
}

// ---------- command line ----------
//
//   node scripts/native/native.mjs slot                     the current slots
//   node scripts/native/native.mjs backlog <candidates.json> file the slot's 18
//   node scripts/native/native.mjs dispatch                 dispatch one issue
//   node scripts/native/native.mjs merge                    gate and merge open tessl PRs
//   node scripts/native/native.mjs deploy <sha>             merged or live
//
// backlog, dispatch and merge write to GitHub. Run them only inside the
// native-intake action, which holds the carnival-app-writer key.

if (import.meta.url === `file://${process.argv[1]}`) {
  const [command, arg] = process.argv.slice(2);
  const now = new Date();
  const print = (v) => console.log(JSON.stringify(v, null, 2));
  const held = process.env.CARNIVAL_APP_WRITER_HELD === '1';
  const adapter = ghAdapter({ writerKeyHeld: held });
  if (command === 'slot') {
    print({ backlog: backlogSlot(now), dispatch: dispatchSlot(now), london: londonParts(now) });
  } else if (!held && command !== 'deploy') {
    console.error('refusing: set CARNIVAL_APP_WRITER_HELD=1 only inside the native-intake action');
    process.exit(3);
  } else if (command === 'backlog') {
    print(await produceBacklog(adapter, backlogSlot(now), JSON.parse(readFileSync(arg, 'utf8'))));
  } else if (command === 'dispatch') {
    print(await dispatch(adapter, dispatchSlot(now)));
  } else if (command === 'merge') {
    const open = pages(`repos/${REPOSITORY}/pulls?state=open&per_page=100`);
    if (!open.complete) print({ status: 'blocked', reason: 'pull request listing incomplete' });
    else {
      const results = [];
      for (const pr of open.items) {
        if (!labelNames(pr).includes(TRIGGER_LABEL) || !pr.head.ref.startsWith('tessl/')) continue;
        results.push(await mergeOne(adapter, pr.number));
      }
      print(results);
    }
  } else if (command === 'deploy') {
    const runs = pages(`repos/${REPOSITORY}/actions/workflows/pages.yml/runs?per_page=50`);
    if (!runs.complete) print({ status: 'unknown', reason: 'runs listing incomplete' });
    else
      print({
        sha: arg,
        state: deployState(
          arg,
          runs.items.flatMap((p) => p.workflow_runs ?? p),
        ),
      });
  } else {
    console.error('usage: native.mjs slot | backlog <file> | dispatch | merge | deploy <sha>');
    process.exit(2);
  }
}
