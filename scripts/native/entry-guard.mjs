// Implementation entry guard. `.tessl/cloud-launch-setup.sh` runs it before
// the agent starts and before the skill is installed, only when the run's
// SKILL is implement-github-issue, so both the owner's label trigger and the
// native admission handoff pass through it. Other actions never run it.
//
// It claims one immutable key for the work: repository, issue number, issue
// node, content digest and generation (the tessl label event that handed the
// issue over). The claim is a git ref created with GitHub's create-ref call,
// which fails when the ref exists, so two runs cannot both own a key. The ref
// points at a parentless commit whose message records the key and the run id.
// It is never moved or deleted, so it also stays as evidence after the run.
//
//   same key, same run id: the run resumes (setup reruns on a resumed run);
//   same generation, anything else: refused, never taken over, whatever its age;
//   identity cannot be read in full: refused.
//
// A refusal exits non-zero, which fails the run's prepare step before any
// coding. Nothing here waits.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  BOT_ID,
  OWNER_ID,
  REPOSITORY,
  REPOSITORY_ID,
  TRIGGER_LABEL,
  botEligibility,
  byApp,
  claimHistory,
  contentDigest,
  readAdmissions,
  requestId,
} from './native.mjs';

export const ENTRY_RE = /^tessl-entry:v1 (\{.*\})$/m;
export const entryRef = (issue, generation) => `refs/tessl-entry/issue-${issue}/gen-${generation}`;
const isOwner = (u) => u?.id === OWNER_ID && u?.type === 'User';
const isBotUser = (u) => u?.id === BOT_ID && u?.type === 'Bot';

/** The one issue this implementation run is for, from its inputs and events, or why not. */
export function runIssue(inputs, events) {
  const fromInput = inputs?.GITHUB_ISSUE_NUMBER;
  const fromEvents = [
    ...new Set((Array.isArray(events) ? events : []).map((e) => e?.payload?.issue?.number)),
  ];
  if (events !== undefined && !Array.isArray(events)) return { error: 'trigger events malformed' };
  if (fromEvents.some((n) => !Number.isSafeInteger(n)) || fromEvents.length > 1)
    return { error: 'trigger events do not name exactly one issue' };
  const n = fromInput !== undefined && fromInput !== '' ? Number(fromInput) : fromEvents[0];
  if (!Number.isSafeInteger(n) || n < 1) return { error: 'no issue number' };
  if (fromEvents.length && fromEvents[0] !== n)
    return { error: 'input issue differs from the event issue' };
  return { number: n };
}

/**
 * The identity key for issue n from fresh, complete reads, or why it cannot be
 * established. The generation is the newest tessl label event. The owner's
 * label is its own hand-off. The bot's label counts only with the app's
 * admission record for that exact event and node, so a bot label that skipped
 * admission never starts implementation.
 */
export function identity(n, issue, events, comments) {
  if (!issue || !events?.complete || !comments?.complete)
    return { error: 'issue, events or comments not read in full' };
  if (issue.number !== n || issue.pull_request) return { error: 'not this repository issue' };
  if (issue.repository_url !== `https://api.github.com/repos/${REPOSITORY}`)
    return { error: 'issue is in another repository' };
  if (issue.state !== 'open') return { error: 'issue is closed' };
  if (!(issue.labels ?? []).some((l) => (l.name ?? l) === TRIGGER_LABEL))
    return { error: 'issue has no tessl label' };
  const label = events.items
    .filter((e) => e.event === 'labeled' && e.label?.name === TRIGGER_LABEL)
    .at(-1);
  if (!label?.id) return { error: 'no tessl label event' };
  if (isBotUser(label.actor)) {
    // Admission checked the issue once; the run may have queued since. The
    // same predicate admission uses runs again on fresh reads, so a hold, an
    // assignment, a person's comment or event, a removed label or an edit
    // after admission stops coding here.
    const fit = botEligibility(n, issue, comments, events);
    const why = [...fit.issueReasons, ...fit.reasons];
    if (!why.length && fit.labelEvent?.id !== label.id) why.push('tessl label event changed');
    if (why.length) return { error: `bot issue no longer eligible: ${why.join('; ')}` };
    // One app admission record must match every part of this entry at once.
    const claims = claimHistory(comments.items.filter(byApp)).get(n);
    const admitted = readAdmissions(comments.items).filter(
      (a) =>
        a.issue === n &&
        a.node === issue.node_id &&
        a.event === label.id &&
        a.request === requestId(n, label.id),
    );
    if (!admitted.length) return { error: 'bot label has no admission for its label event' };
    if (!admitted.some((a) => a.digest === fit.digest))
      return { error: 'content changed since admission' };
    if (!admitted.some((a) => a.digest === fit.digest && a.slot === claims?.slots.at(-1)))
      return { error: 'admission is not for the original claim slot' };
  } else if (!isOwner(label.actor)) {
    return { error: 'tessl label was not added by the owner or an admitted bot' };
  }
  return {
    key: {
      repository: REPOSITORY_ID,
      issue: n,
      node: issue.node_id,
      digest: contentDigest(issue.title, issue.body),
      generation: label.id,
    },
  };
}

