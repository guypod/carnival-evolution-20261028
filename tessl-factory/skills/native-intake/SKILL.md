---
name: native-intake
description: Run the carnival's native creative intake. MODE=backlog files exactly 18 distinct enhancement issues labelled `auto backlog` (never `tessl`) for the current six-hour London slot. MODE=dispatch merges Tessl pull requests that pass the evolution merge gate on their exact current head, atomically pinned to that head, then labels one claimed backlog issue `tessl` as the bot. MODE=admit runs the deterministic admission check on that bot label and alone hands an admitted issue to implement-github-issue. Use only from the native-intake schedules, the native-bot-backlog-labelled trigger (MODE=admit), or a manual verification trigger.
---

# Native intake

Every write goes through `scripts/native/native.mjs`, whose decisions are
tested in `scripts/native/native.test.mjs`. Do not write issues, labels,
comments or merges any other way. The action holds `carnival-app-writer`
(limit 1, queued), so it never runs beside another app writer. Inside this
action only, run the script with `CARNIVAL_APP_WRITER_HELD=1`. That variable
stops an accidental local run. It is not a security boundary.

Everything you write is public. Never include private logs, run artifacts,
credentials or anything from outside this repository's public record.

## MODE=backlog (00:00, 06:00, 12:00, 18:00 Europe/London)

1. `node scripts/native/native.mjs slot` gives the `backlog` slot. If its
   18 items already exist, `backlog` reports `complete` and writes nothing.
2. Look at the carnival as it is now, in a real browser. Run
   `scripts/visual/run-capture.sh <dir outside the clone> '#/' <route ...>`,
   passing the midway and every game's route (with no routes it captures only
   two), and look at every screenshot. Play each game long enough to see a round end. Judge it
   against `docs/visual-baseline/README.md` and the review lenses: one
   coherent look, readable text and contrast, keyboard play, and screens that
   fit. If the browser cannot start, `setup-browser.sh` exits non-zero: stop
   and report that capability failure. Never file items from source alone,
   and never claim to have seen a screen you did not capture.
3. Also read `WORKSHOP.md`, the game READMEs and every issue, open or closed
   (`gh api --paginate 'repos/guypod/carnival-evolution-20261028/issues?state=all&per_page=100' --jq '.[] | {number, state, title, body}'`, which has no cap), so you can
   compare scopes, not only titles.
4. Write the batch to a file outside the clone as
   `{"slot": "<the backlog slot from step 1>", "candidates": [...]}`, with 18
   candidates `{title, scope, body, evidence}` and item `i` for index `i`.
   The slot stays fixed for this batch, even if the run crosses a six-hour
   boundary. Mix sizes
   and kinds: small polish, accessibility and feel fixes as well as larger
   reworks of a game or the midway. New games are allowed but should be the
   exception, and items must not repeat one formula across booths. Each one
   is coherent on its own, has a `Done when` list that includes checking the
   changed flow in a browser, and differs in scope from the others and from
   every existing issue. A change to one game stays inside its folder; a
   midway or `src/carnival/` change is its own item (house rule 7).
   `evidence` names the screenshot route and what you saw there. It is
   public: never include private logs, run artifacts or screenshots' file
   paths outside the repository.
5. `CARNIVAL_APP_WRITER_HELD=1 node scripts/native/native.mjs backlog <file>`.
   It refuses duplicates by title or scope, never adds `tessl`, files each
   missing index with a durable marker, and reconciles an uncertain create
   by re-reading before moving on. After a crash, rerun the same file: it
   names its own slot and item `i` still maps to index `i`, so only that
   slot's missing ones are filed. When it
   reports `partial` with errors, fix the candidates it names and run it
   once more. Never pad, and never claim the slot is complete unless it says
   `complete`. Report the remaining count.

## MODE=dispatch (every 20 minutes Europe/London)

1. `CARNIVAL_APP_WRITER_HELD=1 node scripts/native/native.mjs merge`. For an
   open Tessl PR whose source issue, branch and single `Closes` line agree,
   whose newest `tessl-reviewer[bot]` review on the exact head carries
   `approved=true` (advisory findings allowed) and matches the reviewer's own
   check run on that head, with green `check` CI and no request for changes
   still standing, it gates again and merges atomically with that head as the
   expected SHA. It never arms GitHub auto-merge, never submits a review,
   never relaxes a required check, and never merges another way.
2. A PR counts as shipped only after it merged, `node scripts/native/native.mjs
deploy <merge sha>` reports `deployed-needs-sanity`, and the changed flow
   has been checked in a browser on the live site or that exact commit
   (`VISUAL_REV=<sha> scripts/visual/run-capture.sh <dir> <route>`), with the
   screenshots looked at. A 200 response or the page title alone is not app
   QA. Otherwise report the QA still owed. Never say merged means live.
3. `CARNIVAL_APP_WRITER_HELD=1 node scripts/native/native.mjs dispatch`.
   It claims one eligible backlog issue for the slot and adds `tessl` as
   `tessl-app[bot]`. That label starts no implementation by itself: it fires
   the `native-bot-backlog-labelled` trigger, which runs MODE=admit. Never
   start `implement-github-issue` from dispatch. `busy`, `idle`, `blocked`,
   `labelled` and `stopped` are all normal outcomes. Report the one you got.

## MODE=admit (the native-bot-backlog-labelled trigger)

1. `CARNIVAL_APP_WRITER_HELD=1 node scripts/native/native.mjs admit <repository root>/.cloud-launch/trigger-events.json`.
   Run it once and report its JSON. It reads the issue, its comments, its
   events, the repository's claim history, linked pull requests and the
   `tessl/issue-<n>` branch fresh, plus Tessl's launch runs through
   `tessl api /experimental/launch-runs`, and refuses unless every check
   passes. It defers while another implementation run is queued or running,
   writing only a deferral record that a later dispatch retries, and never
   hands off twice under its own key. On
   a pass it writes one admission record and hands off with
   `tessl action trigger implement-github-issue` and a request id keyed by
   the label event, then returns without waiting for that run.
2. `refused`, `deferred` and `blocked` are final for this run: never hand off any other
   way, never relabel, never edit the issue, and never retry with a weaker
   check. `uncertain` means the admission write or the handoff call failed
   without an answer: rerun the same command once. It reads its own record
   back and reuses the same request id, so a repeat starts no second run.
3. Write nothing else on the issue. The admission script is the only writer.

Report the script's JSON output, plus the browser checks you actually did (routes captured and what you saw) and any browser QA still owed. Claim nothing neither the script nor your own screenshots show.
