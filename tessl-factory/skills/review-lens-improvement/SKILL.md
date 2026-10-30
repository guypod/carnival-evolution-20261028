---
name: review-lens-improvement
description: Run one of the factory's four proposal-only learners on its Europe/London schedule (lens tuning six-hourly, review-feedback and run learning daily, instruction tidy on Mondays), or as a bounded manual initial inspection, and save evidence-based, deduplicated proposals in the factory-state/review-lenses ledger. Use when running the review-lens improvement or factory learning loops. Never edits, weakens or approves anything.
---

# Factory learning: review lenses, feedback, runs and instructions

This one skill runs four **learners**, chosen by the `LEARNER` input. Each one
reads public evidence from this repository and writes **proposals**. None of
them changes a lens, an instruction, a test or any code. The external block
coordinator decides each proposal at the next London block start, through
`scripts/lenses/ledger.mjs decide`, and an accepted proposal goes through the
factory's ordinary implementation and review like any issue.

| `LEARNER`          | London schedule            | Looks at                                                                                   | Proposal kinds                                             |
| ------------------ | -------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `lens-tuning`      | 05:40, 11:40, 17:40, 23:40 | what the lenses in `.tessl-code-review.yml` missed or got wrong                            | `amend-lens`, `new-lens`                                   |
| `review-feedback`  | daily 05:10                | review feedback that was accepted (fixed) or declined (refuted, out of scope)              | `amend-lens`, `new-lens`, `amend-instruction`, `add-check` |
| `run-learning`     | daily 05:20                | factory run friction, failures and no-op causes                                            | `amend-instruction`, `add-check`                           |
| `instruction-tidy` | Mondays 05:30              | `AGENTS.md` guidance that a test, a lint rule or an area-scoped instruction should replace | `replace-with-check`, `scope-instruction`                  |

`LEARNER` defaults to `lens-tuning`. Any other value: stop.

**Observed limitation.** The runtime scheduled-findings integration is
disabled for this workspace. Ordinary Tessl run reports are available. So the
proposals live in `ledger.json` on the branch `factory-state/review-lenses`,
read and written only by `scripts/lenses/ledger.mjs` (tested in
`scripts/lenses/ledger.test.mjs`), and each run's report ends with the
ledger's summary. Do not enable or bypass the findings integration, and do
not change access or the organisation's identity.

Everything written is public: it goes to a public branch. Never write private
experiment log contents or identifiers, credentials, or anything from outside
this repository.

## Guards

Any "stop" ends the run with the ledger unchanged. Say why in the run output.

1. **Serialization.** The action holds the `carnival-app-writer` key (limit 1,
   queued), like every writing action.
2. **Slot or manual.** Exactly one of:
   - **Scheduled.** Run `node scripts/lenses/ledger.mjs due <LEARNER>`. Unless
     it prints `"due": true`, stop. A slot is open for twenty minutes and is
     covered once. A missed slot is never run late, back-filled or described
     as run.
   - **Manual initial inspection.** Only when the run was started by hand to
     verify setup, with `tessl action trigger review-lens-improvement
--request-id manual-<id> --input LEARNER=<learner>`. Run
     `node scripts/lenses/ledger.mjs manual <LEARNER>`. Unless it prints
     `"allowed": true`, stop. Use its `startedAt` and `since`: inspect only
     evidence since `since` (at most 24 hours back). A manual run claims no
     slot. It never covers, replaces or stands in for 05:40, 11:40, 17:40,
     23:40 or any other slot, and it is never described as one. At most two a
     London day per learner.
3. **Scope.** Read only. No branch, pull request, issue, label, lens or
   instruction change in this repository. The only write is `ledger.mjs
record`. Leave PR #299 and every other pull request alone.
4. **Safety standards.** These are not overridable: mandatory safety,
   public-input guards, exact-head tests and review, and evidence standards.
   Never propose relaxing them to make work pass. If a proposal would relax
   one, say so with `weakens: true` and list it in `standards`; the ledger
   then refuses ever to apply it, whatever the evidence.

## Inspect

Note the actual start time. Gather evidence since the `since` that `due` printed (the last complete scheduled run, less a one-hour overlap; partial, failed and manual runs never move it)
(before any complete scheduled run, the start owed since the first scheduled attempt, or `since` for a manual run), all
of it public in this repository:

- **lens-tuning:** merged and open pull requests, their diffs and files
  (`gh pr list --state all --search "updated:>=<time>" --limit 100`); review
  findings on them (`gh api repos/{owner}/{repo}/pulls/<n>/comments`);
  repairs that fixed something a review let through, including
  `factory-state/visual-repair`; tests and CI results; live-play notes.
- **review-feedback:** review threads and Tessl Code Review comments, and how
  each was answered: fixed in a later commit, refuted with a reason, or
  declined as out of scope. Repeated false alarms and repeated real misses are
  the signal.
- **run-learning:** factory comments ending `<!-- tessl-factory -->`, CI runs
  (`gh run list`), reruns, pull requests that needed many shepherd rounds,
  and runs that ended with no change (`not due`, guard stops). Name the cause,
  not the symptom.
- **instruction-tidy:** `AGENTS.md`, `review-lenses/`, and the tests and lint
  config that already enforce some of it. Propose to replace guidance with an
  executable test or lint rule, or to move area-only guidance next to that
  area. A tidy never makes the instructions longer.

If a list reaches its limit, or a source cannot be read, the coverage is
`partial` (or `failed` if nothing could be read) and `gaps` says what was
missed. Never describe evidence you did not read.

Read the current target before proposing to change it. Propose only when the
evidence shows a concrete miss, false alarm, friction or redundancy. Each
proposal uses the shared schema:

- `kind`: one of the learner's kinds above;
- `target`: for `amend-lens` a ref exactly as in `.tessl-code-review.yml`,
  for `new-lens` `new:<slug>`, otherwise a repository path (an existing file
  for `amend-instruction` and `replace-with-check`);
- `check`: for `replace-with-check`, the test or lint file to carry it;
- `title`, `change` (the exact wording or check to add or alter) and
  `rationale`;
- `weakens`: `true` when the change would let through anything now flagged or
  enforced. Say so plainly;
- `standards`: the safety standards the change touches, from
  `mandatory-safety`, `public-input-guards`, `exact-head-tests-and-review`,
  `evidence-standards`, or `[]`;
- `netLines`: lines of instruction text it adds (negative when it removes);
  never positive for `instruction-tidy`;
- `evidence`: `{ kind, ref, url, commit? }` items, `kind` one of `pr`,
  `review-finding`, `repair`, `test`, `live-play`, `ci-run`,
  `factory-comment`, `instruction`, each `url` in this repository.

The fingerprint is the kind, target and normalised title, so the same
proposal from two runs or two learners is kept once.

## Record

Write the run to a file outside the clone. Scheduled:

```json
{
  "runId": "<the Tessl launch run id>",
  "learner": "lens-tuning",
  "trigger": "schedule",
  "slot": "<slot from due>",
  "startedAt": "<actual UTC start>",
  "finishedAt": "<actual UTC finish>",
  "coverage": { "status": "complete|partial|failed", "inspected": ["#304"], "gaps": "..." },
  "proposals": []
}
```

Manual: `"trigger": "manual"`, `"manualId": "manual-<id>"`, `"since"` from
`manual`, and no `slot`.

Save it with `node scripts/lenses/ledger.mjs record <file>` within 30 minutes
of the real start. It refuses a malformed run, a slot that is not the one the
real start fell in or is already covered, a manual run with a slot, a window
over 24 hours or over the daily limit, times in the future, a target outside
the schema or not in normal form, a missing `netLines`, evidence outside this
repository, and a partial or failed run without `gaps`. A proposal already in
the ledger keeps its status and decisions and gains the new evidence; if the
new sighting says it weakens something, or names more standards, that
caution is kept.
Recording the same `runId` twice changes nothing. A failed run is still
recorded, with its real times, so the gap is visible.

If the push is refused because the branch moved, the run is not saved: report
it and stop. Never force-push or hand-edit the branch.

## Run output

Lead with `recorded <n> proposal(s) for <slot or manual id>`,
`not due: <reason>` or `failed: <error>`. Then print
`node scripts/lenses/ledger.mjs summary <runId>` so the coordinator can read
the proposals from the Tessl run report.
