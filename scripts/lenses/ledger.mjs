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
//   node scripts/lenses/ledger.mjs correct <file>    downgrade a false coverage claim
//   node scripts/lenses/ledger.mjs pending           proposals awaiting a decision
//   node scripts/lenses/ledger.mjs decide <file>     record apply/defer/reject
//   node scripts/lenses/ledger.mjs issue <fp>        the issue for an accepted proposal
//   node scripts/lenses/ledger.mjs issued <fp> <url> record the issue opened for it
//   node scripts/lenses/ledger.mjs unissued          accepted proposals with no issue yet
//   node scripts/lenses/ledger.mjs summary [runId]   markdown for the run report
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LEDGER_BRANCH = 'factory-state/review-lenses';
export const LEDGER_FILE = 'ledger.json';
export const TIMEZONE = 'Europe/London';
// A run that starts this long after its slot is on time.
export const SLOT_WINDOW_MINUTES = 20;
// A scheduled run may wait behind the shared writer key. It still serves its
// slot if it really starts within this long of the slot's scheduled time, and
// records both times. Later than this, the slot is missed and stays missed.
export const MAX_QUEUE_DELAY_MINUTES = 180;
// The ledger is read and written whole. Past this size it is refused, never
// truncated, so a run fails closed instead of losing records.
export const MAX_LEDGER_BYTES = 4 * 1024 * 1024;
export const REPOSITORY_URL = 'https://github.com/guypod/carnival-evolution-20261028';
// The loop's own name. It may propose, but never decide its own proposals.
export const LOOP_NAME = 'review-lens-improvement';

// Each learner's London slots and the proposal kinds it may make. weekday is
// 1 for Monday, as in cron.
export const LEARNERS = Object.freeze({
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
});
export const DEFAULT_LEARNER = 'lens-tuning';
// Only the learners above, never an inherited property such as constructor.
const learnerConfig = (name) =>
  typeof name === 'string' && Object.hasOwn(LEARNERS, name) ? LEARNERS[name] : undefined;

