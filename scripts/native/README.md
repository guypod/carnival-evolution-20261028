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
- Tessl's launch runs (below) show no other implementation run queued or
  running in this repository, and none in any state linked to this issue;
- every listing was read to its last page.

A missing branch is not proof that nothing is running. `admit` reads the
actual runs with `tessl api /experimental/launch-runs`, every page: the
`status=pending` runs, kept to this repository, and every run linked to the
issue (`filter[linkType]=github_issue`, `filter[linkValue]=<issue url>`). An
implementation run is one labelled `implement-github-issue` or whose skill is
`#implement-github-issue`. Its own run is the one labelled
`implement-github-issue <its request id>`. Before any write:

| What the runs show                                 | `admit`                                       |
| -------------------------------------------------- | --------------------------------------------- |
| a listing failed, was denied or is malformed       | `deferred`: still owed, nothing written       |
| its own request's run is queued or running         | `admitted`, `already running`: no new handoff |
| its own request's run ended, whatever the outcome  | `refused`: never restarted                    |
| another implementation run is queued or running    | `deferred`: one deferral record, no handoff   |
| another implementation run for this issue ever ran | `refused`: not the issue's first run          |
| none of these                                      | writes the record and hands off               |

`deferred` exits at once and never waits holding the writer key. A read
that fails (the issue, comments, events, claim history, links, branch or
runs) also defers rather than refuses. When another run is pending, `admit`
writes one app deferral record, `carnival-deferred:v1`, keyed by the
original label event and request id.

**Retrying a deferred admission.** Each dispatch that finds a claimed,
bot-labelled issue with no pull request and a deferral record for its
current label event and node calls the same admission again, with every
guard read fresh. It uses the original request id, never relabels, makes no
new generation and fabricates no event. Deferred again keeps the queue on
that issue. A refusal (taken back, held, assigned, a person commented,
content changed, an earlier run) frees the queue for that dispatch and
writes nothing. A later dispatch checks again, and admission can pass only
if every guard passes then: a label removed or a person comment never
clears, so taken-back work never resumes. A read that fails blocks dispatch,
so the owed work stays owed. A deferral from a failed read alone writes no
record. Once the 90-minute grace passes with no admission and no admit run
pending, dispatch retries that admission the same way.

## Implementation entry guard

Accepting a request twice is possible (see the gap below); coding twice is
not. `.tessl/cloud-launch-setup.sh` runs before the agent and before the
skill installs, with the recipe's `SKILL`, `INPUTS`, `TRIGGER_EVENTS` and
`TESSL_LAUNCH_RUN_ID`. When `SKILL` ends in `#implement-github-issue`, both
for the owner's label and the native handoff, it runs
`scripts/native/entry-guard.mjs`. Other actions skip it. The issue comes
from `GITHUB_ISSUE_NUMBER` or the GitHub issue event. A run started by
`tessl action trigger` carries one synthetic `tessl:trigger` event whose
payload describes the launch: `key` (the action name), `loop` (`id`,
`projectId`, `workspaceId`), `inputs` (a string map or `null`), `overrides`,
`concurrency` and, for a native child handoff, `parentLaunchRunId`. That
payload never names the issue and grants nothing. The guard checks its shape,
then requires `GITHUB_ISSUE_NUMBER` as an explicit input, and any input the
payload repeats must match it. A malformed envelope, an unknown `tessl:` event,
payload inputs that disagree, a conflicting or second issue, or a missing input
refuses.

