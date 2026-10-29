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

### Controls

| Pointer                               | Keyboard           | Does                                       |
| ------------------------------------- | ------------------ | ------------------------------------------ |
| Press on a puppet or prop             | `1` to `5`         | Select it                                  |
| Drag left or right                    | `Left` / `Right`   | Move the selected puppet or prop           |
| Pose buttons (stand, wave, bow, hide) | `Up` / `Down`      | Change the selected puppet's pose          |
| Release a dragged prop                | `Space` or `Enter` | Drop the selected prop                     |
| Undo button                           | `Z`                | Undo the last change                       |
| Rehearse button                       | `R`                | Put the current scene back to how it began |
| Click after the curtain               | `Space` or `Enter` | Perform it again                           |

Props stay on the shelf until the gift scene. A drag counts as one change for
undo, including a prop drop and any scene change it causes. Undo or Rehearse
during a drag ends the drag.

## Scoring

When the curtain falls, the performance records a score of how many of the two
endings you have found so far (1 or 2). Endings found are remembered with the
saved stage.

## Saved stage

The stage (scene, positions, poses, gift and endings found), and the stage as
the current scene began, are saved after every change under their own key,
separate from scores, and restored when you come back. Rehearse after a restore
still goes back to the start of the scene. A saved stage that is malformed is ignored and the play starts over.
