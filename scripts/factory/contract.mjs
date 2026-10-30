// The factory contract: the exact actions, triggers and schedules tessl.json
// must keep.
// Any change to an approved action, a route's guards, its concurrency or its
// action fails the check, so a change to the factory has to change this file
// too, in review. The top-level name, mode and dependencies are not checked:
// tessl install manages them.

export const REPOSITORY_ID = 1437265009;
export const OWNER_ID = 1106394;
export const REVIEWER_ID = 325629464;

const ENVIRONMENT = 'carnival-evolution-20261028-factory';
const SKILL_PREFIX = 'tessl-labs/factory@0.6.0#';

// One static key every writing action holds, from any trigger, schedule or
// manual `tessl action trigger`, so no two runs change the app at once. It sits
// beside each trigger's own per-issue or per-PR key; it does not replace them.
// follow-ticket-changes is left out on purpose: it cancels writers, and queued
// behind the run it should cancel it could not.
export const WRITER_KEY = 'carnival-app-writer';
const writer = { keys: [{ key: WRITER_KEY, limit: 1 }], mode: 'queue' };

const action = (name, timeout, concurrency = writer) => ({
  skill: `${SKILL_PREFIX}${name}`,
  environment: ENVIRONMENT,
  agent: 'claude-code',
  model: 'claude-opus-5-5',
  timeout,
  ...(concurrency ? { concurrency } : {}),
});

export const EXPECTED_ACTIONS = {
  'implement-github-issue': action('implement-github-issue', '15m'),
  shepherd: action('shepherd', '10m'),
  'follow-ticket-changes': action('follow-ticket-changes', '5m', null),
  // The test health maintenance loop, from the repository's own skill. It files
  // issues only; a person labels them before the factory ships a fix.
  'test-health': {
    skill: 'file:tessl-factory#test-health',
    environment: ENVIRONMENT,
    agent: 'claude-code',
    model: 'claude-opus-5-5',
    timeout: '15m',
    concurrency: writer,
  },
  // The visual repair loop, from the repository's own skill. It renders changed
  // screens in a headless browser and opens at most one draft repair PR a run,
  // inspecting even while other pull requests are open and deferring only a repair whose files overlap one.
  'visual-repair': {
    skill: 'file:tessl-factory#visual-repair',
    environment: ENVIRONMENT,
    agent: 'claude-code',
    model: 'claude-opus-5-5',
    timeout: '30m',
    concurrency: writer,
  },
  // The review-lens improvement loop (issue #371). It proposes lens changes to
  // the factory-state/review-lenses ledger and never edits a lens itself; the
  // external block coordinator decides each proposal. It holds the writer key
  // because it pushes that ledger.
  'review-lens-improvement': {
    skill: 'file:tessl-factory#review-lens-improvement',
    environment: ENVIRONMENT,
    agent: 'claude-code',
    model: 'claude-opus-5-5',
    timeout: '20m',
    concurrency: writer,
  },
};

// Test health weekly, per WORKSHOP module 04, visual repair every six hours
// (issue #303) and review-lens improvement twenty minutes before each London
// block ends (issue #371), in the scheduler's own timezone so DST needs no
// change. No other schedules: gameplay batching is owned outside this
// repository.
export const EXPECTED_SCHEDULES = {
  'test-health-weekly': {
    cron: '0 9 * * 1',
    description: 'Weekly test health check: file an issue for each test that cannot fail',
    action: 'test-health',
  },
  'visual-repair-six-hourly': {
    cron: '17 */6 * * *',
    description:
      'Every six hours: render screens changed since the last good visual review and repair the worst one in one draft PR',
    action: 'visual-repair',
  },
  'review-lens-improvement-six-hourly': {
    cron: '40 5,11,17,23 * * *',
    timezone: 'Europe/London',
    description:
      'Twenty minutes before each six-hour London block ends: propose evidence-based review lens improvements to the fallback ledger',
    action: 'review-lens-improvement',
  },
};

const tesslLabel = (path) => ({ [path]: { any: { equals: 'tessl' } } });
const tesslPr = {
  ...tesslLabel('event.pull_request.labels.*.name'),
  'event.pull_request.head.ref': { matches: '^tessl/' },
  'event.pull_request.head.repo.id': REPOSITORY_ID,
};
const repo = { 'event.repository.id': REPOSITORY_ID };
const key = (template, extra = {}) => ({ ...extra, keys: [{ key: template, limit: 1 }] });
const shepherdKey = (number) => key(`shepherd:{{ ${number} }}`, { debounce: '90s' });
const followKey = (number) =>
  key(`follow-ticket-changes:{{ event.repository.id }}#{{ ${number} }}`);
const implementKey = key('implement:{{ event.repository.id }}#{{ event.issue.number }}');
const follow = (change) => ({ use: 'follow-ticket-changes', inputs: { TICKET_CHANGE: change } });

