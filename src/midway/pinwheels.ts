/**
 * The pinwheel garden: a little cluster of pinwheels beside the entrance path.
 * Walk up and press G, or tap a wheel, for a gentle gust that turns them one
 * after another and lets each settle. It keeps no score. In quiet mode the
 * wheels hold still and a dot lights over each in turn instead.
 */

import type { Point } from './world';

/** Seconds between one wheel catching the gust and the next. */
export const GUST_STAGGER = 0.35;
/** Seconds a wheel turns before it has settled. */
export const GUST_SPIN = 2.4;
/** How close, in tiles, the player stands to raise a gust. */
export const GARDEN_REACH = 1.6;

export interface PinwheelGarden {
  wheels: Point[];
  /** When the latest gust started, on the gust clock, or undefined before any. */
  gustAt: number | undefined;
}

/** A row of wheels set on the grass by `anchor`, in tile coordinates. */
export function createGarden(anchor: Point, count = 5): PinwheelGarden {
  const wheels = Array.from({ length: count }, (_, i) => ({
    x: anchor.x + i * 0.45,
    y: anchor.y + (i % 2) * 0.35,
  }));
  return { wheels, gustAt: undefined };
}

/** Starts a fresh gust. A gust while one is still blowing starts again from the first wheel. */
export function raiseGust(garden: PinwheelGarden, now: number): PinwheelGarden {
  return { ...garden, gustAt: now };
}

export type WheelState = 'still' | 'turning' | 'settled';

/** Where wheel `i` is in the gust: not reached yet, turning, or settled again. */
export function wheelState(garden: PinwheelGarden, i: number, now: number): WheelState {
  if (garden.gustAt === undefined) return 'still';
  const since = now - garden.gustAt - i * GUST_STAGGER;
  if (since < 0) return 'still';
  return since < GUST_SPIN ? 'turning' : 'settled';
}

/** How fast wheel `i` turns, in turns per second: quick as the gust reaches it, easing to nothing. */
export function wheelSpeed(garden: PinwheelGarden, i: number, now: number): number {
  if (wheelState(garden, i, now) !== 'turning') return 0;
  const since = now - garden.gustAt! - i * GUST_STAGGER;
  const left = 1 - since / GUST_SPIN;
  return 1.6 * left * left;
}

/** Turns every wheel on by `dt` seconds. In quiet mode they hold their angle. */
export function turnWheels(
  angles: readonly number[],
  garden: PinwheelGarden,
  now: number,
  dt: number,
  quiet: boolean,
): number[] {
  return angles.map((angle, i) =>
    quiet ? angle : angle + wheelSpeed(garden, i, now) * dt * Math.PI * 2,
  );
}

/** Whether the player is close enough to the garden to raise a gust. */
export function gardenInReach(garden: PinwheelGarden, player: Point, reach = GARDEN_REACH) {
  return garden.wheels.some((w) => Math.hypot(w.x - player.x, w.y - player.y) <= reach);
}
