# Native intake

The carnival's creative intake as native Tessl schedules (issue #425). It
replaces only the manual half-hour intake. The learning, test health and
visual repair schedules stay as they are.

| Schedule (Europe/London)                   | `native-intake` `MODE` | Does                                                              |
| ------------------------------------------ | ---------------------- | ----------------------------------------------------------------- |
| `native-backlog-six-hourly` 00, 06, 12, 18 | `backlog`              | files exactly 18 distinct `auto backlog` issues, no `tessl`       |
| `native-dispatch-twenty-minutes` `*/20`    | `dispatch`             | merges gated Tessl PRs at their exact head, then labels one issue |

`native-intake` holds `carnival-app-writer` (limit 1, queued) like every app
writer, so it never runs beside an implementation, shepherd, visual repair or
learner run. All writes go through `native.mjs`; its decisions are tested
with fixture adapters in `native.test.mjs`.

## Admission

There are two separate ways a backlog issue can start work.

- `github-issue-labelled`, unchanged: a `tessl` label added by user 1106394
  (type `User`) on an open issue in repository 1437265009.
- `native-bot-backlog-labelled`, owner-approved for issue #425: a `tessl`
  label added by `tessl-app[bot]` (user 295179765, type `Bot`) on an open
  issue, not a pull request, that the same bot opened and that carries
  `auto backlog`, in `guypod/carnival-evolution-20261028` (id 1437265009,
  not a fork). It runs `native-intake` with `MODE=admit`. It does not start
  `implement-github-issue`.

`dispatch` claims one issue for its slot and adds `tessl` as the bot. That
label only wakes `admit`. `admit` (`native.mjs admit <trigger-events.json>`)
reads GitHub fresh, under the writer key, and refuses unless all of these
hold:

- the event is a single `issues.labeled` with the shape the trigger matches,
  and the issue's node id and id match the event;
- the issue is open, the bot's own, in this repository, not a pull request,
  labelled `auto backlog` and `tessl`, with no hold label and no assignee;
- the producer's journal has exactly one entry for this item, and its
  digest matches the current title and body;
- every comment on the issue is the app's own, so no person has commented;
- every event on the issue is the bot's, `tessl` was added exactly once and
  never removed;
- the app wrote a claim before the label, in a dispatch slot no later than
  now that claimed no other issue, read from the complete repository-wide
  claim history;
- there is no linked pull request, no `tessl/issue-<n>` branch, and no
  admission for a different label event;
- every listing was read to its last page.

On a pass it writes one admission record, then calls
`tessl action trigger implement-github-issue --request-id carnival-admit:<repo id>:<n>:<label event id>`
with `GITHUB_ISSUE_NUMBER` and `GITHUB_ISSUE_LABEL=tessl`. It returns as soon
as Tessl accepts the request, so it never waits on the run it starts while
holding the writer key. That action keeps its own queued writer key. A retry
reuses the record and the same request id, so Tessl starts no second run.
Once the branch exists, a retry hands off nothing.

Provenance is GitHub's own `performed_via_github_app.id` (4096310, the
Tessl app's App id, not an installation id) on the bot's comments, plus the
bot's user id and type. Marker text or a git author never counts on its own.
The trust scope is the shared Tessl App identity the owner approved: anything
that runs as that app can write these records. Nothing narrower is claimed.

## Records

- Journal marker, in an app comment on each filed issue:
  `<!-- carnival-backlog:journal:v1 slot=<slot> index=<i> issue=<n> digest=<sha256> -->`,
  the digest of the title and body as filed. A rerun of the full 18-item
  batch file journals an issue a crash left without one, but only when the
  issue still holds exactly what that file would have filed. Otherwise the
  slot stays `partial`. `admit` refuses an issue without a journal entry.
- Admission marker, in an app comment:
  `<!-- carnival-admission:v1 issue=<n> node=<id> slot=<claim slot> digest=<sha256> event=<label event id> request=<request id> -->`.
- Item marker, in the body of a bot-authored issue:
  `<!-- carnival-backlog:item:v1 slot=backlog-<date>T<hh> index=<0-17> scope=<key> -->`.
  A slot is complete when all 18 indexes exist. A retry files only the
  missing ones; rerunning the original 18-item file maps item `i` to index
  `i`. An uncertain create is read back before moving on.
- Batch file: `{ "slot": "backlog-<date>T<hh>", "candidates": [18 items] }`.
  The slot is the one the batch was written for, so a rerun after a six-hour
  boundary fills that slot, not the new one. It must be a scheduled slot no
  later than the current one. A bare array means the current slot.
