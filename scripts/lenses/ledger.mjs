// The review-lens improvement loop's durable record, and the decision interface
// the external block coordinator calls at each Europe/London block start.
//
// The loop never edits a lens. It reads public evidence from this repository
// (pull request diffs, review findings, repairs, tests, live-play notes) and
// saves *proposals* to change an existing lens or add a new one. A person or
// the external coordinator decides apply, defer or reject; an accepted proposal
// becomes an ordinary factory issue, implemented and validated like any other.
//
// Native Tessl schedule findings are disabled for this workspace, so this
// ledger is the fallback: ledger.json on the branch LEDGER_BRANCH on origin,
// written with a fast-forward push only, and summarised in each run's Tessl
// result. Everything in it is repository-public; it holds no private log
// content or identifiers.
//
// The decisions are plain functions, tested in ledger.test.mjs. The command
// line at the bottom wires them to git:
//
//   node scripts/lenses/ledger.mjs due              is a London slot due now?
//   node scripts/lenses/ledger.mjs record <file>    save a finished run
//   node scripts/lenses/ledger.mjs pending          proposals awaiting a decision
//   node scripts/lenses/ledger.mjs decide <file>    record apply/defer/reject
//   node scripts/lenses/ledger.mjs summary          markdown for the run result
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const LEDGER_BRANCH = 'factory-state/review-lenses';
export const LEDGER_FILE = 'ledger.json';
export const TIMEZONE = 'Europe/London';
// Twenty minutes before each six-hour block ends, in London wall-clock time.
export const SLOT_HOURS = [5, 11, 17, 23];
export const SLOT_MINUTE = 40;
// A run may start this long after its slot and still count for it: the block
// it reviews ends at the next hour, and nothing later may claim the slot.
export const SLOT_WINDOW_MINUTES = 20;
export const REPOSITORY_URL = 'https://github.com/guypod/carnival-evolution-20261028';
// The loop's own name. It may propose, but never decide its own proposals.
export const LOOP_NAME = 'review-lens-improvement';

const EVIDENCE_KINDS = ['pr', 'review-finding', 'repair', 'test', 'live-play'];
const COVERAGE = ['complete', 'partial', 'failed'];
const DECISIONS = ['apply', 'defer', 'reject'];
// Only these statuses wait for the coordinator.
const PENDING = ['open', 'deferred'];
const COMMIT = /^[0-9a-f]{7,40}$/;

