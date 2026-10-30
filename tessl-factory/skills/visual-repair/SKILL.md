---
name: visual-repair
description: Every six hours, look at the carnival screens that changed since the last good visual review, in a real headless browser, against the visual design baseline, and repair the worst one in one small draft pull request. Use when running the visual repair maintenance loop. Defers whenever other Tessl work could touch the same files.
---

# Visual repair

The midway sets the carnival's look; `docs/visual-baseline/README.md` holds the
rubric and reference screenshots. This loop keeps the other screens close to
it. Each run repairs at most one screen, through one draft pull request, and
stops. It improves the carnival; it does not file report after report.

## Guards

Follow these in order. Any "stop" ends the run with nothing written and the
checkpoint unchanged.

1. **Checkpoint.** The last commit whose screens were reviewed successfully is
   the ref `refs/tessl/visual-repair/checkpoint` on origin. Read it with
   `git ls-remote origin refs/tessl/visual-repair/checkpoint`. With no ref, use
   the commit that added this skill.
2. **Reconcile open work.** Tessl's schedule lock only stops two runs of this
   loop at once. It does not stop the implement, shepherd or other loops, so
   check GitHub yourself, through `gh` only:
   - `gh pr list --state open --json number,headRefName,files,isDraft`: any open
     pull request from a `tessl/` branch, or any open pull request that changes
     `src/main.ts`, `src/style.css`, `index.html` or the screen you would repair,
     means stop. Name the pull requests in the run output.
   - `gh issue list --state open --label tessl`: an open labelled issue with no
     open pull request may have an implement run in progress. Stop.
   - `git ls-remote --heads origin 'tessl/visual-repair-*'`: an existing branch
     from an earlier round is yours to finish only if it has an open pull
     request from you; otherwise stop and say so.
     Do not read other runs' logs and do not ask for wider permissions to do so.
3. **Browser.** Run `scripts/visual/setup-browser.sh`. If Chromium does not
   start, stop and report the error. Never describe a screen you did not
   render, and never treat tests, lint or a build as a visual pass.

## Find the screens

1. Diff with overlap: `git diff --name-only <checkpoint>~3..origin/main`, so a
   change merged around the last run is looked at twice rather than missed.
2. Map changed files to routes: a `render<Name>` function in `src/main.ts`,
   the `src/<name>.ts` module it draws with, and the CSS rules for its class in
   `src/style.css` all belong to route `#/<name>`. A change to shared styles or
   `src/carnival/theme.ts` affects every route; take the midway plus the three
   routes changed most recently.
3. No changed screens: move the checkpoint (below) and stop.

## Look

Start `npm run dev` and run
`node scripts/visual/capture.mjs http://localhost:5173/ <dir outside the clone> <routes>`.
It captures desktop 1280x800, narrow 390x844, keyboard focus, Quiet (reduced
motion), and the route's interaction from its `INTERACTIONS` entry; add an
entry for a route that has none. It fails on blank images and page errors.

Open every screenshot and judge it against each rubric criterion. A finding
names route, state, criterion and what the image shows.

## Deduplicate

Each finding has a fingerprint `<route>:<criterion>`. Search pull requests,
open and closed, for `tessl-visual-finding: <fingerprint>`:

- An open pull request has it: skip the finding.
- A pull request closed without merging in the last 30 days has it: a person
  declined that repair. Skip it.
- Merged: the repair did not hold. It may be repaired again.

## Repair

Pick the one route with the most findings, worst first: composition, controls
and focus-contrast before the rest.

- Branch `tessl/visual-repair-<route name>` from the default branch.
- Keep the change bounded: the route's markup in `src/main.ts`, its rules in
  `src/style.css`, and its own drawing module. No new route, no gameplay,
  scoring, save or copy changes, no audio, no network, no new dependency.
- Keep native semantics: restyle `<button>`, `<input>` and `<label>`; never
  replace them. Colours and fonts from the theme only (house rule 3).
- Original art drawn with canvas, SVG or CSS. No external or generated images.
- Run `npm run format` and `npm run check`, then capture the same states again
  and look at them. The repair is done only when the after screenshots clear
  the findings without new ones. Two attempts at most; otherwise stop without a
  pull request and report what you saw.
- Push after every commit. Open a draft pull request labelled `tessl` titled
  `Visual repair: <route>`. The body lists each finding with its before and
  after screenshot paths, what you ran, and one
  `<!-- tessl-visual-finding: <fingerprint> -->` line per finding fixed.
  Commit the after screenshots under `docs/visual-baseline/repairs/<route>/`.
- Never merge, approve or enable auto-merge.

## Move the checkpoint

Only when every changed screen was captured and judged, and any repair pull
request opened (or there was nothing to repair), push the reviewed commit:
`git push origin <origin/main sha>:refs/tessl/visual-repair/checkpoint`.
Any failure, deferral or stop leaves it where it was, so the next run looks
again.

## Run output

Lead with one line: `repaired <route> in <pr url>`, `deferred: <reason>`,
`nothing changed since <sha>` or `failed: <error>`. Then the routes captured,
the findings, and the checkpoint before and after.
