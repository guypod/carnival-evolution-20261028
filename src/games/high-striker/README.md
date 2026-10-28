# High Striker

Swing the mallet three times and try to ring the bell at the top of the tower.

## How to play

- Press the **Start** button (or Space or Enter). Nothing moves until then.
  When a link such as **Back to the midway** has keyboard focus, the game
  leaves Enter and Space to the browser: Enter activates the link, and Space
  keeps its native behaviour (it does not activate the link or strike).
- A marker sweeps back and forth across the power meter, one full sweep there
  and back every 1.6 seconds. Press **Strike!** (click or tap it, or press Space
  or Enter) to lock it.
- The puck flies up the tower to a height set by your score. A perfect hit
  rings the bell.
- A red marker stays on the meter where you struck, while the puck flies and
  until the next swing starts, next to a line that gives your points and your
  timing: **Perfect timing** inside the bell zone, **Early: wait a beat longer**
  when the marker had not reached the centre yet, or **Late: strike a beat
  sooner** when it had already passed it. Early and late follow the marker's
  direction of travel, so they mean the same thing on either side.
- Your result stays on screen until you press **Next swing**. Pressing again
  while the puck is flying does nothing.
- After the third swing the end screen shows your total and lists all three
  swings with their points and timing, with your best swing (the first of any
  tie) marked **(best)**. Press **Play again**
  for a fresh round. Escape takes you back to the midway.
- The game runs on real time and pauses while the tab is hidden.

## Scoring

Each swing scores by how far the marker is from the centre of the meter, where
0 is the centre and 1 is either end:

| Distance from centre | Points              |
| -------------------- | ------------------- |
| up to 0.05           | 100, rings the bell |
| up to 0.2            | 75                  |
| up to 0.45           | 50                  |
| up to 0.75           | 25                  |
| further out          | 10                  |

Three swings make a total of up to 300. The total is saved to the carnival's
score board once, when the third swing lands. If the browser refuses to save
it, the error goes to the console and **Play again** still works.

## Files

- `game.ts`: the game logic (`createState`, `markerPosition`,
  `markerDirection`, `signedOffset`, `timingFor`, `zoneFor`, `scoreFor`,
  `lastStrike`, `feedback`, `bestSwing`, `breakdown`, `breakdownRow`, `strike`, `nextSwing`, `step`, `press`, `puckHeight`, `total`,
  `takeFinalScore`, `saveFinalScore`, `frameClock`, `isActionKey`, `listen`) and
  the `highStriker` entry the midway registers.
- `game.test.ts`: tests for the game logic.
