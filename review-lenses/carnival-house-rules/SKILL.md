---
name: carnival-house-rules
description: Review changes to carnival games against the house rules in AGENTS.md. Use on pull requests that add or change a game under src/games/.
---

# Carnival house rules

Review only the files this pull request changes under `src/games/`. Report a
finding only when the change breaks one of these rules. Quote the line, name
the rule, and say what the fix is.

## Rules

1. **Every game registers on the midway.** A game lives in
   `src/games/<game-id>/`, exports a `CarnivalGame` from `game.ts`, and is
   added to the list in `src/games/index.ts`. The folder name and the game's
   `id` match. A new game folder with no line in `src/games/index.ts`, or an
   `id` that differs from its folder, is a finding.
2. **Every game reports scores through the shared scores module.** A game
   calls `recordScore(game.id, score)` from `src/carnival` once, when a round
   ends. A game that reads or writes `localStorage` or `sessionStorage`, keeps
   its own high score table, or calls `recordScore` on every frame or more than
   once per round is a finding.
3. **Every game draws with the carnival's theme.** Colours, fonts and sizes
   come from `theme` and `canvasFont` in `src/carnival/theme.ts`. A hex colour,
   an `rgb(`/`hsl(` colour, a named CSS colour or a font string such as
   `'16px sans-serif'` inside a game is a finding.
4. **Game logic is testable without a browser.** Scoring, moving and hits live
   in plain exported functions that `game.test.ts` tests. Logic that only
   exists inside `start`, or touches `document`, `window`, the canvas or
   `requestAnimationFrame` outside `start`, is a finding.
5. **`start` cleans up after itself.** It returns a function that cancels the
   animation frame and removes every listener it added. A listener added with
   no matching removal, or a frame that is never cancelled, is a finding.
6. **Each game has a README** that says how to play and how scoring works. A
   new game with no `README.md`, or a change to controls or scoring that
   leaves the README saying something else, is a finding.

## Stay quiet on

- Formatting, lint and type errors: `npm run check` already fails on them.
- Code outside `src/games/`, and `src/games/index.ts` beyond rule 1.
- Style preferences that no rule above names.
