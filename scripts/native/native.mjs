// The native creative intake (issue #425): a six-hour backlog producer, a
// twenty-minute dispatcher and an evolution-only merge controller.
//
//   backlog   at 00:00, 06:00, 12:00 and 18:00 Europe/London, file exactly 18
//             distinct enhancement issues labelled BACKLOG_LABEL, never tessl.
//   dispatch  every 20 minutes, claim one eligible backlog issue and label it
//             tessl as the bot. That label starts nothing itself: it fires
//             the native-bot-backlog-labelled trigger, which runs admit.
//   admit     on that trigger, check GitHub as it is now and, only on a pass,
//             record an admission and hand off to implement-github-issue
//             through `tessl action trigger` with a stable request id.
//   merge     in the same run, merge a Tessl pull request atomically, pinned
//             to its exact head, only on an authentic reviewer pass and green
//             CI for that head. GitHub's auto-merge is never armed.
//
// Native GitHub writes come from tessl-app[bot] (BOT_ID). The owner's
// github-issue-labelled trigger (sender OWNER_ID, type User) is unchanged and
// still ignores the bot. The bot's label reaches only admit, through the
// separate, owner-approved native-bot-backlog-labelled trigger.
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
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const REPOSITORY = 'guypod/carnival-evolution-20261028';
export const REPOSITORY_ID = 1437265009;
export const OWNER_ID = 1106394;
export const REVIEWER_ID = 325629464;
export const REVIEWER_LOGIN = 'tessl-reviewer[bot]';
export const BOT_ID = 295179765;
export const BOT_LOGIN = 'tessl-app[bot]';
// The GitHub App (not installation) id behind BOT_ID. GitHub stamps it on the
// bot's own comments as performed_via_github_app, which no issue text can set.
export const BOT_APP_ID = 4096310;
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
// The Tessl project that declares implement-github-issue (the loop's projectId).
export const PROJECT_ID = '01a1831d-52c0-76ed-8f37-31683acd362e';

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
  const [, date] = SLOT_RE.exec(slot);
  const day = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== date)
    return { error: `batch slot ${slot} is not a calendar date` };
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

/** The canonical digest of an issue's title and body, as filed. */
export const contentDigest = (title, body) =>
  createHash('sha256')
    .update(JSON.stringify([String(title ?? '').trim(), String(body ?? '').replace(/\r\n/g, '\n')]))
    .digest('hex');

const JOURNAL_RE =
  /<!-- carnival-backlog:journal:v1 slot=(\S+) index=(\d+) issue=(\d+) digest=([0-9a-f]{64}) -->/;
export const journalMarker = (slot, index, issue, digest) =>
  `<!-- carnival-backlog:journal:v1 slot=${slot} index=${index} issue=${issue} digest=${digest} -->`;

/**
 * Whether a comment was written by the Tessl app itself: the bot account and
 * GitHub's own performed_via_github_app stamp. Markers alone never count.
 */
export const byApp = (c) =>
  c?.user?.id === BOT_ID &&
  c?.user?.type === 'Bot' &&
  c?.performed_via_github_app?.id === BOT_APP_ID;

/** The producer's durable journal entries on an issue, from the app only. */
export function readJournal(comments) {
  return comments
    .filter(byApp)
    .map((c) => JOURNAL_RE.exec(c.body ?? ''))
    .filter(Boolean)
    .map(([, slot, index, issue, digest]) => ({
      slot,
      index: Number(index),
      issue: Number(issue),
      digest,
    }));
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
  const expected = (index) =>
    Array.isArray(candidates) && candidates.length === BATCH_SIZE && candidates[index]
      ? {
          title: String(candidates[index].title ?? '').trim(),
          body: itemBody(slot, index, candidates[index]),
        }
      : undefined;
  if (!todo.length) return journalAll(adapter, slot, done, expected);
  // A full 18-item file maps item i to index i, so rerunning the original file
  // after a crash files only the missing ones. A shorter file fills the
  // missing indexes in order.
  if (!Array.isArray(candidates))
    return {
      status: 'partial',
      slot,
      issues: [...done.values()],
      remaining: todo.length,
      errors: ['candidates must be an array'],
    };
  const full = candidates.length === BATCH_SIZE;
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
    const journaled = await journal(adapter, slot, index, number, issue);
    if (journaled) return { ...journaled, slot, issues: [...done.values()] };
  }
  return journalAll(adapter, slot, done, expected);
}

/**
 * A crash between a create and its journal entry leaves an issue admission
 * refuses. Every run of the slot journals any such issue from its content as
 * filed, so the slot is complete only when every item is journaled.
 */
