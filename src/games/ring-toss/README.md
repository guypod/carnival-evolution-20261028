# Ring Toss

Ring the bottles as they slide along three shelves. You have ten rings.

## How to play

- Move the mouse (or your finger) to aim, then click or tap to throw. You can
  also steer the aim with the arrow keys and press Space to throw.
- The dashed arc and the gold ring show exactly where your ring will land.
  A ring lands where it was aimed, half a second after you throw it, so lead the
  moving bottles.
- The bottom right shows how many rings you have left. The round ends when the
  last ring lands.
- On the end screen, click, tap or press Space to play another round.

## Scoring

Each bottle has a dashed circle around its neck: that is its scoring zone. A
ring scores when its centre lands inside the zone. If two zones overlap, the
closest bottle counts. A ring that lands anywhere else is a miss and scores
nothing.

| Shelf  | Speed    | Points |
| ------ | -------- | ------ |
| Top    | 150 px/s | 30     |
| Middle | 100 px/s | 20     |
| Bottom | 50 px/s  | 10     |

The end screen shows your score and how many of your ten rings landed. Your
final score is saved to the carnival's score board once, when the round ends.

## Files

- `game.ts`: the game logic (`createState`, `toss`, `step`, `bottleAt`,
  `takeFinalScore`, `steerAim`) and the `ringToss` entry the midway registers.
- `game.test.ts`: tests for the game logic.
