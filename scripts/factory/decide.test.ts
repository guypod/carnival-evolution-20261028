import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  decide,
  latestReviews,
  REQUIRED_REVIEWER_ID,
  type Review,
  type Snapshot,
} from './decide.ts';

const load = (name: string): Snapshot =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));

const HEAD = 'a'.repeat(40);
const OLD = 'c'.repeat(40);

function ready(): Snapshot {
  return load('ready');
}

function review(over: Partial<Review>): Review {
  return {
    authorId: REQUIRED_REVIEWER_ID,
    state: 'APPROVED',
    commitId: HEAD,
    submittedAt: '2026-01-02T10:00:00Z',
    ...over,
  };
}

function expectNotReady(s: unknown, verdict: string, reason: RegExp) {
  const d = decide(s);
  expect(d.verdict).toBe(verdict);
  expect(d.reasons.join('\n')).toMatch(reason);
}

describe('decide', () => {
  it('reports READY for a complete same-head fixture, with the merge caveat', () => {
    const d = decide(ready());
    expect(d.verdict).toBe('READY');
    expect(d.caveats.join(' ')).toMatch(/never grants merge authorization/);
    expect(d.observations.length).toBeGreaterThan(0);
  });

  it('pins repository and base independently of supplied matching identities', () => {
    const wrongRepo = ready();
    wrongRepo.repository = wrongRepo.pullRequest.headRepository = 'other/project';
    expectNotReady(wrongRepo, 'STOPPED', /not the approved/);
    const wrongBase = ready();
    wrongBase.pullRequest.baseRefName = 'feature/unreviewed-base';
    expectNotReady(wrongBase, 'STOPPED', /PR base.*not main/);
  });

  it.each(['unknown-platform-state', '   '])('rejects unrecognized run status %s', (status) => {
    const s = ready();
    s.runs.items[0].status = status;
    expectNotReady(s, 'UNKNOWN', /runs.items/);
  });

  it('does not assume an unattributed active run is irrelevant', () => {
    const s = ready();
    s.runs.items.push({
      id: 'unknown-run',
      kind: 'shepherd',
      status: 'running',
      issueNumber: null,
      prNumber: null,
    });
    expectNotReady(s, 'UNKNOWN', /unknown issue\/PR attribution/);
  });

  it('rejects unsafe integer identifiers', () => {
    const s = ready();
    s.issue.number = Number.MAX_SAFE_INTEGER + 1;
    s.pullRequest.headRefName = `tessl/issue-${s.issue.number}`;
    s.pullRequest.closingIssues = [s.issue.number];
    expectNotReady(s, 'UNKNOWN', /issue.number/);
  });

  it.each(['2026-01-02T10:00:00', '2026-02-30T10:00:00Z', '2026-01-02T25:00:00Z'])(
    'rejects ambiguous or impossible review time %s',
    (submittedAt) => {
      const s = ready();
      s.reviews.items[0].submittedAt = submittedAt;
      expectNotReady(s, 'UNKNOWN', /reviews.items/);
    },
  );

  it('does not choose a conflicting equal-time review by array position', () => {
    const s = ready();
    s.reviews.items.push(review({ state: 'DISMISSED' }));
    expectNotReady(s, 'UNKNOWN', /same timestamp/);
    s.reviews.items.reverse();
    expectNotReady(s, 'UNKNOWN', /same timestamp/);
  });

  it('treats an approval and check on an old head as not current', () => {
    const d = decide(load('stale-approval'));
    expect(d.verdict).toBe('WAITING');
    expect(d.reasons.join('\n')).toMatch(/no check check has reported on head/);
    expect(d.reasons.join('\n')).toMatch(/approved a{40}, not head/);
  });

  it('waits on a stale check even when the approval is current', () => {
    const s = ready();
    s.checks.items[0].headSha = OLD;
    expectNotReady(s, 'WAITING', /no check check has reported on head/);
  });

  it('waits on a pending check', () => {
    const s = ready();
    s.checks.items[0] = { ...s.checks.items[0], status: 'IN_PROGRESS', conclusion: null };
    expectNotReady(s, 'WAITING', /in_progress/);
  });

  it('does not treat a cancelled check as passing', () => {
    const s = ready();
    s.checks.items[0].conclusion = 'CANCELLED';
    expectNotReady(s, 'WAITING', /concluded CANCELLED/);
  });

  it('waits on a draft PR', () => {
    const s = ready();
    s.pullRequest.isDraft = true;
    expectNotReady(s, 'WAITING', /is a draft/);
  });

  it.each(['queued', 'running'])(
    'waits on an active %s shepherd or implementation run',
    (status) => {
      const s = ready();
      s.runs.items.push({
        id: 'run-2',
        kind: 'shepherd',
        status,
        issueNumber: null,
        prNumber: 202,
      });
      s.runs.items.push({
        id: 'run-3',
        kind: 'implement',
        status,
        issueNumber: 101,
        prNumber: null,
      });
      expectNotReady(s, 'WAITING', /run-2 \(shepherd\)[\s\S]*run-3 \(implement\)/);
    },
  );

  it('ignores active runs for other issues and PRs', () => {
    const s = ready();
    s.runs.items.push({
      id: 'run-9',
      kind: 'shepherd',
      status: 'running',
      issueNumber: 7,
      prNumber: 8,
    });
    expect(decide(s).verdict).toBe('READY');
  });

  it('waits on changes requested and unresolved threads', () => {
    const s = ready();
    s.reviews.items.push(review({ authorId: 42, state: 'CHANGES_REQUESTED' }));
    s.reviewThreads.items.push({ id: 'thread-2', isResolved: false });
    expectNotReady(s, 'WAITING', /42 requested changes[\s\S]*1 review thread/);
  });

  it('does not promote advisory comment text into formal approval', () => {
    const s = ready();
    s.reviews.items = [
      {
        ...review({ state: 'COMMENTED' }),
        body: '<!-- tessl-code-review:result:v1 approved=true findings-total=0 -->',
      } as Review,
    ];
    expectNotReady(s, 'WAITING', /reviewer 325629464 has not approved/);
  });

  it('waits when the only approval is from the wrong reviewer', () => {
    const s = ready();
    s.reviews.items = [review({ authorId: 325629465 })];
    expectNotReady(s, 'WAITING', /not from reviewer 325629464/);
  });

  it.each([
    ['closed issue', (s: Snapshot) => (s.issue.state = 'CLOSED'), /issue #101 is closed/],
    ['taken-back issue', (s: Snapshot) => (s.issue.labels = []), /no longer has the tessl label/],
    ['merged PR', (s: Snapshot) => (s.pullRequest.state = 'MERGED'), /already merged/],
    ['closed PR', (s: Snapshot) => (s.pullRequest.state = 'CLOSED'), /PR #202 is closed/],
    [
      'fork head',
      (s: Snapshot) => (s.pullRequest.headRepository = 'someone/fork'),
      /head repository someone\/fork/,
    ],
    [
      'wrong branch',
      (s: Snapshot) => (s.pullRequest.headRefName = 'tessl/issue-102'),
      /not tessl\/issue-101/,
    ],
    [
      'other issue',
      (s: Snapshot) => (s.pullRequest.closingIssues = [102]),
      /does not close issue #101/,
    ],
    [
      'PR without tessl label',
      (s: Snapshot) => (s.pullRequest.labels = []),
      /PR #202 does not have/,
    ],
  ])('stops on a %s', (_name, change, reason) => {
    const s = ready();
    change(s);
    expectNotReady(s, 'STOPPED', reason);
  });

  it.each([
    [
      'incomplete pagination',
      (s: Snapshot) => (s.reviewThreads.complete = false),
      /reviewThreads were not read/,
    ],
    [
      'failed read',
      (s: Snapshot) => s.readErrors.push('gh pr checks timed out'),
      /read failed: gh pr checks/,
    ],
  ])('is UNKNOWN on %s', (_name, change, reason) => {
    const s = ready();
    change(s);
    expectNotReady(s, 'UNKNOWN', reason);
  });

  it.each([
    ['not an object', null, /not a JSON object/],
    ['empty object', {}, /schemaVersion must be 1/],
    [
      'missing head SHA',
      { ...ready(), pullRequest: { ...ready().pullRequest, headRefOid: '' } },
      /headRefOid/,
    ],
    ['missing runs', { ...ready(), runs: undefined }, /runs is missing/],
    ['malformed review', { ...ready(), reviews: { complete: true, items: [{}] } }, /reviews.items/],
  ])('is UNKNOWN when evidence is %s', (_name, input, reason) => {
    expectNotReady(input, 'UNKNOWN', reason);
  });
});

describe('latest-review semantics', () => {
  it('lets a later changes-requested review replace an earlier approval', () => {
    const s = ready();
    s.reviews.items.push(
      review({ state: 'CHANGES_REQUESTED', submittedAt: '2026-01-03T10:00:00Z' }),
    );
    expectNotReady(s, 'WAITING', /325629464 requested changes/);
  });

  it('lets a later dismissal replace an earlier approval', () => {
    const s = ready();
    s.reviews.items.push(review({ state: 'DISMISSED', submittedAt: '2026-01-03T10:00:00Z' }));
    expectNotReady(s, 'WAITING', /latest review was dismissed/);
  });

  it('orders by submittedAt, not by array position', () => {
    const s = ready();
    s.reviews.items.unshift(
      review({ state: 'CHANGES_REQUESTED', submittedAt: '2026-01-01T10:00:00Z' }),
    );
    expect(decide(s).verdict).toBe('READY');
  });

  it('ignores comment-only reviews', () => {
    const latest = latestReviews([
      review({}),
      review({ state: 'COMMENTED', submittedAt: '2026-01-05T10:00:00Z' }),
    ]);
    expect(latest.get(REQUIRED_REVIEWER_ID)?.state).toBe('APPROVED');
  });
});
