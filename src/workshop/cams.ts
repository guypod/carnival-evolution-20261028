/**
 * The hopping frog's cams as plain geometry, so the bench drawing, the midway
 * toy and the tests all use one profile. A cam turns clockwise on screen
 * about the shaft. The follower is a vertical rod with a knife edge, standing
 * on the line straight above the shaft, so it touches the cam where the cam's
 * outline crosses that line and its lift is that radius minus the smallest
 * one. This is a small toy model, not a physics engine.
 */

export type CamShape = 'round' | 'snail' | 'tall';

/** Every cam's radius at its lowest point: where the follower rests when not lifted. */
export const CAM_BASE = 12;
/** The round cam: a disc of this radius, set this far off the shaft. */
const ROUND_R = 18;
const ROUND_OFFSET = 6;
/** How far the snail cam's spiral and the tall cam's lobe climb above the base. */
const SNAIL_RISE = 18;
const TALL_RISE = 22;

/** Where each test's still frame sits: one turn of the shaft takes this share of a run. */
export const TURNS_PER_RUN = 2;

/**
 * The cam's radius in direction `a`, measured in the cam's own frame (the
 * frame it is drawn in before it turns), with canvas angles: 0 points right
 * and positive angles turn clockwise on screen.
 */
export function camRadius(cam: CamShape, a: number): number {
  if (cam === 'round') {
    // The disc's centre sits ROUND_OFFSET down from the shaft in the cam's frame.
    const off = a - Math.PI / 2;
    const s = ROUND_OFFSET * Math.sin(off);
    return ROUND_OFFSET * Math.cos(off) + Math.sqrt(ROUND_R ** 2 - s ** 2);
  }
  if (cam === 'snail') return CAM_BASE + SNAIL_RISE * snailShare(a);
  // The tall lobe points down in the cam's frame and has a flat top where it is widest.
  const c = Math.max(0, Math.cos(a - Math.PI / 2));
  return CAM_BASE + TALL_RISE * Math.min(1, 1.6 * c);
}

/**
 * How far round the snail's spiral `a` is, 0 to 1: it climbs steadily the way
 * the follower meets it as the cam turns, then drops back at a step.
 */
function snailShare(a: number): number {
  const u = (-a - Math.PI / 2) / (Math.PI * 2);
  return u - Math.floor(u);
}

/** How far each cam reaches from the shaft at its widest. */
export const CAM_REACH: Record<CamShape, number> = {
  round: ROUND_R + ROUND_OFFSET,
  snail: CAM_BASE + SNAIL_RISE,
  tall: CAM_BASE + TALL_RISE,
};

/** The cam's outline after `turns` turns, as points around a shaft at (0, 0). */
export function camOutline(cam: CamShape, turns: number, steps = 96): { x: number; y: number }[] {
  const spin = turns * Math.PI * 2;
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    // The snail is traced from its step round to the step again, so the drop is a straight edge.
    const a =
      cam === 'snail' ? -Math.PI / 2 - (i / steps) * Math.PI * 2 : (i / steps) * Math.PI * 2;
    const r = cam === 'snail' ? CAM_BASE + SNAIL_RISE * (i / steps) : camRadius(cam, a);
    out.push({ x: Math.cos(a + spin) * r, y: Math.sin(a + spin) * r });
  }
  return out;
}

/** The cam's radius in a direction `a` on screen after `turns` turns. */
export function camReachAt(cam: CamShape, turns: number, a: number): number {
  return camRadius(cam, a - turns * Math.PI * 2);
}

/**
 * How far the follower is lifted above its rest after `turns` turns: the
 * radius of the cam straight above the shaft, less the base. With no cam the
 * rod rests on its collar at the same height as the base.
 */
export function followerLift(cam: CamShape | undefined, turns: number): number {
  if (!cam) return 0;
  return camReachAt(cam, turns, -Math.PI / 2) - CAM_BASE;
}

/**
 * The frog sits on top of the follower. The safety guard is a catch placed
 * where the frog's head arrives when the follower is lifted GUARD_LIFT: only
 * the tall cam reaches that. Once caught, the frog hangs on the guard while
 * the follower drops away beneath it.
 */
export const GUARD_LIFT = TALL_RISE;

/** The first point of a turn, from 0, where the follower reaches the guard; undefined if it never does. */
export function guardTurn(cam: CamShape | undefined): number | undefined {
  for (let i = 0; i <= 1440; i++)
    if (followerLift(cam, i / 1440) >= GUARD_LIFT - 1e-9) return i / 1440;
  return undefined;
}

/**
 * The pebble in the cam track, up and to the left of the shaft, in pixels from
 * the shaft. At rest every cam is narrow on that side and clears it, and each
 * one's wider part turns into it within its first half turn.
 */
export const PEBBLE = { dx: -18.4, dy: -16.9, r: 7 };

/** The gap between the cam's outline and the pebble after `turns` turns. Below zero they overlap. */
export function pebbleGap(cam: CamShape | undefined, turns: number): number {
  const d = Math.hypot(PEBBLE.dx, PEBBLE.dy);
  if (!cam) return d - PEBBLE.r;
  return d - PEBBLE.r - camReachAt(cam, turns, Math.atan2(PEBBLE.dy, PEBBLE.dx));
}

