# Native intake

The carnival's creative intake as native Tessl schedules (issue #425). It
replaces only the manual half-hour intake. The learning, test health and
visual repair schedules stay as they are.

| Schedule (Europe/London)                   | `native-intake` `MODE` | Does                                                          |
| ------------------------------------------ | ---------------------- | ------------------------------------------------------------- |
| `native-backlog-six-hourly` 00, 06, 12, 18 | `backlog`              | files exactly 18 distinct `auto backlog` issues, no `tessl`   |
| `native-dispatch-twenty-minutes` `*/20`    | `dispatch`             | merges gated Tessl PRs, then hands one backlog issue to Tessl |

`native-intake` holds `carnival-app-writer` (limit 1, queued) like every app
writer, so it never runs beside an implementation, shepherd, visual repair or
learner run. All writes go through `native.mjs`; its decisions are tested
with fixture adapters in `native.test.mjs`.

## Admission

Native writes come from `tessl-app[bot]` (id 295179765, type `Bot`). The
`github-issue-labelled` trigger accepts only sender 1106394 of type `User`, so
the dispatcher's `tessl` label starts nothing by webhook, and that guard is
unchanged. The dispatcher admits the run itself with `tessl action trigger
implement-github-issue --request-id native-<slot>-issue-<n>`: one admission
per issue, and a repeat with the same id starts no second run.

## Records

- Item marker, in the body of a bot-authored issue:
  `<!-- carnival-backlog:item:v1 slot=backlog-<date>T<hh> index=<0-17> scope=<key> -->`.
  A slot is complete when all 18 indexes exist. A retry files only the
  missing ones, and an uncertain create is re-read before moving on.
- Claim marker, in a bot comment:
  `<!-- carnival-dispatch:claim:v1 slot=dispatch-<date>T<hhmm> issue=<n> -->`.
  A retried slot resumes its claim. An earlier claim whose issue has no PR
  yet keeps the queue busy. A claimed issue that a person unlabelled is
  never relabelled.
- Markers in issues or comments by anyone other than the bot are ignored.

## Merge gate

`mergeGate` is separate from `scripts/factory/decide.ts`, the original lab's
read-only readiness helper, which this does not use or change. It merges only
an open, non-draft, bot-authored `tessl/issue-<n>` PR from this repository
into `main`, labelled `tessl` with a `Closes` line, when:

- the newest review by `tessl-reviewer[bot]` (id 325629464) is on the exact
  head, not dismissed, and has exactly one `workflow-run:v1` marker and one
  `result:v1` marker, with `approved=true`. Advisory findings
  (`findings-total` > 0) are allowed. A `COMMENTED` state alone, another
  author's markers, or any formal `APPROVE` does not count;
- no reviewer's latest review requests changes;
- the `check` run from GitHub Actions (app 15368) on that head succeeded, and
  no other check or status on it failed or is still running;
- every listing was read to its last page.

It reads the PR twice and merges with `PUT /pulls/<n>/merge` and
`{sha: <head>, merge_method: "squash"}`, so GitHub refuses the merge if the
head moved. It never submits a review and never arms auto-merge, so the
repository's `allow_auto_merge` (currently `false`) does not need to change.
A merge is reported as merged, not live. `deploy <sha>` reports the Pages
run, and only a succeeded run plus a fetch of the site counts as live.

## Activation and limits

- Schedules and the action take effect only after this reaches `main` and
  Tessl syncs `tessl.json`. `tessl doctor --automations` validates the file
  locally only.
- The first backlog slot is the next London 00, 06, 12 or 18 after sync, and
  the first dispatch slot the next `:00`, `:20` or `:40`. A slot is never
  back-filled.
- To verify without a duplicate run, wait for the first scheduled slot and
  read its run. Do not also trigger the same slot by hand. A manual check is
  `node scripts/native/native.mjs slot`, which writes nothing.
- Unverified until the first live run: that `tessl action trigger` works
  from inside a scheduled run with the factory environment's credentials,
  and that the bot token may merge into `main` under its branch protection
  (this run could not read it: HTTP 403).
- The producer has no browser, so its review is of source, READMEs and
  `WORKSHOP.md`, and each item says so.
