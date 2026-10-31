// The native creative intake (issue #425): a six-hour backlog producer, a
// twenty-minute dispatcher and an evolution-only merge controller.
//
//   backlog   at 00:00, 06:00, 12:00 and 18:00 Europe/London, file exactly 18
//             distinct enhancement issues labelled BACKLOG_LABEL, never tessl.
//   dispatch  every 20 minutes, have one eligible backlog issue labelled tessl
//             by the owner's own label route, so the existing owner-only
//             github-issue-labelled trigger starts the run. There is no direct
//             action trigger. Without an owner label route it fails closed.
//   merge     in the same run, merge a Tessl pull request atomically, pinned
//             to its exact head, only on an authentic reviewer pass and green
//             CI for that head. GitHub's auto-merge is never armed.
//
// Native GitHub writes come from tessl-app[bot] (BOT_ID). The
// github-issue-labelled trigger accepts only the owner (sender id OWNER_ID,
// type User, repository REPOSITORY_ID), so a label the bot adds starts
// nothing. That guard is not broadened, and nothing here routes around it.
//
// The record is GitHub itself, append-only: each backlog issue carries an item
// marker naming its slot, index and scope, and each dispatch leaves a claim
// comment naming its slot. Claims are read across every comment in the
// repository, so closing or relabelling an issue never hides one. A crashed
// or retried run re-reads those markers before any write.
//
// Everything here is plain functions over an adapter, tested in
// native.test.mjs with fixtures. The command line at the bottom wires them to
// gh. scripts/factory/decide.ts is the original lab's read-only readiness
// helper and is not used or changed here.
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
export const REVIEWER_APP_ID = 4850038;
export const BACKLOG_LABEL = 'auto backlog';
export const TRIGGER_LABEL = 'tessl';
export const BATCH_SIZE = 18;
export const BACKLOG_HOURS = [0, 6, 12, 18];
export const DISPATCH_MINUTES = 20;
export const TIMEZONE = 'Europe/London';
// Labels a person adds to keep an item out of dispatch.
export const HOLD_LABELS = ['held', 'manual', 'on hold', 'do not dispatch'];
export const WRITER_KEY = 'carnival-app-writer';

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

/**
 * The item marker of an issue, honoured only on an issue the bot opened and
 * only as the body's last line, where itemBody puts it.
 */