async function journalAll(adapter, slot, done, expected) {
  for (const [index, number] of done) {
    // Only the content the full batch file would have filed is certified, and
    // only while the issue still holds exactly that. Never the issue as it is.
    const want = expected(index);
    const fresh = await adapter.getIssue(number);
    const content =
      want && contentDigest(want.title, want.body) === contentDigest(fresh?.title, fresh?.body)
        ? want
        : undefined;
    const journaled = await journal(adapter, slot, index, number, content);
    if (journaled) return { ...journaled, slot, issues: [...done.values()] };
  }
  return { status: 'complete', slot, issues: [...done.values()], remaining: 0 };
}

/**
 * Record the filed issue's digest in the producer's journal, once. Returns
 * null when it is recorded, or a partial result to retry.
 */
async function journal(adapter, slot, index, number, content) {
  const comments = await adapter.listComments(number);
  if (!comments.complete)
    return { status: 'partial', remaining: 0, errors: [`comments of #${number} incomplete`] };
  if (readJournal(comments.items).some((j) => j.issue === number)) return null;
  if (!content)
    return {
      status: 'partial',
      remaining: 0,
      errors: [`#${number} has no journal and its filed content cannot be confirmed`],
    };
  // Only the producer's own bot issue for this slot is journaled. Its digest
  // is of the content the producer sent, or, on recovery, the batch's own.
  const fresh = await adapter.getIssue(number);
  if (fresh?.user?.id !== BOT_ID || readItem(fresh)?.slot !== slot)
    return { status: 'partial', remaining: 0, errors: [`#${number} is not this slot's bot issue`] };
  const digest = contentDigest(content.title, content.body);
  try {
    await adapter.comment(
      number,
      `Backlog producer journal: slot \`${slot}\`, item ${index + 1}.\n\n${journalMarker(slot, index, number, digest)}\n<!-- tessl-factory -->`,
    );
  } catch {
    const again = await adapter.listComments(number);
    if (!again.complete || !readJournal(again.items).some((j) => j.issue === number))
      return {
        status: 'partial',
        remaining: 0,
        errors: [`journal of #${number} uncertain; retry`],
      };
  }
  return null;
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
 * Dispatch one backlog issue for the slot by labelling it tessl as the bot.
 * The label starts no implementation: it fires native-bot-backlog-labelled,
 * whose admit run decides. Dispatch never triggers an action itself.
 *
 * The record is the bot's claim comments across the whole repository, read
 * before any write. A slot that already claimed an issue never claims a
 * second, whatever has since happened to the first. A claim from any slot
 * that never got its label is finished in a later slot unless a person has
 * since held or taken the issue back. A claimed issue labelled and still
 * waiting for its pull request keeps the queue busy.
 */
export async function dispatch(adapter, slot, now = new Date()) {
  if (typeof adapter.labelAsBot !== 'function') {
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
      if (prs.items.length) continue;
      const waiting = await awaitingRun(adapter, claim.issue, now, issue);
      if (waiting) return waiting;
      continue; // labelled, never admitted, past the grace: refused, not running
    }
    const labelled = await adapter.wasLabelledTessl(claim.issue);
    if (labelled === undefined)
      return { status: 'blocked', reason: `events of #${claim.issue} incomplete` };
    if (labelled) continue; // labelled once and since removed: taken back
    const r = await finish(adapter, slot, claim.issue, 'recovered');
    if (r.status !== 'released') return r;
  }
  // Never start a new issue while any implementation or admission is queued
  // or running, however long it has queued: a run is proof, age is not.
  const pending = await adapter.launchRuns({ status: 'pending' });
  if (!pending.complete) return { status: 'blocked', reason: 'implementation runs incomplete' };
  if (pending.items.some(isImplementation) || admitPending(pending))
    return { status: 'busy', reason: 'an implementation or admission run is queued or running' };
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
    // Admission needs the producer's journal with an unchanged digest; an item
    // without one would only be refused.
    const digest = contentDigest(issue.title, issue.body);
    if (!readJournal(comments.items).some((j) => j.issue === issue.number && j.digest === digest))
      continue;
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

/** How long a bot label may wait for its admit run before it counts as refused. */
export const ADMIT_GRACE_MS = 90 * 60_000;
/** How long an admitted issue may wait for its pull request before it counts as stopped. */
export const RUN_GRACE_MS = 3 * 60 * 60_000;

/**
 * Whether a claimed, labelled issue with no pull request still holds the
 * queue, read from its actual launch runs, never from elapsed time alone.
 * Returns the busy or blocked result, or null when the runs show nothing for
 * it is queued or running, so the queue moves on. That issue is never
 * relabelled.
 *   - Any pending implementation run in the repository, or a pending admit
 *     run for this issue: busy.
 *   - Admitted: its own run (by request id) ended, so the queue moves on. No
 *     run visible yet: busy within the run grace, since an accepted request
 *     may not be admitted yet; after it, blocked for a person, not idle.
 *   - The owner's own label: busy, as the owner trigger's run.
 *   - The bot's label, no admission, no pending admit run: busy within the
 *     admit grace, then refused, so the queue moves on.
 */
async function awaitingRun(adapter, number, now, issue) {
  const pending = await adapter.launchRuns({ status: 'pending' });
  const linked = await adapter.launchRuns({ issue: number });
  if (!pending.complete || !linked.complete)
    return { status: 'blocked', reason: `implementation runs of #${number} incomplete` };
  if (pending.items.some(isImplementation) || admitPending(pending))
    return { status: 'busy', waitingOn: number };
  const comments = await adapter.listComments(number);
  if (!comments.complete) return { status: 'blocked', reason: `comments of #${number} incomplete` };
  const admissions = comments.items
    .filter((c) => readAdmissions([c]).some((a) => a.issue === number))
    .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
  const admitted = admissions.at(-1);
  if (admitted !== undefined) {
    const { request } = readAdmissions([admitted])[0];
    const exec = executionState(pending, linked, request);
    if (exec.state === 'own-ended') return null;
    const age = now - new Date(admitted.created_at);
    if (Number.isNaN(age) || age < RUN_GRACE_MS) return { status: 'busy', waitingOn: number };
    return {
      status: 'blocked',
      issue: number,
      reason: `#${number} was admitted but no run for ${request} is visible; a person checks it`,
    };
  }
  const events = await adapter.listEvents(number);
  if (!events.complete) return { status: 'blocked', reason: `events of #${number} incomplete` };
  // An admission deferred for its current label event is still owed: retry the
  // original admission with every guard read fresh, never relabelling. Deferred
  // again keeps the queue on it; a refusal (taken back, held, changed) frees it.
  const labelEvent = events.items
    .filter((e) => e.event === 'labeled' && e.label?.name === TRIGGER_LABEL)
    .at(-1);
  const owed = readDeferrals(comments.items).find(
    (d) =>
      d.issue === number &&
      d.event === labelEvent?.id &&
      d.node === issue?.node_id &&
      d.request === requestId(number, labelEvent.id),
  );
  if (owed && isBot(labelEvent.actor)) return retryAdmission(adapter, number, now, issue);
  const at = events.items
    .filter((e) => e.event === 'labeled' && e.label?.name === TRIGGER_LABEL)
    .at(-1)?.created_at;
  // The owner's own label starts work through the owner trigger: still busy.
  if (!at || now - new Date(at) < ADMIT_GRACE_MS) return { status: 'busy', waitingOn: number };
  const last = events.items.filter((e) => e.label?.name === TRIGGER_LABEL).at(-1);
  if (!isBot(last?.actor)) return { status: 'busy', waitingOn: number };
  // Past the grace with no admission and no admit run pending: the admit run
  // refused, or deferred on a read that failed and could write no record.
  // Retry the original admission with fresh guards; only a refusal frees it.
  return retryAdmission(adapter, number, now, issue);
}

async function retryAdmission(adapter, number, now, issue) {
  const r = await admitIssue(adapter, { number, nodeId: issue?.node_id, id: issue?.id }, now);
  if (r.status === 'refused') return null;
  if (r.status === 'uncertain') return { status: 'blocked', issue: number, retried: r };
  return { status: 'busy', waitingOn: number, retried: r };
}

export const MISSING_LABEL_ROUTE =
  'no bot label route: the adapter cannot add the tessl label as tessl-app[bot]';

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
    await adapter.labelAsBot(number, TRIGGER_LABEL);
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
  // The bot trigger only fires for the app's own label, and admission then
  // decides: check who actually added it. The label never starts work itself.
  const actor = await adapter.labelActor(number, TRIGGER_LABEL);
  if (actor?.id !== BOT_ID || actor?.type !== 'Bot') {
    return { status: 'failed', issue: number, reason: 'tessl label was not added by the bot' };
  }
  return { status: 'dispatched', how, issue: number, slot };
}

