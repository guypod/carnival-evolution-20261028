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
  the hole the rod sits in sets the swing: too near the pivot swings short of the
  bell, too far thumps the rubber stop. The middle hole rings it. Loosen the pin
  again to move the rod.
- **Hopping Frog Automaton.** The frog sits on a rod whose foot stands on the
  cam, straight above the shaft, so the frog rises and falls with the cam's
  edge as it turns. A pebble in the cam track stalls the shaft as soon as the
  cam turns into it, and wedges the cam on it; lift it out with the tweezers.
  Then the round cam, a disc set off the shaft, only bobs the frog gently. The
  tall cam's lobe lifts it into the safety guard, which holds it while the rod
  drops away. The snail cam's spiral lifts it slowly, then the rod drops off
  the spiral's step: a hop. The frog is a crafted automaton: a riveted body
  with its legs folded up at its sides, big eyes on top, and a socket underneath
  that the rod's top fits into, so the rod is the only thing holding it up.

## Controls

- Toys: the three buttons above the bench pick the toy. Each one says in words
  whether that toy is repaired ("✓ Repaired" or "Not repaired yet"), and the toy
  on the bench also shows "▶ On the bench" and a heavier double outline.
- Pointer: drag a part onto a spot, or click a part then click a spot. A press
  released without moving is a click, so the part stays in hand. A part
  dropped on a taken spot swaps with the part there. Click a pin or pebble with
  the screwdriver or tweezers chosen. A part is drawn at its own size wherever
  it sits, every tray spot has room for the largest part, and a click picks the
  part drawn on top under the pointer, by its teeth or lobe as drawn, turning
  or still. A click in a tooth valley with no other part showing there still
  picks up that gear.
- Keyboard: focus the bench, then the arrow keys step through parts, fixtures
  and empty spots, and Enter or Space acts on the ringed one. 1, 2 and 3 choose
  the hand, screwdriver and tweezers. T tests, I inspects (see below), U undoes, R resets the toy to the
  faults it came in with (Undo brings the work back), and Escape puts a held
  part down or goes back to the midway.
- With Quiet midway or the system's reduced motion, a test shows one still
  frame instead of animating. For the frog it is the frame that explains the
  result: the cam pressed on the pebble, the round cam at the top of its bob,
  the frog held by the guard, or the rod at the top of the snail's spiral. The words under the bench always say what
  happened. For the bell it is the lever at full pull.
- The bench's holes and the rod ride the bell lever as it turns, and clicks,
  drops and the keyboard ring follow them to wherever they are drawn, during a
  test run and in the still frame.

## Inspecting a toy

Inspect step (I) is a slow, untimed crank. The first press stops any test that
is animating and holds the same run the Test button uses at its first step: the
crank a sixteenth of the way through the run (an eighth of a turn, or a little
way into the lever's pull), not at rest. Each press after that turns the crank
(or pulls the lever) one step further, in 8 even steps that wrap round, so
gears, lever, rod, cam and frog stand where a test would carry them, Quiet or
not. A frog shaft that will stall on the pebble shows as turning until the cam
actually meets the pebble, and stalled from that step on. Clicks and the keyboard ring
follow the parts to where they are drawn at that step.

On the bench, every part along the drive gets a numbered arrow with words:
"turns with crank", "turns against crank", "swings", "stops here" (with a cross
on the part where the motion stops) or "still" for the parts past it. Turning
gears also get a curved arrow showing which way they turn. Nothing rests on
colour alone. The words under the bench sum it up, for example "Inspect step 1
of 8: motion passes the crank gear, medium gear and stops at the bear gear."
The bench's accessible name adds what the rig says about the ringed part.

A loose bell shows the lever and the rod's end in its hole moving, while the
hammer stays still: the rod slides on the loose pivot pin, so its push never
reaches the hammer.

Press Test to leave the inspection and run the toy normally. Any move, tool use,
Undo (even one with nothing to undo), Reset or toy switch clears the inspection
or a running test, even one that puts the toy back as it was, such as picking a
part up and putting it back in its own spot, so the next press starts at step 1. Inspecting changes nothing and
never records a repair; only Test does.

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
