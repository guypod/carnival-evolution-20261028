---
name: visual-design
description: Review changes that affect how the carnival looks (UI routes, shared styles, drawing code and art) against the visual design baseline. Use on pull requests that touch index.html, src/main.ts, src/style.css, any src/**/*.ts that draws to a canvas, or anything under docs/visual-baseline.
---

# Visual design

The midway has a warm, handcrafted fairground look. Screens off the midway
must look like they belong to it. Judge the change against the rubric in
`docs/visual-baseline/README.md` and the screenshots in
`docs/visual-baseline/reference/`.

## What counts as evidence

A visual verdict needs rendered evidence: screenshots of the changed screen
taken from this pull request's head, at desktop (1280x800) and narrow (390px)
widths, with keyboard focus on a control, after the main interaction, and with
reduced motion. `scripts/visual/run-capture.sh` takes them. It captures the
interaction state only for routes with an entry in `INTERACTIONS` in
`scripts/visual/capture.mjs` (today only `#/balloon`). For any other route,
the interaction screenshot is still required: a route with no entry and no
interaction screenshot is **rendering unverified** for that state.

- If the pull request changes how a screen looks and carries no such
  screenshots, report one finding: **rendering unverified**, naming the screens
  and states that are missing. Do not pass or fail the look from the code alone.
- Lint, type checks, unit tests and pixel counts prove the code runs and the
  image is not blank. None of them is a visual pass. Never say a screen looks
  right because tests pass.
- Mark each rubric criterion `pass`, `finding` or `unverified`, as in
  `review-lenses/visual-design/rubric.json`.

## Findings

Report a finding when a screenshot shows one of these. Name the screen, the
state, the rubric criterion and what in the image shows it, and say the fix.

1. **Raw default controls**: a grey browser button, default radio dots or a
   white default text box sitting on the carnival background (`controls`).
2. **Giant empty layout**: a short column of controls and most of a 1280x800
   screen left as bare background (`composition`).
3. **Isolated dashboard destination**: a screen of tables, cards or stats with
   no carnival material, focal art or frame that ties it to the midway
   (`materials`, `art-integration`).
4. **Lost focus or contrast**: a control with no visible focus ring, or text
   under 4.5:1 against its background (`focus-contrast`).
5. **Broken narrow layout**: sideways scrolling, cropped art or controls out
   of reading order at 390px (`responsive`).
6. **Motion needed to understand it**: with reduced motion the screen is empty
   or incomplete (`quiet`).
7. **Off-theme colour or font** in styles or drawing code: a hex, `rgb(`,
   `hsl(` or named colour, or a font string, that does not come from
   `theme`/`canvasFont` or a `--color-*` property (`materials`). Standalone
   fixtures under `review-lenses/visual-design/fixtures/` are exempt.

Keep native semantics: a fix restyles a control, it never swaps a `<button>`,
`<input>` or `<label>` for a `<div>`.

## Stay quiet on

- Gameplay, scoring and copy, unless the text is unreadable.
- Personal taste that no rubric criterion names.
- Screens the pull request does not change.

## Calibration

`review-lenses/visual-design/fixtures/` holds a deliberately inconsistent
sample and a compliant one, with screenshots and the assessment a reviewer
should reach. The inconsistent sample must get findings for composition,
controls and focus-contrast at least; the compliant one must get none.
