// The factory learning loops' durable record, and the decision interface the
// external block coordinator calls at each Europe/London block start.
//
// Four proposal-only learners share this ledger and one proposal schema:
//
//   lens-tuning        05:40, 11:40, 17:40, 23:40 daily: review lens misses
//   review-feedback    05:10 daily: review feedback accepted or declined
//   run-learning       05:20 daily: factory run friction, failures, no-ops
//   instruction-tidy   05:30 Mondays: AGENTS.md guidance that a test, a lint
//                      rule or an area-scoped instruction should replace
//
// No learner edits anything. Each reads public evidence from this repository
// and saves *proposals*. The coordinator decides apply, defer or reject after
// validating each one against current code; an accepted proposal becomes an
// ordinary factory issue, implemented and reviewed like any other.
//
// Observed limitation: the runtime scheduled-findings integration is disabled
// for this workspace. Ordinary Tessl run reports are available, so each run
// ends its report with this ledger's summary, and the ledger itself is
// ledger.json on the branch LEDGER_BRANCH on origin, written with a
// fast-forward push only. Everything in it is repository-public; it holds no
// private log content or identifiers.
//
// The decisions are plain functions, tested in ledger.test.mjs. The command
// line at the bottom wires them to git:
//
//   node scripts/lenses/ledger.mjs due [learner]     is a London slot due now?
//   node scripts/lenses/ledger.mjs manual <learner>  may a manual run start now?
//   node scripts/lenses/ledger.mjs record <file>     save a finished run
//   node scripts/lenses/ledger.mjs pending           proposals awaiting a decision
//   node scripts/lenses/ledger.mjs decide <file>     record apply/defer/reject
//   node scripts/lenses/ledger.mjs summary [runId]   markdown for the run report
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const LEDGER_BRANCH = 'factory-state/review-lenses';
export const LEDGER_FILE = 'ledger.json';
export const TIMEZONE = 'Europe/London';
// A run may start this long after its slot and still count for it. Nothing
// later may claim the slot.
export const SLOT_WINDOW_MINUTES = 20;
export const REPOSITORY_URL = 'https://github.com/guypod/carnival-evolution-20261028';
// The loop's own name. It may propose, but never decide its own proposals.
export const LOOP_NAME = 'review-lens-improvement';

// Each learner's London slots and the proposal kinds it may make. weekday is
// 1 for Monday, as in cron.
export const LEARNERS = {
  'lens-tuning': { hours: [5, 11, 17, 23], minute: 40, kinds: ['amend-lens', 'new-lens'] },
  'review-feedback': {
    hours: [5],
    minute: 10,
    kinds: ['amend-lens', 'new-lens', 'amend-instruction', 'add-check'],
  },
  'run-learning': { hours: [5], minute: 20, kinds: ['amend-instruction', 'add-check'] },
  'instruction-tidy': {
    hours: [5],
    minute: 30,
    weekday: 1,
    kinds: ['replace-with-check', 'scope-instruction'],
  },
};
export const DEFAULT_LEARNER = 'lens-tuning';

