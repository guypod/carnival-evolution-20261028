# Parade Composer

Open it from the Visitor Guide's Destinations (`#/parade`).

- Pick 3 to 5 floats. Duck, Ring, Lantern and Music are free. Balloon, Bell
  and Mole unlock when Balloon Darts, High Striker or Mole Mayhem has a score.
  Unlocking reads scores only and never changes them.
- Reorder with the ↑ and ↓ buttons, remove with ✕ (all keyboard reachable).
- Choose a cadence: Stroll, March or Dance. Each changes the spacing, speed and
  sway of the floats, and the timeline line under the route says how long the
  parade runs.
- Play, Pause, Restart and End control the procession from the start gate to
  the finale stage. Escape returns to the midway.
- Save parade keeps the composition in this browser. A save that cannot be read
  loads the starter parade and is left in place. A saved float that is locked
  now is replaced by a starter.
- In quiet mode (Quiet midway or the system's reduced motion) nothing animates:
  Previous step and Next step walk a storyboard, one still frame per float plus
  the start and the finale.

No sound plays. The logic is in `parade.ts` and tested in `parade.test.ts`.