// ---------- admission ----------
//
// The native-bot-backlog-labelled trigger runs native-intake MODE=admit on a
// tessl label the app added to its own auto backlog issue. admit() decides
// from GitHub as it is now, never from the webhook alone, and only a passing
// decision records an admission and hands off to implement-github-issue
// through `tessl action trigger` with a stable request id. The shared Tessl
// App identity is the approved trust scope: anything that runs as the app can
// write the records read here, and nothing narrower is claimed.

const ADMIT_RE =
  /<!-- carnival-admission:v1 issue=(\d+) node=(\S+) slot=(\S+) digest=([0-9a-f]{64}) event=(\d+) request=(\S+) -->/;
export const admissionMarker = (a) =>
  `<!-- carnival-admission:v1 issue=${a.issue} node=${a.node} slot=${a.slot} digest=${a.digest} event=${a.event} request=${a.request} -->`;
const DISPATCH_SLOT_RE = /^dispatch-\d{4}-\d{2}-\d{2}T\d{4}$/;

/** The app's own admission records in an issue's comments. */
export function readAdmissions(comments) {
  return comments
    .filter(byApp)
    .map((c) => ADMIT_RE.exec(c.body ?? ''))
    .filter(Boolean)
    .map(([, issue, node, slot, digest, event, request]) => ({
      issue: Number(issue),
      node,
      slot,
      digest,
      event: Number(event),
      request,
    }));
}

