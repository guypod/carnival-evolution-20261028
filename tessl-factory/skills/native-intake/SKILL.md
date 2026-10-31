---
name: native-intake
description: Run the carnival's native creative intake. MODE=backlog files exactly 18 distinct enhancement issues labelled `auto backlog` (never `tessl`) for the current six-hour London slot. MODE=dispatch hands exactly one eligible backlog issue to Tessl and squash-merges Tessl pull requests that pass the evolution merge gate on their exact current head. Use only from the native-intake schedules or a manual verification trigger.
---

# Native intake

Every write goes through `scripts/native/native.mjs`, whose decisions are
tested in `scripts/native/native.test.mjs`. Do not write issues, labels,
comments or merges any other way. The action holds `carnival-app-writer`
(limit 1, queued), so it never runs beside another app writer. Inside this
action only, run the script with `CARNIVAL_APP_WRITER_HELD=1`. That variable
stops an accidental local run. It is not a security boundary.

Everything you write is public. Never include private logs, run artifacts,
credentials or anything from outside this repository.

`MODE` is `backlog` or `dispatch`. Any other value: stop.

## MODE=backlog (00:00, 06:00, 12:00, 18:00 Europe/London)

1. `node scripts/native/native.mjs slot` gives the `backlog` slot. If its
   18 items already exist, `backlog` reports `complete` and writes nothing.
2. Review the app as it is now: `WORKSHOP.md`, `src/games/*/README.md`, the
   game sources, and every issue open or closed (`gh issue list --state all
--limit 1000 --json number,title,labels,state`). The machine has no
   browser, so say in each item's evidence which file and lines you read,
   and never claim to have played or seen it.
3. Write 18 candidates to a file outside the clone as a JSON array of
   `{title, scope, body, evidence}`. Prefer refining what exists over new
   games. Each one stays inside one game's folder (house rule 7), is
   coherent on its own, has a `Done when` list, and differs in scope from
   the others and from every existing issue. `scope` is a few words naming
   the area and the change, such as `water cannon aim feedback`.
4. `CARNIVAL_APP_WRITER_HELD=1 node scripts/native/native.mjs backlog <file>`.
   It refuses duplicates by title or scope, never adds `tessl`, files each
   missing index with a durable marker, and reconciles an uncertain create
   by re-reading before moving on. When it reports `partial`, fix the
   candidates it names and run it once more. Never pad, and never claim
   the slot is complete unless it says `complete`. Report the remaining count.

## MODE=dispatch (every 20 minutes Europe/London)

1. `CARNIVAL_APP_WRITER_HELD=1 node scripts/native/native.mjs merge`. It
   squash-merges an open Tessl PR only when the trusted reviewer's newest
   review, on the exact current head, carries `approved=true` (advisory
   findings allowed), the `check` CI run on that head passed, nothing else
   fails, and the head is unchanged on a second read. The merge is pinned to
   that SHA. It never submits a review and never arms auto-merge.
2. For each merge, `node scripts/native/native.mjs deploy <merge sha>`.
   `deployed-needs-sanity` means the Pages run succeeded. Fetch
   `https://guypod.github.io/carnival-evolution-20261028/` and check it
   returns 200 with the midway's title. Otherwise report the QA owed. Never
   say merged means live.
3. `CARNIVAL_APP_WRITER_HELD=1 node scripts/native/native.mjs dispatch`. It
   picks the oldest eligible backlog issue, writes a claim, adds `tessl`
   once, and admits `implement-github-issue` with `tessl action trigger` and
   the stable request id `native-<slot>-issue-<n>`. The label alone starts
   nothing: the webhook trigger accepts only the owner. `busy`, `idle`,
   `blocked` and `stopped` are all normal outcomes. Report the one you got.

Report the script's JSON output and nothing it did not say.
