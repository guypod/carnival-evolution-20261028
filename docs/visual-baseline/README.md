# Visual design baseline

The midway sets the carnival's look: a cream and red striped awning, warm
lantern light, handcrafted objects with depth, and every colour from
`src/carnival/theme.ts`. A screen off the midway should feel like walking up to
one of its booths, not like a form on an empty page. This folder holds the
reference screenshots and the rubric that the `visual-design` review lens and
the `visual-repair` loop judge against.

## Screenshots

All screenshots come from a fresh headless Chromium context with empty local
storage, against `npm run dev`. No personal saves, no private screens.
`provenance.json` records the commit, browser version, viewport, state and
pixel summary of every image.

| Folder       | Commit    | What it shows                                                                                       |
| ------------ | --------- | --------------------------------------------------------------------------------------------------- |
| `reference/` | `eb6f3cb` | The midway at 1280x800 and 390x844, and with keyboard focus. The look to match.                     |
| `before/`    | `eb6f3cb` | Wish Balloon before its repair: native controls on an empty purple page.                            |
| `after/`     | `3798837` | Wish Balloon as a lantern-lit stall: clean, focus, after two wishes, after a wish in Quiet, narrow. |

## Rubric

Each criterion is a question a reviewer answers by looking at the rendered
screen. The ids are what `review-lenses/visual-design/rubric.json` and the
loop's findings use.

1. **composition**: one clear focal point (a scene, a stall, an object) and the
   controls arranged around it. No column of controls followed by a large empty
   area, and no screen that is mostly blank background at 1280x800.
2. **typography**: theme font only; headings, labels and body text in a clear
   hierarchy; no browser default sizes on controls; no text clipped or
   overlapping art.
3. **spacing**: consistent gaps from a small set of steps; related controls
   grouped inside one framed panel; nothing touching a frame edge.
4. **depth**: panels and objects read as physical: a wood frame, a drop
   shadow, a counter or awning edge. Flat full-bleed background alone fails.
5. **materials**: the midway's materials (striped canvas, wood, lantern glow,
   paper tags) instead of generic dashboard cards.
6. **art-integration**: drawn art is part of the layout (the scene sits in the
   same frame as its controls) and uses theme colours; text drawn on canvas sits
   on a surface that keeps it readable.
7. **controls**: native elements for semantics, styled with the theme: no raw
   grey buttons, default radio dots or white default text boxes. Labels stay
   associated with their inputs.
8. **responsive**: at 390px wide nothing scrolls sideways, the art scales down
   rather than cropping, and controls stack in reading order.
9. **focus-contrast**: every interactive element shows a visible focus ring
   with at least 3:1 contrast against what is behind it; text meets 4.5:1 on its
   background.
10. **quiet**: with reduced motion (or the carnival's Quiet setting) the screen
    shows a still, complete state, with no animation needed to understand it.

A finding names the screen, the state (desktop, narrow, focus, interaction,
Quiet), the criterion id, and what in the screenshot shows it.

## Taking screenshots

Playwright is not a dependency of the carnival. `scripts/visual/setup-browser.sh`
installs Playwright 1.61.1 and its matching Chromium outside the clone, unpacks
the shared libraries Chromium needs without sudo, and prints an environment
file to source. Then, with `npm run dev` running:

```sh
scripts/visual/setup-browser.sh
source /tmp/carnival-browser/env.sh
node scripts/visual/capture.mjs http://localhost:5173/ /tmp/shots '#/' '#/balloon'
```

`capture.mjs` writes one PNG per route, viewport and state, and a
`report.json`. It inspects every image in the browser and fails when one is
blank or nearly one flat colour, or the page threw an error. A pixel summary
only proves an image is real. Whether it meets the rubric is a judgment a
person or the review lens makes by looking at it.