const DEFER_RE = /<!-- carnival-deferred:v1 issue=(\d+) node=(\S+) event=(\d+) request=(\S+) -->/;
export const deferralMarker = (a) =>
  `<!-- carnival-deferred:v1 issue=${a.issue} node=${a.node} event=${a.event} request=${a.request} -->`;

/** The app's own records that an admission was deferred and is still owed. */
export function readDeferrals(comments) {
  return comments
    .filter(byApp)
    .map((c) => DEFER_RE.exec(c.body ?? ''))
    .filter(Boolean)
    .map(([, issue, node, event, request]) => ({
      issue: Number(issue),
      node,
      event: Number(event),
      request,
    }));
}

/** Refusal reasons that only mean a read failed, so the admission is still owed. */
const TRANSIENT = [
  'comments incomplete',
  'events incomplete',
  'claim history incomplete',
  'links incomplete',
  'branch state unknown',
];

export const requestId = (issue, eventId) => `carnival-admit:${REPOSITORY_ID}:${issue}:${eventId}`;

// ---------- execution state ----------
//
// A missing branch or a local flag is not proof that no implementation is
// queued or running. These read Tessl's launch runs, through
// `tessl api /experimental/launch-runs`, every page: the pending runs of this
// repository, and every run linked to the issue. The handoff labels its run
// `implement-github-issue <request id>` and links it to the issue, so the
// app's own request is told apart from any other run by its stable key.
//
// Not covered: a request Tessl has accepted (202) but not yet admitted to a
// launch run. The API documents no listing of action requests before
// admission, so such a request is invisible here until its run exists.

export const IMPLEMENT_ACTION = 'implement-github-issue';
export const ADMIT_TRIGGER = 'native-bot-backlog-labelled';
export const issueUrl = (n) => `https://github.com/${REPOSITORY}/issues/${n}`;
export const runLabel = (request) => `${IMPLEMENT_ACTION} ${request}`;

const isImplementation = (run) =>
  run.label === IMPLEMENT_ACTION ||
  run.label?.startsWith(`${IMPLEMENT_ACTION} `) ||
  run.skill?.endsWith(`#${IMPLEMENT_ACTION}`);

/**
 * What the launch runs say about starting implementation for issue n under
 * `request`. Fails closed: an incomplete listing is unknown, never clear.
 *   unknown: a listing was incomplete or unreadable;
 *   own-pending: the app's own request already has a queued or running run;
 *   own-ended: the app's own run finished (any outcome) and is never restarted;
 *   foreign-pending: another implementation run in this repository is queued
 *     or running; which issue it is for cannot be told, so wait;
 *   foreign-history: another implementation run for this issue exists, in any
 *     state, so this is not the issue's first run;
 *   clear: no implementation run but none of the above.
 */
export function executionState(pending, linked, request) {
  if (!pending?.complete || !linked?.complete) return { state: 'unknown' };
  const own = (r) => r.label === runLabel(request);
  const all = [...pending.items, ...linked.items];
  const mine = all.filter(own);
  if (mine.some((r) => r.status === 'pending')) return { state: 'own-pending', run: mine[0].id };
  if (mine.length) return { state: 'own-ended', run: mine[0].id, status: mine[0].status };
  const foreign = pending.items.find((r) => isImplementation(r) && !own(r));
  if (foreign) return { state: 'foreign-pending', run: foreign.id };
  const earlier = linked.items.find((r) => isImplementation(r) && !own(r));
  if (earlier) return { state: 'foreign-history', run: earlier.id, status: earlier.status };
  return { state: 'clear' };
}

/**
 * Whether any admit run is still queued or running. Its label cannot be
 * relied on to name the issue, so any pending one holds the queue.
 */
const admitPending = (pending) =>
  pending.items.some((r) => r.status === 'pending' && r.label?.startsWith(ADMIT_TRIGGER));