// The standards no proposal may relax. They are constants in this file, not
// ledger data, so no proposal, decision or amount of evidence overrides them:
// changing them is an ordinary reviewed change to this file.
export const SAFETY_STANDARDS = [
  'mandatory-safety',
  'public-input-guards',
  'exact-head-tests-and-review',
  'evidence-standards',
];
// Files that carry those standards. A proposal that weakens anything here is
// treated as weakening them, whatever it declares.
export const PROTECTED_PATHS = [
  /^\.github\//,
  /^tessl\.json$/,
  /^scripts\/factory\//,
  /^scripts\/lenses\//,
  /^scripts\/visual\//,
  /^\.tessl-code-review\.yml$/,
  /^tessl\/code-review@[^#]+#review-security-and-privacy$/,
];

// A manual run inspects a bounded, real window: at most this far back, at most
// this many per learner per London day, and recorded soon after it really ran.
export const MANUAL_LOOKBACK_HOURS = 24;
export const MANUAL_RUNS_PER_DAY = 2;
// The longest a run may take, from the action's timeout with margin. A run
// recorded later than this after its start is refused as not its real time.
export const MAX_RUN_MINUTES = 30;

const EVIDENCE_KINDS = [
  'pr',
  'review-finding',
  'repair',
  'test',
  'live-play',
  'ci-run',
  'factory-comment',
  'instruction',
];
const COVERAGE = ['complete', 'partial', 'failed'];
const DECISIONS = ['apply', 'defer', 'reject'];
// What the coordinator found when it checked a proposal against current code.
// Only a proposal that still holds may be applied.
const VALIDATION = ['current', 'stale', 'already-fixed', 'unsupported'];
// Only these statuses wait for the coordinator.
const PENDING = ['open', 'deferred'];
const COMMIT = /^[0-9a-f]{7,40}$/;
const MANUAL_ID = /^manual-[A-Za-z0-9._-]{1,64}$/;

/** The London wall-clock date, weekday and time of an instant. */
export function londonTime(instant) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: TIMEZONE,
      hourCycle: 'h23',
      weekday: 'short',
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
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

/**
 * The learner's slot an instant falls in, or null outside every window. The id
 * is the London wall-clock slot, so it is the same whatever the UTC offset, and
 * no slot falls in a DST change hour.
 */
export function slotAt(instant, learner = DEFAULT_LEARNER) {
  const config = LEARNERS[learner];
  if (!config) return null;
  const { date, weekday, hour, minute } = londonTime(instant);
  const since = minute - config.minute;
  if (!config.hours.includes(hour) || since < 0 || since >= SLOT_WINDOW_MINUTES) return null;
  if (config.weekday !== undefined && weekday !== config.weekday) return null;
  return `${date}T${String(hour).padStart(2, '0')}:${String(config.minute).padStart(2, '0')} ${TIMEZONE}`;
}

export function emptyLedger() {
  return { schemaVersion: 2, timezone: TIMEZONE, runs: [], proposals: [] };
}

const learnerOf = (run) => run.learner ?? DEFAULT_LEARNER;

/**
 * Whether a scheduled run should inspect now. A slot already covered
 * completely is not inspected again; a partial or failed one may be retried
 * inside its window. A slot whose window has passed is never run late or
 * recorded as run. Manual runs never count here.
 */
export function dueSlot(ledger, now, learner = DEFAULT_LEARNER) {
  if (!LEARNERS[learner]) return { due: false, slot: null, reason: `unknown learner ${learner}` };
  const slot = slotAt(now, learner);
  if (!slot) return { due: false, slot: null, reason: `outside every ${learner} slot window` };
  const covered = ledger.runs.some(
    (r) =>
      r.trigger !== 'manual' &&
      learnerOf(r) === learner &&
      r.slot === slot &&
      r.coverage.status === 'complete',
  );
  if (covered) return { due: false, slot, reason: `slot ${slot} is already covered` };
  return { due: true, slot, reason: `slot ${slot} is due` };
}

/**
 * Whether a manual initial inspection may start now. It claims no slot: it
 * records its own manualId and real times, and looks back at most
 * MANUAL_LOOKBACK_HOURS. It is bounded per learner per London day.
 */
export function manualStart(ledger, now, learner = DEFAULT_LEARNER) {
  if (!LEARNERS[learner]) return { allowed: false, reason: `unknown learner ${learner}` };
  const today = londonTime(now).date;
  const used = ledger.runs.filter(
    (r) =>
      r.trigger === 'manual' && learnerOf(r) === learner && londonTime(r.startedAt).date === today,
  ).length;
  if (used >= MANUAL_RUNS_PER_DAY) {
    return { allowed: false, reason: `${learner} already has ${used} manual runs today` };
  }
  const startedAt = new Date(now).toISOString();
  const since = new Date(Date.parse(now) - MANUAL_LOOKBACK_HOURS * 3600_000).toISOString();
  return { allowed: true, learner, startedAt, since, reason: 'manual run, no slot claimed' };
}

/** Every lens ref configured in .tessl-code-review.yml. */
export function configuredLenses(yaml) {
  return [...yaml.matchAll(/^\s*-\s*ref:\s*(\S+)\s*$/gm)].map((m) => m[1]);
}

/** The stable fingerprint of a proposal: kind, target and normalised title. */
export function fingerprint({ kind, target, title }) {
  const text = [kind, target, title.toLowerCase().replace(/\s+/g, ' ').trim()].join('\n');
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

const isText = (value) => typeof value === 'string' && value.trim() !== '';
const isTime = (value) => isText(value) && !Number.isNaN(Date.parse(value));
// A repository-relative file path, never outside the clone.
const isRepoPath = (value) =>
  isText(value) && !value.startsWith('/') && !value.split('/').includes('..');

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

/** Whether a proposal, applied, would relax one of the SAFETY_STANDARDS. */
export function touchesSafety(proposal) {
  if (!proposal.weakens) return false;
  if ((proposal.standards ?? []).length > 0) return true;
  return PROTECTED_PATHS.some((path) => path.test(proposal.target ?? ''));
}

/** Errors in one proposal against the shared schema. */
function proposalErrors(p, at, learner, { lenses, exists }) {
  const errors = [];
  const kinds = LEARNERS[learner]?.kinds ?? [];
  if (!kinds.includes(p?.kind)) {
    return [`${at}: kind must be one of ${kinds.join(', ')} for ${learner}`];
  }
  if (p.kind === 'amend-lens' && !lenses.includes(p.target)) {
    errors.push(`${at}: ${p.target} is not a configured lens`);
  } else if (p.kind === 'new-lens' && !/^new:[a-z0-9-]+$/.test(p.target ?? '')) {
    errors.push(`${at}: a new lens is named new:<slug>`);
  } else if (!p.kind.endsWith('-lens') && !isRepoPath(p.target)) {
    errors.push(`${at}: target must be a path in this repository`);
  } else if (['amend-instruction', 'replace-with-check'].includes(p.kind) && !exists(p.target)) {
    errors.push(`${at}: ${p.target} does not exist`);
  }
  for (const field of ['title', 'change', 'rationale']) {
    if (!isText(p[field])) errors.push(`${at}: needs ${field}`);
  }
  // A change that relaxes anything must say so, so it is never slipped in to
  // make reviews pass, and name the safety standards it touches.
  if (typeof p.weakens !== 'boolean') errors.push(`${at}: must declare weakens true or false`);
  if (!Array.isArray(p.standards) || p.standards.some((s) => !SAFETY_STANDARDS.includes(s))) {
    errors.push(`${at}: standards must list only ${SAFETY_STANDARDS.join(', ')}`);
  }
  // Instructions never grow by themselves: a change to instruction text says
  // how many lines it adds, and a tidy must not add any.
  if (!Number.isInteger(p.netLines)) errors.push(`${at}: must declare netLines as an integer`);
  else if (learner === 'instruction-tidy' && p.netLines > 0) {
    errors.push(`${at}: an instruction tidy must not grow the instructions`);
  }
  if (p.kind === 'replace-with-check' && !isRepoPath(p.check)) {
    errors.push(`${at}: replace-with-check names the test or lint file in check`);
  }
  errors.push(...evidenceErrors(p.evidence, at));
  return errors;
}

/**
 * Every way a finished run is malformed; empty when it can be saved. `now` is
 * the real recording time. A scheduled run's slot must be the slot its real
 * start fell in, and a run is recorded within MAX_RUN_MINUTES of starting, so
 * neither a missed slot nor a different slot can be claimed after the fact.
 */
export function validateRun(run, { lenses, now, ledger = emptyLedger(), exists = () => true }) {
  const errors = [];
  const learner = run?.learner;
  if (!LEARNERS[learner]) errors.push(`learner must be one of ${Object.keys(LEARNERS).join(', ')}`);
  if (!isText(run?.runId)) errors.push('run needs the Tessl runId');
  for (const field of ['startedAt', 'finishedAt']) {
    if (!isTime(run?.[field])) errors.push(`run needs ${field} as the actual time`);
  }
  if (isTime(run?.startedAt) && isTime(run?.finishedAt)) {
    const start = Date.parse(run.startedAt);
    const finish = Date.parse(run.finishedAt);
    const at = Date.parse(now);
    if (finish < start) errors.push('finishedAt is before startedAt');
    if (finish > at + 60_000) errors.push('finishedAt is in the future');
    if (at - start > MAX_RUN_MINUTES * 60_000) {
      errors.push(`a run is recorded within ${MAX_RUN_MINUTES} minutes of its real start`);
    }
  }
  if (run?.trigger === 'manual') {
    if (run.slot !== undefined) errors.push('a manual run claims no slot');
    if (!MANUAL_ID.test(run.manualId ?? '')) errors.push('a manual run needs manualId manual-<id>');
    if (!isTime(run.since)) errors.push('a manual run records since, the start of its window');
    else if (isTime(run.startedAt)) {
      const back = Date.parse(run.startedAt) - Date.parse(run.since);
      if (back < 0 || back > MANUAL_LOOKBACK_HOURS * 3600_000) {
        errors.push(`a manual run looks back at most ${MANUAL_LOOKBACK_HOURS} hours`);
      }
    }
    if (LEARNERS[learner] && isTime(run.startedAt)) {
      // Saving the same run again is not a further manual run.
      const others = { ...ledger, runs: ledger.runs.filter((r) => r.runId !== run.runId) };
      const check = manualStart(others, run.startedAt, learner);
      if (!check.allowed) errors.push(check.reason);
    }
  } else if (run?.trigger === 'schedule') {
    if (run.manualId !== undefined) errors.push('a scheduled run has no manualId');
    if (LEARNERS[learner] && isTime(run.startedAt)) {
      const real = slotAt(run.startedAt, learner);
      if (!real || real !== run.slot) {
        errors.push(`slot must be the ${learner} slot its real start fell in, not ${run.slot}`);
      }
    }
  } else {
    errors.push('trigger must be schedule or manual');
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
    errors.push(...proposalErrors(p, `proposals[${i}]`, learner, { lenses, exists }));
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
      learner: run.learner,
      kind: p.kind,
      target: p.target,
      title: p.title,
      change: p.change,
      rationale: p.rationale,
      weakens: p.weakens,
      standards: p.standards,
      netLines: p.netLines,
      ...(p.check ? { check: p.check } : {}),
      evidence: p.evidence,
      status: 'open',
      firstSeen: run.finishedAt,
      seenIn: [run.runId],
      decisions: [],
    });
  }
  const { runId, learner, trigger, startedAt, finishedAt, coverage } = run;
  const when =
    trigger === 'manual' ? { manualId: run.manualId, since: run.since } : { slot: run.slot };
  return {
    ...ledger,
    runs: [
      ...ledger.runs,
      { runId, learner, trigger, ...when, startedAt, finishedAt, coverage, fingerprints },
    ],
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
  // Every proposal is checked against current code before it is decided.
  if (!VALIDATION.includes(decision.validation)) {
    errors.push(`validation must be one of ${VALIDATION.join(', ')}`);
  }
  if (!COMMIT.test(decision.checkedAt ?? '')) {
    errors.push('checkedAt must be the main commit the proposal was validated against');
  }
  errors.push(...evidenceErrors(decision.evidence, 'decision'));
  if (decision.decision === 'apply') {
    if (decision.validation !== 'current') {
      errors.push(`a ${decision.validation} proposal cannot be applied: reject or defer it`);
    }
    // The safety standards are not overridable. No amount of evidence makes a
    // weakening of them applicable.
    if (touchesSafety(proposal)) {
      errors.push('a proposal that weakens a safety standard can never be applied');
    } else if (proposal.weakens) {
      // Relaxing anything else needs evidence from more than one pull request.
      const prs = new Set(
        [...proposal.evidence, ...(decision.evidence ?? [])]
          .filter((e) => e.kind === 'pr')
          .map((e) => e.ref),
      );
      if (prs.size < 2) errors.push('applying a weakening proposal needs evidence from two PRs');
    }
  }
  return errors;
}

const STATUS = { apply: 'accepted', defer: 'deferred', reject: 'rejected' };

/** The ledger with a decision saved. Call validateDecision first. */
export function recordDecision(ledger, decision, now) {
  const {
    decision: verdict,
    rationale,
    evidence,
    decidedBy,
    slot,
    validation,
    checkedAt,
  } = decision;
  return {
    ...ledger,
    proposals: ledger.proposals.map((p) =>
      p.fingerprint === decision.fingerprint
        ? {
            ...p,
            status: STATUS[verdict],
            decisions: [
              ...p.decisions,
              {
                decision: verdict,
                rationale,
                validation,
                checkedAt,
                evidence,
                decidedBy,
                slot,
                at: now,
              },
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
    `Accepted ${proposal.learner} proposal \`${proposal.fingerprint}\`.`,
    '',
    `Target: \`${proposal.target}\` (${proposal.kind})`,
    ...(proposal.check ? ['', `Check: \`${proposal.check}\``] : []),
    '',
    `Change: ${proposal.change}`,
    '',
    `Why: ${proposal.rationale}`,
    '',
    `Decision: ${last.decision} by ${last.decidedBy} at ${last.slot}, validated as ${last.validation} against ${last.checkedAt}: ${last.rationale}`,
    '',
    'Evidence:',
    ...[...proposal.evidence, ...last.evidence].map((e) => `- ${e.kind} ${e.ref}: ${e.url}`),
    '',
    `Done when the change is made as proposed, a test or check covers it, instruction text grows by at most ${proposal.netLines} line(s), and none of ${SAFETY_STANDARDS.join(', ')} is weakened.`,
  ];
  return { title: `${proposal.learner}: ${proposal.title}`, body: lines.join('\n') };
}

const runLabel = (run) =>
  run.trigger === 'manual'
    ? `manual ${run.manualId} (no slot, since ${run.since})`
    : (run.slot ?? 'unknown slot');

/** A short markdown summary for the Tessl run report, the findings fallback. */
export function summary(ledger, runId) {
  const run = ledger.runs.find((r) => r.runId === runId) ?? ledger.runs.at(-1);
  const pending = pendingProposals(ledger);
  const lines = [
    `Factory learning proposals (repository ledger; the runtime scheduled-findings integration is disabled, so this run report is the fallback): ${REPOSITORY_URL}/blob/${LEDGER_BRANCH}/${LEDGER_FILE}`,
  ];
  if (run) {
    lines.push(
      `Run ${run.runId} (${learnerOf(run)}) for ${runLabel(run)}: coverage ${run.coverage.status}, ${run.fingerprints.length} proposal(s), started ${run.startedAt}, finished ${run.finishedAt}.`,
    );
    if (run.coverage.gaps) lines.push(`Gaps: ${run.coverage.gaps}`);
  }
  lines.push(`${pending.length} proposal(s) awaiting a decision:`);
  for (const p of pending) {
    lines.push(
      `- ${p.fingerprint} [${p.status}] ${p.learner ?? DEFAULT_LEARNER} ${p.kind} ${p.target}: ${p.title}`,
    );
  }
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
  const [command, arg] = process.argv.slice(2);
  const repo = process.cwd();
  const now = new Date().toISOString();
  const { ledger, base } = readLedger(repo);
  const print = (value) => console.log(JSON.stringify(value, null, 2));
  if (command === 'due') {
    print({ now, ...dueSlot(ledger, now, arg ?? DEFAULT_LEARNER) });
  } else if (command === 'manual') {
    print({ now, ...manualStart(ledger, now, arg) });
  } else if (command === 'pending') {
    print(pendingProposals(ledger));
  } else if (command === 'summary') {
    console.log(summary(ledger, arg));
  } else if (command === 'record') {
    const run = JSON.parse(readFileSync(arg, 'utf8'));
    const lenses = configuredLenses(readFileSync(join(repo, '.tessl-code-review.yml'), 'utf8'));
    const exists = (path) => existsSync(join(repo, path));
    const errors = validateRun(run, { lenses, now, ledger, exists });
    if (errors.length) fail(errors);
    const next = recordRun(ledger, run);
    if (next === ledger) {
      print({ unchanged: `run ${run.runId} is already recorded` });
    } else {
      const message = `${run.learner}: ${run.runId} for ${runLabel(run)}`;
      const commit = writeLedger(repo, next, base, message);
      print({ commit, pending: pendingProposals(next).length });
    }
  } else if (command === 'decide') {
    const decision = JSON.parse(readFileSync(arg, 'utf8'));
    const errors = validateDecision(ledger, decision);
    if (errors.length) fail(errors);
    const next = recordDecision(ledger, decision, now);
    const message = `factory learning: ${decision.decision} ${decision.fingerprint}`;
    const commit = writeLedger(repo, next, base, message);
    const proposal = next.proposals.find((p) => p.fingerprint === decision.fingerprint);
    print({
      commit,
      status: proposal.status,
      ...(proposal.status === 'accepted' ? { issue: implementationIssue(proposal) } : {}),
    });
  } else {
    console.error(
      'usage: ledger.mjs due [learner] | manual <learner> | pending | summary [runId] | record <run> | decide <file>',
    );
    process.exit(2);
  }
}
