# Ring Toss

Ring the bottles as they slide along three shelves. You have ten rings.

## How to play

- Move the mouse (or your finger) to aim, then click or tap to throw. You can
  also steer the aim with the arrow keys and press Space to throw. During a
  round a line above the thrower says so.
- The dashed arc and the gold ring show exactly where your ring will land.
  A ring lands where it was aimed, half a second after you throw it, so lead the
  moving bottles. The line under the awning says so: lead moving bottles by half
  a second, and gold bottles score double.
- The aim stops just below that line, so a ring always lands on the playfield.
  Aim above the top shelf's zones and the ring lands there as a red `Miss`.
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

One bottle on each shelf is golden: it is drawn in gold with a gold dashed
zone, and it scores double its shelf's points (60, 40 or 20). Its zone is the
same size as every other bottle's, so it is no easier to ring. A ring on a
golden bottle pops up `Golden! +<points>`. Each new round moves the golden
bottle on every shelf along one place, so the first round always starts the
same way.

The end screen shows your score, how many of your ten rings landed and how many
of those landed on golden bottles. The golden count starts at zero each round. Your
final score is saved to the carnival's score board once, when the round ends.

## Files

- `game.ts`: the game logic (`createState`, `goldenIndex`, `toss`, `step`,
  `bottleAt`, `takeFinalScore`, `steerAim`) and the `ringToss` entry the midway registers.
- `game.test.ts`: tests for the game logic.
