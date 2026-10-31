# Water Cannon

Soak the targets on the three rails before your tank runs dry.

## How to play

- Before each round, pick a challenge mode and press **Start**. Click a mode
  button, or press `1`, `2` or `3`, or the arrow keys, then click **Start** or
  press Space or Enter. Only the buttons respond on this screen, so a stray
  click neither starts the round nor fires a shot.
- Move the mouse to aim the cannon, and click to fire a shot of water.
- You have 15 shots. The game ends when the tank is empty and the last shot has landed.
- The game over screen shows your score and the mode you played. Click it, or
  press Space or Enter, to go back to the mode selector with the same mode
  still picked.
- Keyboard shortcuts do nothing while a link or button on the page has focus,
  so Enter on **Back to the midway** still follows the link.

## Challenge modes

The mode changes how fast the targets move. Points per hit and streaks are the
same in every mode.

| Mode    | Target speed | Top / middle / bottom rail |
| ------- | ------------ | -------------------------- |
| Calm    | x0.5         | 90 / 60 / 30 px/s          |
| Classic | x1           | 180 / 120 / 60 px/s        |
| Rapid   | x1.5         | 270 / 180 / 90 px/s        |

Classic is picked to start with, and plays exactly like the original game. The
mode you pick is kept for the rest of your visit while the game stays open; it
is not saved anywhere, and opening the booth again starts on Classic. The mode
is shown in the top left corner during a round.

## Scoring

Each target scores 10 points for every 60 px/s of its rail's Classic speed,
rounded up, whatever the mode:

| Rail   | Speed    | Points |
| ------ | -------- | ------ |
| Top    | 180 px/s | 30     |
| Middle | 120 px/s | 20     |
| Bottom | 60 px/s  | 10     |

### Streaks

Hits in a row build a streak, shown in the top right corner. The second hit in a
row scores double and every hit after that scores triple, up to a cap of x3:

| Hit in the streak | Multiplier |
| ----------------- | ---------- |
| 1st               | x1         |
| 2nd               | x2         |
| 3rd and later     | x3         |

A shot that leaves the booth without hitting a target is a miss and resets the
streak to 0. A shot still in the air does not count yet: it hits or misses when
it lands. Each hit shows a splash and a popup with the points it scored and,
on a streak, its multiplier.

Your final score is saved to the carnival's score board once, when the game ends.
Playing again starts a new round in the picked mode with a full tank, no score
and no streak.

## Options

Add `?shots=25` to the page URL to change the size of the tank, for example
`http://localhost:5173/?shots=25#/play/water-cannon`.

## Files

- `game.ts`: the game logic (`createState`, `fire`, `step`, `scoreForHit`,
  `multiplierFor`, `registerHit`, `registerMiss`, `takeFinalScore`), the
  challenge modes (`MODES`, `createReadyState`, `selectMode`, `beginRound`,
  `replay`, `keyAction`, `pointerAction`) and the `waterCannon` entry the
  midway registers.
- `game.test.ts`: tests for the game logic.