The guard reads the issue, its events and comments in full and builds one
key: repository, issue, node, content digest, and generation (the newest
`tessl` label event). The owner's label is its own hand-off, and none of the
bot-only conditions below apply to it. For the bot's label, the run may have
queued for a while since admission, so the guard runs the same
`botEligibility` check admission uses, on fresh reads: still open, the bot's
own, in `auto backlog` and `tessl`, no hold label, no assignee, every comment
the app's own, every event the bot's, `tessl` labelled once and never
removed, and the title and body still matching the producer's journal. A
hold, an assignment, a person's comment such as "Please stop", a person's
event or an edit made after admission refuses entry. Then one app admission
record must match the issue, node, label event, request id, original claim
slot and current digest together; fields from different records never
combine. It then
creates `refs/tessl-entry/issue-<n>/gen-<event>` with GitHub's create-ref
call, which fails if the ref exists. The ref points at a parentless commit
whose message records the key and the run id. It is never moved or deleted.

- Same key, same run id (setup reruns on resume): resumes.
- Any other run, or a changed digest: refused, whatever the claim's age.
- Anything unreadable, no run id, closed, unlabelled: refused.

A refusal exits non-zero, which fails the run's prepare step before coding.
Fixture tests cover the decisions, including a race on the create. The hook
itself, the real create-ref call and the env vars at setup time are checked
only by reading the recipe here, not in a live run.

**The gap.** `tessl action trigger` answers once the request is recorded,
before Tessl admits it to a launch run. The API documents no listing of
action requests before admission: `/experimental/launch-runs` shows a run
only once it exists. So a request someone else made in the last moments,
not yet admitted, is invisible to `admit`. Closing it needs a read of
recorded, not yet admitted action requests for the project, filterable by
action and linked issue. Until then the check covers every run that exists.

On a pass it writes one admission record, then calls
`tessl action trigger implement-github-issue --request-id carnival-admit:<repo id>:<n>:<label event id>`
with `GITHUB_ISSUE_NUMBER` and `GITHUB_ISSUE_LABEL=tessl`, plus
`--label-fragment <request id>` and `--link github_issue=<issue url>` so the
run can be found by its key and its issue. It returns as soon as Tessl
accepts the request, so it never waits on the run it starts while holding
the writer key. That action keeps its own queued writer key. A retry reuses
the record and the same request id, so Tessl starts no second run; when its
run is already visible, a retry hands off nothing. Once the branch exists, a
retry hands off nothing.

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
  - no new issue is claimed while any implementation run or
    `native-bot-backlog-labelled` admit run is queued or running in this
    repository, however long it has queued, and an incomplete run listing
    blocks dispatch;
  - an open claimed issue labelled `tessl` with no pull request yet keeps the
    queue busy, without reading the rest of the backlog. Time alone never
    frees it; the runs decide:
    - its label is the owner's: busy;
    - admitted: busy until its own run (by request id) is seen to end, then
      the queue moves on. While no run for its request is visible, each
      dispatch replays the original admission, with fresh guards and the
      same request id, in case the handoff was never sent. If no run for its request is visible 3 hours after
      the admission record, dispatch reports `blocked` for a person, and
      stays blocked, rather than calling it idle;
    - the bot's label, never admitted: busy for 90 minutes, then, with no
      admit run still pending, dispatch retries the original admission. A
      refusal moves the queue on; deferred keeps it busy.

    That issue is never relabelled;

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
  no other check or status on it failed or is still running. That `check`
  counts only when its check suite belongs to a `.github/workflows/ci.yml`
  run on the head, read from the Actions runs for that commit: `pages.yml`
  also has a job named `check`, and it is not CI. Only the newest run of each
  check from each app in each check suite counts, so a successful rerun
  replaces the failure it reran, and another workflow's run never does;
- an app change has browser-flow evidence for the exact head (see below);
- every listing was read to its last page.

### Browser-flow evidence

