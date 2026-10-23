# Factory readiness

A read-only decision aid that says whether one Tessl pull request looks ready
for its owner to review for merge. It is not a scheduler, a merge bot or a
security boundary, and it does not change what the factory costs to run.

It never merges, comments, labels, cancels runs or reads credentials.

## Fixture mode

```sh
npm run factory:readiness -- --snapshot scripts/factory/fixtures/ready.json
npm run factory:readiness -- --snapshot scripts/factory/fixtures/stale-approval.json
```

The first prints `READY` and exits 0. The second prints `WAITING` and exits 10,
because its approval and check are on an older commit than the PR head.

The output is JSON: `verdict`, `reasons`, `observations` (what the decision
looked at) and `caveats`.

## Live mode

There is no live mode yet. `--pr <number>` is not supported. To check a real
PR, collect a snapshot by hand with read-only `gh` calls (`gh pr view`,
`gh pr checks`, `gh api graphql` for review threads) and pass it with
`--snapshot`. Mark a list `"complete": false` when you did not read every page,
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

- The issue is open and has the `tessl` label.
- The PR is open, not a draft, has the `tessl` label, comes from
  `tessl/issue-<n>` in the same repository and closes the issue.
- The `check` job (the aggregate CI check) completed with `SUCCESS` on the
  PR's current head SHA. A check on an older commit is ignored, and
  `CANCELLED` is not passing.
- Reviewer ID `325629464`'s latest review is an approval of the current head.
- No reviewer's latest review requests changes.
- No review thread is unresolved.
- No visible queued or running factory run names the issue or the PR.
- Every list was read completely and no read failed.

### Latest-review semantics

For each reviewer, comment-only reviews are ignored, and the review with the
latest `submittedAt` is that reviewer's current state (a tie goes to the one
later in the list). A later `DISMISSED` or `CHANGES_REQUESTED` review replaces
an earlier approval.

## Limits

- READY never grants merge authorization.
- The run list has visibility lag, and the platform does not deduplicate
  webhooks before dispatch. An empty run list does not prove that no run is
  queued.
- The required check name and reviewer ID are fixed in `decide.ts`.