/** How far the cam turns before it presses on the pebble and the shaft stalls. */
export function stallTurn(cam: CamShape | undefined): number {
  if (!cam) return 0;
  for (let i = 0; i <= 1440; i++) if (pebbleGap(cam, i / 1440) <= 0) return i / 1440;
  return 1;
}

/** Where the frog's mechanism stands at a point of a test run. */
export interface FrogPose {
  /** How far the shaft has turned. */
  turns: number;
  /** The follower's lift above its rest. */
  lift: number;
  /** The frog's lift: the follower's, or the guard's height once it is caught. */
  frogLift: number;
  caught: boolean;
}

/**
 * The frog's pose `phase` (0 to 1) through a test run. A stalled shaft stops
 * where the cam meets the pebble. A frog the tall cam pushed into the guard
 * stays caught for the rest of the run.
 */
export function frogPose(cam: CamShape | undefined, phase: number, stalled: boolean): FrogPose {
  const free = phase * TURNS_PER_RUN;
  const turns = stalled ? Math.min(free, stallTurn(cam)) : free;
  const lift = followerLift(cam, turns);
  const catchAt = stalled ? undefined : guardTurn(cam);
  const caught = catchAt !== undefined && turns >= catchAt;
  return { turns, lift, frogLift: caught ? GUARD_LIFT : lift, caught };
}

/** The follower rod's length, foot to the frog's seat, and the frog's size, in bench pixels. */
export const FOLLOWER_ROD = 50;
export const FROG_HALF_HEIGHT = 14;
/** The frog's eyes stand this far above its body's centre. */
const FROG_EYES_TOP = 17;

/**
 * Heights for drawing the frog, in pixels from the shaft (negative is up): the
 * follower's foot on the cam, the top of its rod, the frog's centre, and the
 * underside of the safety guard, which sits just where the frog's eyes meet it
 * at the guard's lift.
 */
export function frogRig(pose: Pick<FrogPose, 'lift' | 'frogLift'>) {
  const foot = -(CAM_BASE + pose.lift);
  const seat = (lift: number) => -(CAM_BASE + lift) - FOLLOWER_ROD;
  return {
    foot,
    rodTop: foot - FOLLOWER_ROD,
    frog: seat(pose.frogLift) - FROG_HALF_HEIGHT,
    guard: seat(GUARD_LIFT) - FROG_HALF_HEIGHT - FROG_EYES_TOP,
  };
}

/**
 * The run phase a still frame (Quiet midway or reduced motion) shows, chosen so
 * the one frame explains the outcome: a stalled cam pressed on the pebble, the
 * round cam at the top of its bob, the tall cam's frog held by the guard, and
 * the snail's follower at the top of its spiral, about to drop off the step.
 */
export function stillPhase(cam: CamShape | undefined, stalled: boolean): number {
  if (stalled) return 1 / TURNS_PER_RUN;
  return (cam === 'snail' ? 0.97 : 0.5) / TURNS_PER_RUN;
}

/** A circle or an ellipse of the frog's drawing, in bench pixels. */
export interface FrogBlob {
  x: number;
  y: number;
  rx: number;
  ry: number;
}

/**
 * The frog's crafted parts around its centre `frogY`, for drawing. The body
 * and the eye bumps keep the frog's old outline, so its bottom is the seat on
 * the rod and its eye tops are what meets the safety guard. The mount is a
 * socket set into the underside of the body where the rod's top goes in, so
 * the rod is the only thing the frog rests on. The legs and feet are folded
 * up beside the body and stop short of its bottom, so they touch nothing.
 */
export function frogFigure(frogY: number) {
  const bottom = frogY + FROG_HALF_HEIGHT;
  const eye = (side: -1 | 1): FrogBlob => ({ x: 12 * side, y: frogY - 12, rx: 5, ry: 5 });
  const haunch = (side: -1 | 1): FrogBlob => ({ x: 22 * side, y: frogY + 3, rx: 9, ry: 7 });
  const foot = (side: -1 | 1): FrogBlob => ({ x: 27 * side, y: bottom - 5, rx: 7, ry: 2.5 });
  return {
    body: { x: 0, y: frogY, rx: 26, ry: FROG_HALF_HEIGHT },
    eyes: [eye(-1), eye(1)],
    pupils: [-1, 1].map((side) => ({ x: 12 * side, y: frogY - 12, rx: 2, ry: 2 })),
    haunches: [haunch(-1), haunch(1)],
    feet: [foot(-1), foot(1)],
    /** The mouth: an arc across the face, between the eyes and the body's middle. */
    mouth: { x: 0, y: frogY - 4, r: 9 },
    /** A seam across the body and the rivets along it. */
    seam: frogY + 2,
    rivets: [-16, -8, 8, 16].map((dx) => ({ x: dx, y: frogY + 2, rx: 1.5, ry: 1.5 })),
    /** The follower socket: open at the bottom, flush with the seat. */
    mount: { x: -6, y: bottom - 8, width: 12, height: 8 },
  };
}