A reviewer's `approved=true` and comments on the issue or PR are not browser
evidence. `requiredFlows` reads every changed path, the new name and, for a
rename, the old one. A change in `src/games/<game>/` needs that game's flows
from `GAME_FLOWS`, and a game with none is owed a flow: the gate refuses. A
pull request cannot qualify its own head by adding a flow: new coverage needs
a separate, operator-reviewed update to the wrapper, the capture pin and the
flow registry, and then a new authority record. One game's pass never stands in for
another's. A change to the flow scripts replays every flow. Other app code
follows `SHARED_COVERAGE`, a finite registry of what each shared path reaches:
`src/carnival/` and `src/games/*.ts` reach every game folder, `src/main.ts`,
`src/midway/` and `index.html` need a `midway-booth` flow, and `package.json`,
`vite.config.ts`, `tsconfig.json` and `public/` need both. A shared change
clears once every flow it reaches exists and passes; until then each missing
game or flow is owed by name, and a path in no entry stays owed. Today only
Mini Putt has a flow, so shared changes are owed until the other games and
the midway get theirs. An unread file listing owes everything.
`node scripts/native/native.mjs flows <pr>` prints `{ flows, owed }`.

For each required flow, the gate reads the newest `browser-flow` check run
created by the factory app (app 4096310) on the exact head with
`external_id: browser-flow:<flow>`. That attempt decides, so a newer attempt
that failed or is still running is never masked by an older pass. It must be
completed with `success`, and its output must carry one
`carnival-browser-flow:v1` record that:

- names that head and that flow;
- lists every check with `result: pass`;
- lists screenshots under `evidence/<head>/<flow>/`, retained at a recorded
  commit that is on `factory-state/browser-evidence`, each of whose bytes,
  read back by the controller, hash to the recorded sha256.

A factory attempt on the head for a flow `GAME_FLOWS` does not know also
refuses unless it succeeded. Missing, stale (another head), failed, still
running, forged (another app), recordless, off-branch or digest-mismatched
evidence refuses the merge. The one exception is a complete changed-file
listing in which every path, old and new, is infrastructure that no screen
draws with: under `scripts/` other than `scripts/visual/` (which produces the
evidence), `tessl-factory/` or `skills/`, a Markdown file under `docs/`, or a
top-level `.md` file. App source renamed into `docs/`, or deleted, is still
an app change.

Only `scripts/visual/trusted-publish.mjs`, run from a clean checkout of the
operator record's reviewed wrapper `W` (see "Trusted publisher" below),
produces this evidence. It runs the pinned capture primitives in isolated
containers, never the candidate's Vite on the host, and writes the
provenance the gate needs. The file listing counts as complete only when it
holds every file the pull request reports. The dispatch mode of
`tessl-factory/skills/native-intake` runs that wrapper for every required
flow before the merge sweep once the record is installed, and until then
reports each flow as owed.

`scripts/visual/run-flow.sh <out dir> <flow>` is a local developer mode
only: it serves the checkout with its own Vite and plays the flow into a new
`attempt.XXXXXX` directory. It never publishes, and nothing it writes is
evidence. `run-flow.sh --publish` and `--live` are disabled: they exit 3
before any checkout check, Vite, network read or check run, because they ran
candidate code on the host that holds the GitHub credentials.

### Isolated capture (not yet authoritative)

`scripts/visual/isolated-flow.sh <out dir> <flow> <candidate sha>` captures a
flow on a pull request commit without running that commit's code on the host.
It records evidence locally and publishes nothing.

No candidate code ever has a network or the host's environment.

- `isolated-deps.sh` prepares a trusted dependency snapshot before any
  candidate code is on disk: the runner checkout's own `package.json` and
  `package-lock.json` installed with `npm ci --ignore-scripts`, plus pinned
  Playwright, in a digest-pinned `node:22-bookworm-slim` container. It is the
  only networked step, and it runs no candidate code.
- `isolated-build.sh` exports the exact commit with `git archive` (no `.git`,
  symlinks refused) into a fresh directory. A candidate whose `package.json`,
  `package-lock.json` or `.npmrc` differs from the snapshot is refused (exit 5)
  and stays owed: nothing is installed from a candidate. The build, which runs
  the candidate's Vite config, runs with `--network none` and the snapshot
  mounted read-only. The container uses the caller's non-root uid,
  `--cap-drop ALL`, `no-new-privileges`, a read-only root, memory, CPU and
  process limits, and gets no host environment, home, `gh` config, Git
  directory or Docker socket. It refuses when Docker reports no seccomp or
  namespace option, when there is no snapshot, or when the image is not
  already present (`--pull never`: only the operator pulls images).
