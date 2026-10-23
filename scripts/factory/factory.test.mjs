// The fixture matcher here is an offline model of the current tessl.json
// configuration. It is not the production scheduler and not a security
// boundary: online validation (tessl doctor --automations, real events) is
// still required. These tests show which synthetic events each route accepts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkContract, OWNER_ID, REPOSITORY_ID, REVIEWER_ID } from './contract.mjs';
import { matchesTrigger, matchingTriggers } from './matcher.mjs';

const manifest = JSON.parse(readFileSync(new URL('../../tessl.json', import.meta.url), 'utf8'));
const clone = () => structuredClone(manifest);
const repository = { id: REPOSITORY_ID };
const owner = { id: OWNER_ID, type: 'User' };
const tesslPr = (state, extra = {}) => ({
  number: 7,
  state,
  labels: [{ name: 'tessl' }],
  head: { ref: 'tessl/issue-7', repo: { id: REPOSITORY_ID } },
  ...extra,
});
const issue = (state, extra = {}) => ({ number: 7, state, labels: [{ name: 'tessl' }], ...extra });

const positives = {
  'github-issue-labelled': [
    'github:issues.labeled',
    { label: { name: 'tessl' }, sender: owner, issue: issue('open'), repository },
  ],
  'shepherd-pr-review': [
    'github:pull_request_review.submitted',
    { pull_request: tesslPr('open'), sender: owner, repository },
  ],
  'shepherd-pr-review-comment': [
    'github:pull_request_review_comment.created',
    { pull_request: tesslPr('open'), sender: owner, repository },
  ],
  'shepherd-pr-comment': [
    'github:issue_comment.created',
    { issue: issue('open', { pull_request: {} }), sender: owner, repository },
  ],
  'shepherd-checks-failed': [
    'github:check_run.completed',
    {
      check_run: {
        conclusion: 'failure',
        check_suite: { head_branch: 'tessl/issue-7' },
        pull_requests: [{ number: 7, head: { repo: { id: REPOSITORY_ID } } }],
      },
      repository,
    },
  ],
  'shepherd-checks-passed': [
    'github:check_suite.completed',
    {
      check_suite: {
        conclusion: 'success',
        head_branch: 'tessl/issue-7',
        pull_requests: [{ number: 7, head: { repo: { id: REPOSITORY_ID } } }],
      },
      repository,
    },
  ],
  'shepherd-pr-review-by-reviewer': [
    'github:pull_request_review.submitted',
    { pull_request: tesslPr('open'), sender: { id: REVIEWER_ID, type: 'User' }, repository },
  ],
  'follow-ticket-changes-pr-closed': [
    'github:pull_request.closed',
    { pull_request: tesslPr('closed', { merged: true }), sender: owner, repository },
  ],
  'follow-ticket-changes-github-taken-back': [
    'github:issues.unlabeled',
    { label: { name: 'tessl' }, sender: owner, issue: issue('closed', { labels: [] }), repository },
  ],
  'follow-ticket-changes-github-ended': [
    'github:issues.closed',
    { issue: issue('closed'), sender: owner, repository },
  ],
  'follow-ticket-changes-github-replied': [
    'github:issue_comment.created',
    { issue: issue('open'), sender: owner, repository },
  ],
};

test('the committed manifest keeps the contract', () => {
  assert.deepEqual(checkContract(manifest), []);
});

test('every one of the eleven routes has a positive fixture that only it accepts', () => {
  assert.equal(Object.keys(manifest.triggers).length, 11);
  for (const [name, [event, payload]] of Object.entries(positives)) {
    assert.deepEqual(matchingTriggers(manifest, event, payload), [name], name);
  }
});

test('an unmerged PR close still reaches the pr-closed route', () => {
  const [event, payload] = positives['follow-ticket-changes-pr-closed'];
  const unmerged = structuredClone(payload);
  unmerged.pull_request.merged = false;
  assert.deepEqual(matchingTriggers(manifest, event, unmerged), [
    'follow-ticket-changes-pr-closed',
  ]);
});

test('taken-back cancellation works whether the issue is open or closed', () => {
  const [event, payload] = positives['follow-ticket-changes-github-taken-back'];
  for (const state of ['open', 'closed']) {
    const p = structuredClone(payload);
    p.issue.state = state;
    assert.deepEqual(matchingTriggers(manifest, event, p), [
      'follow-ticket-changes-github-taken-back',
    ]);
  }
});

const mutate = (name, change) => {
  const [event, payload] = positives[name];
  const p = structuredClone(payload);
  change(p);
  return matchesTrigger(manifest.triggers[name], event, p);
};

