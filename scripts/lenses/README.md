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
the London slot id (`YYYY-MM-DDTHH:MM Europe/London`) from the real clock and
refuses a slot already covered completely.

- **Writer-queue delay.** All learners share the `carnival-app-writer` key, so
  a run can wait in the queue. A run that really starts up to
  `MAX_QUEUE_DELAY_MINUTES` (180) after its slot still serves that slot. `due`
  prints the slot, its `scheduledFor` time and `delayMinutes`, and the run
  records `scheduledFor` and its real `startedAt` separately; `record` refuses
  a `scheduledFor` that is not the slot's. A start after twenty minutes is
  shown as late in the summary, never as on time. A run that starts more than
  180 minutes after its slot finds it missed: missed slots are never run,
  back-filled or recorded as run.
- **Owed interval.** `due` prints `since`: the start of the last complete
  scheduled run less one hour of overlap or, before any, the window of the
  first scheduled attempt. `record` refuses a scheduled run whose `since` is
  missing or later than that, so a run cannot cover less than it owes.
- **Retry.** A partial or failed slot stays due: a run for the same slot may
  try again while the slot is still owed (within the 180 minutes). After
  that, the next slot's `since` still reaches back to the last complete run,
  so the uncovered interval is read then. Partial, failed and manual runs
  never move that checkpoint, except that a partial scheduled run may
  record `coverage.through`, a time up to which it read every source in
  full (oldest first), so a backlog over a list limit is worked through instead
  of hitting the same limit every run.
- `record` also refuses a slot its real start did not follow, and a run
  recorded more than 30 minutes after its real start.

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
  trigger, slot with `scheduledFor`, `delayMinutes` and `since`, or manual id
  and window, actual start and finish, coverage
  `complete`, `partial` or `failed` with gaps, the fingerprints seen) and
  proposals (fingerprint, learner, kind, target, change, rationale, `weakens`,
  `standards`, `netLines`, public evidence, status, decisions, and the
  implementation `issue` URL once opened).
- The ledger is read and written whole, and refused, never truncated, when it
  is over `MAX_LEDGER_BYTES` (4 MiB) or does not match the schema. A run that
  hits this fails and says so; trimming the ledger is an owner's reviewed
  decision, not something a loop does.
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
   refuses a malformed file, a missing rationale, validation, commit or
   evidence, evidence that is not a canonical `https://github.com` URL in
   this repository, a `pr` item whose `ref` is not `#<n>` of its URL, a
   proposal already decided, `decidedBy: "review-lens-improvement"` (the
   loop cannot decide its own proposals), applying anything not validated as
   `current`, and applying a weakening proposal with evidence from fewer
   than two distinct pull requests, counted by the number in their URL.
5. For `apply`, the output carries `issue: { title, body }`. The body starts
   with the marker `<!-- factory-learning:proposal <fingerprint> -->` and the
   title ends with `[<fingerprint>]`. Before opening it, search the
   repository's issues for that marker; if one exists that is not in the
   proposal's `previousIssues`, use it instead of opening another. Then run
   `node scripts/lenses/ledger.mjs issued <fingerprint> <issue url>`. The
   owner labels the issue `tessl` and the existing implement flow does the
   work under the `carnival-app-writer` key, with ordinary review. Nothing
   here approves or merges it.
6. **Recovery.** At every block start, run
   `node scripts/lenses/ledger.mjs unissued`. It lists accepted proposals with
   no recorded issue, for example after a restart between `decide` and
   `issued`. For each, `ledger.mjs issue <fingerprint>` prints the same title,
   body and marker again; search for the marker and repeat step 5. Recording
   the same issue twice changes nothing, and a different one is refused.

If a later sighting of an accepted proposal declares more caution (it now
weakens something, or names more standards), the ledger moves it back to
`deferred` with a `reopened` note, so it leaves `unissued` and comes back to
the coordinator, whose next decision checks the safety and two-PR rules
again. `issue` and `issued` refuse a proposal that weakens a safety
standard. A sighting with the same fingerprint but a different `change`,
`check` or `netLines` replaces that content, keeps the old content under
`revisions`, and reopens an accepted proposal, so the coordinator decides,
and the issue carries, the latest content. An issue already recorded for
the old content moves to `previousIssues`; after a new `apply`, open a new
issue and close the old one, which step 5 skips because it is in
`previousIssues`.

`defer` keeps the proposal pending for the next block. `reject` closes it;
the same proposal seen again keeps its rejection and only gains evidence.

## Standards no decision can relax

`SAFETY_STANDARDS` in `ledger.mjs`: mandatory safety, public-input guards,
exact-head tests and review, and evidence standards. A proposal that weakens
one, or weakens a protected path in `PROTECTED_PATHS`, can be deferred or
rejected but never applied, however many pull requests support it. The
protected paths are the files that carry those standards:

- CI and factory config: `.github/`, `.tessl/`, `tessl.json`,
  `scripts/factory/`, `scripts/lenses/`, `scripts/visual/`;
- agent and skill instructions: every `AGENTS.md`, `CLAUDE.md` and
  `SKILL.md` at any depth, including area-scoped ones, plus `skills/` and
  `tessl-factory/`;
- review: `.tessl-code-review.yml`, the repository lenses in
  `review-lenses/` and the `tessl/code-review` security lens;
- tests, lint, types and scripts: `package.json`, `package-lock.json`,
  `eslint.config.js`, `tsconfig.json`, `vite.config.ts`, Prettier config,
  and every `*.test.*` file.

A proposal's `check` file counts too. Targets must be repository paths in
normal form, so `./tessl.json` cannot dodge the list. The other
`tessl/code-review` lenses are not protected: weakening them needs evidence
from two distinct pull requests and an honest `weakens: true`. A repeat
sighting can only add caution to a proposal, never remove it. Two-source
evidence only unlocks weakening something outside the list. The standards are constants
in code, so changing them is an ordinary reviewed change, not a decision.

Instructions do not grow by themselves: every proposal declares `netLines`,
and an instruction tidy may not add any.

## Failure handling

- A push refused because the branch moved: nothing was saved.
  - `record` (a learner run): the learner reports it and stops, as its skill
    says. The slot stays due. Once any scheduled run of that learner has
    been saved, a retry while the slot is still owed, or the next slot, reads
    the same interval again from `since`. Before the first saved run there
    is no record of the lost window, so the next slot reads only its own 24
    hours: the run report names the unsaved window, and a manual inspection
    can cover at most its last 24 hours.
  - `decide` and `issued` (the coordinator): read again and redo the step.
    For `decide`, read `pending` first: if the proposal is already decided,
    the earlier attempt was saved.
- A ledger over the size limit or malformed: the command stops with the
  reason and writes nothing. Report it to the owner.
- Never force-push or hand-edit `factory-state/review-lenses`.
- The tests: `node --test scripts/lenses/ledger.test.mjs` (part of
  `npm run check`).