- `isolated-browser.sh` serves the built files and runs Chromium inside a
  second `--network none` container from a digest-pinned Playwright image
  (`mcr.microsoft.com/playwright:v1.61.1-noble`), with the same limits. The
  committed `flow.mjs` and `static-serve.mjs` are copied out of the runner and
  mounted read-only, as are the snapshot and the built files. Only a fresh,
  empty report directory that the build never saw is writable. Chromium's own
  sandbox cannot start under Docker's default seccomp profile, and the runner
  changes no security settings, so it runs with `chromiumSandbox` off. The
  container is the boundary, and the provenance says so.
- `isolated-record.mjs` runs on the host, reads no candidate code, and accepts
  only `flow.json` and `<flow>-<state>.png` as plain files. It recomputes every
  sha256 and writes `provenance.json` naming the candidate, the runner commit,
  `bootstrap: null`, `publishable: false` and the boundary.
- `isolated-canary.sh` builds a hostile candidate (this runner's tree with a
  hostile Vite config and page script) and tests both phases with nonsecret
  canaries. The build tries to read a controller canary file, write a
  trusted-code canary, the controller's Git directory and the snapshot, find
  the Docker socket or a token, and open TCP connections to a host listener on
  the Docker gateway, `169.254.169.254`, `10.0.0.1` and `127.0.0.1:2375`. It
  also leaves a forged `flow.json` and a symlinked screenshot. The page
  fetches the same addresses and `file://` URLs. The host listener counts
  connections, so refusal is observed from outside. `--unboxed` runs the same
  build on the host and the page on a bridge network as a control, and reports
  breaches.

Not done yet: no path publishes an isolated capture as a `browser-flow`
check, and dispatch still reports every flow as owed. Publishing needs a
runner commit that an operator pins after an independent review, recorded in
the provenance as `bootstrap`; the candidate can never choose it, and the
runner checkout's own `HEAD` is never taken as trusted. After this merges,
native dispatch is meant to use the reviewed runner from `main`.

`mergeOne` gates twice, then merges with GitHub's atomic merge API
(`PUT pulls/<n>/merge`) with `sha` set to the head both gates saw, so GitHub
refuses if the head moved. It never arms GitHub's auto-merge: this repository
has no branch rules, so an armed pull request could merge a later push that
no gate saw. If GitHub refuses the merge, that is reported and nothing merges
another way. It never submits a review.

A merge is not shipped. `deploy <sha>` prints `deploy`, the Pages state
(`deployed-needs-sanity` only when the Pages run's `deploy` job succeeded for
that commit), and `state` with `owed`. `state` is `shipped` only when every
flow the merge commit's files need has the factory's newest
`browser-flow-live` check run on the merge commit concluded `success`, with a
record that passes the same checks as premerge evidence (merge as head, the
flow, every check passed, screenshots under `evidence/live/<merge>/<flow>/`
retained on the evidence branch with matching sha256) and also names the merge
as `mergeSha` and `deployedSha`, the Pages `url` (`LIVE_URL`), a `capturedAt`
after the merge's first successful Pages deploy, and an `identity` that matched
before and after the flow. That identity report is retained as
`identity.json` beside the screenshots and hashed with them.

`scripts/visual/run-flow.sh --live` no longer records that run: it refuses
(exit 3), because it built and ran the merge on the host that holds the writer
key. Its replacement is the mediated capture in
`scripts/visual/live-capture.mjs`, which dispatch runs from the record's
wrapper `W`. With no authority anchor installed it exits 3 before any build or
check run, so every live flow is still reported as
`browser-flow-live-owed: <merge>:<flow>` and nothing reaches `shipped`.

