/**
 * Quiet mode: when someone asks their system for reduced motion, the midway's
 * decoration holds still. Clouds, rides, flags, bobbing balloons, rising
 * floaters and strolling visitors stop; the player still walks, follows paths
 * and opens booths at full speed.
 */

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** The part of `window` quiet mode needs, so tests can pass a fake. */
export interface MotionHost {
  matchMedia?: (query: string) => MotionQuery;
}

/** A `MediaQueryList`, including the old `addListener` API some browsers still have. */
export interface MotionQuery {
  matches: boolean;
  addEventListener?: (type: 'change', listener: (event: { matches: boolean }) => void) => void;
  removeEventListener?: (type: 'change', listener: (event: { matches: boolean }) => void) => void;
  addListener?: (listener: (event: { matches: boolean }) => void) => void;
  removeListener?: (listener: (event: { matches: boolean }) => void) => void;
}

/**
 * Reports the reduced-motion preference now and whenever it changes, and
 * returns a function that stops listening. Without `matchMedia`, the midway
 * stays lively and nothing is listened to.
 */
export function watchReducedMotion(
  host: MotionHost,
  onChange: (quiet: boolean) => void,
): () => void {
  let query: MotionQuery | undefined;
  try {
    query = host.matchMedia?.(REDUCED_MOTION_QUERY);
  } catch {
    query = undefined;
  }
  if (!query) {
    onChange(false);
    return () => {};
  }
  const listener = (event: { matches: boolean }) => onChange(event.matches);
  onChange(query.matches);
  if (query.addEventListener && query.removeEventListener) {
    query.addEventListener('change', listener);
    return () => query.removeEventListener!('change', listener);
  }
  if (query.addListener && query.removeListener) {
    query.addListener(listener);
    return () => query.removeListener!(listener);
  }
  return () => {};
}

/**
 * The clock the scenery animates by. It stands still in quiet mode, so every
 * ride and flag holds its pose, and picks up where it left off afterwards.
 */
export function advanceSceneClock(clock: number, dt: number, quiet: boolean): number {
  return quiet ? clock : clock + dt;
}