test('negative fixtures are rejected', () => {
  const cases = [
    ['github-issue-labelled', (p) => (p.sender = { id: 999, type: 'User' })],
    ['github-issue-labelled', (p) => (p.sender = { id: OWNER_ID, type: 'Bot' })],
    ['github-issue-labelled', (p) => (p.repository.id = 1)],
    ['github-issue-labelled', (p) => (p.label.name = 'bug')],
    ['github-issue-labelled', (p) => (p.issue.state = 'closed')],
    ['github-issue-labelled', (p) => (p.sender.id = String(OWNER_ID))],
    ['github-issue-labelled', (p) => delete p.sender.id],
    ['github-issue-labelled', (p) => delete p.repository],
    ['shepherd-pr-review', (p) => (p.pull_request.head.repo.id = 42)],
    ['shepherd-pr-review', (p) => (p.pull_request.head.ref = 'feature/x')],
    ['shepherd-pr-review', (p) => (p.pull_request.labels = [{ name: 'bug' }])],
    ['shepherd-pr-review', (p) => (p.pull_request.state = 'closed')],
    ['shepherd-pr-review-comment', (p) => (p.sender.id = REVIEWER_ID)],
    ['shepherd-pr-comment', (p) => (p.sender.id = REVIEWER_ID)],
    ['shepherd-pr-comment', (p) => delete p.issue.pull_request],
    ['shepherd-checks-failed', (p) => (p.check_run.conclusion = 'success')],
    ['shepherd-checks-failed', (p) => (p.check_run.pull_requests = [])],
    ['shepherd-checks-failed', (p) => (p.check_run.pull_requests[0].head.repo.id = 42)],
    ['shepherd-checks-passed', (p) => (p.check_suite.head_branch = 'main')],
    ['shepherd-checks-passed', (p) => (p.repository.id = 42)],
    ['shepherd-pr-review-by-reviewer', (p) => (p.sender.id = 42)],
    ['follow-ticket-changes-pr-closed', (p) => (p.pull_request.state = 'open')],
    ['follow-ticket-changes-pr-closed', (p) => (p.sender.id = REVIEWER_ID)],
    ['follow-ticket-changes-github-taken-back', (p) => (p.label.name = 'bug')],
    ['follow-ticket-changes-github-ended', (p) => (p.issue.state = 'open')],
    ['follow-ticket-changes-github-ended', (p) => (p.issue.labels = [])],
    ['follow-ticket-changes-github-replied', (p) => (p.issue.state = 'closed')],
    ['follow-ticket-changes-github-replied', (p) => (p.sender.id = REVIEWER_ID)],
  ];
  for (const [name, change] of cases)
    assert.equal(mutate(name, change), false, `${name} ${change}`);
});

test('the Reviewer reaches only its dedicated review route', () => {
  const reviewer = { id: REVIEWER_ID, type: 'User' };
  // Check routes carry no sender, so they are not people's routes.
  for (const [event, payload] of Object.values(positives)) {
    if (!payload.sender) continue;
    const p = structuredClone(payload);
    p.sender = reviewer;
    for (const name of matchingTriggers(manifest, event, p)) {
      assert.equal(name, 'shepherd-pr-review-by-reviewer');
    }
  }
});

test('malformed payloads do not match and unsupported predicates throw', () => {
  const trigger = manifest.triggers['github-issue-labelled'];
  for (const payload of [null, [], 'x', 1]) {
    assert.equal(matchesTrigger(trigger, 'github:issues.labeled', payload), false);
  }
  const bad = structuredClone(trigger);
  bad.when['event.sender.id'] = { gt: 1 };
  assert.throws(() =>
    matchesTrigger(bad, 'github:issues.labeled', positives['github-issue-labelled'][1]),
  );
  bad.when = { 'payload.x': 1 };
  assert.throws(() => matchesTrigger(bad, 'github:issues.labeled', {}));
});

test('the original manifest fails the narrow guard contract', () => {
  const original = clone();
  for (const trigger of Object.values(original.triggers))
    delete trigger.when['event.repository.id'];
  delete original.triggers['follow-ticket-changes-github-ended'].when['event.issue.state'];
  delete original.triggers['follow-ticket-changes-pr-closed'].when['event.pull_request.state'];
  assert.equal(checkContract(original).length, 11);
});

test('unsafe mutants fail the contract', () => {
  const mutants = {
    'drop the owner guard': (m) => delete m.triggers['shepherd-pr-review'].when['event.sender.id'],
    'drop a repository guard': (m) =>
      delete m.triggers['shepherd-checks-passed'].when['event.repository.id'],
    'drop the head repo guard': (m) =>
      delete m.triggers['shepherd-pr-review'].when['event.pull_request.head.repo.id'],
    'add the Reviewer elsewhere': (m) =>
      (m.triggers['shepherd-pr-comment'].when['event.sender.id'] = REVIEWER_ID),
    'open-only taken-back': (m) =>
      (m.triggers['follow-ticket-changes-github-taken-back'].when['event.issue.state'] = 'open'),
    'remove the issue-ended hook': (m) => delete m.triggers['follow-ticket-changes-github-ended'],
    'remove the pr-closed hook': (m) => delete m.triggers['follow-ticket-changes-pr-closed'],
    'disable taken-back': (m) => (m.triggers['follow-ticket-changes-github-taken-back'].on = []),
    'change the model': (m) => (m.actions.shepherd.model = 'other-model'),
    'change the skill': (m) => (m.actions.shepherd.skill = 'tessl-labs/factory@0.7.0#shepherd'),
    'change the environment': (m) => (m.actions['implement-github-issue'].environment = 'x'),
    'change a timeout': (m) => (m.actions['follow-ticket-changes'].timeout = '1h'),
    'merge cancellation lock with implement': (m) =>
      (m.triggers['follow-ticket-changes-github-taken-back'].concurrency.keys[0].key =
        'implement:{{ event.repository.id }}#{{ event.issue.number }}'),
    'split replies from the implement lock': (m) =>
      (m.triggers['follow-ticket-changes-github-replied'].concurrency.keys[0].key = 'reply'),
    'change the debounce': (m) => (m.triggers['shepherd-pr-review'].concurrency.debounce = '10s'),
    'add a route': (m) => (m.triggers.extra = structuredClone(m.triggers['shepherd-pr-review'])),
  };
  for (const [label, change] of Object.entries(mutants)) {
    const m = clone();
    change(m);
    assert.notDeepEqual(checkContract(m), [], label);
  }
  // The required cancellation and dependency routes still accept their events.
  for (const name of [
    'follow-ticket-changes-github-taken-back',
    'follow-ticket-changes-github-ended',
  ]) {
    const [event, payload] = positives[name];
    assert.deepEqual(matchingTriggers(manifest, event, payload), [name]);
  }
});
