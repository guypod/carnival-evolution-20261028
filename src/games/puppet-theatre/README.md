# Puppet Theatre

Pull the strings on two marionettes, a knight and a dragon, and act out a short
tale in three scenes. Nothing is timed: take as long as you like.

## How to play

Each scene's goal is shown in the caption at the top of the stage.

1. **The Meeting.** Walk the knight up to the dragon and make the knight wave.
2. **The Gift.** Drag a prop from the shelf and drop it at the dragon. The cake
   and the umbrella are gifts; the bell only annoys it.
3. **The Finale.** Bring both puppets to centre stage (the strip on the boards)
   and have both bow.

The gift you choose decides the ending: the cake and the umbrella each lead to
a different comic finale. Each one ends on its own still picture: after the
cake the knight is covered in frosting under a few sprinkles, and after the
umbrella the dragon holds it inside out overhead while confetti hangs across the
stage. The picture does not move, so it reads the same with motion turned down.

### The audience

Three small spectators sit in the front row, bottom left, under a row labelled
**Audience:** with a caption beside the label that says their mood in words.
They react only to what you perform, each thing once per performance. Each mood
has its own face shape, so it reads without colour:

| You perform                                | Audience  | Faces                                                 | Caption says             |
| ------------------------------------------ | --------- | ----------------------------------------------------- | ------------------------ |
| Nothing yet                                | patient   | dot eyes, flat mouth                                  | they wait patiently      |
| The knight meets the dragon (scene 1 ends) | surprised | tall eyes, raised brows, round open mouth, sit taller | they gasp at the meeting |
| The dragon takes a gift (scene 2 ends)     | amused    | eyes curved up, wide grin                             | they cheer the gift      |
| A puppet drops into the hide pose (a fall) | amused    | eyes curved up, wide grin                             | they laugh at the tumble |

Taking your time never upsets them, and a refused bell or a missed drop earns
nothing. Undo takes back the reaction with the event, and each new performance
starts with a patient audience. The faces are still drawings and the theatre
has no sound, so the reactions read the same with motion turned down or audio
off.

### Controls

| Pointer                               | Keyboard           | Does                                              |
| ------------------------------------- | ------------------ | ------------------------------------------------- |
| Press on a puppet or prop             | `1` to `5`         | Select it                                         |
| Drag left or right                    | `Left` / `Right`   | Move the selected puppet or prop                  |
| Pose buttons (stand, wave, bow, hide) | `Up` / `Down`      | Change the selected puppet's pose                 |
| Release a dragged prop                | `Space` or `Enter` | Drop the selected prop                            |
| Undo button                           | `Z`                | Undo the last change                              |
| Reset scene button                    | `R`                | Ask to put the current scene back to how it began |
| Yes, reset button (while asked)       | `Enter` or `Y`     | Reset the scene                                   |
| No button (while asked)               | `N`                | Keep the scene as it is                           |
| Rehearse in private / go live button  | `P`                | Lower or raise the rehearsal curtain              |
| Click after the curtain               | `Space` or `Enter` | Perform it again                                  |

Props stay on the shelf until the gift scene. A drag counts as one change for
undo, including a prop drop and any scene change it causes. Undo, a scene
reset or the rehearsal switch during a drag ends the drag.

### Rehearsal curtain

**Rehearse in private** (`P`) lowers the rehearsal curtain so you can practise
the current scene. While it is down the audience is away (their seats are empty and the
audience caption says so) and never reacts, no
scene ends (a move that would finish one is held back and the caption says so),
and nothing is saved. **Go live** (`P` again) puts the live performance back
exactly as you left it, with its undo history, so nothing practised carries
over. Leaving the theatre with Escape while rehearsing drops the rehearsal, and
you come back to the live performance.

**Reset scene** (`R`) asks first. While it asks, the Undo and Reset scene
buttons become **No** and **Yes, reset**, and everything else waits for the
answer: other keys, the rehearsal switch and any drag are ignored. A reset puts only the scene on stage back to how
it began, and can be undone. It keeps the endings you have found, and never
touches your scores or any other game. Reset during rehearsal resets the
rehearsal only.

In rehearsal, undo works within the scene on stage. It never goes back into an
earlier scene: it stops at the scene start, says so, and keeps the live undo
history untouched.

## Scoring

When the curtain falls, the performance records a score of how many of the two
endings you have found so far (1 or 2). Endings found are remembered with the
saved stage.

If the score cannot be saved, the curtain stays down and says so, with two
buttons. **Retry saving** (or `Space`/`Enter`) tries again, and once the save
works it records the score once and starts a new performance. **Play on
without saving** (or `N`) starts a new performance and drops that score, so it
is never recorded.

## Saved stage

The stage (scene, positions, poses, gift, endings found and the audience's reactions), and the stage as
the current scene began, are saved after every change under their own key,
separate from scores, and restored when you come back. A scene reset after a restore
still goes back to the start of the scene. A saved stage that is malformed is ignored and the play starts over.
