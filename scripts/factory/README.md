# Factory contract check

`tessl.json` decides which GitHub events start Tessl's factory. This folder
pins that file to an approved contract and tests the routes offline.

- `contract.mjs`: the exact actions (skill `tessl-labs/factory@0.6.0`, agent
  `claude-code`, model `claude-opus-5-5`, environment, timeouts) and the eleven
  triggers, with their guards, concurrency keys (the existing 90s shepherd
  debounce, and replies sharing the implement lock) and actions, plus the
  `test-health` and `visual-repair` actions with their two schedules (weekly
  and every six hours).
- `check-contract.mjs`: fails when `tessl.json`'s `actions`, `triggers` or `schedules`
  differ from the contract. It does not check the top-level `name`, `mode` or
  `dependencies`, which `tessl install` manages.
- `matcher.mjs`: an offline model of how a trigger's `when` block matches a
  payload. It supports only the predicates this manifest uses (equality,
  `matches`, `exists`, `in`, `any.equals` over `*`, `isPullRequest`) and throws
  on anything else. Local fixture validation also rejects missing or malformed
  ticket numbers and subject objects, a malformed PR marker, and malformed
  trigger shapes. An absent `issue.pull_request` marker is accepted: it means
  the comment is on an issue, not a pull request. This extra
  input validation is not a claim about the platform's payload validation.
  It is not the production scheduler and not a security
  boundary; online validation is still required.
- `factory.test.mjs`: positive fixtures for all eleven routes, negative
  fixtures, and unsafe mutants.

`npm run check` runs `npm run factory:check` after its other steps.

## Demo

```sh
git show 56c1e19:tessl.json > /tmp/original-tessl.json
node scripts/factory/check-contract.mjs /tmp/original-tessl.json  # fails 11 checks: no repository guard, no closed state
node scripts/factory/check-contract.mjs                           # factory contract: tessl.json holds
node --test scripts/factory/factory.test.mjs                      # mutants fail; cancellation and dependency routes still match
```

Changing the factory on purpose means changing `contract.mjs` in the same pull
request.

# Current-head readiness

A read-only decision aid that says whether one Tessl pull request looks ready
for its owner to review for merge. It is not a scheduler, a merge bot or a
security boundary, and it does not change what the factory costs to run.

It never merges, comments, labels, cancels runs or reads credentials.

## Fixture mode

```sh
npm run factory:readiness -- --snapshot scripts/factory/fixtures/ready.json
npm run factory:readiness -- --snapshot scripts/factory/fixtures/stale-approval.json
```

The fixture issue, PR, hashes, reviews and runs are synthetic; the fixed public
repository and reviewer identities match this isolated factory.

The first prints `READY` and exits 0. The second prints `WAITING` and exits 10,
because its approval and check are on an older commit than the PR head.

The output is JSON: `verdict`, `reasons`, `observations` (what the decision
looked at) and `caveats`.

## Live mode

There is no live mode yet. `--pr <number>` is not supported. To check a real
PR, collect a snapshot by hand with read-only `gh` calls (`gh pr view`,
`gh pr checks`, `gh api graphql` for review threads) and pass it with
`--snapshot`. The `runs` list does not come from GitHub: list the factory runs you
can see for this repository, one entry per visible factory run with
its `id`, `kind`, `status`, and the `issueNumber` and `prNumber` it names (`null`
when it names none). A snapshot without a complete `runs` list returns
`UNKNOWN`. Mark a list `"complete": false` when you did not read every page,
and add a line to `readErrors` for any call that failed. Never paste tokens
into a snapshot.

## Verdicts and exit codes

| Verdict   | Exit | Meaning                                                                    |
| --------- | ---- | -------------------------------------------------------------------------- |
| `READY`   | 0    | Every fact below holds on the current head. A person still decides.        |
| `WAITING` | 10   | Something can still change: a check, a review, a thread, a draft or a run. |
| `STOPPED` | 20   | Issue closed or taken back, PR merged or closed, or identity mismatch.     |
| `UNKNOWN` | 30   | Malformed snapshot, an unreadable file, a failed read or a partial list.   |
| (usage)   | 2    | Wrong arguments.                                                           |

`STOPPED` wins over `UNKNOWN`, which wins over `WAITING`.

## What READY needs

- The repository is exactly `guypod/carnival-factory-lab-20261022`, with base `main`.
- The issue is open and has the `tessl` label.
- The PR is open, not a draft, has the `tessl` label, comes from
  `tessl/issue-<n>` in the same repository and closes the issue.
- The `check` job (the aggregate CI check) completed with `SUCCESS` on the
  PR's current head SHA. A check on an older commit is ignored, and
  `CANCELLED` is not passing.
- Reviewer ID `325629464`'s latest review is an approval of the current head.
- No reviewer's latest review requests changes.
- No review thread is unresolved.
- No visible active factory run (status `queued`, `pending`, `running`,
  `in_progress` or `waiting`) names the issue or the PR, and no active run
  lacks both an issue and a PR number.
- Every list was read completely and no read failed.

### Latest-review semantics

For each reviewer, comment-only reviews are ignored, and the review with the
latest `submittedAt` is that reviewer's current state. Timestamps must be valid
UTC ISO dates ending in `Z`, with optional three-digit milliseconds. Conflicting
equal-time reviews return UNKNOWN rather than relying on list order. A later `DISMISSED` or `CHANGES_REQUESTED` review replaces
an earlier approval.

## Limits

- READY describes only the supplied snapshot; no live freshness check occurs.
- Unknown run statuses and unattributed active runs return UNKNOWN.
- READY never grants merge authorization.
- The run list has visibility lag, and the platform does not deduplicate
  webhooks before dispatch. An empty run list does not prove that no run is
  queued.
- The required check name and reviewer ID are fixed in `decide.ts`.

The readiness CLI requires Node 24 or newer (the factory and CI use Node 24).

### Advisory-only reviews

This repository's current Tessl Code Review publication mode is advisory: it
publishes `COMMENTED` reviews, even when its text reports no blocking findings.
The helper does not treat a comment body or an `approved=true` text marker as a
formal GitHub approval. A real snapshot containing only those advisory reviews
therefore remains `WAITING`. It is a conservative decision aid, not a replacement
for the owner's authorized review-and-merge process.
