// The pure readiness decision. It reads a snapshot and never touches the
// network, the file system, the environment or any credential.

export type Verdict = 'READY' | 'WAITING' | 'STOPPED' | 'UNKNOWN';

export const REQUIRED_REVIEWER_ID = 325629464;
export const REQUIRED_CHECK = 'check';
export const TESSL_LABEL = 'tessl';

export const CAVEATS = [
  'READY never grants merge authorization: a person decides whether to merge.',
  'An empty run list is not proof that no webhook is queued: the platform has visibility lag and no pre-dispatch deduplication.',
];

export interface Snapshot {
  schemaVersion: 1;
  repository: string;
  issue: { number: number; state: 'OPEN' | 'CLOSED'; labels: string[] };
  pullRequest: {
    number: number;
    state: 'OPEN' | 'CLOSED' | 'MERGED';
    isDraft: boolean;
    headRefName: string;
    headRefOid: string;
    baseRefName: string;
    headRepository: string;
    labels: string[];
    closingIssues: number[];
  };
  checks: { complete: boolean; items: Check[] };
  reviews: { complete: boolean; items: Review[] };
  reviewThreads: { complete: boolean; items: { id: string; isResolved: boolean }[] };
  runs: { complete: boolean; items: Run[] };
  readErrors: string[];
}

export interface Check {
  name: string;
  headSha: string;
  status: 'QUEUED' | 'IN_PROGRESS' | 'COMPLETED';
  conclusion: string | null;
}

export interface Review {
  authorId: number;
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'DISMISSED' | 'COMMENTED';
  commitId: string;
  submittedAt: string;
}

export interface Run {
  id: string;
  kind: string;
  status: string;
  issueNumber: number | null;
  prNumber: number | null;
}