const isBot = (u) => u?.id === BOT_ID && u?.type === 'Bot' && u?.login === BOT_LOGIN;

/** The single issues.labeled payload in a trigger-events file, or why not. */
export function readAdmitEvent(events) {
  if (!Array.isArray(events) || events.length !== 1) return { error: 'expected exactly one event' };
  const [{ event, payload: p } = {}] = events;
  if (!['issues', 'issues.labeled', 'github:issues.labeled'].includes(event))
    return { error: `event ${event} is not issues.labeled` };
  const problems = [];
  if (p?.action !== 'labeled') problems.push('action is not labeled');
  if (p?.label?.name !== TRIGGER_LABEL) problems.push('label is not tessl');
  if (!isBot(p?.sender)) problems.push('sender is not tessl-app[bot]');
  if (p?.repository?.id !== REPOSITORY_ID || p?.repository?.full_name !== REPOSITORY)
    problems.push('another repository');
  if (p?.repository?.fork !== false) problems.push('repository is a fork');
  const i = p?.issue;
  if (!Number.isSafeInteger(i?.number) || i.number < 1) problems.push('no issue number');
  if (i?.pull_request !== undefined) problems.push('a pull request');
  if (!isBot(i?.user)) problems.push('issue author is not tessl-app[bot]');
  if (i?.state !== 'open') problems.push('issue is not open');
  if (!labelNames(i ?? {}).includes(BACKLOG_LABEL)) problems.push('issue is not in auto backlog');
  if (typeof i?.node_id !== 'string' || !i.node_id) problems.push('no issue node id');
  if (problems.length) return { error: problems.join('; ') };
  return { number: i.number, nodeId: i.node_id, id: i.id };
}

/**
 * Admit a bot-labelled backlog issue to implementation, or refuse with every
 * reason. Fresh reads, all complete or it refuses:
 *   the issue: same node and id as the event, this repository, the app's own,
 *     open, not a pull request, auto backlog and tessl, no hold, no assignee;
 *   its content: digest equal to the producer's one journal entry, written by
 *     the app (GitHub's performed_via_github_app stamp, not text);
 *   its comments: every one the app's own, so no person has commented;
 *   its events: every one by the bot, one tessl label and never an unlabel;
 *   its claim: the app's own, before the label, in a dispatch slot that
 *     claimed no other issue, from a complete repository-wide claim history;
 *   no linked pull request and no tessl/issue-<n> branch.
 * A passing decision writes one admission record keyed by the label event,
 * then hands off with a request id from the same key, so a retry after a
 * crash or an uncertain write starts no second run.
 */
export async function admit(adapter, events, now = new Date()) {
  const ev = readAdmitEvent(events);
  if (ev.error) return { status: 'refused', reasons: [ev.error] };
  return admitIssue(adapter, ev, now);
}

/**
 * The admission decision for one issue from fresh reads. The original admit
 * run calls it with the webhook's issue; dispatch calls it again, with the
 * issue's own identity, to retry an owed admission. Either way the request id
 * comes from the issue's one tessl label event, so a retry never makes a new
 * generation, and an incomplete read or another pending run leaves the work
 * owed (`deferred`) rather than refused.
 */
