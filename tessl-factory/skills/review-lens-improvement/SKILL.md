---
name: review-lens-improvement
description: Twenty minutes before each six-hour Europe/London block ends, inspect this repository's recent pull request diffs, review findings, repairs, tests and live-play notes, and propose specific improvements to existing review lenses or new lenses as durable, deduplicated proposals in the factory-state/review-lenses ledger. Use when running the review-lens improvement loop. Never edits, weakens or approves a lens.
---

# Review-lens improvement

The review lenses are configured in `.tessl-code-review.yml`: four
`tessl/code-review` lenses and the local ones under `review-lenses/`. This loop
asks, every block, what those lenses missed or got wrong in the work that just
landed, and writes that down as **proposals**. It never changes a lens. The
external block coordinator decides each proposal at the next London block
start, through `scripts/lenses/ledger.mjs decide`, and an accepted proposal
goes through the factory's ordinary implementation and review like any issue.

Native Tessl schedule findings are disabled for this workspace. Do not enable
or bypass them. The proposals live in `ledger.json` on the branch
`factory-state/review-lenses`, read and written only by
`scripts/lenses/ledger.mjs` (tested in `scripts/lenses/ledger.test.mjs`), and
each run's result summarises them. That summary is a fallback, not the native
findings UI, and says so.

Everything written by this loop is public: it goes to a public branch. Never
write private experiment log contents or identifiers, credentials, or anything
from outside this repository.

## Guards

Any "stop" ends the run with the ledger unchanged. Say why in the run output.

1. **Serialization.** The action holds the `carnival-app-writer` key (limit 1,
   queued), like every writing action. Start a manual run only with
   `tessl action trigger review-lens-improvement --request-id <stable id>`.
2. **Slot.** Run `node scripts/lenses/ledger.mjs due`. Unless it prints
   `"due": true`, stop. The schedule fires at 05:40, 11:40, 17:40 and 23:40
   Europe/London through the scheduler's own `timezone`; this check makes a
   late, manual or repeated run harmless. A slot is open for twenty minutes
   and is covered once. A missed slot is never run late, back-filled or
   described as run.
3. **Scope.** Read only. No branch, pull request, issue, label or lens change
   in this repository. The only write is `ledger.mjs record`. Leave PR #299
   and every other pull request alone.

## Inspect

Note the actual start time. Gather evidence since the last recorded run (or
the last six hours on the first run), all of it public in this repository:

- merged and open pull requests, their diffs and files
  (`gh pr list --state all --search "updated:>=<time>" --limit 100`);
- review findings and comments on them (`gh pr view <n> --comments`,
  `gh api repos/{owner}/{repo}/pulls/<n>/comments`);
- repairs: follow-up commits or pull requests fixing something a review let
  through, and visual repairs from `factory-state/visual-repair`;
- tests added or changed, and CI results;
- live-play notes in issues and pull requests, when there are any.

If a list reaches its limit, or a source cannot be read, the coverage is
`partial` (or `failed` if nothing could be read) and `gaps` says what was
missed. Never describe evidence you did not read.

Read each lens's current definition before proposing to change it. Propose
only when the evidence shows a concrete miss, false alarm or ambiguity. Each
proposal names:

- `lens`: a ref exactly as in `.tessl-code-review.yml`, with `kind: "amend"`,
  or `new:<slug>` with `kind: "new"`;
- `title`, `change` (the exact wording or check to add or alter) and
  `rationale`;
- `weakens`: `true` when the change would let through anything the lens now
  flags. Say so plainly; it is never a way to make reviews pass;
- `evidence`: `{ kind, ref, url, commit? }` items, `kind` one of `pr`,
  `review-finding`, `repair`, `test`, `live-play`, each `url` in this
  repository.

## Record

Write the run to a file outside the clone:

```json
{
  "runId": "<the Tessl launch run id>",
  "slot": "<slot from due>",
  "startedAt": "<actual UTC start>",
  "finishedAt": "<actual UTC finish>",
  "coverage": { "status": "complete|partial|failed", "inspected": ["#304"], "gaps": "..." },
  "proposals": []
}
```

Save it with `node scripts/lenses/ledger.mjs record <file>`. It refuses a
malformed run, a lens that is not configured, evidence outside this
repository, and a partial or failed run without `gaps`. A proposal already in
the ledger, by fingerprint, keeps its status and decisions and gains the new
evidence. Recording the same `runId` twice changes nothing. A failed run is
still recorded, with its real times, so the gap is visible.

If the push is refused because the branch moved, the run is not saved: report
it and stop. Never force-push or hand-edit the branch.

## Run output

Lead with `recorded <n> proposal(s) for <slot>`, `not due: <reason>` or
`failed: <error>`. Then print `node scripts/lenses/ledger.mjs summary <runId>`
so the coordinator can read the proposals from the Tessl run result.