// The standards no proposal may relax. They are constants in this file, not
// ledger data, so no proposal, decision or amount of evidence overrides them:
// changing them is an ordinary reviewed change to this file.
export const SAFETY_STANDARDS = [
  'mandatory-safety',
  'public-input-guards',
  'exact-head-tests-and-review',
  'evidence-standards',
];
// Files that carry those standards: CI, the factory contract and guards, the
// agent and skill instructions, the repository's own review lenses and review
// config, the security lens, and the test, lint and type-check setup. A
// proposal that weakens anything here is treated as weakening them, whatever
// it declares.
export const PROTECTED_PATHS = [
  /^\.github\//,
  /^\.tessl\//,
  /^tessl\.json$/,
  /(^|\/)AGENTS\.md$/,
  /(^|\/)CLAUDE\.md$/,
  /(^|\/)SKILL\.md$/,
  /^skills\//,
  /^tessl-factory\//,
  /^review-lenses\//,
  /^\.tessl-code-review\.yml$/,
  /^tessl\/code-review@[^#]+#review-security-and-privacy$/,
  /^scripts\/factory\//,
  /^scripts\/lenses\//,
  /^scripts\/visual\//,
  /^package\.json$/,
  /^package-lock\.json$/,
  /^eslint\.config\.js$/,
  /^tsconfig\.json$/,
  /^vite\.config\.ts$/,
  /^\.prettier(rc[^/]*|ignore)$/,
  /(^|\/)[^/]+\.test\.[cm]?[jt]s$/,
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
// A correction may also cite the issue that reported the false claim.
const CORRECTION_EVIDENCE_KINDS = [...EVIDENCE_KINDS, 'issue'];
const COVERAGE = ['complete', 'partial', 'failed'];

// The sources each learner must read, as in its skill. A run records one
// receipt per source in coverage.sources. A receipt cannot prove the source
// was understood, only what was listed and read, so classification is
// conservative: complete coverage needs every source listed in full
// (enumeration "complete") and read in full (read "full"). A capped list, a
// count without content, a truncated read or a missing receipt is partial at
// best, and gives no through unless that source names its own through.
export const REQUIRED_SOURCES = Object.freeze({
  'lens-tuning': [
    'pull-requests',
    'pr-diffs',
    'review-comments',
    'review-bodies',
    'visual-repair',
    'ci-runs',
    'tests',
    'live-play',
  ],
  'review-feedback': ['review-comments', 'review-bodies', 'follow-up-commits'],
  'run-learning': ['factory-comments', 'ci-runs', 'pull-requests', 'run-outcomes'],
  'instruction-tidy': ['instructions', 'review-lenses', 'tests-and-lint'],
});
const ENUMERATION = ['complete', 'capped', 'count-only', 'none'];
const READ = ['full', 'truncated', 'none'];

const sourceDone = (s) => s.enumeration === 'complete' && s.read === 'full';

/** The errors in a run's per-source receipts, given its coverage status. */
export function sourceErrors(run) {
  const required = Object.hasOwn(REQUIRED_SOURCES, run?.learner ?? '')
    ? REQUIRED_SOURCES[run.learner]
    : null;
  const sources = run?.coverage?.sources;
  if (!required) return [];
  if (!Array.isArray(sources) || !sources.every(isObject)) {
    return ['coverage.sources must list a receipt for every required source'];
  }
  const errors = [];
  const names = sources.map((s) => s.source);
  for (const [i, s] of sources.entries()) {
    const at = `coverage.sources[${i}]`;
    if (!required.includes(s.source)) errors.push(`${at}: unknown source ${s.source}`);
    if (names.indexOf(s.source) !== i) errors.push(`${at}: ${s.source} is listed twice`);
    if (!ENUMERATION.includes(s.enumeration)) {
      errors.push(`${at}: enumeration must be one of ${ENUMERATION.join(', ')}`);
    }
    if (!READ.includes(s.read)) errors.push(`${at}: read must be one of ${READ.join(', ')}`);
    if (!isText(s.scope)) errors.push(`${at}: scope must say what was listed and read`);
    if (!sourceDone(s) && !isText(s.gaps)) errors.push(`${at}: say what was not read in gaps`);
    if (s.through !== undefined && (!isTime(s.through) || sourceDone(s))) {
      errors.push(`${at}: through is a time, and only for a source not read in full`);
    }
  }
  const missing = required.filter((name) => !names.includes(name));
  const status = run.coverage.status;
  if (status === 'complete') {
    if (missing.length)
      errors.push(`complete coverage is missing receipts for ${missing.join(', ')}`);
    const short = sources.filter((s) => !sourceDone(s)).map((s) => s.source);
    if (short.length) {
      errors.push(
        `complete coverage needs every source listed and read in full, not ${short.join(', ')}`,
      );
    }
  }
  if (status === 'partial' && run.coverage.through !== undefined) {
    // Every source must have been read in full up to through.
    if (missing.length) errors.push(`coverage.through needs receipts for ${missing.join(', ')}`);
    for (const s of sources.filter((x) => !sourceDone(x))) {
      if (!isTime(s.through) || Date.parse(s.through) < Date.parse(run.coverage.through)) {
        errors.push(`coverage.through is later than ${s.source} was read in full`);
      }
    }
  }
  return errors;
}
const DECISIONS = ['apply', 'defer', 'reject'];
// What the coordinator found when it checked a proposal against current code.
// Only a proposal that still holds may be applied.
const VALIDATION = ['current', 'stale', 'already-fixed', 'unsupported'];
// Only these statuses wait for the coordinator.
const PENDING = ['open', 'deferred'];
const COMMIT = /^[0-9a-f]{7,40}$/;
const MANUAL_ID = /^manual-[A-Za-z0-9._-]{1,64}$/;
const STATUSES = ['open', 'deferred', 'accepted', 'rejected'];

const isText = (value) => typeof value === 'string' && value.trim() !== '';
const isTime = (value) => isText(value) && !Number.isNaN(Date.parse(value));
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const REPOSITORY_PATH = new URL(REPOSITORY_URL).pathname;

const LONDON = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIMEZONE,
  hourCycle: 'h23',
  weekday: 'short',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

/** The London wall-clock date, weekday and time of an instant. */
export function londonTime(instant) {
  const parts = Object.fromEntries(
    LONDON.formatToParts(new Date(instant)).map((p) => [p.type, p.value]),
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
  const config = learnerConfig(learner);
  if (!config) return null;
  const { date, weekday, hour, minute } = londonTime(instant);
  const since = minute - config.minute;
  if (!config.hours.includes(hour) || since < 0 || since >= SLOT_WINDOW_MINUTES) return null;
  if (config.weekday !== undefined && weekday !== config.weekday) return null;
  return `${date}T${String(hour).padStart(2, '0')}:${String(config.minute).padStart(2, '0')} ${TIMEZONE}`;
}

/**
 * The slot a scheduled run that really starts at `instant` serves: the
 * learner's latest slot at or before it, if that is at most
 * MAX_QUEUE_DELAY_MINUTES back. It keeps the scheduled intent (slot and
 * scheduledFor) apart from the real start, so a run delayed behind the writer
 * key is neither dropped nor dressed up as on time.
 */
export function owedSlot(instant, learner = DEFAULT_LEARNER) {
  const config = learnerConfig(learner);
  if (!config) return null;
  const at = Date.parse(instant);
  const minute = Math.floor(at / 60_000) * 60_000;
  for (let back = 0; back <= MAX_QUEUE_DELAY_MINUTES; back += 1) {
    const t = minute - back * 60_000;
    const slot = slotAt(t, learner);
    if (slot && londonTime(t).minute === config.minute) {
      const delayMinutes = Math.floor((at - t) / 60_000);
      return {
        slot,
        scheduledFor: new Date(t).toISOString(),
        delayMinutes,
        late: delayMinutes >= SLOT_WINDOW_MINUTES,
      };
    }
  }
  return null;
}

export function emptyLedger() {
  return { schemaVersion: 2, timezone: TIMEZONE, runs: [], proposals: [] };
}

const learnerOf = (run) => run.learner ?? DEFAULT_LEARNER;

// How far before a complete run's start the next scheduled run starts reading.
export const RETRY_OVERLAP_MINUTES = 60;

// Where the next scheduled run may resume after this one, or NaN. A complete
// run resumes an overlap before its start, but never before its own since. A
// partial run resumes exactly at its through, which already lies after its
// since, so a backlog read in batches only ever moves forward.
const resumeAt = (r) => {
  if (r.coverage.status === 'complete') {
    const start = Date.parse(r.startedAt) - RETRY_OVERLAP_MINUTES * 60_000;
    return isTime(r.since) ? Math.max(start, Date.parse(r.since)) : start;
  }
  if (r.coverage.status === 'partial' && isTime(r.coverage.through)) {
    return Date.parse(r.coverage.through);
  }
  return NaN;
};

// The runs with each correction applied: a corrected run counts with the
// coverage of its latest correction, never with the claim it replaced.
export function effectiveRuns(ledger) {
  const corrections = ledger.corrections ?? [];
  return ledger.runs.map((r) => {
    const latest = corrections.filter((c) => c.target.runId === r.runId).at(-1);
    return latest ? { ...r, coverage: latest.coverage, corrected: true } : r;
  });
}

const scheduledRuns = (ledger, learner) =>
  effectiveRuns(ledger).filter((r) => r.trigger !== 'manual' && learnerOf(r) === learner);

/**
 * A learner's last successful coverage checkpoint: the start of its latest
 * complete scheduled run, or the `coverage.through` of a partial scheduled run
 * that read its window oldest first and names how far it got. Failed runs and
 * partial runs without `through` never advance it, and nor does a manual
 * inspection, whose bounded window may skip an older interval.
 */
export function checkpoint(ledger, learner = DEFAULT_LEARNER) {
  const done = scheduledRuns(ledger, learner)
    .map((r) => {
      if (r.coverage.status === 'complete') return Date.parse(r.startedAt);
      if (r.coverage.status === 'partial' && isTime(r.coverage.through)) {
        return Date.parse(r.coverage.through);
      }
      return NaN;
    })
    .filter((t) => !Number.isNaN(t));
  return done.length ? new Date(Math.max(...done)).toISOString() : null;
}

/**
 * Where a scheduled run for the slot due at `scheduledFor` starts reading: the
 * furthest resume point of any complete or checkpointed partial scheduled run,
 * so no gap is skipped and progress never goes backwards. Before any, it stays
 * anchored at the first scheduled attempt's window, so failed first runs never
 * move it on. It depends on the slot, not on the clock, so `due` and `record`
 * agree on the owed interval.
 */
export function retrySince(ledger, scheduledFor, learner = DEFAULT_LEARNER) {
  const runs = scheduledRuns(ledger, learner);
  const resumes = runs.map(resumeAt).filter((t) => !Number.isNaN(t));
  if (resumes.length) return new Date(Math.max(...resumes)).toISOString();
  const lookback = MANUAL_LOOKBACK_HOURS * 3600_000;
  const starts = runs.map((r) =>
    r.since ? Date.parse(r.since) : Date.parse(r.startedAt) - lookback,
  );
  return new Date(Math.min(Date.parse(scheduledFor) - lookback, ...starts)).toISOString();
}

/**
 * Whether a scheduled run should inspect now. A slot already covered
 * completely is not inspected again; a partial or failed one may be retried
 * while it is still owed. A run delayed in the writer queue still serves its
 * slot, up to MAX_QUEUE_DELAY_MINUTES; after that the slot is missed and is
 * never back-filled. Manual runs never count here.
 */
export function dueSlot(ledger, now, learner = DEFAULT_LEARNER) {
  if (!learnerConfig(learner))
    return { due: false, slot: null, reason: `unknown learner ${learner}` };
  const owed = owedSlot(now, learner);
  if (!owed) {
    return {
      due: false,
      slot: null,
      reason: `no ${learner} slot was scheduled in the ${MAX_QUEUE_DELAY_MINUTES} minutes before ${now}: any earlier slot is missed`,
    };
  }
  const { slot, scheduledFor, delayMinutes } = owed;
  const covered = effectiveRuns(ledger).some(
    (r) =>
      r.trigger !== 'manual' &&
      learnerOf(r) === learner &&
      r.slot === slot &&
      r.coverage.status === 'complete',
  );
  if (covered) return { due: false, slot, reason: `slot ${slot} is already covered` };
  const since = retrySince(ledger, scheduledFor, learner);
  const timing = owed.late ? `, started ${delayMinutes} minutes late` : '';
  return {
    due: true,
    slot,
    scheduledFor,
    delayMinutes,
    since,
    reason: `slot ${slot} is due${timing}, reading from ${since}`,
  };
}

/**
 * Whether a manual initial inspection may start now. It claims no slot: it
 * records its own manualId and real times, and looks back at most
 * MANUAL_LOOKBACK_HOURS. It is bounded per learner per London day.
 */
export function manualStart(ledger, now, learner = DEFAULT_LEARNER) {
  if (!learnerConfig(learner)) return { allowed: false, reason: `unknown learner ${learner}` };
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

// A repository-relative file path, never outside the clone.
// It must be spelled in normal form, so ./tessl.json or a//b cannot slip past
// PROTECTED_PATHS.
const isRepoPath = (value) =>
  isText(value) && value.split('/').every((part) => part !== '' && part !== '.' && part !== '..');

/**
 * The parsed URL when `url` is a canonical https URL inside this repository,
 * otherwise null. Canonical means the URL parser leaves it unchanged, so
 * dot segments, encoded separators, other hosts or credentials cannot point a
 * repository-looking prefix somewhere else.
 */
export function repositoryUrl(url) {
  if (typeof url !== 'string') return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.href !== url || parsed.protocol !== 'https:' || parsed.origin !== 'https://github.com')
    return null;
  if (parsed.username || parsed.password || parsed.pathname.includes('%')) return null;
  if (!parsed.pathname.startsWith(`${REPOSITORY_PATH}/`)) return null;
  return parsed;
}

/** The pull request number a canonical repository URL points at, or null. */
export function pullNumber(url) {
  const parsed = repositoryUrl(url);
  const match = parsed?.pathname.slice(REPOSITORY_PATH.length).match(/^\/pull\/([1-9]\d*)(\/|$)/);
  return match ? Number(match[1]) : null;
}

/** Evidence must point at something public in this repository. */
export function evidenceErrors(evidence, where, kinds = EVIDENCE_KINDS) {
  if (!Array.isArray(evidence) || evidence.length === 0) return [`${where}: needs evidence`];
  return evidence.flatMap((item, i) => {
    const at = `${where}.evidence[${i}]`;
    const errors = [];
    if (!kinds.includes(item?.kind)) errors.push(`${at}: unknown kind ${item?.kind}`);
    if (!isText(item?.ref)) errors.push(`${at}: needs a ref`);
    const url = item?.url;
    if (!repositoryUrl(url)) {
      errors.push(`${at}: url must be a canonical https URL in ${REPOSITORY_URL}`);
    } else if (item.kind === 'pr') {
      // A PR is identified by its URL, and its ref must agree, so '#283' and
      // 'PR #283' cannot count as two pull requests.
      const n = pullNumber(url);
      if (n === null) errors.push(`${at}: a pr url is ${REPOSITORY_URL}/pull/<n>`);
      else if (item.ref !== `#${n}`) errors.push(`${at}: a pr ref is #${n}, matching its url`);
    }
    if (item?.commit !== undefined && !COMMIT.test(item.commit)) {
      errors.push(`${at}: commit must be a sha`);
    }
    return errors;
  });
}

/** Whether a target is a protected policy file or lens. */
export function isProtected(target) {
  // Repository lenses are configured as ./review-lenses/..., the same file.
  const path = typeof target === 'string' ? target.replace(/^\.\//, '') : '';
  return PROTECTED_PATHS.some((pattern) => pattern.test(path));
}

/** Whether a proposal, applied, would relax one of the SAFETY_STANDARDS. */
export function touchesSafety(proposal) {
  if (!proposal.weakens) return false;
  if ((proposal.standards ?? []).length > 0) return true;
  return isProtected(proposal.target) || isProtected(proposal.check);
}

/** Errors in one proposal against the shared schema. */
function proposalErrors(p, at, learner, { lenses, exists }) {
  if (p === null || typeof p !== 'object' || Array.isArray(p)) return [`${at}: must be an object`];
  const errors = [];
  const kinds = learnerConfig(learner)?.kinds ?? [];
  if (!kinds.includes(p?.kind)) {
    return [`${at}: kind must be one of ${kinds.join(', ')} for ${learner}`];
  }
  if (p.kind === 'amend-lens' && !lenses.includes(p.target)) {
    errors.push(`${at}: ${p.target} is not a configured lens`);
  } else if (p.kind === 'new-lens' && !(isText(p.target) && /^new:[a-z0-9-]+$/.test(p.target))) {
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
  } else if (p.check !== undefined && !isRepoPath(p.check)) {
    errors.push(`${at}: check must be a path in this repository, in normal form`);
  }
  errors.push(...evidenceErrors(p.evidence, at));
  return errors;
}

// Without a caller's own check, targets are looked up in this checkout.
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const inRepo = (path) => existsSync(join(REPO_ROOT, path));

/**
 * Every way a finished run is malformed; empty when it can be saved. `now` is
 * the real recording time. A scheduled run's slot must be the slot its real
 * start fell in, and a run is recorded within MAX_RUN_MINUTES of starting, so
 * neither a missed slot nor a different slot can be claimed after the fact.
 */
export function validateRun(run, { lenses, now, ledger = emptyLedger(), exists = inRepo }) {
  if (run === null || typeof run !== 'object' || Array.isArray(run))
    return ['run must be an object'];
  const errors = [];
  const learner = run?.learner;
  if (!learnerConfig(learner))
    errors.push(`learner must be one of ${Object.keys(LEARNERS).join(', ')}`);
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
    if (run.slot !== undefined || run.scheduledFor !== undefined) {
      errors.push('a manual run claims no slot');
    }
    if (!MANUAL_ID.test(run.manualId ?? '')) errors.push('a manual run needs manualId manual-<id>');
    if (!isTime(run.since)) errors.push('a manual run records since, the start of its window');
    else if (isTime(run.startedAt)) {
      const back = Date.parse(run.startedAt) - Date.parse(run.since);
      if (back < 0 || back > MANUAL_LOOKBACK_HOURS * 3600_000) {
        errors.push(`a manual run looks back at most ${MANUAL_LOOKBACK_HOURS} hours`);
      }
    }
    if (learnerConfig(learner) && isTime(run.startedAt)) {
      // Saving the same run again is not a further manual run.
      const others = { ...ledger, runs: ledger.runs.filter((r) => r.runId !== run.runId) };
      const check = manualStart(others, run.startedAt, learner);
      if (!check.allowed) errors.push(check.reason);
    }
  } else if (run?.trigger === 'schedule') {
    if (run.manualId !== undefined) errors.push('a scheduled run has no manualId');
    if (learnerConfig(learner) && isTime(run.startedAt)) {
      const owed = owedSlot(run.startedAt, learner);
      if (!owed || owed.slot !== run.slot) {
        errors.push(
          `slot must be the latest ${learner} slot at most ${MAX_QUEUE_DELAY_MINUTES} minutes before its real start, not ${run.slot}`,
        );
      } else {
        if (run.scheduledFor !== owed.scheduledFor) {
          errors.push(`scheduledFor must be ${owed.scheduledFor}, when slot ${owed.slot} was due`);
        }
        // Saving the same run again is harmless; a second run for a covered slot is not.
        const others = { ...ledger, runs: ledger.runs.filter((r) => r.runId !== run.runId) };
        const due = dueSlot(others, run.startedAt, learner);
        if (!due.due) errors.push(due.reason);
        else if (!isTime(run.since)) {
          errors.push(
            `a scheduled run records since, the start of the owed interval (${due.since})`,
          );
        } else if (Date.parse(run.since) > Date.parse(due.since)) {
          errors.push(`since must reach back to ${due.since}, the start of the owed interval`);
        }
      }
    }
  } else {
    errors.push('trigger must be schedule or manual');
  }
  if (!COVERAGE.includes(run?.coverage?.status)) errors.push('coverage.status is not valid');
  if (!Array.isArray(run?.coverage?.inspected) || !run.coverage.inspected.every(isText)) {
    errors.push('coverage.inspected must list refs');
  }
  if (run?.coverage?.status !== 'complete' && !isText(run?.coverage?.gaps)) {
    errors.push('partial or failed coverage must say what was missed in coverage.gaps');
  }
  // A partial run that read its window oldest first may say how far it got,
  // so the next run resumes there instead of hitting the same limit again.
  if (run?.coverage?.through !== undefined) {
    const through = Date.parse(run.coverage.through);
    if (run.coverage.status !== 'partial' || run.trigger !== 'schedule') {
      errors.push('only a partial scheduled run records coverage.through');
    } else if (!isTime(run.coverage.through) || !isTime(run.since) || !isTime(run.startedAt)) {
      errors.push('coverage.through must be a time');
    } else if (through <= Date.parse(run.since) || through > Date.parse(run.startedAt)) {
      // A through at since records no progress: leave it out instead.
      errors.push('coverage.through must fall after since and no later than startedAt');
    }
  }
  if (COVERAGE.includes(run?.coverage?.status)) errors.push(...sourceErrors(run));
  const proposals = run.proposals ?? [];
  if (!Array.isArray(proposals)) return [...errors, 'proposals must be a list'];
  if (run.coverage?.status === 'failed' && proposals.length) {
    errors.push('a failed run records no proposals');
  }
  for (const [i, p] of proposals.entries()) {
    errors.push(...proposalErrors(p, `proposals[${i}]`, learner, { lenses, exists }));
  }
  return errors;
}

// Evidence is the same item only when kind, ref, url and commit all match, so
// distinct findings that share a ref are all kept.
const evidenceKey = (e) => JSON.stringify([e.kind, e.ref, e.url, e.commit ?? null]);
const mergeEvidence = (old, extra) => {
  const seen = new Set(old.map(evidenceKey));
  const added = [];
  for (const e of extra) {
    if (seen.has(evidenceKey(e))) continue;
    seen.add(evidenceKey(e));
    added.push(e);
  }
  return [...old, ...added];
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
      const prior = {
        change: known.change,
        check: known.check,
        netLines: known.netLines,
        rationale: known.rationale,
        weakens: known.weakens,
        standards: known.standards ?? [],
      };
      // A sighting with different content becomes the proposal the
      // coordinator decides and the issue carries, rationale included.
      const revised = ['change', 'check', 'netLines'].some((f) => p[f] !== known[f]);
      if (revised) {
        known.change = p.change;
        known.netLines = p.netLines;
        known.rationale = p.rationale;
        if (p.check === undefined) delete known.check;
        else known.check = p.check;
      }
      // A later sighting can only make it more cautious, never less.
      known.weakens = known.weakens || p.weakens;
      known.standards = [...new Set([...prior.standards, ...p.standards])];
      const cautious =
        JSON.stringify([known.weakens, known.standards]) !==
        JSON.stringify([prior.weakens, prior.standards]);
      // The content and caution it replaces are kept under revisions. Their
      // count is the issue marker's revision, so an issue opened for either,
      // even one never recorded, no longer matches.
      if (revised || cautious) {
        known.revisions = [...(known.revisions ?? []), { replacedBy: run.runId, ...prior }];
      }
      // An acceptance decided under less caution, or for other content, goes
      // back to the coordinator, so the safety and two-PR rules are checked
      // again before any issue.
      if (known.status === 'accepted' && (cautious || revised)) {
        known.status = 'deferred';
        // An issue opened for the old content no longer describes the work.
        if (known.issue) {
          known.previousIssues = [...(known.previousIssues ?? []), known.issue];
          delete known.issue;
        }
        known.reopened = {
          at: run.finishedAt,
          runId: run.runId,
          reason: revised
            ? 'a later sighting proposed a different change than the one accepted'
            : 'a later sighting declared more caution than the accepted decision saw',
        };
      }
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
      evidence: mergeEvidence([], p.evidence),
      status: 'open',
      firstSeen: run.finishedAt,
      seenIn: [run.runId],
      decisions: [],
    });
  }
  const { runId, learner, trigger, startedAt, finishedAt, coverage } = run;
  const when =
    trigger === 'manual'
      ? { manualId: run.manualId, since: run.since }
      : {
          slot: run.slot,
          scheduledFor: run.scheduledFor,
          delayMinutes: Math.floor((Date.parse(startedAt) - Date.parse(run.scheduledFor)) / 60_000),
          since: run.since,
        };
  return {
    ...ledger,
    runs: [
      ...ledger.runs,
      { runId, learner, trigger, ...when, startedAt, finishedAt, coverage, fingerprints },
    ],
    proposals,
  };
}