export async function admitIssue(adapter, ev, now = new Date()) {
  const n = ev.number;
  const reasons = [];
  const fresh = await adapter.getIssue(n);
  if (!fresh) return { status: 'deferred', issue: n, reasons: ['issue not read'] };
  if (fresh.node_id !== ev.nodeId || (ev.id !== undefined && fresh.id !== ev.id))
    reasons.push('issue identity differs from the event');
  if (fresh.repository_url !== `https://api.github.com/repos/${REPOSITORY}`)
    reasons.push('issue is in another repository');
  if (!isBot(fresh.user)) reasons.push('issue author is not tessl-app[bot]');
  if (!isOpen(fresh)) reasons.push('issue is closed');
  if (fresh.pull_request) reasons.push('a pull request');
  const labels = labelNames(fresh);
  if (!labels.includes(BACKLOG_LABEL)) reasons.push('not in auto backlog');
  if (!labels.includes(TRIGGER_LABEL)) reasons.push('tessl label is gone');
  if (labels.some((l) => HOLD_LABELS.includes(l.toLowerCase()))) reasons.push('held');
  if ((fresh.assignees ?? []).length || fresh.assignee) reasons.push('assigned to a person');
  const item = readItem(fresh);
  if (!item) reasons.push('no backlog marker from the bot');

  const comments = await adapter.listComments(n);
  const issueEvents = await adapter.listEvents(n);
  const history = await adapter.listClaimComments();
  const prs = await adapter.linkedPullRequests(n);
  const branch = await adapter.branchExists(`tessl/issue-${n}`);
  if (!comments.complete) reasons.push('comments incomplete');
  if (!issueEvents.complete) reasons.push('events incomplete');
  if (!history.complete) reasons.push('claim history incomplete');
  if (!prs.complete) reasons.push('links incomplete');
  if (branch === undefined) reasons.push('branch state unknown');
  // Only unreadable state so far: the work is still owed, so a later dispatch retries.
  if (reasons.length) {
    const owed = reasons.every((r) => TRANSIENT.includes(r));
    return { status: owed ? 'deferred' : 'refused', issue: n, reasons };
  }

  // Content: the producer's one journal entry for this item, digest unchanged.
  const digest = contentDigest(fresh.title, fresh.body);
  const journal = readJournal(comments.items).filter((j) => j.issue === n);
  if (journal.length !== 1) reasons.push('no single producer journal entry');
  else {
    const [j] = journal;
    if (j.slot !== item.slot || j.index !== item.index)
      reasons.push('journal entry is for another item');
    if (j.digest !== digest) reasons.push('content changed since it was filed');
  }
  if (comments.items.some((c) => !byApp(c))) reasons.push('has a comment not from the app');

  // History: only the bot has acted, it labelled tessl once, and nobody took it back.
  if (issueEvents.items.some((e) => !isBot(e.actor))) reasons.push('a person acted on the issue');
  const tesslEvents = issueEvents.items.filter((e) => e.label?.name === TRIGGER_LABEL);
  const labelled = tesslEvents.filter((e) => e.event === 'labeled');
  if (tesslEvents.some((e) => e.event === 'unlabeled')) reasons.push('tessl was taken back');
  if (labelled.length !== 1) reasons.push('tessl was not labelled exactly once');
  const labelEvent = labelled[0];

  // Claim: the app's own, before the label, in a slot that claimed only this issue.
  const claims = claimHistory(history.items.filter(byApp));
  const mine = claims.get(n);
  if (!mine) reasons.push('no scheduled claim');
  else {
    const slot = mine.slots.at(-1);
    if (!mine.slots.every((s) => DISPATCH_SLOT_RE.test(s))) reasons.push('malformed claim slot');
    if (slot > dispatchSlot(now)) reasons.push('claim slot is in the future');
    for (const [other, c] of claims)
      if (other !== n && c.slots.some((s) => mine.slots.includes(s)))
        reasons.push(`claim slot also claimed #${other}`);
    const claimAt = comments.items
      .filter((c) => readClaims([c]).some((k) => k.issue === n && k.slot === slot))
      .map((c) => c.created_at)
      .sort()[0];
    if (!claimAt || !labelEvent || claimAt > labelEvent.created_at)
      reasons.push('claim does not precede the label');
  }
  if (prs.items.length) reasons.push('has a linked pull request');
  if (reasons.length) return { status: 'refused', issue: n, reasons };

  const record = {
    issue: n,
    node: fresh.node_id,
    slot: mine.slots.at(-1),
    digest,
    event: labelEvent.id,
    request: requestId(n, labelEvent.id),
  };
  const prior = readAdmissions(comments.items).filter((a) => a.issue === n);
  if (prior.length && !prior.some((a) => a.request === record.request))
    return { status: 'refused', issue: n, reasons: ['admitted before for another label event'] };
  if (branch) {
    // The run already started: an admission with this key exists, or it is foreign.
    if (prior.length) return { status: 'admitted', issue: n, how: 'already running', ...record };
    return { status: 'refused', issue: n, reasons: ['an implementation branch already exists'] };
  }
  // No branch proves nothing: read the actual runs before any write or handoff.
  const exec = executionState(
    await adapter.launchRuns({ status: 'pending' }),
    await adapter.launchRuns({ issue: n }),
    record.request,
  );
  if (exec.state === 'unknown')
    return { status: 'deferred', issue: n, reasons: ['implementation runs incomplete'] };
  if (exec.state === 'own-pending')
    return { status: 'admitted', issue: n, how: 'already running', run: exec.run, ...record };
  if (exec.state === 'own-ended')
    return {
      status: 'refused',
      issue: n,
      reasons: [`its own run ${exec.run} already ended (${exec.status}); never restarted`],
    };
  if (exec.state === 'foreign-history')
    return {
      status: 'refused',
      issue: n,
      reasons: [`an earlier implementation run ${exec.run} (${exec.status}) exists for this issue`],
    };
  // Another run is queued or running: record that the work is owed, then exit
  // now, never waiting while holding the writer key. A later dispatch retries.
  if (exec.state === 'foreign-pending') {
    const out = {
      status: 'deferred',
      issue: n,
      reasons: [`implementation run ${exec.run} is queued or running`],
    };
    if (readDeferrals(comments.items).some((d) => d.request === record.request)) return out;
    try {
      await adapter.comment(
        n,
        `Admission waits for another implementation run; a later dispatch retries it.\n\n${deferralMarker(record)}\n<!-- tessl-factory -->`,
      );
    } catch {
      out.reasons.push('deferral record write uncertain');
    }
    return out;
  }
  if (!prior.length) {
    try {
      await adapter.comment(
        n,
        `Admitted to implementation after the native backlog checks.\n\n${admissionMarker(record)}\n<!-- tessl-factory -->`,
      );
    } catch {
      const again = await adapter.listComments(n);
      if (!again.complete || !readAdmissions(again.items).some((a) => a.request === record.request))
        return {
          status: 'uncertain',
          issue: n,
          reasons: ['admission write uncertain; rerun admit'],
        };
    }
  }
  // Same request id on every retry, so the platform starts at most one run.
  try {
    await adapter.triggerImplementation(n, record.request);
  } catch (e) {
    return {
      status: 'uncertain',
      issue: n,
      ...record,
      reasons: [`handoff result unknown, rerun admit: ${String(e?.message ?? e).slice(0, 200)}`],
    };
  }
  return { status: 'admitted', issue: n, how: prior.length ? 'resumed' : 'new', ...record };
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

/** The label that hands a PR's issue to Tessl: its body's marker, or tessl. */
export const issueLabel = (body) =>
  /<!-- tessl-factory:issue-label: (\S+) -->/.exec(body ?? '')?.[1] ?? TRIGGER_LABEL;

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
  // Only a tessl label starts work through the owner's trigger, whatever the
  // PR's own (editable) text names.
  const label = issueLabel(pr.body);
  if (label !== TRIGGER_LABEL) return [`issue label ${label} is not ${TRIGGER_LABEL}`];
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
  // The issue label must still be the owner's, or the bot's with an admission
  // for that label event. If someone else put it back, nothing restores it.

  // The bot's label counts only with the app's own admission for that exact
  // label event, on the issue the branch names.
  const by = s.issueLabelActor?.actor;
  if (!s.issueLabelActor?.complete) reasons.push('source issue label history incomplete');
  else if (by?.id === OWNER_ID && by?.type === 'User') {
    // the owner's own hand-off
  } else if (isBot(by)) {
    const n = Number(/^tessl\/issue-(\d+)$/.exec(pr?.head?.ref ?? '')?.[1]);
    if (!s.admissions?.complete) reasons.push('admission records incomplete');
    else if (
      !readAdmissions(s.admissions.items).some(
        (a) =>
          a.issue === n && a.event === s.issueLabelActor.eventId && a.node === s.issue?.node_id,
      )
    )
      reasons.push('bot label has no admission for its label event');
  } else reasons.push('source issue label was not last added by the owner or an admitted bot');
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

  // A rerun replaces the run it reran: GitHub lists both under filter=all, and
  // only the newest run of each check by each app counts.
  const newest = new Map();
  for (const c of s.checks.items.filter((x) => x.head_sha === head)) {
    const k = `${c.app?.id}:${c.name}`;
    if (!newest.has(k) || c.id > newest.get(k).id) newest.set(k, c);
  }
  const runs = [...newest.values()];
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
  if (merged.uncertain)
    return { status: 'uncertain', number, head: second.head, reasons: [merged.message] };
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

/** Who last added `label` to issue `n`, read from every page of its events. */
function labelHistory(n, label) {
  const r = pages(`repos/${REPOSITORY}/issues/${n}/events?per_page=100`);
  const last = r.items.filter((e) => e.event === 'labeled' && e.label?.name === label).at(-1);
  return { complete: r.complete, actor: last?.actor, eventId: last?.id };
}

/** Every page of `tessl api /experimental/launch-runs` for this repository. */
export function launchRuns({ status, issue }, call = tesslApi) {
  const q = new URLSearchParams({ 'page[size]': '100' });
  if (status) q.set('status', status);
  if (issue !== undefined) {
    q.set('filter[linkType]', 'github_issue');
    q.set('filter[linkValue]', issueUrl(issue));
  }
  const repo = `https://github.com/${REPOSITORY}`;
  const items = [];
  let path = `/experimental/launch-runs?${q}`;
  try {
    for (let page = 0; path; page++) {
      if (page >= 50) return { items: [], complete: false };
      const body = JSON.parse(call(path));
      if (!Array.isArray(body?.data) || !body.links) return { items: [], complete: false };
      for (const r of body.data) {
        const a = r.attributes ?? {};
        if (a.config?.repoUrl?.replace(/\.git$/, '') !== repo) continue;
        items.push({
          id: r.id,
          status: a.status,
          phase: a.liveness?.phase,
          label: a.label,
          skill: a.config?.skillRef,
        });
      }
      const next = body.links.next;
      path = next ? new URL(next).pathname + new URL(next).search : null;
    }
  } catch {
    return { items: [], complete: false };
  }
  return { items, complete: true };
}

function tesslApi(path) {
  return execFileSync('tessl', ['api', path], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: 120_000,
  });
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
    // The app's own label. It starts nothing by itself: the bot trigger runs
    // admit, which decides.
    labelAsBot: async (n, label) =>
      gh(
        ['api', '-X', 'POST', `${base}/issues/${n}/labels`, '--input', '-'],
        JSON.stringify({ labels: [label] }),
      ),
    listEvents: async (n) => pages(`${base}/issues/${n}/events?per_page=100`),
    branchExists: async (name) => {
      try {
        gh(['api', `${base}/branches/${encodeURIComponent(name)}`]);
        return true;
      } catch (e) {
        return /HTTP 404/.test(String(e.stderr ?? '')) ? false : undefined;
      }
    },
    // The supported hand-off: the project's declared implement action, queued
    // on its own writer key, deduplicated by request id. It returns once the
    // request is accepted, so admit never waits on the run it starts.
    triggerImplementation: async (n, request) =>
      execFileSync(
        'tessl',
        [
          'action',
          'trigger',
          IMPLEMENT_ACTION,
          '--project-id',
          PROJECT_ID,
          '--request-id',
          request,
          // Presentation only: lets launchRuns tell this request's run apart.
          '--label-fragment',
          request,
          '--link',
          `github_issue=${issueUrl(n)}`,
          '--input',
          `GITHUB_ISSUE_NUMBER=${n}`,
          '--input',
          `GITHUB_ISSUE_LABEL=${TRIGGER_LABEL}`,
          '--json',
        ],
        { encoding: 'utf8', timeout: 120_000 },
      ),
    // Tessl launch runs of this repository, every page: the pending ones, or
    // every run linked to issue n. Any failed page makes it incomplete.
    launchRuns: async ({ status, issue }) => launchRuns({ status, issue }),
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
      const checks = pages(`${base}/commits/${sha}/check-runs?filter=all&per_page=100`);
      const n2 = /^tessl\/issue-(\d+)$/.exec(pr.head.ref)?.[1];
      return {
        issue: n2 ? JSON.parse(gh(['api', `${base}/issues/${n2}`])) : undefined,
        issueLabelActor: n2 ? labelHistory(n2, issueLabel(pr.body)) : { complete: false },
        admissions: n2 ? pages(`${base}/issues/${n2}/comments?per_page=100`) : { complete: false },
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
        const message = String(e.stderr ?? e.message).slice(0, 300);
        // The merge may have landed without its response: read the PR back.
        try {
          const pr = JSON.parse(gh(['api', `${base}/pulls/${n}`]));
          if (pr.merged && pr.head?.sha === sha) return { merged: true, sha: pr.merge_commit_sha };
          if (pr.head?.sha === sha && pr.state === 'open') return { merged: false, message };
        } catch {
          // fall through: unknown
        }
        return { merged: false, uncertain: true, message: `merge result unknown: ${message}` };
      }
    },
  };
}