const sameKey = (a, b) =>
  ['repository', 'issue', 'node', 'digest', 'generation'].every((k) => a?.[k] === b?.[k]);

/**
 * Claim the key for runId, or resume a claim the same run made. An uncertain
 * create is read back before deciding. Every other outcome refuses.
 */
export async function claimEntry(adapter, key, runId) {
  if (typeof runId !== 'string' || !/^[0-9a-f-]{36}$/.test(runId))
    return { status: 'refused', reason: 'no launch run id' };
  const ref = entryRef(key.issue, key.generation);
  const record = { ...key, run: runId };
  const decide = (held) => {
    if (!held) return { status: 'refused', reason: `claim ${ref} unreadable` };
    if (!sameKey(held, key))
      return { status: 'refused', reason: `${ref} holds a different identity (content changed)` };
    if (held.run !== runId)
      return { status: 'refused', reason: `${ref} is owned by run ${held.run}`, owner: held.run };
    return { status: 'resumed', ref, ...record };
  };
  const existing = await adapter.readEntry(ref);
  if (existing.error) return { status: 'refused', reason: existing.error };
  if (existing.record) return decide(existing.record);
  try {
    await adapter.createEntry(ref, `tessl-entry:v1 ${JSON.stringify(record)}`);
  } catch {
    // Exists now, or the create landed and the answer was lost: read it back.
    const again = await adapter.readEntry(ref);
    if (again.error || !again.record)
      return { status: 'refused', reason: `claim ${ref} uncertain` };
    return decide(again.record);
  }
  return { status: 'claimed', ref, ...record };
}

function gh(args, input) {
  return execFileSync('gh', args, { encoding: 'utf8', input, timeout: 60_000 });
}

function pages(path) {
  try {
    return { items: JSON.parse(gh(['api', '--paginate', '--slurp', path])).flat(), complete: true };
  } catch {
    return { items: [], complete: false };
  }
}

export function ghEntryAdapter() {
  const base = `repos/${REPOSITORY}`;
  return {
    getIssue: async (n) => JSON.parse(gh(['api', `${base}/issues/${n}`])),
    listEvents: async (n) => pages(`${base}/issues/${n}/events?per_page=100`),
    listComments: async (n) => pages(`${base}/issues/${n}/comments?per_page=100`),
    readEntry: async (ref) => {
      let sha;
      try {
        sha = JSON.parse(gh(['api', `${base}/git/${ref}`])).object.sha;
      } catch (e) {
        // 404 is "no claim"; anything else is unknown.
        return /HTTP 404/.test(String(e.stderr ?? e.message)) ? {} : { error: 'claim read failed' };
      }
      try {
        const msg = JSON.parse(gh(['api', `${base}/git/commits/${sha}`])).message;
        const m = ENTRY_RE.exec(msg);
        return m ? { record: JSON.parse(m[1]) } : { error: `${ref} is not a claim` };
      } catch {
        return { error: 'claim read failed' };
      }
    },
    createEntry: async (ref, message) => {
      const tree = JSON.parse(gh(['api', `${base}/git/ref/heads/main`])).object.sha;
      const treeSha = JSON.parse(gh(['api', `${base}/git/commits/${tree}`])).tree.sha;
      const commit = JSON.parse(
        gh(
          ['api', '-X', 'POST', `${base}/git/commits`, '--input', '-'],
          JSON.stringify({ message, tree: treeSha, parents: [] }),
        ),
      ).sha;
      gh(
        ['api', '-X', 'POST', `${base}/git/refs`, '--input', '-'],
        JSON.stringify({ ref, sha: commit }),
      );
    },
  };
}

/** The whole guard: issue, identity, claim. Returns the decision. */
export async function guard(adapter, { inputs, events, runId }) {
  const run = runIssue(inputs, events);
  if (run.error) return { status: 'refused', reason: run.error };
  let issue;
  try {
    issue = await adapter.getIssue(run.number);
  } catch {
    return { status: 'refused', reason: 'issue not read' };
  }
  const id = identity(
    run.number,
    issue,
    await adapter.listEvents(run.number),
    await adapter.listComments(run.number),
  );
  if (id.error) return { status: 'refused', issue: run.number, reason: id.error };
  return claimEntry(adapter, id.key, runId);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const read = (p) => {
    try {
      return p ? JSON.parse(readFileSync(p, 'utf8')) : undefined;
    } catch {
      return null;
    }
  };
  const inputs = read(process.env.INPUTS);
  const events = read(process.env.TRIGGER_EVENTS);
  const r =
    inputs === null || events === null
      ? { status: 'refused', reason: 'inputs or trigger events unreadable' }
      : await guard(ghEntryAdapter(), {
          inputs: inputs ?? {},
          events,
          runId: process.env.TESSL_LAUNCH_RUN_ID,
        });
  console.log(JSON.stringify(r));
  if (r.status !== 'claimed' && r.status !== 'resumed') process.exit(1);
}