const RANK = { failed: 0, partial: 1, complete: 2 };
const correctionsOf = (ledger, runId) =>
  (ledger.corrections ?? []).filter((c) => c.target?.runId === runId);

/**
 * The errors in a correction of a recorded run's coverage claim. A correction
 * targets one run at the revision it read (the number of corrections that run
 * already has), only ever lowers the coverage, never records a through, and
 * claims no ref the run did not record. The run, its proposals and their
 * decisions are left as they are.
 */
export function validateCorrection(ledger, correction) {
  if (!isObject(correction)) return ['the correction must be an object'];
  const errors = [];
  const c = correction;
  if (!/^correction-[A-Za-z0-9._-]{1,64}$/.test(c.correctionId ?? '')) {
    errors.push('needs correctionId correction-<id>');
  }
  const run = ledger.runs.find((r) => r.runId === c.target?.runId);
  if (!run) return [...errors, `no recorded run ${c.target?.runId}`];
  const prior = correctionsOf(ledger, run.runId);
  const same = (ledger.corrections ?? []).find((x) => x.correctionId === c.correctionId);
  if (same) {
    return JSON.stringify(same) === JSON.stringify(c)
      ? []
      : [`${c.correctionId} is already recorded with different content`];
  }
  if (c.target.revision !== prior.length) {
    errors.push(
      `run ${run.runId} is at correction revision ${prior.length}, not ${c.target.revision}`,
    );
  }
  const current = prior.at(-1)?.coverage ?? run.coverage;
  if (c.target.claimed !== current.status) {
    errors.push(`run ${run.runId} currently claims ${current.status}, not ${c.target.claimed}`);
  }
  const coverage = c.coverage;
  if (!isObject(coverage) || !COVERAGE.includes(coverage.status)) {
    return [...errors, 'coverage.status is not valid'];
  }
  if (!(RANK[coverage.status] < RANK[current.status])) {
    errors.push(
      `a correction only lowers coverage, and ${coverage.status} is not below ${current.status}`,
    );
  }
  if (coverage.through !== undefined) errors.push('a correction never records coverage.through');
  if (!isText(coverage.gaps)) errors.push('a correction says what was missed in coverage.gaps');
  if (!Array.isArray(coverage.inspected) || !coverage.inspected.every(isText)) {
    errors.push('coverage.inspected must list refs');
  } else {
    const extra = coverage.inspected.filter((ref) => !run.coverage.inspected?.includes(ref));
    if (extra.length) errors.push(`the run never recorded inspecting ${extra.join(', ')}`);
  }
  errors.push(...sourceErrors({ learner: learnerOf(run), coverage }));
  // A correction names what was and was not read for every required source.
  const named = Array.isArray(coverage.sources) ? coverage.sources.map((s) => s?.source) : [];
  const unnamed = (REQUIRED_SOURCES[learnerOf(run)] ?? []).filter((n) => !named.includes(n));
  if (unnamed.length) errors.push(`a correction needs receipts for ${unnamed.join(', ')}`);
  if (!isText(c.rationale)) errors.push('a correction needs its rationale');
  errors.push(...evidenceErrors(c.evidence, 'correction', CORRECTION_EVIDENCE_KINDS));
  if (!isText(c.correctedBy)) errors.push('a correction needs correctedBy');
  else if (c.correctedBy === LOOP_NAME) errors.push('the loop cannot correct its own runs');
  if (!isTime(c.correctedAt)) errors.push('a correction needs correctedAt');
  return errors;
}

