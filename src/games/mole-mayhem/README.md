# Mole Mayhem

Whack the moles as they pop out of six numbered holes. You have 30 seconds.

## How to play

- Press the **Start** button (or Space or Enter). The 30 second timer only
  starts then. When a link such as **Back to the midway** has keyboard focus,
  Enter and Space work that link instead of starting the round.
- One mole is up at a time. Click or tap it, or press the key for its hole:
  `1` `2` `3` on the top row and `4` `5` `6` on the bottom row.
- A mole is a cream face with a dark outline, sitting in a dark hole in a
  brown mound. A whacked mole squashes flat, shows **BONK!** and springs back
  as it ducks.
- A mole stays up for 1.2 seconds, then ducks away. The next mole pops up a
  quarter of a second after the last one leaves or is whacked.
- The top of the screen shows the time left, your score, and your streak with
  its bonus.
- The round runs on real time, so it lasts 30 seconds even at a low frame
  rate. It pauses while the tab is hidden.
- When time runs out the round ends. Press **Play again** (or Space or Enter)
  for a fresh round. Escape takes you back to the midway.

## Scoring

- A hit is worth 10 points times your bonus.
- Every fourth mole of a round (the 4th, 8th, 12th and so on) is a golden
  visitor: it is gold, wears a crown and is labelled **GOLDEN 25**. A golden
  hit is worth 25 points times your bonus. The count starts again with each
  round, and moles that duck away unhit still count.
- The bonus grows with hits in a row: the first hit is x1, the second x2, and
  every hit after that x3.
- Whacking an empty hole is a miss: it resets your streak to 0 but never takes
  points away. A whacked mole can't be hit twice, and tapping it again doesn't
  count as a miss. That goes for golden moles too.
- Reaching a streak of 3 and of 5 flashes a short message, such as
  **3 in a row! x3**, below the holes for a second.

The end screen shows your score, hits, golden hits, misses and your best
streak of the round. Your final score is saved to
the carnival's score board once, when the round ends. If the browser refuses
to save it, the error goes to the console and the end screen and **Play again**
still work.

## Files

- `game.ts`: the game logic (`createState`, `startRound`, `beginRound`, `whack`, `step`,
  `takeFinalScore`, `saveFinalScore`, `frameClock`, `isStartKey`, `seededRng`,
  `isGoldenSpawn`, `milestoneText`, `squash`, `holeForKey`, `holeAt`) and the `moleMayhem`
  entry the midway registers. `createState` takes an rng so tests can choose
  where moles pop.
- `game.test.ts`: tests for the game logic.
