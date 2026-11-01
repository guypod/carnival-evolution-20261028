# Prize Wheel

Spin the wheel five times and brake it so it lands on the big numbers.

## How to play

- Press **Start** (Space or Enter, or click or tap the game). The wheel starts
  turning clockwise at a steady speed.
- Press again (Space, Enter, click or tap) to put the brake on. The wheel
  slows evenly and comes to rest about two thirds of a turn later, so brake early.
  Pressing while it slows does nothing.
- The segment under the pointer at the top scores. Press again for the next
  spin.
- After the fifth spin the total shows. Press again to play a new round.
- When a link such as **Back to the midway** has keyboard focus, Space and
  Enter go to the link instead of the wheel.

## Scoring

The wheel has eight segments, clockwise from the one under the pointer at the
start: 10, 50, 25, 100, 10, 25, 50 and 5 points. Each spin scores the segment
it stops on, and the round's score is the total of its five spins, up to 500.
The total is saved to the carnival's score board once, when the fifth spin
lands. If the save fails, the game says the score was not saved and the action
becomes **Save again**, which tries once more with the same total.

## Files

- `game.ts`: the game logic (`createState`, `segmentAt`, `restingAngle`,
  `spin`, `brake`, `step`, `press`, `actionLabel`, `total`, `saveFinalScore`,
  `isActionKey`, `listen`) and the `prizeWheel` entry the midway registers.
- `game.test.ts`: tests for the game logic.