// ---------- command line ----------
//
//   node scripts/native/native.mjs slot                     the current slots
//   node scripts/native/native.mjs backlog <candidates.json> file the slot's 18
//   node scripts/native/native.mjs dispatch                 label one issue as the bot
//   node scripts/native/native.mjs admit <trigger-events>   admit a bot-labelled issue
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
  } else if (command === 'admit') {
    print(await admit(adapter, JSON.parse(readFileSync(arg, 'utf8')), now));
  } else if (command === 'dispatch') {
    print(await dispatch(adapter, dispatchSlot(now), now));
  } else if (command === 'merge') {
    const open = pages(`repos/${REPOSITORY}/pulls?state=open&per_page=100`);
    if (!open.complete) print({ status: 'blocked', reason: 'pull request listing incomplete' });
    else {
      const results = [];
      // Stop starting new pull requests well inside the action's 30 minutes,
      // so the results of merges already done are always reported.
      const deadline = Date.now() + 15 * 60_000;
      for (const pr of open.items) {
        if (!labelNames(pr).includes(TRIGGER_LABEL) || !pr.head.ref.startsWith('tessl/')) continue;
        if (Date.now() > deadline) {
          results.push({ status: 'deferred', number: pr.number, reasons: ['sweep time limit'] });
          continue;
        }
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
    console.error(
      'usage: native.mjs slot | backlog <file> | dispatch | admit <events> | merge | deploy <sha>',
    );
    process.exit(2);
  }
}