export interface Decision {
  verdict: Verdict;
  reasons: string[];
  observations: string[];
  caveats: string[];
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isPosInt = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0;
const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isSha = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{40}$/.test(v);
const isRepo = (v: unknown): v is string =>
  typeof v === 'string' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(v);
const isTextList = (v: unknown): v is string[] => Array.isArray(v) && v.every(isText);
const oneOf = (v: unknown, values: readonly string[]) =>
  typeof v === 'string' && values.includes(v);

function listProblems(v: unknown, name: string, item: (x: unknown) => boolean): string[] {
  if (!isObj(v)) return [`${name} is missing`];
  const problems: string[] = [];
  if (typeof v.complete !== 'boolean') problems.push(`${name}.complete is missing`);
  if (!Array.isArray(v.items)) problems.push(`${name}.items is missing`);
  else if (!v.items.every(item)) problems.push(`${name}.items has a malformed entry`);
  return problems;
}

// Returns every way the input fails the snapshot schema. Empty means valid.
export function validateSnapshot(input: unknown): string[] {
  if (!isObj(input)) return ['snapshot is not a JSON object'];
  const p: string[] = [];
  if (input.schemaVersion !== 1) p.push('schemaVersion must be 1');
  if (!isRepo(input.repository)) p.push('repository must be owner/name');

  const issue = input.issue;
  if (!isObj(issue)) p.push('issue is missing');
  else {
    if (!isPosInt(issue.number)) p.push('issue.number is missing');
    if (!oneOf(issue.state, ['OPEN', 'CLOSED'])) p.push('issue.state is missing');
    if (!isTextList(issue.labels)) p.push('issue.labels is missing');
  }

  const pr = input.pullRequest;
  if (!isObj(pr)) p.push('pullRequest is missing');
  else {
    if (!isPosInt(pr.number)) p.push('pullRequest.number is missing');
    if (!oneOf(pr.state, ['OPEN', 'CLOSED', 'MERGED'])) p.push('pullRequest.state is missing');
    if (typeof pr.isDraft !== 'boolean') p.push('pullRequest.isDraft is missing');
    if (!isText(pr.headRefName)) p.push('pullRequest.headRefName is missing');
    if (!isSha(pr.headRefOid)) p.push('pullRequest.headRefOid is not a commit SHA');
    if (!isText(pr.baseRefName)) p.push('pullRequest.baseRefName is missing');
    if (!isRepo(pr.headRepository)) p.push('pullRequest.headRepository must be owner/name');
    if (!isTextList(pr.labels)) p.push('pullRequest.labels is missing');
    if (!Array.isArray(pr.closingIssues) || !pr.closingIssues.every(isPosInt))
      p.push('pullRequest.closingIssues is missing');
  }

  p.push(
    ...listProblems(
      input.checks,
      'checks',
      (c) =>
        isObj(c) &&
        isText(c.name) &&
        isSha(c.headSha) &&
        oneOf(c.status, ['QUEUED', 'IN_PROGRESS', 'COMPLETED']) &&
        (c.conclusion === null || isText(c.conclusion)),
    ),
    ...listProblems(
      input.reviews,
      'reviews',
      (r) =>
        isObj(r) &&
        isPosInt(r.authorId) &&
        oneOf(r.state, ['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED', 'COMMENTED']) &&
        isSha(r.commitId) &&
        isText(r.submittedAt) &&
        !Number.isNaN(Date.parse(r.submittedAt)),
    ),
    ...listProblems(
      input.reviewThreads,
      'reviewThreads',
      (t) => isObj(t) && isText(t.id) && typeof t.isResolved === 'boolean',
    ),
    ...listProblems(
      input.runs,
      'runs',
      (r) =>
        isObj(r) &&
        isText(r.id) &&
        isText(r.kind) &&
        isText(r.status) &&
        (r.issueNumber === null || isPosInt(r.issueNumber)) &&
        (r.prNumber === null || isPosInt(r.prNumber)),
    ),
  );
  if (!isTextList(input.readErrors)) p.push('readErrors is missing');
  return p;
}

const ACTIVE_RUN_STATUSES = ['queued', 'pending', 'running', 'in_progress', 'waiting'];

// Latest-review semantics: for each reviewer, COMMENTED reviews are ignored and
// the reviewer's latest remaining review by submittedAt (later array position
// breaks ties) is their current state. A later DISMISSED or CHANGES_REQUESTED
// review therefore replaces an earlier approval.
export function latestReviews(reviews: Review[]): Map<number, Review> {
  const latest = new Map<number, Review>();
  reviews.forEach((review) => {
    if (review.state === 'COMMENTED') return;
    const prior = latest.get(review.authorId);
    if (!prior || Date.parse(review.submittedAt) >= Date.parse(prior.submittedAt)) {
      latest.set(review.authorId, review);
    }
  });
  return latest;
}

export function decide(input: unknown): Decision {
  const problems = validateSnapshot(input);
  if (problems.length > 0) {
    return {
      verdict: 'UNKNOWN',
      reasons: problems.map((x) => `malformed snapshot: ${x}`),
      observations: [],
      caveats: CAVEATS,
    };
  }
  const s = input as Snapshot;
  const { issue, pullRequest: pr } = s;
  const head = pr.headRefOid;
  const stopped: string[] = [];
  const unknown: string[] = [];
  const waiting: string[] = [];
  const observations: string[] = [
    `repository ${s.repository}`,
    `issue #${issue.number} is ${issue.state} with labels [${issue.labels.join(', ')}]`,
    `PR #${pr.number} is ${pr.state}${pr.isDraft ? ' (draft)' : ''}, ${pr.headRepository}:${pr.headRefName} -> ${pr.baseRefName} at ${head}`,
  ];

  // Lifecycle and identity: the factory has nothing to wait for.
  if (issue.state !== 'OPEN') stopped.push(`issue #${issue.number} is closed`);
  if (!issue.labels.includes(TESSL_LABEL))
    stopped.push(`issue #${issue.number} no longer has the ${TESSL_LABEL} label`);
  if (pr.state === 'MERGED') stopped.push(`PR #${pr.number} is already merged`);
  if (pr.state === 'CLOSED') stopped.push(`PR #${pr.number} is closed`);
  if (pr.headRepository !== s.repository)
    stopped.push(`PR head repository ${pr.headRepository} is not ${s.repository}`);
  if (pr.headRefName !== `tessl/issue-${issue.number}`)
    stopped.push(`PR branch ${pr.headRefName} is not tessl/issue-${issue.number}`);
  if (!pr.closingIssues.includes(issue.number))
    stopped.push(`PR #${pr.number} does not close issue #${issue.number}`);
  if (!pr.labels.includes(TESSL_LABEL))
    stopped.push(`PR #${pr.number} does not have the ${TESSL_LABEL} label`);

  // Evidence we could not read in full.
  s.readErrors.forEach((e) => unknown.push(`read failed: ${e}`));
  (['checks', 'reviews', 'reviewThreads', 'runs'] as const).forEach((k) => {
    if (!s[k].complete) unknown.push(`${k} were not read completely (pagination or partial read)`);
  });

  // The required aggregate check, on the current head only.
  const checks = s.checks.items.filter((c) => c.name === REQUIRED_CHECK);
  const current = checks.filter((c) => c.headSha === head);
  checks
    .filter((c) => c.headSha !== head)
    .forEach((c) =>
      observations.push(
        `ignored ${c.name} on old commit ${c.headSha}: ${c.conclusion ?? c.status}`,
      ),
    );
  if (current.length === 0) {
    waiting.push(`no ${REQUIRED_CHECK} check has reported on head ${head}`);
  } else {
    current.forEach((c) => {
      observations.push(`check ${c.name} on head: ${c.status} ${c.conclusion ?? ''}`.trim());
      if (c.status !== 'COMPLETED') waiting.push(`check ${c.name} is ${c.status.toLowerCase()}`);
      else if (c.conclusion !== 'SUCCESS')
        waiting.push(
          `check ${c.name} concluded ${c.conclusion ?? 'with no conclusion'}, not SUCCESS`,
        );
    });
  }

  // Reviews: the required reviewer's latest review must approve the head, and
  // nobody's latest review may request changes.
  const latest = latestReviews(s.reviews.items);
  latest.forEach((r, author) =>
    observations.push(
      `latest review by ${author}: ${r.state} on ${r.commitId} at ${r.submittedAt}`,
    ),
  );
  latest.forEach((r, author) => {
    if (r.state === 'CHANGES_REQUESTED') waiting.push(`reviewer ${author} requested changes`);
  });
  const required = latest.get(REQUIRED_REVIEWER_ID);
  if (!required) {
    const others = [...latest.values()].some((r) => r.state === 'APPROVED');
    waiting.push(
      others
        ? `approval is not from reviewer ${REQUIRED_REVIEWER_ID}`
        : `reviewer ${REQUIRED_REVIEWER_ID} has not approved`,
    );
  } else if (required.state === 'DISMISSED') {
    waiting.push(`reviewer ${REQUIRED_REVIEWER_ID}'s latest review was dismissed`);
  } else if (required.state === 'APPROVED' && required.commitId !== head) {
    waiting.push(
      `reviewer ${REQUIRED_REVIEWER_ID} approved ${required.commitId}, not head ${head}`,
    );
  }

  const open = s.reviewThreads.items.filter((t) => !t.isResolved);
  if (open.length > 0) waiting.push(`${open.length} review thread(s) are unresolved`);

  if (pr.isDraft) waiting.push(`PR #${pr.number} is a draft`);

  const active = s.runs.items.filter(
    (r) =>
      ACTIVE_RUN_STATUSES.includes(r.status.toLowerCase()) &&
      (r.issueNumber === issue.number || r.prNumber === pr.number),
  );
  active.forEach((r) => waiting.push(`factory run ${r.id} (${r.kind}) is ${r.status}`));
  observations.push(`${active.length} relevant active factory run(s) visible`);

  const [verdict, reasons]: [Verdict, string[]] =
    stopped.length > 0
      ? ['STOPPED', stopped]
      : unknown.length > 0
        ? ['UNKNOWN', [...unknown, ...waiting]]
        : waiting.length > 0
          ? ['WAITING', waiting]
          : [
              'READY',
              [`head ${head} has a passing ${REQUIRED_CHECK} check and a current approval`],
            ];
  return { verdict, reasons, observations, caveats: CAVEATS };
}

export const EXIT_CODES: Record<Verdict, number> = {
  READY: 0,
  WAITING: 10,
  STOPPED: 20,
  UNKNOWN: 30,
};