export const EXPECTED_TRIGGERS = {
  'github-issue-labelled': {
    on: ['github:issues.labeled'],
    when: {
      'event.label.name': 'tessl',
      'event.sender.type': 'User',
      'event.sender.id': OWNER_ID,
      'event.issue.state': 'open',
      ...repo,
    },
    concurrency: implementKey,
    action: 'implement-github-issue',
  },
  'shepherd-pr-review': {
    on: ['github:pull_request_review.submitted'],
    when: { ...tesslPr, 'event.pull_request.state': 'open', 'event.sender.id': OWNER_ID, ...repo },
    concurrency: shepherdKey('event.pull_request.number'),
    action: 'shepherd',
  },
  'shepherd-pr-review-comment': {
    on: ['github:pull_request_review_comment.created'],
    when: { ...tesslPr, 'event.pull_request.state': 'open', 'event.sender.id': OWNER_ID, ...repo },
    concurrency: shepherdKey('event.pull_request.number'),
    action: 'shepherd',
  },
  'shepherd-pr-comment': {
    on: ['github:issue_comment.created'],
    when: {
      isPullRequest: 'true',
      ...tesslLabel('event.issue.labels.*.name'),
      'event.issue.state': 'open',
      'event.sender.id': OWNER_ID,
      ...repo,
    },
    concurrency: shepherdKey('event.issue.number'),
    action: 'shepherd',
  },
  'shepherd-checks-failed': {
    on: ['github:check_run.completed'],
    when: {
      'event.check_run.pull_requests.0.number': { exists: true },
      'event.check_run.pull_requests.0.head.repo.id': REPOSITORY_ID,
      'event.check_run.check_suite.head_branch': { matches: '^tessl/' },
      'event.check_run.conclusion': {
        in: ['failure', 'timed_out', 'startup_failure', 'action_required'],
      },
      ...repo,
    },
    concurrency: shepherdKey('event.check_run.pull_requests.0.number'),
    action: 'shepherd',
  },
  'shepherd-checks-passed': {
    on: ['github:check_suite.completed'],
    when: {
      'event.check_suite.pull_requests.0.number': { exists: true },
      'event.check_suite.pull_requests.0.head.repo.id': REPOSITORY_ID,
      'event.check_suite.head_branch': { matches: '^tessl/' },
      'event.check_suite.conclusion': 'success',
      ...repo,
    },
    concurrency: shepherdKey('event.check_suite.pull_requests.0.number'),
    action: 'shepherd',
  },
  'shepherd-pr-review-by-reviewer': {
    on: ['github:pull_request_review.submitted'],
    when: {
      ...tesslPr,
      'event.pull_request.state': 'open',
      'event.sender.id': REVIEWER_ID,
      ...repo,
    },
    concurrency: shepherdKey('event.pull_request.number'),
    action: 'shepherd',
  },
  'follow-ticket-changes-pr-closed': {
    on: ['github:pull_request.closed'],
    when: {
      ...tesslPr,
      'event.sender.id': OWNER_ID,
      'event.pull_request.state': 'closed',
      ...repo,
    },
    concurrency: followKey('event.pull_request.number'),
    action: follow('pr-closed'),
  },
  'follow-ticket-changes-github-taken-back': {
    on: ['github:issues.unlabeled'],
    // No issue state on purpose: taking an issue back must cancel work even
    // after the issue is closed.
    when: { 'event.label.name': 'tessl', 'event.sender.id': OWNER_ID, ...repo },
    concurrency: followKey('event.issue.number'),
    action: follow('taken-back'),
  },
  'follow-ticket-changes-github-ended': {
    on: ['github:issues.closed'],
    when: {
      ...tesslLabel('event.issue.labels.*.name'),
      'event.sender.id': OWNER_ID,
      'event.issue.state': 'closed',
      ...repo,
    },
    concurrency: followKey('event.issue.number'),
    action: follow('issue-ended'),
  },
  'follow-ticket-changes-github-replied': {
    on: ['github:issue_comment.created'],
    when: {
      isPullRequest: 'false',
      'event.issue.state': 'open',
      ...tesslLabel('event.issue.labels.*.name'),
      'event.sender.id': OWNER_ID,
      ...repo,
    },
    // Shares the implement lock, so a reply waits for a running implementation.
    concurrency: implementKey,
    action: follow('replied'),
  },
};

/** Compare as data, ignoring object key order. */
function sameData(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, i) => sameData(item, b[i]))
    );
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = Object.keys(a);
    return (
      keys.length === Object.keys(b).length &&
      keys.every((k) => Object.hasOwn(b, k) && sameData(a[k], b[k]))
    );
  }
  return a === b;
}

function compareSet(label, actual, expected, errors) {
  if (actual === null || typeof actual !== 'object' || Array.isArray(actual)) {
    errors.push(`${label} must be an object`);
    return;
  }
  for (const name of Object.keys(expected)) {
    if (!Object.hasOwn(actual, name)) {
      errors.push(`${label}.${name} is missing`);
      continue;
    }
    if (actual[name] === null || typeof actual[name] !== 'object' || Array.isArray(actual[name])) {
      errors.push(`${label}.${name} must be an object`);
      continue;
    }
    for (const field of new Set([...Object.keys(expected[name]), ...Object.keys(actual[name])])) {
      if (!sameData(actual[name][field], expected[name][field])) {
        errors.push(`${label}.${name}.${field} differs from the contract`);
      }
    }
  }
  for (const name of Object.keys(actual)) {
    if (!Object.hasOwn(expected, name)) errors.push(`${label}.${name} is not in the contract`);
  }
}

/** Every way the manifest breaks the contract; empty when it holds. */
export function checkContract(manifest) {
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return ['manifest must be an object'];
  }
  const errors = [];
  compareSet('actions', manifest.actions, EXPECTED_ACTIONS, errors);
  compareSet('triggers', manifest.triggers, EXPECTED_TRIGGERS, errors);
  compareSet('schedules', manifest.schedules, EXPECTED_SCHEDULES, errors);
  return errors;
}
