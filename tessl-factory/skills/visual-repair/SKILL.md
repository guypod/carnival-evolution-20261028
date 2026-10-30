---
name: visual-repair
description: Every six hours, look at the carnival screens owed a review in its ledger, in a real headless browser, against the visual design baseline, and repair the worst one in one small draft pull request. Use when running the visual repair maintenance loop. Inspects every run, even with other pull requests open, and defers a repair only when an open pull request changes the same or a shared file.
---

# Visual repair

The midway sets the carnival's look; `docs/visual-baseline/README.md` holds the
rubric and reference screenshots. This loop keeps the other screens close to
it. Each run repairs at most one screen, through one draft pull request, and
stops. It improves the carnival; it does not file report after report.

## The ledger

The loop's memory is `ledger.json` on the ordinary branch
`factory-state/visual-repair` on origin, read and written by
`scripts/visual/ledger.mjs` (tested in `scripts/visual/ledger.test.mjs`). It
holds:

- `reviewedThrough`: the last `main` commit whose affected routes were all
  captured and judged. It is coverage, not repair: a pull request opened or
  merged does not move it.
- `pending`: routes still owed a look, carried from run to run until reviewed.
- `findings`: one per `<route>:<state>:<criterion>`, with status `open`,
  `pr-open`, `merged`, `declined` or `resolved`.

A write is a fast-forward push of one commit. If another run moved the
branch first, git refuses it and this run's record is not saved: report that
and stop, and the next run redoes the batch. Never force-push the branch and
never edit it by hand.

## Guards

Follow these in order. Any "stop" ends the run with the ledger unchanged.

1. **Serialization.** Every writing action in `tessl.json` holds the
   `carnival-app-writer` key (limit 1, queued), so while this run holds it no
   implement, shepherd, test health or other visual run is writing. Keys are
   taken at admission, so start a manual run only through
   `tessl action trigger visual-repair --request-id <stable id>`, never
   through a raw launch, which skips the action's keys.
2. **Plan.** Run `node scripts/visual/ledger.mjs plan`. It reads the ledger
   and `gh pr list` with each pull request's files, reconciles the loop's own
   pull requests first, and prints one of the actions below.
   Other open work never stops an inspection: open pull requests, queued
   issues and the loop's own repair awaiting review all leave `review` in
   place, so `main` is captured every six hours. The plan also prints
   `conflicts`: for each route, the open pull requests whose diffs a repair of
   it would overlap. It uses the same mapping as Coverage below, so a shared
   file (`index.html`, `src/main.ts`, `src/style.css`, `src/carnival/`), a
   module other screens import or a file it cannot place overlaps every
   route. A pull request whose file list is missing or may be cut off counts
   as overlapping every route. A queued issue without a pull
   request has no diff and does not conflict; the writer key already keeps its
   run from writing alongside this one.
   - `review`: the `batch` of routes to capture now, open findings first.
     When it carries `monitor`, the loop's own repair pull request is open:
     record the review, then look after that pull request as for `monitor`
     instead of Repair.
   - `monitor`: nothing to capture and the loop's own repair pull request is
     still open. Do not open another. Look after that one only: if its checks
     failed or it has unanswered review, fix it on its branch, push, and
     answer; otherwise leave it. Then stop. Findings it fixes stay `pr-open`
     even when a review of `main` still sees them; new findings stay `open`
     for the repair after it.
   - `repair`: nothing to capture, and `targets` lists routes with
     `repairable` findings that no open pull request overlaps (an earlier
     repair failed, or a decline is older than 30 days). Go to Repair, with a
     route from `targets` only.
   - `defer`: nothing to capture, findings are repairable, but every route
     with one is overlapped by an open pull request. Name the `reason` and
     stop. Nothing is lost: owed routes and unresolved findings stay in the
     ledger for a later run.
   - `nothing`: no route is owed a look and no finding is repairable. Stop.

   It fails, and the run stops, if a GitHub list reaches its limit, because a
   cut-off list could hide work in flight.
   Only same-repository pull requests count as the loop's own; a fork with the
   same branch name is ignored, and so is any pull request not opened by
   `app/tessl-app`, since anyone with push access can pick the branch name.
   A route the router no longer serves is dropped from `pending`; its findings
   stay in the ledger, untouched.
   Merged repairs become `merged` and their route is reviewed again on
   `main`. A finding that no longer shows there becomes `resolved`: resolved
   on `main` as rendered locally. That is not evidence of the live deploy;
   never report a repair as deployed.
   Declined repairs (closed without merging) stay declined for 30 days.
   Leftover `tessl/visual-repair-*` branches never block a run; each repair
   branch is named for its run, so an old one is never reused. If that name already exists on origin, take a new time.