- The manifest is `index.html` plus every file under `assets/` of the isolated
  (network-none) build of the exact merge. Vite names assets by content hash,
  so this is the deployment identity. Every key must be canonical (the same
  allowlist requests must pass), with at most 512 entries, before anything is
  fetched.
- The broker (`live-broker.mjs`) fetches only those keys from the fixed Pages
  origin and path, GET only, with no credentials, query or redirect. It scans
  the whole manifest before the flow (`before.json`) and after it
  (`after.json`), and checks every byte it serves against the build. One
  deadline covers the scans and every request, even an upstream that ignores
  its abort signal. Requests (2000) and kept failures (50) are capped, and a
  request past the cap stops intake.
- The browser runs the pinned harness and `socket-adapter.mjs` in a
  network-none container. It sees only a directory holding the broker's
  socket, never the receipts, home, Git or Docker socket. Its report goes
  through the same no-follow, single-link, size, PNG and sha256 checks as
  premerge, and the evidence for `evidence/live/<merge>/<flow>/` is read back
  by sha256.
- **Limit:** this plays the actual deployed static bytes through localhost
  mediation. It is not the same as visiting the origin: CORS, service workers,
  cookies and auth are not exercised, so flows that need an external service
  or auth stay owed. Only `mini-putt-hole-next` has a live capture.

If the site does not match, the attempt fails and the flow stays owed. A 200
response, the page title and premerge evidence never count, and anything no
flow covers stays owed.

Owed live work is never forgotten. `node scripts/native/native.mjs owed`
walks every commit on `main` since the live gate began (`LIVE_GATE_SINCE`)
and lists each merge that is not `shipped`, with its owed reasons and stable
`<merge sha>:<flow>` keys. Main's history is the ledger, so a merge stays
listed after its pull request leaves the open list. Once a newer deployment
replaces a merge, the live site can no longer match that merge's build, so it
cannot be verified any more. It is reported as `superseded-verification-owed`,
never `shipped`, and stays listed until a person signs it off.

Each sweep reads at most `OWED_BUDGET` (60) merges, chosen fairly by the
owed ledger, `state/owed-ledger.json` on `factory-state/browser-evidence`.
It is keyed by merge sha and records, for each merge, the sweep it was last
read in, its last verified result (`verified`: state, time, keys) and its last
observation (`observed`), kept apart so a failed read never erases a shipped
result. The merges read are the ones whose turn is oldest, so every merge,
shipped ones included, is read again within ceil(merges / 60) sweeps however
many new merges arrive. A merge not read this sweep reports its last
observation, with its owed reasons, when that observation was not `shipped`
(a failed or running live check, for example); an older verified success is
kept beside it as `verified`, never in its place. Otherwise it keeps its
verified result, or is `verification-unread`. A sweep whose Pages listing
failed moves no merge's turn and does not overwrite its last observation. Only the writer-key holder saves the ledger, through a
fast-forward ref update on the branch tip it read: if another writer moved the
tip, or the result is uncertain, nothing is retried and the next sweep starts
from the tip it reads. A lost save only repeats reads. An unreadable or
invalid ledger is reported (`ledger-unread`, `ledger-invalid`), never
replaced, and that sweep reconciles as if no ledger existed.

Publication calls are bounded. Every GitHub call in `trusted-publish.mjs` and
`live-capture.mjs` (check-run create, upload, readback, final and failure
PATCH) has a 60 s limit inside one 600 s budget per publication, with the
failure PATCH allowed one more 60 s call (`GH_LIMITS`). A timeout or error is
a failure, never a success. Writes that time out are reported as outcome
unknown and are never retried, so no check run or evidence commit is created
twice. The newest attempt then fails or stays in progress, and the gate
refuses.

### Trusted publisher (awaiting independent review)