export function readItem(issue) {
  if (issue.user?.id !== BOT_ID) return null;
  const m = ITEM_RE.exec((issue.body ?? '').trimEnd().split('\n').at(-1));
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
    if (/carnival-(backlog|dispatch):/.test(`${c.title}${c.body}${c.evidence}${c.scope}`))
      errors.push(`item ${i}: must not contain a producer or dispatcher marker`);
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

const SLOT_RE = /^backlog-(\d{4}-\d{2}-\d{2})T(00|06|12|18)$/;

/**
 * The slot and candidates of a batch file. A batch file records the slot it
 * was written for, `{ slot, candidates }`, so a rerun after a six-hour
 * boundary fills that slot rather than a new one. The slot must be a
 * scheduled backlog slot no later than `now`'s. A bare array is the current
 * slot's batch.
 */
export function readBatch(json, now) {
  const current = backlogSlot(now);
  if (Array.isArray(json)) return { slot: current, candidates: json };
  const slot = json?.slot;
  if (typeof slot !== 'string' || !SLOT_RE.test(slot))
    return { error: 'batch slot is not a scheduled backlog slot' };
  if (slot > current) return { error: `batch slot ${slot} is later than ${current}` };
  return { slot, candidates: json.candidates };
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
 * File the slot's backlog. Candidates are matched to the missing indexes. A
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
  // A full 18-item file maps item i to index i, so rerunning the original file
  // after a crash files only the missing ones. A shorter file fills the
  // missing indexes in order.
  const full = Array.isArray(candidates) && candidates.length === BATCH_SIZE;
  const pool = full ? todo.map((i) => candidates[i]) : (candidates ?? []).slice(0, todo.length);
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

const isOpen = (issue) => issue?.state === 'open' || issue?.state === 'OPEN';

/**
 * Why a person has taken a backlog issue back or put it on hold, or null.
 * The dispatcher's own claim and tessl label are not holds.
 */
export function heldBack(issue, comments) {
  if (!isOpen(issue)) return 'closed';
  if (issue.pull_request) return 'pull request';
  if (!readItem(issue)) return 'no backlog marker from the bot';
  const labels = labelNames(issue);
  if (!labels.includes(BACKLOG_LABEL)) return 'not in the backlog';
  if (labels.some((l) => HOLD_LABELS.includes(l.toLowerCase()))) return 'held';
  if ((issue.assignees ?? []).length) return 'assigned to a person';
  // A person commented: they may be steering it, so it waits for them.
  if (comments.some((c) => c.user?.id !== BOT_ID)) return 'has a person comment';
  return null;
}

/** Why an unclaimed backlog issue cannot be dispatched, or null when it can. */
export function ineligible(issue, comments, linkedPrs) {
  const held = heldBack(issue, comments);
  if (held) return held;
  if (labelNames(issue).includes(TRIGGER_LABEL)) return 'already labelled tessl';
  if (readClaims(comments).length) return 'already claimed';
  if (linkedPrs.length) return 'has a linked pull request';
  return null;
}

/**
 * Every claim the bot has written, across the whole repository, open or
 * closed, labelled or not, keyed by issue with its first (identity) slot. A
 * claim whose marker names a different issue from the one it sits on is
 * ignored.
 */
export function claimHistory(comments) {
  const byIssue = new Map();
  for (const c of comments) {
    const onIssue = Number(/\/issues\/(\d+)$/.exec(c.issue_url ?? '')?.[1]);
    for (const claim of readClaims([c])) {
      if (claim.issue !== onIssue) continue;
      const seen = byIssue.get(claim.issue);
      if (!seen) byIssue.set(claim.issue, { issue: claim.issue, slots: [claim.slot] });
      else if (!seen.slots.includes(claim.slot)) seen.slots.push(claim.slot);
    }
  }
  for (const v of byIssue.values()) v.slots.sort();
  return byIssue;
}

/**
 * Dispatch one backlog issue for the slot by having the owner's own,
 * already-approved route add the tessl label, so the existing
 * github-issue-labelled trigger (owner only) starts the run. There is no
 * direct action trigger: without an owner label route the dispatcher fails
 * closed before any write.
 *
 * The record is the bot's claim comments across the whole repository, read
 * before any write. A slot that already claimed an issue never claims a
 * second, whatever has since happened to the first. A claim from any slot
 * that never got its label is finished in a later slot unless a person has
 * since held or taken the issue back. A claimed issue labelled and still
 * waiting for its pull request keeps the queue busy.
 */
export async function dispatch(adapter, slot) {
  if (typeof adapter.labelAsOwner !== 'function') {
    return { status: 'blocked', reason: MISSING_LABEL_ROUTE };
  }
  const history = await adapter.listClaimComments();
  if (!history.complete) return { status: 'blocked', reason: 'claim history incomplete' };
  const claims = claimHistory(history.items);
  const ordered = [...claims.values()].sort(
    (a, b) => (a.slots[0] < b.slots[0] ? -1 : a.slots[0] > b.slots[0] ? 1 : 0) || a.issue - b.issue,
  );
  // This slot already claimed an issue: finish that one or report it, never a second.
  const mine = ordered.find((c) => c.slots.includes(slot));
  if (mine) return finish(adapter, slot, mine.issue, 'resumed');
  // Earlier claims: recover an unfinished one, or wait on an admitted one.
  for (const claim of ordered) {
    const issue = await adapter.getIssue(claim.issue);
    if (!isOpen(issue)) continue;
    if (labelNames(issue).includes(TRIGGER_LABEL)) {
      const prs = await adapter.linkedPullRequests(claim.issue);
      if (!prs.complete)
        return { status: 'blocked', reason: `links of #${claim.issue} incomplete` };
      if (!prs.items.length) return { status: 'busy', waitingOn: claim.issue };
      continue;
    }
    const labelled = await adapter.wasLabelledTessl(claim.issue);
    if (labelled === undefined)
      return { status: 'blocked', reason: `events of #${claim.issue} incomplete` };
    if (labelled) continue; // labelled once and since removed: taken back
    const r = await finish(adapter, slot, claim.issue, 'recovered');
    if (r.status !== 'released') return r;
  }
  const listed = await adapter.listIssues({ state: 'open', label: BACKLOG_LABEL });
  if (!listed.complete) return { status: 'blocked', reason: 'backlog listing incomplete' };
  const sorted = [...listed.items]
    .filter((i) => !i.pull_request && !claims.has(i.number))
    .sort(
      (a, b) =>
        (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0) ||
        a.number - b.number,
    );
  for (const issue of sorted) {
    if (ineligible(issue, [], [])) continue;
    const comments = await adapter.listComments(issue.number);
    if (!comments.complete)
      return { status: 'blocked', reason: `comments of #${issue.number} incomplete` };
    if (ineligible(issue, comments.items, [])) continue;
    const prs = await adapter.linkedPullRequests(issue.number);
    if (!prs.complete) return { status: 'blocked', reason: `links of #${issue.number} incomplete` };
    const fresh = await adapter.getIssue(issue.number);
    if (ineligible(fresh, comments.items, prs.items)) continue;
    const bound = await bindSlot(adapter, slot, issue.number);
    if (bound) return bound;
    return finish(adapter, slot, issue.number, 'claimed');
  }
  return { status: 'idle', reason: 'no eligible backlog issue' };
}

export const MISSING_LABEL_ROUTE =
  'no owner-authenticated label route: the github-issue-labelled trigger starts a run only for a tessl label added by user 1106394, and native-intake has only the tessl-app[bot] GitHub identity, so a label it adds starts nothing';

/**
 * Write this slot's claim on an issue, so the slot is bound to it before any
 * label. An uncertain write is read back; returns a blocked result when the
 * claim cannot be confirmed, or null when it is in the history.
 */
async function bindSlot(adapter, slot, number) {
  try {
    await adapter.comment(
      number,
      `Dispatcher slot \`${slot}\` hands this to Tessl.\n\n${claimMarker(slot, number)}\n<!-- tessl-factory -->`,
    );
  } catch {
    // Uncertain: the claim may have landed. Read the history before deciding.
    const again = await adapter.listClaimComments();
    const landed = again.complete && claimHistory(again.items).get(number);
    if (!landed?.slots.includes(slot))
      return { status: 'blocked', issue: number, reason: 'claim write uncertain' };
  }
  return null;
}

async function finish(adapter, slot, number, how) {
  const fresh = await adapter.getIssue(number);
  if (!isOpen(fresh)) return { status: 'stopped', issue: number, reason: 'closed after its claim' };
  if (labelNames(fresh).includes(TRIGGER_LABEL)) {
    return { status: 'labelled', how, issue: number, note: 'already labelled; nothing to write' };
  }
  const labelled = await adapter.wasLabelledTessl(number);
  if (labelled === undefined)
    return { status: 'blocked', reason: `events of #${number} incomplete` };
  // Labelled once and since removed: a person took it back. Never relabel.
  if (labelled) return { status: 'stopped', issue: number, reason: 'taken back' };
  const comments = await adapter.listComments(number);
  if (!comments.complete) return { status: 'blocked', reason: `comments of #${number} incomplete` };
  const held = heldBack(fresh, comments.items);
  if (held)
    return { status: how === 'recovered' ? 'released' : 'stopped', issue: number, reason: held };
  // An issue that already has a pull request is never labelled again.
  const prs = await adapter.linkedPullRequests(number);
  if (!prs.complete) return { status: 'blocked', reason: `links of #${number} incomplete` };
  if (prs.items.length)
    return {
      status: how === 'recovered' ? 'released' : 'stopped',
      issue: number,
      reason: 'has a linked pull request',
    };
  // A recovered claim belongs to an earlier slot. Bind this slot to it first,
  // keeping the earlier claim, so a retry of this slot resumes this issue
  // whatever happens to it after the label, and never claims a second.
  if (how === 'recovered') {
    const bound = await bindSlot(adapter, slot, number);
    if (bound) return bound;
  }
  try {
    await adapter.labelAsOwner(number, TRIGGER_LABEL);
  } catch {
    // Uncertain: read back. If the label did not land, a later slot recovers it.
    const again = await adapter.getIssue(number);
    if (!labelNames(again).includes(TRIGGER_LABEL))
      return {
        status: 'blocked',
        issue: number,
        reason: 'label write uncertain; a later slot recovers it',
      };
  }
  // The trigger only fires for the owner's own label: check who actually added it.
  const actor = await adapter.labelActor(number, TRIGGER_LABEL);
  if (actor?.id !== OWNER_ID || actor?.type !== 'User') {
    return { status: 'failed', issue: number, reason: 'tessl label was not added by the owner' };
  }
  return { status: 'dispatched', how, issue: number, slot };
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
 * Why a pull request's source issue does not match it, as a list. The issue
 * comes from the branch name, and the body must close exactly that issue and
 * no other; the issue must be an open issue of this repository that still
 * carries its authorization label.
 */
export function provenance(pr, issue) {
  const branch = /^tessl\/issue-(\d+)$/.exec(pr?.head?.ref ?? '');
  const closes = [...(pr?.body ?? '').matchAll(/^Closes #(\d+)\s*$/gm)].map((m) => Number(m[1]));
  const anyClose =
    (pr?.body ?? '').match(
      /\b(close[sd]?|fix(e[sd])?|resolve[sd]?):?\s+(\S*#\d+|https?:\/\/\S+\/issues\/\d+)/gi,
    ) ?? [];
  if (!branch) return [];
  const n = Number(branch[1]);
  if (closes.length !== 1 || anyClose.length !== 1) return ['no single Closes line'];
  if (closes[0] !== n) return [`Closes #${closes[0]} does not match branch issue #${n}`];
  const label = /<!-- tessl-factory:issue-label: (\S+) -->/.exec(pr.body)?.[1] ?? TRIGGER_LABEL;
  if (!issue) return ['source issue not read'];
  if (issue.number !== n || issue.pull_request) return ['source issue is not the branch issue'];
  if (issue.repository_url !== `https://api.github.com/repos/${REPOSITORY}`)
    return ['source issue is in another repository'];
  if (!isOpen(issue)) return ['source issue is closed'];
  if (!labelNames(issue).includes(label)) return [`source issue no longer carries ${label}`];
  return [];
}

/**
 * Whether a pull request may be merged now, from a snapshot of its
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
  reasons.push(...provenance(pr, s.issue));
  if (!/^[0-9a-f]{40}$/.test(head ?? '')) reasons.push('no head sha');
  if (!s.reviews?.complete) reasons.push('review listing incomplete');
  if (!s.checks?.complete) reasons.push('check listing incomplete');
  if (reasons.length) return { merge: false, reasons };

  const reviews = [...s.reviews.items].sort(
    (a, b) =>
      (a.submitted_at < b.submitted_at ? -1 : a.submitted_at > b.submitted_at ? 1 : 0) ||
      a.id - b.id,
  );
  // A request for changes stands until the same reviewer approves or it is
  // dismissed. A later COMMENTED review does not clear it, as on GitHub.
  const latestByUser = new Map();
  for (const r of reviews)
    if (!['PENDING', 'COMMENTED'].includes(r.state)) latestByUser.set(r.user?.id, r);
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
    else {
      // The review's run must be the reviewer's own completed check run on this head.
      const run = s.checks.items.find(
        (c) =>
          c.head_sha === head &&
          c.app?.id === REVIEWER_APP_ID &&
          c.external_id === `tessl-code-review-run:${result.runId}`,
      );
      if (!run) reasons.push('trusted review has no matching reviewer run on the head');
      else if (run.status !== 'completed') reasons.push('reviewer run still running');
    }
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
 * Re-read and gate twice, then merge with GitHub's atomic merge pinned to the
 * head the gates saw (the merge API's `sha`), so GitHub refuses if the head
 * moved. GitHub's auto-merge is never armed: with no branch rules in this
 * repository, an armed pull request could merge a later, ungated push. A
 * refusal is reported and nothing merges another way. It never submits a
 * review.
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
  const merged = await adapter.squashMerge(number, second.head);
  if (merged.merged)
    return { status: 'merged', number, head: second.head, sha: merged.sha, live: 'pending' };
  return { status: 'refused', number, reasons: [merged.message ?? 'merge refused'] };
}

/**
 * Merged is not live: the Pages run for the merge commit decides, and only
 * when its deploy job itself succeeded. pages.yml succeeds without deploying
 * when Pages is off, by skipping that job.
 */
export function deployState(mergeSha, pagesRuns, jobsOf = () => undefined) {
  const run = pagesRuns.find((r) => r.head_sha === mergeSha);
  if (!run) return 'merged-not-deployed';
  if (run.status !== 'completed') return 'deploying';
  if (run.conclusion !== 'success') return 'deploy-failed';
  const jobs = jobsOf(run);
  if (!jobs) return 'deploy-unknown';
  const job = jobs.find((j) => j.name === 'deploy');
  return job?.conclusion === 'success' ? 'deployed-needs-sanity' : 'merged-not-deployed';
}

// ---------- gh and tessl adapter ----------

function gh(args, input) {
  // A stalled call fails after two minutes rather than holding the writer key.
  return execFileSync('gh', args, {
    encoding: 'utf8',
    input,
    maxBuffer: 64 * 1024 * 1024,
    timeout: 120_000,
  });
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
    // Every comment in the repository, so claims on closed or relabelled
    // issues still count. Only the bot's claim markers are read from it.
    listClaimComments: async () => pages(`${base}/issues/comments?per_page=100`),
    wasLabelledTessl: async (n) => {
      const r = pages(`${base}/issues/${n}/events?per_page=100`);
      if (!r.complete) return undefined;
      return r.items.some((e) => e.event === 'labeled' && e.label?.name === TRIGGER_LABEL);
    },
    labelActor: async (n, label) => {
      const r = pages(`${base}/issues/${n}/events?per_page=100`);
      return r.items.filter((e) => e.event === 'labeled' && e.label?.name === label).at(-1)?.actor;
    },
    // No labelAsOwner: this action has only the tessl-app[bot] identity, and
    // no approved route adds a label as the owner. dispatch fails closed.
    linkedPullRequests: async (n) => {
      const r = pages(`${base}/issues/${n}/timeline?per_page=100`);
      return {
        complete: r.complete,
        items: r.items.filter(
          (e) => e.event === 'cross-referenced' && e.source?.issue?.pull_request,
        ),
      };
    },
    snapshot: async (n) => {
      const pr = JSON.parse(gh(['api', `${base}/pulls/${n}`]));
      const sha = pr.head.sha;
      const checks = pages(`${base}/commits/${sha}/check-runs?per_page=100`);
      const n2 = /^tessl\/issue-(\d+)$/.exec(pr.head.ref)?.[1];
      return {
        issue: n2 ? JSON.parse(gh(['api', `${base}/issues/${n2}`])) : undefined,
        writerKeyHeld,
        pr,
        reviews: pages(`${base}/pulls/${n}/reviews?per_page=100`),
        checks: { ...checks, items: checks.items.flatMap((p) => p.check_runs ?? p) },
        combinedStatus: JSON.parse(gh(['api', `${base}/commits/${sha}/status`])),
      };
    },
    repoSettings: async () => JSON.parse(gh(['api', base])),
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
    const batch = readBatch(JSON.parse(readFileSync(arg, 'utf8')), now);
    if (batch.error) print({ status: 'blocked', reason: batch.error });
    else print(await produceBacklog(adapter, batch.slot, batch.candidates));
  } else if (command === 'dispatch') {
    print(await dispatch(adapter, dispatchSlot(now)));
  } else if (command === 'merge') {
    const open = pages(`repos/${REPOSITORY}/pulls?state=open&per_page=100`);
    if (!open.complete) print({ status: 'blocked', reason: 'pull request listing incomplete' });
    else {
      const results = [];
      for (const pr of open.items) {
        if (!labelNames(pr).includes(TRIGGER_LABEL) || !pr.head.ref.startsWith('tessl/')) continue;
        try {
          results.push(await mergeOne(adapter, pr.number));
        } catch (e) {
          results.push({ status: 'blocked', number: pr.number, reasons: [String(e.message)] });
        }
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
          (run) => {
            const jobs = pages(`repos/${REPOSITORY}/actions/runs/${run.id}/jobs?per_page=100`);
            return jobs.complete ? jobs.items.flatMap((p) => p.jobs ?? p) : undefined;
          },
        ),
      });
  } else {
    console.error('usage: native.mjs slot | backlog <file> | dispatch | merge | deploy <sha>');
    process.exit(2);
  }
}