3. **Browser.** Capture only through `scripts/visual/run-capture.sh`, which
   sets up Chromium, loads its environment in the same shell, starts its own
   dev server for this checkout on a free port (never one already running)
   and captures. If Chromium does not start, stop and report the
   error. Never describe a screen you did not render, and never treat tests,
   lint or a build as a visual pass.

## Coverage

`plan` owes a route a look when a commit since `reviewedThrough` touches a
file it draws with. Shared files (`index.html`, `src/main.ts`,
`src/style.css`, `src/carnival/`) and files it cannot place owe every route.
The first run, with no ledger, owes every route, so screens changed before
this loop existed are reviewed too. A game registry change (`src/games/index.ts`) owes every route too,
since the midway lays out from it. So does a module that another `src` module
imports or that `src/main.ts` uses outside one screen's renderer, such as the
midway's passport panel. If the import search fails, `plan` stops instead of
narrowing. Routes are reviewed four at a time.
`reviewedThrough` moves only when none is left owed, so a shared change is
spread over several runs and no route is skipped. A new interval, from
`reviewedThrough` to the newest `main`, opens only once the last one is done,
so commits landing between runs wait for the next interval instead of
refilling the current one.

## Look

Run `VISUAL_REV=<plan head> scripts/visual/run-capture.sh <dir outside the
clone> <batch routes>`, with the `head` that `plan` printed. It renders that
exact `main` commit from a temporary worktree and writes it to `<dir>/commit`,
so the review covers what the ledger credits, whatever is checked out.
It captures desktop 1280x800, narrow 390x844, keyboard focus, Quiet (reduced
motion), and the route's interaction from its `INTERACTIONS` entry in
`scripts/visual/capture.mjs`; add an entry for a route that has none. It fails
on blank images and page errors. Check the files a second way with
`node scripts/visual/pixels.mjs <dir>/*.png`, which decodes them without the
browser.

Open every screenshot and judge it against each rubric criterion. A finding
names route, state, criterion and what the image shows. Write the review to a
file as `{ "head": <contents of <dir>/commit>, "reviewed": [<routes>],
"findings": [{ "route", "state", "criterion", "note" }], "pr": null }` and
save it with `node scripts/visual/ledger.mjs record <file>`, which refuses a
review of any commit but the planned one, or a finding without a note. Do this before repairing, so
the findings are kept even if the repair fails.

## Repair

Take the findings `plan` listed as `repairable` plus the ones just recorded:
open, and not declined in the last 30 days, on a route with no entry in
`conflicts`. Pick the one route with the most,
worst first: composition, controls and focus-contrast before the rest. Other
routes' findings stay open in the ledger for later runs.

- Branch `tessl/visual-repair-<route name>-<yyyymmddhhmmss>`, with the run's UTC start time to the second, from the default
  branch.
- Keep the change bounded: the route's markup in `src/main.ts`, its rules in
  `src/style.css`, and its own drawing module. No new route, no gameplay,
  scoring, save or copy changes, no audio, no network, no new dependency.
- Keep native semantics: restyle `<button>`, `<input>` and `<label>`; never
  replace them. Colours and fonts from the theme only (house rule 3).
- Original art drawn with canvas, SVG or CSS. No external or generated images.
- Run `npm run format` and `npm run check`, then capture the same states again
  from the repair branch (`run-capture.sh` without `VISUAL_REV`, into a new
  directory) and look at them. These after screenshots are the pull request's
  evidence only; never `record` them, since they are not `main`. The repair is done only when the after screenshots clear
  the findings without new ones. Two attempts at most; otherwise stop without
  a pull request and report what you saw. The findings stay open.
- Push after every commit. Open a draft pull request labelled `tessl` titled
  `Visual repair: <route>`. The body lists each finding with its before and
  after screenshot paths, what you ran, and one
  `<!-- tessl-visual-finding: <route>:<state>:<criterion> -->` line per
  finding fixed. Commit the before screenshots (from the
  `main` capture) and the after screenshots under
  `docs/visual-baseline/repairs/<route>/before/` and `.../after/`, so both sides
  of the comparison are reachable from the pull request. The next run's `plan` marks those
  findings `pr-open` from the markers.
- Never merge, approve or enable auto-merge.

## Run output

Lead with one line: `opened <pr url> for <route>`, `monitoring <pr url>`,
`deferred: <reason>`, `nothing owed since <sha>` or `failed: <error>`. Then
the routes captured, the findings recorded, routes still owed, and
`reviewedThrough` before and after.