`scripts/visual/trusted-publish.mjs` is the premerge publisher. One
invocation captures one registered flow on one exact candidate commit and,
with `--publish`, reports it as the `browser-flow` check run the gate reads.
It has no mode that publishes a directory it did not just capture.

- **Pins.** The capture primitives (`isolated-deps.sh`, `isolated-build.sh`,
  `isolated-browser.sh`, `flow.mjs`, `static-serve.mjs`) run from
  `--runner`, a separate clean checkout that must be exactly `CAPTURE_PIN`
  (6ae7388, the independently reviewed capture commit), each file matching
  its pinned blob. The Node and Playwright images are the pinned digests,
  their image ids are recorded, and the primitives run with a fixed
  environment, so no `CARNIVAL_*` image override reaches them. It never
  calls `isolated-flow.sh` or `run-flow.sh`.
- **Flows.** The expected checks and screenshots of each flow are listed in
  `FLOWS` in the wrapper. A flow the candidate adds stays owed until a
  reviewed change to the wrapper registers it.
- **Validation.** The report directory is fresh, private (0700) and never
  seen by the build. After the browser container exits, the original
  directory is checked without following links: only `flow.json` and the
  expected `<flow>-<state>.png` names, each a regular file with one link,
  within size limits, read with `O_NOFOLLOW`. The report must name the flow,
  list exactly the expected checks, all passing, and no errors. Each PNG
  needs a valid signature, a 1280 pixel width and its recorded sha256. Only
  those bytes are copied to fresh private staging, which is validated again.
- **Authority.** `--publish` and the merge gate both read one operator
  record, `control/operator-browser-authority.json`, at exactly the commit
  named by `CARNIVAL_AUTHORITY_COMMIT`, a plain value an admin saves on the
  Carnival environment. They read it through GitHub's git object API
  (commit, tree, blob), never at a branch tip and never from a checkout. The
  factory App can move `factory-state/browser-evidence`, so the tip proves
  nothing; only the anchor does. A missing or invalid anchor, an unreadable
  commit, or a record missing, malformed or unapproved at that commit fails
  closed. INPUTS, trigger payloads, the command line and the candidate never
  select the anchor. The record names the wrapper commit `W`, the capture
  pin, the image digests, the boundary and each flow's checks and states.
  The wrapper must run from a clean checkout of exactly `W`, and `W` must
  differ from the candidate, except under the record's `bootstrap` entry,
  which may name only pull request 449 at a head equal to `W`. Later commits
  on `main` do not matter: nothing compares `W` with `main`. No routine run
  writes the record, its anchor or its pins.
- **Run provenance.** Saved environment values survive repository syncs and
  a run's own token cannot change them, but a raw launch or resume can
  upload its own environment. So the gate and the publisher also read this
  run from `tessl api /experimental/launch-runs/$TESSL_LAUNCH_RUN_ID` and
  accept only two routes in the Carnival repository and environment
  (`01a18320-...`): the scheduled `native-intake` dispatch created by the
  Carnival project automation (`01a1831d-...`), or, for pull request 449
  only, the owner's `shepherd` action (`01a18325-...`) started by a user with
  the single `tessl:trigger` event and a link to the PR. Anything else is
  refused: another environment or project, a manual or raw launch, a run
  with a resume, overlay or encrypted environment field, an unknown config
  key, an unreadable run, or a trigger override other than `timeout` and
  `instructions`. The API exposes no resume or environment upload field
  today, so their absence there is not proof; the route check is what
  refuses them. Trigger events can add refusals, never grant a route. The
  run id, route, environment and anchor are bound into `provenance.json`,
  and the gate refuses evidence whose anchor differs from the one it read
  or that names no supported route. The trusted controller and its
  credentials remain a trust assumption: this is not a separate signature.
