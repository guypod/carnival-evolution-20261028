# Factory learning loops: operator runbook

The action `review-lens-improvement` (skill:
`tessl-factory/skills/review-lens-improvement/SKILL.md`) runs four
proposal-only learners, chosen by its `LEARNER` input. None of them edits
anything. They save proposals to one shared ledger, and the external block
coordinator decides every proposal kind through the interface below. There is
no second decision executor and no auto-implementation loop in this
repository.

## Schedules and timezone

All in `tessl.json`, all with `"timezone": "Europe/London"`, all running the
same action under the shared `carnival-app-writer` key (queued, limit 1):

| Schedule                             | Cron                  | `LEARNER`          |
| ------------------------------------ | --------------------- | ------------------ |
| `review-feedback-learning-daily`     | `10 5 * * *`          | `review-feedback`  |
| `run-learning-daily`                 | `20 5 * * *`          | `run-learning`     |
| `instruction-tidy-weekly`            | `30 5 * * 1`          | `instruction-tidy` |
| `review-lens-improvement-six-hourly` | `40 5,11,17,23 * * *` | `lens-tuning`      |

The repository schedule schema accepts `timezone` and an action with
`inputs`: `tessl doctor --automations` (CLI 0.118.1) validates both and
rejects an invalid zone. So the scheduler handles DST, nobody changes a cron
when the clocks change, and a repository sync keeps the timezone because it is
in `tessl.json`. `LEARNERS` in `ledger.mjs` holds the same slots, and a test
fails if the two disagree.

After merge, check the synced schedules with `tessl loop` / the Loops tab. If
one shows UTC, the sync dropped the field: report it rather than editing the
cron. The fix is `tessl schedule update <id> --timezone Europe/London`, and a
later sync would then reset it.

`node scripts/lenses/ledger.mjs due <learner>` is a second gate. It derives
the London slot id (`YYYY-MM-DDTHH:MM Europe/London`) from the real clock,
accepts a run only in the twenty minutes after the slot, and refuses a slot
already covered completely. `record` also refuses a scheduled run whose slot
is not the one its real start fell in, or that is recorded more than 30
minutes after it started. Missed slots are never run late or recorded as run.

## Manual initial inspection

To verify setup live without waiting for, or pretending to be, a slot:

```sh
tessl action trigger review-lens-improvement \
  --request-id manual-<id> --input LEARNER=lens-tuning
```

The run calls `ledger.mjs manual <learner>`, which allows at most two manual
runs a London day per learner and returns the real `startedAt` and a `since`
at most 24 hours back. The run is recorded with `trigger: "manual"`, its
`manualId` and no slot. It never counts as covering a slot: if 11:40 was
missed it stays missed, and 17:40 is still due afterwards.

## Where the records are

Observed limitation: the runtime scheduled-findings integration is disabled
for this workspace. Ordinary Tessl run reports are available. This is the
fallback:

- `ledger.json` on branch `factory-state/review-lenses`: runs (learner,
  trigger, slot or manual id and window, actual start and finish, coverage
  `complete`, `partial` or `failed` with gaps, the fingerprints seen) and
  proposals (fingerprint, learner, kind, target, change, rationale, `weakens`,
  `standards`, `netLines`, public evidence, status, decisions).
- Each run's Tessl report ends with `ledger.mjs summary`, which names the
  limitation and lists pending proposals.

The ledger is public. Private experiment log contents and identifiers stay
with the external coordinator and never go into Git.

## At each London block start (the coordinator)

From a clone of `main`:

1. `node scripts/lenses/ledger.mjs pending` lists proposals with status
   `open` or `deferred`, of every learner, as JSON.
2. Validate each one against current code on `main`: does the miss, friction
   or redundancy still hold? Classify it as `current`, `stale`,
   `already-fixed` or `unsupported`, keeping the evidence.
3. Write a decision file outside the clone:

   ```json
   {
     "fingerprint": "<16 hex>",
     "decision": "apply | defer | reject",
     "rationale": "why",
     "validation": "current | stale | already-fixed | unsupported",
     "checkedAt": "<main commit sha validated against>",
     "evidence": [
       {
         "kind": "pr",
         "ref": "#304",
         "url": "https://github.com/guypod/carnival-evolution-20261028/pull/304"
       }
     ],
     "decidedBy": "<coordinator name>",
     "slot": "2026-10-30T12:00 Europe/London"
   }
   ```

4. `node scripts/lenses/ledger.mjs decide <file>` validates and saves it. It
   refuses a missing rationale, validation, commit or evidence, evidence
   outside this repository, a proposal already decided,
   `decidedBy: "review-lens-improvement"` (the loop cannot decide its own
   proposals), applying anything not validated as `current`, and applying a
   weakening proposal with fewer than two pull requests of evidence.
5. For `apply`, the output carries `issue: { title, body }`. Open it as an
   issue; the owner labels it `tessl` and the existing implement flow does
   the work under the `carnival-app-writer` key, with ordinary review. Nothing
   here approves or merges it.

`defer` keeps the proposal pending for the next block. `reject` closes it;
the same proposal seen again keeps its rejection and only gains evidence.

## Standards no decision can relax

`SAFETY_STANDARDS` in `ledger.mjs`: mandatory safety, public-input guards,
exact-head tests and review, and evidence standards. A proposal that weakens
one, or weakens a protected path (`.github/`, `tessl.json`,
`scripts/factory/`, `scripts/lenses/`, `scripts/visual/`,
`.tessl-code-review.yml`, the security lens), can be deferred or rejected but
never applied, however many pull requests support it. Two-source evidence
only unlocks weakening something outside those. The standards are constants
in code, so changing them is an ordinary reviewed change, not a decision.

Instructions do not grow by themselves: every proposal declares `netLines`,
and an instruction tidy may not add any.

## Failure handling

- A push refused because the branch moved: nothing was saved. Read again and
  redo the step.
- Never force-push or hand-edit `factory-state/review-lenses`.
- The tests: `node --test scripts/lenses/ledger.test.mjs` (part of
  `npm run check`).
