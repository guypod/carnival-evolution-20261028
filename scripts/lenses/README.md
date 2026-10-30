# Review-lens improvement: operator runbook

The loop `review-lens-improvement` (skill:
`tessl-factory/skills/review-lens-improvement/SKILL.md`) proposes changes to
the review lenses in `.tessl-code-review.yml`. It never edits a lens. The
external block coordinator decides each proposal through the interface below.
There is no second decision executor in this repository.

## Schedule and timezone

`tessl.json` schedule `review-lens-improvement-six-hourly`:
`40 5,11,17,23 * * *` with `"timezone": "Europe/London"`, twenty minutes
before each six-hour London block ends. The repository schedule schema
accepts `timezone`: `tessl doctor --automations` (CLI 0.118.1) validates
`Europe/London` and rejects an invalid zone. So the scheduler handles DST,
nobody changes the cron when the clocks change, and a repository sync keeps
the timezone because it is in `tessl.json`.

After merge, check the synced schedule with `tessl loop` / the Loops tab. If it
shows UTC, the sync dropped the field: report it rather than editing the cron.
The fix is `tessl schedule update <id> --timezone Europe/London`, and a later
sync would then reset it.

`node scripts/lenses/ledger.mjs due` is a second gate. It derives the London
slot id (`YYYY-MM-DDTHH:40 Europe/London`) from the real clock, accepts a run
only in the twenty minutes after the slot, and refuses a slot already covered
completely. Missed slots are never run late or recorded as run.

## Where the records are

Native Tessl schedule findings are disabled for this workspace. This is the
fallback:

- `ledger.json` on branch `factory-state/review-lenses`: runs (slot, actual
  start and finish, coverage `complete`, `partial` or `failed` with gaps, the
  fingerprints seen) and proposals (fingerprint, lens, change, rationale,
  `weakens`, public evidence, status, decisions).
- Each run's Tessl result ends with `ledger.mjs summary`, labelled as the
  fallback, listing pending proposals.

The ledger is public. Private experiment log contents and identifiers stay
with the external coordinator and never go into Git.

## At each London block start (the coordinator)

From a clone of `main`:

1. `node scripts/lenses/ledger.mjs pending` lists proposals with status
   `open` or `deferred`, as JSON.
2. For each one, write a decision file outside the clone:

   ```json
   {
     "fingerprint": "<16 hex>",
     "decision": "apply | defer | reject",
     "rationale": "why",
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

3. `node scripts/lenses/ledger.mjs decide <file>` validates and saves it. It
   refuses a missing rationale or evidence, evidence outside this repository,
   a proposal already decided, `decidedBy: "review-lens-improvement"` (the
   loop cannot decide its own proposals), and applying a proposal that weakens
   a lens with fewer than two pull requests of evidence.
4. For `apply`, the output carries `issue: { title, body }`. Open it as an
   issue; the owner labels it `tessl` and the existing implement flow does
   the work under the `carnival-app-writer` key, with ordinary review. Nothing
   here approves or merges it.

`defer` keeps the proposal pending for the next block. `reject` closes it;
the same proposal seen again keeps its rejection and only gains evidence.

## Failure handling

- A push refused because the branch moved: nothing was saved. Read again and
  redo the step.
- Never force-push or hand-edit `factory-state/review-lenses`.
- The tests: `node --test scripts/lenses/ledger.test.mjs` (part of
  `npm run check`).