/** The London wall-clock date and time of an instant. */
export function londonTime(instant) {
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
      .formatToParts(new Date(instant))
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

/**
 * The slot an instant falls in, or null outside every slot's window. The id is
 * the London wall-clock slot, so it is the same whatever the UTC offset, and
 * every London day has exactly four: the slots never fall in a DST change hour.
 */
export function slotAt(instant) {
  const { date, hour, minute } = londonTime(instant);
  const since = minute - SLOT_MINUTE;
  if (!SLOT_HOURS.includes(hour) || since < 0 || since >= SLOT_WINDOW_MINUTES) return null;
  return `${date}T${String(hour).padStart(2, '0')}:${SLOT_MINUTE} ${TIMEZONE}`;
}

export function emptyLedger() {
  return { schemaVersion: 1, timezone: TIMEZONE, runs: [], proposals: [] };
}

/**
 * Whether this run should review now. A slot already covered completely is not
 * reviewed again; a partial or failed one may be retried inside its window.
 * A slot whose window has passed is never run late or recorded as run.
 */
export function dueSlot(ledger, now) {
  const slot = slotAt(now);
  if (!slot) return { due: false, slot: null, reason: 'outside every London slot window' };
  if (ledger.runs.some((r) => r.slot === slot && r.coverage.status === 'complete')) {
    return { due: false, slot, reason: `slot ${slot} is already covered` };
  }
  return { due: true, slot, reason: `slot ${slot} is due` };
}

/** Every lens ref configured in .tessl-code-review.yml. */
export function configuredLenses(yaml) {
  return [...yaml.matchAll(/^\s*-\s*ref:\s*(\S+)\s*$/gm)].map((m) => m[1]);
}

/** The stable fingerprint of a proposal: lens, kind and normalised title. */
export function fingerprint({ lens, kind, title }) {
  const text = [lens, kind, title.toLowerCase().replace(/\s+/g, ' ').trim()].join('\n');
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

const isText = (value) => typeof value === 'string' && value.trim() !== '';

/** Evidence must point at something public in this repository. */
export function evidenceErrors(evidence, where) {
  if (!Array.isArray(evidence) || evidence.length === 0) return [`${where}: needs evidence`];
  return evidence.flatMap((item, i) => {
    const at = `${where}.evidence[${i}]`;
    const errors = [];
    if (!EVIDENCE_KINDS.includes(item?.kind)) errors.push(`${at}: unknown kind ${item?.kind}`);
    if (!isText(item?.ref)) errors.push(`${at}: needs a ref`);
    const url = item?.url;
    if (!(typeof url === 'string' && url.startsWith(`${REPOSITORY_URL}/`))) {
      errors.push(`${at}: url must be in ${REPOSITORY_URL}`);
    }
    if (item?.commit !== undefined && !COMMIT.test(item.commit)) {
      errors.push(`${at}: commit must be a sha`);
    }
    return errors;
  });
}

/** Every way a finished run is malformed; empty when it can be saved. */
export function validateRun(run, lenses) {
  const errors = [];
  if (!isText(run?.runId)) errors.push('run needs the Tessl runId');
  if (!isText(run?.slot)) errors.push('run needs its slot');
  for (const field of ['startedAt', 'finishedAt']) {
    if (!isText(run?.[field]) || Number.isNaN(Date.parse(run[field]))) {
      errors.push(`run needs ${field} as the actual time`);
    }
  }
  if (!COVERAGE.includes(run?.coverage?.status)) errors.push('coverage.status is not valid');
  if (!Array.isArray(run?.coverage?.inspected)) errors.push('coverage.inspected must list refs');
  if (run?.coverage?.status !== 'complete' && !isText(run?.coverage?.gaps)) {
    errors.push('partial or failed coverage must say what was missed in coverage.gaps');
  }
  if (run?.coverage?.status === 'failed' && run?.proposals?.length) {
    errors.push('a failed run records no proposals');
  }
  for (const [i, p] of (run?.proposals ?? []).entries()) {
    const at = `proposals[${i}]`;
    if (p.kind === 'amend' && !lenses.includes(p.lens)) {
      errors.push(`${at}: ${p.lens} is not a configured lens`);
    } else if (p.kind === 'new' && !/^new:[a-z0-9-]+$/.test(p.lens ?? '')) {
      errors.push(`${at}: a new lens is named new:<slug>`);
    } else if (!['amend', 'new'].includes(p.kind)) {
      errors.push(`${at}: kind must be amend or new`);
    }
    for (const field of ['title', 'change', 'rationale']) {
      if (!isText(p[field])) errors.push(`${at}: needs ${field}`);
    }
    // A change that relaxes a lens must say so, so it is never slipped in to
    // make reviews pass.
    if (typeof p.weakens !== 'boolean') errors.push(`${at}: must declare weakens true or false`);
    errors.push(...evidenceErrors(p.evidence, at));
  }
  return errors;
}

const mergeEvidence = (old, extra) => {
  const seen = new Set(old.map((e) => `${e.kind}:${e.ref}`));
  return [...old, ...extra.filter((e) => !seen.has(`${e.kind}:${e.ref}`))];
};

/**
 * The ledger with a finished run saved. Recording a runId again changes
 * nothing. A proposal seen before keeps its status and gains new evidence.
 */
export function recordRun(ledger, run) {
  if (ledger.runs.some((r) => r.runId === run.runId)) return ledger;
  const proposals = ledger.proposals.map((p) => ({ ...p }));
  const fingerprints = [];
  for (const p of run.proposals ?? []) {
    const id = fingerprint(p);
    fingerprints.push(id);
    const known = proposals.find((q) => q.fingerprint === id);
    if (known) {
      known.evidence = mergeEvidence(known.evidence, p.evidence);
      known.seenIn = [...known.seenIn, run.runId];
      continue;
    }
    proposals.push({
      fingerprint: id,
      lens: p.lens,
      kind: p.kind,
      title: p.title,
      change: p.change,
      rationale: p.rationale,
      weakens: p.weakens,
      evidence: p.evidence,
      status: 'open',
      firstSeen: run.finishedAt,
      seenIn: [run.runId],
      decisions: [],
    });
  }
  const { runId, slot, startedAt, finishedAt, coverage } = run;
  return {
    ...ledger,
    runs: [...ledger.runs, { runId, slot, startedAt, finishedAt, coverage, fingerprints }],
    proposals,
  };
}

/** Proposals still waiting for apply, defer or reject. */
export function pendingProposals(ledger) {
  return ledger.proposals.filter((p) => PENDING.includes(p.status));
}

/** Every reason a decision is refused; empty when it can be saved. */
export function validateDecision(ledger, decision) {
  const errors = [];
  const proposal = ledger.proposals.find((p) => p.fingerprint === decision?.fingerprint);
  if (!proposal) return [`no proposal ${decision?.fingerprint}`];
  if (!PENDING.includes(proposal.status)) {
    errors.push(`proposal ${proposal.fingerprint} is already ${proposal.status}`);
  }
  if (!DECISIONS.includes(decision.decision))
    errors.push('decision must be apply, defer or reject');
  if (!isText(decision.rationale)) errors.push('a decision needs a rationale');
  if (!isText(decision.decidedBy)) errors.push('a decision needs decidedBy');
  if (decision.decidedBy === LOOP_NAME) errors.push('the loop cannot decide its own proposals');
  if (!isText(decision.slot)) errors.push('a decision names the block-start slot it was made in');
  errors.push(...evidenceErrors(decision.evidence, 'decision'));
  // Relaxing a lens needs evidence from more than one pull request.
  if (decision.decision === 'apply' && proposal.weakens) {
    const prs = new Set(
      [...proposal.evidence, ...(decision.evidence ?? [])]
        .filter((e) => e.kind === 'pr')
        .map((e) => e.ref),
    );
    if (prs.size < 2) errors.push('applying a weakening proposal needs evidence from two PRs');
  }
  return errors;
}

const STATUS = { apply: 'accepted', defer: 'deferred', reject: 'rejected' };

/** The ledger with a decision saved. Call validateDecision first. */
export function recordDecision(ledger, decision, now) {
  const { decision: verdict, rationale, evidence, decidedBy, slot } = decision;
  return {
    ...ledger,
    proposals: ledger.proposals.map((p) =>
      p.fingerprint === decision.fingerprint
        ? {
            ...p,
            status: STATUS[verdict],
            decisions: [
              ...p.decisions,
              { decision: verdict, rationale, evidence, decidedBy, slot, at: now },
            ],
          }
        : p,
    ),
  };
}

/**
 * The factory issue for an accepted proposal. It goes through the existing
 * implement flow: the owner labels it, the writer key serialises the work and
 * the change is reviewed like any other. Nothing here approves it.
 */
export function implementationIssue(proposal) {
  const last = proposal.decisions.at(-1);
  const lines = [
    `Accepted review-lens proposal \`${proposal.fingerprint}\`.`,
    '',
    `Lens: \`${proposal.lens}\` (${proposal.kind})`,
    '',
    `Change: ${proposal.change}`,
    '',
    `Why: ${proposal.rationale}`,
    '',
    `Decision: ${last.decision} by ${last.decidedBy} at ${last.slot}: ${last.rationale}`,
    '',
    'Evidence:',
    ...[...proposal.evidence, ...last.evidence].map((e) => `- ${e.kind} ${e.ref}: ${e.url}`),
    '',
    'Done when the lens is changed as proposed, its fixtures or tests cover the change, and no',
    'existing lens is weakened beyond what the proposal declares.',
  ];
  return { title: `Review lens: ${proposal.title}`, body: lines.join('\n') };
}

/** A short markdown summary for the Tessl run result: the findings fallback. */
export function summary(ledger, runId) {
  const run = ledger.runs.find((r) => r.runId === runId) ?? ledger.runs.at(-1);
  const pending = pendingProposals(ledger);
  const lines = [
    `Review-lens findings (fallback ledger, not the native findings UI): ${REPOSITORY_URL}/blob/${LEDGER_BRANCH}/${LEDGER_FILE}`,
  ];
  if (run) {
    lines.push(
      `Run ${run.runId} for ${run.slot}: coverage ${run.coverage.status}, ${run.fingerprints.length} proposal(s), started ${run.startedAt}, finished ${run.finishedAt}.`,
    );
    if (run.coverage.gaps) lines.push(`Gaps: ${run.coverage.gaps}`);
  }
  lines.push(`${pending.length} proposal(s) awaiting a decision:`);
  for (const p of pending) lines.push(`- ${p.fingerprint} [${p.status}] ${p.lens}: ${p.title}`);
  return lines.join('\n');
}

// Storage, as in scripts/visual/ledger.mjs: a plain branch, read with fetch and
// written as one fast-forward commit, so a lost race is refused, not merged.

const git = (cwd, ...args) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** The ledger on origin and the commit it was read from, or an empty one. */
export function readLedger(repo, remote = 'origin') {
  // ls-remote exits 2 only when the remote answered and has no such branch;
  // any other failure stops the run instead of passing for a first run.
  try {
    git(repo, 'ls-remote', '--exit-code', '--heads', remote, LEDGER_BRANCH);
  } catch (error) {
    if (error.status === 2) return { ledger: emptyLedger(), base: null };
    throw error;
  }
  const tracking = `refs/remotes/${remote}/${LEDGER_BRANCH}`;
  git(repo, 'fetch', '--quiet', remote, `+refs/heads/${LEDGER_BRANCH}:${tracking}`);
  const base = git(repo, 'rev-parse', tracking);
  return { ledger: JSON.parse(git(repo, 'show', `${base}:${LEDGER_FILE}`)), base };
}

/** Push the ledger as a child of `base`. Throws if origin moved since the read. */
export function writeLedger(repo, ledger, base, message, remote = 'origin') {
  const dir = mkdtempSync(join(tmpdir(), 'lens-ledger-'));
  try {
    const file = join(dir, LEDGER_FILE);
    writeFileSync(file, JSON.stringify(ledger, null, 2) + '\n');
    const blob = git(repo, 'hash-object', '-w', file);
    const env = { ...process.env, GIT_INDEX_FILE: join(dir, 'index') };
    execFileSync('git', ['update-index', '--add', '--cacheinfo', `100644,${blob},${LEDGER_FILE}`], {
      cwd: repo,
      env,
    });
    const tree = execFileSync('git', ['write-tree'], { cwd: repo, env, encoding: 'utf8' }).trim();
    const commit = git(repo, 'commit-tree', tree, ...(base ? ['-p', base] : []), '-m', message);
    git(repo, 'push', '--quiet', remote, `${commit}:refs/heads/${LEDGER_BRANCH}`);
    return commit;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const fail = (errors) => {
  console.error(errors.join('\n'));
  process.exit(1);
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const [command, file] = process.argv.slice(2);
  const repo = process.cwd();
  const now = new Date().toISOString();
  const { ledger, base } = readLedger(repo);
  const print = (value) => console.log(JSON.stringify(value, null, 2));
  if (command === 'due') {
    print({ now, ...dueSlot(ledger, now) });
  } else if (command === 'pending') {
    print(pendingProposals(ledger));
  } else if (command === 'summary') {
    console.log(summary(ledger, file));
  } else if (command === 'record') {
    const run = JSON.parse(readFileSync(file, 'utf8'));
    const lenses = configuredLenses(readFileSync(join(repo, '.tessl-code-review.yml'), 'utf8'));
    const errors = validateRun(run, lenses);
    if (errors.length) fail(errors);
    const next = recordRun(ledger, run);
    if (next === ledger) {
      print({ unchanged: `run ${run.runId} is already recorded` });
    } else {
      const commit = writeLedger(repo, next, base, `review lenses: ${run.runId} for ${run.slot}`);
      print({ commit, pending: pendingProposals(next).length });
    }
  } else if (command === 'decide') {
    const decision = JSON.parse(readFileSync(file, 'utf8'));
    const errors = validateDecision(ledger, decision);
    if (errors.length) fail(errors);
    const next = recordDecision(ledger, decision, now);
    const message = `review lenses: ${decision.decision} ${decision.fingerprint}`;
    const commit = writeLedger(repo, next, base, message);
    const proposal = next.proposals.find((p) => p.fingerprint === decision.fingerprint);
    print({
      commit,
      status: proposal.status,
      ...(proposal.status === 'accepted' ? { issue: implementationIssue(proposal) } : {}),
    });
  } else {
    console.error(
      'usage: ledger.mjs due | pending | summary [runId] | record <run> | decide <file>',
    );
    process.exit(2);
  }
}