- Claim marker, in a bot comment:
  `<!-- carnival-dispatch:claim:v1 slot=dispatch-<date>T<hhmm> issue=<n> -->`.
  Claims are read from every comment in the repository, so closing an issue
  or removing `auto backlog` or `tessl` never hides one:
  - a slot that already has a claim never claims a second issue;
  - an open claimed issue labelled `tessl` with no pull request yet keeps the
    queue busy, without reading the rest of the backlog, while its label is
    the owner's, for 90 minutes after the bot's label so its `admit` run can
    come off the writer queue, and for 3 hours after its admission record so
    its run can open a pull request. After that the run was refused or ended
    without a pull request: the queue moves on and that issue is never
    relabelled;
  - a backlog item without a journal entry whose digest matches its current
    content is skipped, since `admit` would refuse it;
  - a claim that never got its label, from any slot, is finished later,
    unless a person has since held, assigned or commented on the issue, in
    which case it is released and the next issue is considered. Before
    labelling a recovered issue, the current slot writes its own claim on
    it, keeping the earlier claim, so a retry of the current slot resumes
    that issue even after it closes, loses its label or gets a pull request,
    and never claims a second;
  - an issue that was labelled `tessl` and then unlabelled was taken back and
    is never relabelled;
  - an uncertain claim or label write is read back before anything else.
- Markers in issues or comments by anyone other than the bot are ignored.

## Merge controller

`mergeGate` is separate from `scripts/factory/decide.ts`, the original lab's
read-only readiness helper, which this does not use or change. It passes only
an open, non-draft, bot-authored `tessl/issue-<n>` PR from this repository
into `main`, labelled `tessl`, when:

- the body has exactly one closing reference, `Closes #<n>`, naming the
  branch's issue, and that issue is an open issue of this repository that
  still carries `tessl` (a PR whose `tessl-factory:issue-label` marker names
  another label is refused, since only `tessl` starts work), last added by the owner, user 1106394, as read from the
  issue's complete event history, or last added by `tessl-app[bot]` with an
  app admission record for that exact label event and issue node;
- the newest review by `tessl-reviewer[bot]` (id 325629464) is on the exact
  head, not dismissed, and has exactly one `workflow-run:v1` marker and one
  `result:v1` marker with `approved=true`. Advisory findings are allowed. The
  run id must match the reviewer app's own completed check run on that head.
  The review may be `COMMENTED` or `APPROVED`; what counts is its markers.
  Another account's markers, or a formal `APPROVE` without valid markers, do
  not count;
- no reviewer has a request for changes still standing. A later `COMMENTED`
  review does not clear it; a later approval or a dismissal does;
- the `check` run from GitHub Actions (app 15368) on that head succeeded, and
  no other check or status on it failed or is still running;
- every listing was read to its last page.

`mergeOne` gates twice, then merges with GitHub's atomic merge API
(`PUT pulls/<n>/merge`) with `sha` set to the head both gates saw, so GitHub
refuses if the head moved. It never arms GitHub's auto-merge: this repository
has no branch rules, so an armed pull request could merge a later push that
no gate saw. If GitHub refuses the merge, that is reported and nothing merges
another way. It never submits a review.

A merge is not shipped. `deploy <sha>` reports `deployed-needs-sanity` only
when the Pages run's `deploy` job succeeded for that commit, and shipping
also needs the changed flow checked in a real browser on that commit, not
just a 200 response.

## Activation and limits

- The merge sweep starts no new pull request after 15 minutes; the rest are
  reported as `deferred` for the next run.
- A shortened backlog file (fewer than 18 items) fills the missing indexes in
  order each run, so after a partial write it must be trimmed to what is
  still missing. The full 18-item file can always be rerun unchanged.

- Schedules and the action take effect only after this reaches `main` and
  Tessl syncs `tessl.json`. `tessl doctor --automations` validates the file
  locally only.
- The bot route has run only against fixtures. Live delivery of a bot
  `issues.labeled` event to `native-bot-backlog-labelled`, and
  `tessl action trigger` from inside the action, still need one real check
  after this merges.
- Listings are read through one `gh` call capped at 64 MiB. Past that cap
  the call fails and the listing counts as incomplete. The step that needs
  it stops before its own write; writes earlier in the same run, such as a
  merge of an earlier pull request or an issue already filed, stand. It
  never treats a partial listing as complete. `state=all` issue history
  only grows, so this cap will eventually stop the producer until listings
  are read another way.
- The producer captures and looks at the carnival with
  `scripts/visual/run-capture.sh` before it files anything.
- To verify without a duplicate run, wait for the first scheduled slot and
  read its run. Do not also trigger the same slot by hand. A manual check is
  `node scripts/native/native.mjs slot`, which writes nothing.
