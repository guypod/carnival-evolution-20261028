# #812: Let the ring toss count a ring that lands on the rim

A ring that came to rest on a bottle's rim used to score nothing, even though it
looked like a hit. It now scores half points, so near misses feel fair and the
best score reflects how well people actually throw.

The half-point rule lives in `scoreToss`, beside the full-hit rule, so the
round's total is still recorded once through the shared scores module.

**Checks:** `npm run check` passes on `a1b2c3d`. I did not look at the change in
a browser: the build passing does not show how the rim hit looks on screen.

**Not done:** the game's README still says a rim landing scores nothing. It
needs its own issue.

**Try it:** `npm run dev`, open `#/play/ring-toss`, and drop a ring on a rim.

<details><summary>Evidence</summary>

- `npm run check` on `a1b2c3d`: lint, format, typecheck, 214 tests and the
  factory contract all pass.
- New cases in `game.test.ts`: centre hit 10, rim hit 5, miss 0, rim hit on the
  last throw still ends the round.

</details>

Closes #812

<!-- tessl-factory:issue-label: tessl -->

🤖 Generated with [Claude Code](https://claude.com/claude-code)