/** The ledger with a correction appended. The same correction again changes nothing. */
export function recordCorrection(ledger, correction) {
  if ((ledger.corrections ?? []).some((c) => c.correctionId === correction.correctionId)) {
    return ledger;
  }
  return { ...ledger, corrections: [...(ledger.corrections ?? []), correction] };
}

/** Proposals still waiting for apply, defer or reject. */
export function pendingProposals(ledger) {
  return ledger.proposals.filter((p) => PENDING.includes(p.status));
}

/** Every reason a decision is refused; empty when it can be saved. */
export function validateDecision(ledger, decision) {
  if (decision === null || typeof decision !== 'object' || Array.isArray(decision)) {
    return ['decision must be an object'];
  }
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
  // A decision names the revision it validated, so content a later sighting
  // recorded under the same fingerprint is never decided on the old check.
  const revision = proposal.revisions?.length ?? 0;
  if (decision.revision !== revision) {
    errors.push(`revision must be ${revision}, the proposal content as it now stands`);
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
      // Pull requests are counted by the number in their canonical URL.
      const prs = new Set(
        [...proposal.evidence, ...(Array.isArray(decision.evidence) ? decision.evidence : [])]
          .filter((e) => e?.kind === 'pr')
          .map((e) => pullNumber(e.url))
          .filter((n) => n !== null),
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
    revision,
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
                revision,
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
    issueMarker(proposal.fingerprint, proposal.revisions?.length ?? 0),
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
  return {
    title: `${proposal.learner}: ${proposal.title} [${proposal.fingerprint}]`,
    body: lines.join('\n'),
  };
}

/**
 * The stable line every implementation issue carries. Before opening an issue
 * the coordinator searches for it, so a restart after `decide` never opens a
 * second issue for the same proposal.
 */
export function issueMarker(fingerprintId, revision = 0) {
  // The revision count changes whenever the content does, so an issue opened
  // for superseded content, even one never recorded, never matches.
  return `<!-- factory-learning:proposal ${fingerprintId} r${revision} -->`;
}

/** Accepted proposals whose implementation issue is not yet recorded. */
export function unissuedProposals(ledger) {
  return ledger.proposals.filter((p) => p.status === 'accepted' && !p.issue && !touchesSafety(p));
}

/** Every reason the issue for an accepted proposal cannot be recorded. */
export function validateIssued(ledger, fingerprintId, url) {
  const proposal = ledger.proposals.find((p) => p.fingerprint === fingerprintId);
  if (!proposal) return [`no proposal ${fingerprintId}`];
  const errors = [];
  if (proposal.status !== 'accepted') errors.push(`proposal ${fingerprintId} is not accepted`);
  else if (touchesSafety(proposal))
    errors.push(`proposal ${fingerprintId} now weakens a safety standard`);
  const parsed = repositoryUrl(url);
  if (!parsed || !/^\/issues\/[1-9]\d*$/.test(parsed.pathname.slice(REPOSITORY_PATH.length))) {
    errors.push(`the issue url must be ${REPOSITORY_URL}/issues/<n>`);
  }
  if (proposal.issue && proposal.issue !== url) {
    errors.push(`proposal ${fingerprintId} already has issue ${proposal.issue}`);
  }
  return errors;
}

/** The ledger with the issue recorded. Recording the same issue again changes nothing. */
export function recordIssued(ledger, fingerprintId, url) {
  const proposal = ledger.proposals.find((p) => p.fingerprint === fingerprintId);
  if (proposal?.issue === url) return ledger;
  return {
    ...ledger,
    proposals: ledger.proposals.map((p) =>
      p.fingerprint === fingerprintId ? { ...p, issue: url } : p,
    ),
  };
}

/** Every way a ledger read from the branch is malformed. */
export function ledgerErrors(ledger) {
  if (ledger === null || typeof ledger !== 'object' || Array.isArray(ledger)) {
    return ['the ledger must be an object'];
  }
  const errors = [];
  if (ledger.schemaVersion !== emptyLedger().schemaVersion) {
    errors.push(`the ledger schemaVersion must be ${emptyLedger().schemaVersion}`);
  }
  for (const field of ['runs', 'proposals']) {
    if (!Array.isArray(ledger[field]) || !ledger[field].every(isObject)) {
      errors.push(`the ledger ${field} must be a list of objects`);
    }
  }
  if (
    ledger.corrections !== undefined &&
    (!Array.isArray(ledger.corrections) || !ledger.corrections.every(isObject))
  ) {
    errors.push('the ledger corrections must be a list of objects');
  }
  if (errors.length) return errors;
  // Each correction must still be one the correct command would accept,
  // replayed in order, so a reordered or edited history is refused.
  let replay = { ...ledger, corrections: [] };
  for (const [i, c] of (ledger.corrections ?? []).entries()) {
    if ((ledger.corrections ?? []).findIndex((x) => x.correctionId === c.correctionId) !== i) {
      errors.push(`corrections[${i}]: ${c.correctionId} is listed twice`);
      continue;
    }
    const found = validateCorrection(replay, c);
    for (const e of found) errors.push(`corrections[${i}]: ${e}`);
    replay = recordCorrection(replay, c);
  }
  // The fields the commands read, so a bad record is named here instead of
  // failing later.
  for (const [i, r] of ledger.runs.entries()) {
    const at = `runs[${i}]`;
    if (!isText(r.runId)) errors.push(`${at}: needs runId`);
    if (r.learner !== undefined && !learnerConfig(r.learner)) errors.push(`${at}: unknown learner`);
    if (r.trigger !== undefined && !['schedule', 'manual'].includes(r.trigger)) {
      errors.push(`${at}: unknown trigger`);
    }
    if (!isTime(r.startedAt) || !isTime(r.finishedAt)) errors.push(`${at}: needs real times`);
    if (r.since !== undefined && !isTime(r.since)) errors.push(`${at}: since must be a time`);
    // A checkpoint outside its own run's window would move the next since
    // into the future or into an interval the run never read.
    if (isObject(r.coverage) && r.coverage.through !== undefined) {
      const through = Date.parse(r.coverage.through);
      if (r.coverage.status !== 'partial' || r.trigger === 'manual') {
        errors.push(`${at}: only a partial scheduled run records coverage.through`);
      } else if (!isTime(r.coverage.through) || !isTime(r.since) || !isTime(r.startedAt)) {
        errors.push(`${at}: coverage.through needs since and startedAt and must be a time`);
      } else if (through <= Date.parse(r.since) || through > Date.parse(r.startedAt)) {
        errors.push(`${at}: coverage.through must fall after since and no later than startedAt`);
      }
    }
    if (!isObject(r.coverage) || !COVERAGE.includes(r.coverage.status)) {
      errors.push(`${at}: needs coverage.status`);
    }
    if (!Array.isArray(r.fingerprints)) errors.push(`${at}: needs fingerprints`);
  }
  for (const [i, p] of ledger.proposals.entries()) {
    const at = `proposals[${i}]`;
    for (const field of ['fingerprint', 'kind', 'target', 'title', 'change', 'rationale']) {
      if (!isText(p[field])) errors.push(`${at}: needs ${field}`);
    }
    if (!STATUSES.includes(p.status)) errors.push(`${at}: unknown status`);
    if (typeof p.weakens !== 'boolean') errors.push(`${at}: needs weakens`);
    for (const field of ['standards', 'evidence', 'seenIn', 'decisions']) {
      if (!Array.isArray(p[field])) errors.push(`${at}: ${field} must be a list`);
    }
    for (const field of ['revisions', 'previousIssues']) {
      if (p[field] !== undefined && !Array.isArray(p[field])) {
        errors.push(`${at}: ${field} must be a list`);
      }
    }
    if (Array.isArray(p.revisions) && !p.revisions.every(isObject)) {
      errors.push(`${at}: revisions must be objects`);
    }
    if (Array.isArray(p.evidence) && !p.evidence.every(isObject)) {
      errors.push(`${at}: evidence must be objects`);
    }
    if (
      Array.isArray(p.decisions) &&
      !p.decisions.every(
        (d) =>
          isObject(d) &&
          DECISIONS.includes(d.decision) &&
          Array.isArray(d.evidence) &&
          d.evidence.every(isObject),
      )
    ) {
      errors.push(`${at}: each decision needs its decision and evidence`);
    }
    if (p.status === 'accepted' && !(p.decisions?.length > 0)) {
      errors.push(`${at}: an accepted proposal has its decision`);
    }
  }
  return errors;
}

const runLabel = (run) => {
  if (run.trigger === 'manual') return `manual ${run.manualId} (no slot, since ${run.since})`;
  const late =
    run.delayMinutes >= SLOT_WINDOW_MINUTES ? `, started ${run.delayMinutes} minutes late` : '';
  return `${run.slot ?? 'unknown slot'}${late}`;
};

/** A short markdown summary for the Tessl run report, the findings fallback. */
export function summary(ledger, runId) {
  const runs = effectiveRuns(ledger);
  const run = runs.find((r) => r.runId === runId) ?? runs.at(-1);
  const pending = pendingProposals(ledger);
  const lines = [
    `Factory learning proposals (repository ledger; the runtime scheduled-findings integration is disabled, so this run report is the fallback): ${REPOSITORY_URL}/blob/${LEDGER_BRANCH}/${LEDGER_FILE}`,
  ];
  if (run) {
    lines.push(
      `Run ${run.runId} (${learnerOf(run)}) for ${runLabel(run)}: coverage ${run.coverage.status}, ${run.fingerprints.length} proposal(s), started ${run.startedAt}, finished ${run.finishedAt}.`,
    );
    if (run.corrected) {
      const ids = correctionsOf(ledger, run.runId).map((c) => c.correctionId);
      lines.push(`Coverage corrected by ${ids.join(', ')}; the original claim stays in the run.`);
    }
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
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    // Room for the largest ledger the size check lets through.
    maxBuffer: MAX_LEDGER_BYTES + 1024 * 1024,
  }).trim();

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
  const size = Number(git(repo, 'cat-file', '-s', `${base}:${LEDGER_FILE}`));
  if (!(size <= MAX_LEDGER_BYTES)) {
    throw new Error(`${LEDGER_FILE} is ${size} bytes, over the ${MAX_LEDGER_BYTES} byte limit`);
  }
  let ledger;
  try {
    ledger = JSON.parse(git(repo, 'show', `${base}:${LEDGER_FILE}`));
  } catch (error) {
    throw new Error(`${LEDGER_FILE} at ${base} is not JSON: ${error.message}`, { cause: error });
  }
  const errors = ledgerErrors(ledger);
  if (errors.length) throw new Error(`${LEDGER_FILE} at ${base}: ${errors.join('; ')}`);
  return { ledger, base };
}

/** Push the ledger as a child of `base`. Throws if origin moved since the read. */
export function writeLedger(repo, ledger, base, message, remote = 'origin') {
  const dir = mkdtempSync(join(tmpdir(), 'lens-ledger-'));
  try {
    const file = join(dir, LEDGER_FILE);
    // Never save a ledger the next read would refuse.
    const errors = ledgerErrors(ledger);
    if (errors.length)
      throw new Error(`refusing to write a malformed ledger: ${errors.join('; ')}`);
    const text = JSON.stringify(ledger, null, 2) + '\n';
    if (Buffer.byteLength(text) > MAX_LEDGER_BYTES) {
      throw new Error(`refusing to write a ledger over ${MAX_LEDGER_BYTES} bytes`);
    }
    writeFileSync(file, text);
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

// An input file is read whole only when it is small, and must be JSON.
const readInput = (file) => {
  try {
    const text = readFileSync(file, 'utf8');
    if (Buffer.byteLength(text) > MAX_LEDGER_BYTES) fail([`${file} is too large`]);
    return JSON.parse(text);
  } catch (error) {
    return fail([`${file} is not readable JSON: ${error.message}`]);
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const [command, arg, extra] = process.argv.slice(2);
  const repo = process.cwd();
  const now = new Date().toISOString();
  const { ledger, base } = readLedger(repo);
  const print = (value) => console.log(JSON.stringify(value, null, 2));
  if (command === 'due') {
    print({ now, ...dueSlot(ledger, now, arg ?? DEFAULT_LEARNER) });
  } else if (command === 'manual') {
    print({ now, ...manualStart(ledger, now, arg) });
  } else if (command === 'pending') {
    print(pendingProposals(ledger).map((p) => ({ ...p, revision: p.revisions?.length ?? 0 })));
  } else if (command === 'summary') {
    console.log(summary(ledger, arg));
  } else if (command === 'record') {
    const run = readInput(arg);
    const lenses = configuredLenses(readFileSync(join(repo, '.tessl-code-review.yml'), 'utf8'));
    const exists = (path) => existsSync(join(repo, path));
    // A run already saved is a harmless repeat, however late it is replayed.
    const saved = isObject(run) && ledger.runs.some((r) => r.runId === run.runId);
    const errors = saved ? [] : validateRun(run, { lenses, now, ledger, exists });
    if (errors.length) fail(errors);
    if (saved) {
      print({ unchanged: `run ${run.runId} is already recorded` });
    } else {
      const next = recordRun(ledger, run);
      const message = `${run.learner}: ${run.runId} for ${runLabel(run)}`;
      const commit = writeLedger(repo, next, base, message);
      print({ commit, pending: pendingProposals(next).length });
    }
  } else if (command === 'correct') {
    const correction = readInput(arg);
    const errors = validateCorrection(ledger, correction);
    if (errors.length) fail(errors);
    const next = recordCorrection(ledger, correction);
    if (next === ledger) print({ unchanged: `${correction.correctionId} is already recorded` });
    else {
      const message = `factory learning: ${correction.correctionId} for ${correction.target.runId}`;
      print({ commit: writeLedger(repo, next, base, message) });
    }
  } else if (command === 'decide') {
    const decision = readInput(arg);
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
  } else if (command === 'issue') {
    const proposal = ledger.proposals.find((p) => p.fingerprint === arg);
    if (proposal?.status !== 'accepted') fail([`proposal ${arg} is not accepted`]);
    if (touchesSafety(proposal)) fail([`proposal ${arg} now weakens a safety standard`]);
    print({
      marker: issueMarker(arg, proposal.revisions?.length ?? 0),
      ...(proposal.issue ? { recorded: proposal.issue } : {}),
      issue: implementationIssue(proposal),
    });
  } else if (command === 'issued') {
    const errors = validateIssued(ledger, arg, extra);
    if (errors.length) fail(errors);
    const next = recordIssued(ledger, arg, extra);
    if (next === ledger) print({ unchanged: `${arg} already records ${extra}` });
    else print({ commit: writeLedger(repo, next, base, `factory learning: issue for ${arg}`) });
  } else if (command === 'unissued') {
    print(unissuedProposals(ledger).map((p) => p.fingerprint));
  } else {
    console.error(
      'usage: ledger.mjs due [learner] | manual <learner> | pending | summary [runId] | record <run> | correct <file> | decide <file> | issue <fp> | issued <fp> <url> | unissued',
    );
    process.exit(2);
  }
}
