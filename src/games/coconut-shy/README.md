# Coconut Shy

Knock the coconuts off their posts before your balls run out.

## How to play

- Five coconuts sit on wooden posts of different heights. An aim marker swings
  left and right across the stand, there and back every 2.4 seconds.
- Click the canvas, or press Space or Enter, to throw a ball at where the
  marker is right now. The ball takes 0.4 seconds to land.
- A ball that lands within 26 px of a standing coconut hits it: the coconut
  wobbles for 0.6 seconds, then falls off its post. A ball that lands between
  coconuts misses.
- You have 6 balls. The round ends when every ball has landed and every hit
  coconut has fallen, or as soon as all five coconuts are down, even with a
  spare ball still in the air.
- The game over screen shows your score. Click it, or press Space or Enter, to
  play again. The keys do nothing while a link or button on the page has focus.

## Scoring

A coconut is worth 10 points for every 40 px of its post, rounded up. Higher
posts are worth more:

| Post height | Points |
| ----------- | ------ |
| 80 px       | 20     |
| 100 px      | 30     |
| 120 px      | 30     |
| 160 px      | 40     |
| 200 px      | 50     |

Knocking all five down scores 170. The score is recorded once, when the round ends. If saving it
fails, the game over screen still shows and you can play again.
