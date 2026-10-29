# Backstage Repair Workshop

Open it from the Visitor Guide's Destinations (`#/workshop`). It is optional:
no booth needs it, nothing is timed and nothing is scored.

Three wind-up toys come in broken. Each test runs a small, fixed model of the
toy's mechanism, so what moves follows from where the parts are.

- **Dancing Bear Music Box.** A crank gear and the bear's gear sit at either
  end of five pegs. Gears that touch turn each other the opposite way, so a gap
  leaves the bear still, two gears that overlap jam (a slip clutch gives way),
  and two idler gears spin the bear backwards. One large gear in the middle peg
  makes it dance.
- **Rooster Bell.** A lever drives the hammer through a link rod. While the
  pivot pin is loose the rod just slides. Tighten it with the screwdriver, and
  the hole the rod sits in sets the swing: too near the pivot only taps the
  bell, too far thumps the rubber stop. The middle hole rings it. Loosen the pin
  again to move the rod.
- **Hopping Frog Automaton.** The frog sits on a rod whose foot stands on the
  cam, straight above the shaft, so the frog rises and falls with the cam's
  edge as it turns. A pebble in the cam track stalls the shaft as soon as the
  cam turns into it, and wedges the cam on it; lift it out with the tweezers.
  Then the round cam, a disc set off the shaft, only bobs the frog gently. The
  tall cam's lobe lifts it into the safety guard, which holds it while the rod
  drops away. The snail cam's spiral lifts it slowly, then the rod drops off
  the spiral's step: a hop.

## Controls

- Pointer: drag a part onto a spot, or click a part then click a spot. A press
  released without moving is a click, so the part stays in hand. A part
  dropped on a taken spot swaps with the part there. Click a pin or pebble with
  the screwdriver or tweezers chosen. A part is drawn at its own size wherever
  it sits, every tray spot has room for the largest part, and a click picks the
  part drawn on top under the pointer.
- Keyboard: focus the bench, then the arrow keys step through parts, fixtures
  and empty spots, and Enter or Space acts on the ringed one. 1, 2 and 3 choose
  the hand, screwdriver and tweezers. T tests, U undoes, R resets the toy to the
  faults it came in with (Undo brings the work back), and Escape puts a held
  part down or goes back to the midway.
- With Quiet midway or the system's reduced motion, a test shows one still
  frame instead of animating. For the frog it is the frame that explains the
  result: the cam pressed on the pebble, the round cam at the top of its bob,
  the frog held by the guard, or the rod at the top of the snail's spiral. The words under the bench always say what
  happened.

## Repairs and the midway

A toy counts as repaired the first time its own test works. Repairs are saved
in this browser under `tessl-carnival:repair-workshop` through the shared save
slot. A save that cannot be read loads as no repairs, and a saved toy whose
set-up the model says does not work is dropped while the rest are kept. When
the browser will not save, the workshop says so. Switching toys keeps each
bench's work and undo for the visit; only repairs outlast it.

Each repaired toy stands on the grass beside the midway entrance and plays
(the bear turns, the rooster rings, the frog hops; still in quiet mode). The
"Show repaired toys" box puts them away again. They block no path or booth, and
scores are never read or changed.

The logic is in `workshop.ts` and tested in `workshop.test.ts`. The midway side
is `src/midway/repaired-toys.ts`.
