# Duck Dash

Steer a carnival duck down a three-lane river for 20 seconds. Catch the stars
and dodge the reeds floating towards you.

## How to play

- Press **Start** (or Space/Enter) on the ready screen.
- Move between lanes with **Left/Right** arrows or **A/D**, or click or tap one
  of the **Left / Middle / Right** lane buttons (or anywhere in a lane).
- Stars and reeds appear at the top of the river and take a little over two
  seconds to reach the duck, so there is time to react. A row never has reeds in
  every lane.
- Your current star streak and the best streak this round show on the left.
- When time runs out the result screen shows your score, stars collected (and
  the points they earned), reeds hit, the streak bonus total and your best
  streak. Press **Play again** (or Space/Enter) to replay.

Keys are ignored while a link or other page control has focus, so they keep
working for that control.

## Scoring

- A star that reaches the duck in its lane: **+10**.
- A reed that reaches the duck in its lane: **-5**, never below 0.
- **Streak bonus:** each star caught in a row earns extra points. A star caught
  when you already have a streak of `s` stars earns `10 + min(2 × s, 10)`, so
  the run goes 10, 12, 14, 16, 18, 20, 20, ...
- Hitting a reed or letting a star go past in another lane resets the streak to 0. Dodging a reed does not. The best streak of the round is kept.
- Each object counts once: when it reaches the duck's row it is either caught
  (in the duck's lane) or missed, and never changes after that. The duck
  flashes `+10`, `+10 +4 streak` or `Ouch! -5` briefly.
- Your final score is saved to the carnival's score board once, when the round
  ends. If the save fails (for example, browser storage is full), the result
  screen says `Your score could not be saved.` and the game tries once more
  when you press Play again or leave the booth. If that also fails, the score
  is not saved.
