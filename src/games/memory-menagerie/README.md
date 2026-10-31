# Memory Menagerie

Find the six matching pairs among twelve face-down cards, in as few moves as
you can.

## How to play

- Press the **Start** button (or Space or Enter). Cards only flip after that.
  When a link such as **Back to the midway** has keyboard focus, Enter and
  Space work that link instead.
- Twelve cards lie face down in 4 columns and 3 rows: two each of Balloon,
  Star, Tent, Ticket, Heart and Lollipop. Every card face shows its symbol's
  picture, its number (1 to 6) and its name, so pairs never depend on colour
  alone. The cards are shuffled for every round.
- Click or tap a card to flip it. Or move the yellow cursor with the arrow
  keys and press Space or Enter to flip the selected card.
- Flip two cards per try. A matching pair stays face up, marked **PAIR**. Two
  cards that don't match stay visible for one second, then turn back over.
  While they are showing, no other card flips. Flipping a card that is already
  face up does nothing.
- Once per round you may **Peek**: press P, or click the **Peek** button above
  the cards. Every card shows for 1.5 seconds, then the board is exactly as it
  was: matched pairs, moves and a single card you had already turned up stay
  as they were. No card flips while a peek shows, and you can't peek while a
  mismatched pair is waiting to close. The button says whether your peek is
  still available or used.
- Below the cards, a **Forecast** shows the score you would finish with if
  every pair still hidden were matched on its first try from here, less the
  peek if you used it, never below 0. It is a forecast, not points already
  earned: each miss lowers it by 10, until it reaches 0. Under it, a short
  tag says what your last try did (a match and its symbol, or a miss and how
  much it lowered the forecast, with no number once the forecast was already
  0), and the top right shows
  pairs found and pairs left. The feedback starts empty in every new round.
- The round ends when all six pairs are found. The results show your moves,
  pairs matched and score. Press **Play again** (or Space or Enter) for a
  freshly shuffled round. Escape takes you back to the midway.

## Scoring

- Each try (every second card you flip) is one move, match or not.
- Finishing in 6 moves, the fewest possible, scores 300. Each move beyond 6
  costs 10 points: the score is `max(0, 300 - 10 * (moves - 6))`, so 36 moves
  or more scores 0.
- Using the peek takes 20 points off the final score, never below 0:
  `max(0, 300 - 10 * (moves - 6) - 20)`. The results say whether the peek was
  used. Every new round gets a fresh peek.

Your final score is saved to the carnival's score board once, when the round
ends. If the browser refuses to save it, the error goes to the console and the
results and **Play again** still work.

## Files

- `game.ts`: the game logic (`deal`, `createState`, `startRound`, `beginRound`,
  `flip`, `peek`, `isShown`, `step`, `scoreFor`, `scoreWithPeek`, `forecastScore`, `pairsLeft`, `lastTryText`, `finalScore`, `takeFinalScore`, `saveFinalScore`,
  `moveCursor`, `arrowFor`, `isActionKey`, `isPeekKey`, `onPeekButton`, `isPageControl`, `cardAt`,
  `onButton`, `seededRng`) and the `memoryMenagerie` entry the midway
  registers. `createState` takes an rng so tests can choose the shuffle.
- `game.test.ts`: tests for the game logic.
