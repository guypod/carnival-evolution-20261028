# Coaster Workshop

Shape a small side-view coaster track, then test it. This is a toy model with
made-up gravity, drag and a speed limit. It says nothing about real coasters.

## How to play

- The track runs through seven control points. Click a point and drag it up or
  down, or pick one with the left and right arrow keys and move it with up and
  down.
- Press T to test. The train leaves the station slowly, speeds up going
  downhill and slows going uphill on the exact track you drew.
- P pauses or resumes a test, S steps it one tick at a time, Esc stops it.
- U undoes the last change. R puts this layout back to the starter (undo can
  bring yours back). Any change ends the current test.
- Your layout is kept while the page stays open, so you can leave the booth and
  come back to it.
- With reduced motion turned on, a test shows the result straight away, with dots
  for where the train was every half second, instead of a moving train.

## Outcomes

- **Safe finish**: the train reaches the end without passing the speed limit.
- **Stalled**: the train ran out of speed before the end. A red ring marks where.
- **Too fast**: the train passed the speed limit. A red ring marks where.

## Scoring

A safe finish scores the train's top speed as a percentage of the speed limit,
so a fast but safe track scores the most. A stall or a too-fast run scores 0.
The score is recorded when a test ends.
