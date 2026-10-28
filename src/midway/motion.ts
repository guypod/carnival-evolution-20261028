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

/**
 * The visitor's own choice from the guide. "system" follows the reduced-motion
 * setting above; "quiet" holds the decoration still whatever the system says.
 */
export type MotionPreference = 'system' | 'quiet';

export const MOTION_KEY = 'tessl-carnival:motion';

type MotionStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function createMotionPreference(storage: MotionStorage | undefined) {
  /** The saved choice. Missing, unreadable or unknown values follow the system. */
  function load(): MotionPreference {
    try {
      return storage?.getItem(MOTION_KEY) === 'quiet' ? 'quiet' : 'system';
    } catch {
      return 'system';
    }
  }

  /** Saves the choice, and returns whether the write worked. */
  function save(preference: MotionPreference): boolean {
    try {
      if (!storage) return false;
      storage.setItem(MOTION_KEY, preference);
      return true;
    } catch {
      return false;
    }
  }

  return { load, save };
}

/** Whether the midway is quiet, given the visitor's choice and the system's. */
export function isQuiet(preference: MotionPreference, systemReduces: boolean): boolean {
  return preference === 'quiet' || systemReduces;
}

export function nextMotionPreference(preference: MotionPreference): MotionPreference {
  return preference === 'system' ? 'quiet' : 'system';
}

/**
 * The quiet toggle's state. The name stays "Quiet midway" either way, and
 * `pressed` says whether Quiet is chosen; unpressed means follow the system.
 */
export function motionToggleState(preference: MotionPreference): {
  label: string;
  pressed: boolean;
} {
  return { label: '🤫 Quiet midway', pressed: preference === 'quiet' };
}

function browserStorage(): MotionStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export const motionPreference = createMotionPreference(
  typeof window === 'undefined' ? undefined : browserStorage(),
);
