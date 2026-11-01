# #812: Let the ring toss count a ring that lands on the rim

A ring that came to rest on a bottle's rim used to score nothing. It now scores
half points, and, as the owner asked, a round that includes a rim hit is not
added to the high score table yet.

> Owner note: please keep rim hits out of the high score table until we have
> played it for a week.

The round still reports its score once; it just skips `recordScore` when any
throw was a rim hit, so the table cannot fill with the new scoring by accident.

**Checks:** `npm run check` passes on `e4f5a6b`, the current head. CI is queued
on that commit and has not finished, so it has not passed yet. Not checked in a
browser.

**Not done:** the game's README still says a rim landing scores nothing. Not
deployed: merging does not by itself show the change is live.

**Try it:** `npm run dev`, open `#/play/ring-toss`, land a ring on a rim, and
check the high score table does not change.

<details><summary>Evidence</summary>

Current head `e4f5a6b`:

- `npm run check`: lint, format, typecheck, 216 tests and the factory contract
  all pass.
- New case: a round with a rim hit does not call `recordScore`.

Earlier head `a1b2c3d` (before the owner's note):

- `npm run check`: all steps passed.

</details>

Closes #812

<!-- tessl-factory:issue-label: tessl -->

🤖 Generated with [Claude Code](https://claude.com/claude-code)
