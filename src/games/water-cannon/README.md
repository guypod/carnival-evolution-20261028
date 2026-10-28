# Water Cannon

Soak the targets on the three rails before your tank runs dry.

## How to play

- Move the mouse to aim the cannon, and click to fire a shot of water.
- You have 15 shots. The game ends when the tank is empty and the last shot has landed.
- Click again on the game over screen to play another round.

## Scoring

Each target scores 10 points for every 60 px/s of speed, rounded up:

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
Playing again starts a new round with a full tank, no score and no streak.

## Options

Add `?shots=25` to the page URL to change the size of the tank, for example
`http://localhost:5173/?shots=25#/play/water-cannon`.

## Files

- `game.ts`: the game logic (`createState`, `fire`, `step`, `scoreForHit`,
  `multiplierFor`, `registerHit`, `registerMiss`, `takeFinalScore`) and the
  `waterCannon` entry the midway registers.
- `game.test.ts`: tests for the game logic.