- **Publishing.** It opens the check run in progress first, re-reads the PR
  head, commits the screenshots, `flow.json` and `provenance.json`
  (repository, PR, candidate, capture runner, wrapper, image ids, boundary,
  flow spec, authority commit, run) under `evidence/<candidate>/<flow>/` only, on top of the branch
  tip so `control/` is kept, reads every file back and compares its sha256,
  re-reads the head again, and only then concludes the check as a success
  with the usual record plus `provenance` and `provenanceSha256`. Any failure
  concludes it as a failure, so an older pass is never reused.
- **Gate.** A passing run counts only when its record carries provenance,
  the retained `provenance.json` at the evidence commit hashes to
  `provenanceSha256` and parses to the same content, and that provenance
  names this repository, head and flow, the record's wrapper (or the exact
  bootstrap), capture pin, image digests, boundary and flow spec, with the
  record's checks. A legacy app success without that never qualifies.
- **Not live QA.** This is a loopback capture of a build. Shipping still
  needs the separate `browser-flow-live` run on the deployed site.
- **Status.** No anchor or record is installed, so nothing qualifies yet.
  Activation needs, in order: an independent review of the final `W`; a
  commit holding only the record (shape below) at
  `control/operator-browser-authority.json`, made by the operator; an admin
  saving that commit's full sha as `CARNIVAL_AUTHORITY_COMMIT` on the
  Carnival environment; then the bootstrap. The bootstrap runs from the
  owner's existing `shepherd` action for PR 449, with no new identity or
  credential. Before running any code from `W`, it checks with fixed `gh`
  and `git` commands that the record at the anchor names `W` and that a
  clean worktree's `HEAD` is `W`:

  ```sh
  rec=$(gh api "repos/guypod/carnival-evolution-20261028/contents/control/operator-browser-authority.json?ref=$CARNIVAL_AUTHORITY_COMMIT" -H 'Accept: application/vnd.github.raw')
  test "$(printf %s "$rec" | jq -r .wrapper)" = "$W"
  git worktree add --detach /tmp/w "$W" && test "$(git -C /tmp/w rev-parse HEAD)" = "$W"
  git worktree add --detach /tmp/pin 6ae738884f7d2007f88917b32062d3b276815a09
  cd /tmp/w && node scripts/native/native.mjs authority
  node scripts/visual/trusted-publish.mjs --pr 449 --candidate "$W" \
    --flow mini-putt-hole-next --runner /tmp/pin --publish
  ```

  The record:

  ```json
  {
    "schema": "carnival-browser-authority",
    "version": 1,
    "approved": true,
    "approvedBy": "<operator login>",
    "repository": "guypod/carnival-evolution-20261028",
    "wrapper": "<W: final reviewed sha>",
    "captureRunner": "6ae738884f7d2007f88917b32062d3b276815a09",
    "images": {
      "node": "node@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da",
      "playwright": "mcr.microsoft.com/playwright@sha256:5b8f294aff9041b7191c34a4bab3ac270157a28774d4b0660e9743297b697e48"
    },
    "boundary": { "network": "none", "chromiumSandbox": false, "dependencies": "runner-snapshot" },
    "flows": {
      "mini-putt-hole-next": {
        "checks": ["<FLOWS checks in W>"],
        "states": ["aiming", "hole-done", "after-next"]
      }
    },
    "bootstrap": { "pr": 449, "head": "<W, only if W is the PR 449 head>" }
  }
  ```

  `node scripts/native/native.mjs authority` shows what the anchor holds and
  whether this run's provenance is accepted.

- **Trust model.** The admin who saves the anchor, the operator who makes
  the record commit, and the Tessl controller that starts supported runs
  are trusted. The factory App can still post check runs and write the
  evidence branch, but it cannot change the anchor or the record at it. This does not
  protect against a compromised controller credential.
- **Limits.** Shared host kernel, Chromium's own sandbox off, and only
  candidates with the runner's exact `package.json`, lockfile and `.npmrc`
  (anything else stays owed). The evidence is still reported by the factory
  app: anything holding its token could post a passing run.

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
