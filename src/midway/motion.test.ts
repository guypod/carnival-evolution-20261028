import { describe, expect, it } from 'vitest';
import {
  advanceSceneClock,
  createMotionPreference,
  isQuiet,
  MOTION_KEY,
  motionToggleState,
  nextMotionPreference,
  REDUCED_MOTION_QUERY,
  watchReducedMotion,
  type MotionPreference,
  type MotionQuery,
} from './motion';

type Listener = (event: { matches: boolean }) => void;

function modernQuery(matches: boolean) {
  const listeners = new Set<Listener>();
  const query: MotionQuery = {
    matches,
    addEventListener: (_type, l) => listeners.add(l),
    removeEventListener: (_type, l) => listeners.delete(l),
  };
  return { query, listeners, change: (m: boolean) => listeners.forEach((l) => l({ matches: m })) };
}

describe('advanceSceneClock', () => {
  it('runs with time normally', () => {
    expect(advanceSceneClock(2, 0.5, false)).toBe(2.5);
  });

  it('holds still in quiet mode, so scenery keeps one pose', () => {
    let clock = 3;
    for (let i = 0; i < 100; i++) clock = advanceSceneClock(clock, 0.016, true);
    expect(clock).toBe(3);
  });

  it('carries on from where it stopped when quiet mode ends', () => {
    const held = advanceSceneClock(advanceSceneClock(1, 0.5, false), 10, true);
    expect(advanceSceneClock(held, 0.25, false)).toBe(1.75);
  });
});

describe('watchReducedMotion', () => {
  it('asks for the reduced-motion preference and reports it straight away', () => {
    const asked: string[] = [];
    const seen: boolean[] = [];
    watchReducedMotion(
      {
        matchMedia: (q) => {
          asked.push(q);
          return modernQuery(true).query;
        },
      },
      (quiet) => seen.push(quiet),
    );
    expect(asked).toEqual([REDUCED_MOTION_QUERY]);
    expect(seen).toEqual([true]);
  });

  it('follows changes while running and stops listening when stopped', () => {
    const fake = modernQuery(false);
    const seen: boolean[] = [];
    const stop = watchReducedMotion({ matchMedia: () => fake.query }, (q) => seen.push(q));
    fake.change(true);
    fake.change(false);
    expect(seen).toEqual([false, true, false]);
    stop();
    expect(fake.listeners.size).toBe(0);
    fake.change(true);
    expect(seen).toEqual([false, true, false]);
  });

  it('uses the older addListener API when that is all there is', () => {
    const listeners = new Set<Listener>();
    const seen: boolean[] = [];
    const stop = watchReducedMotion(
      {
        matchMedia: () => ({
          matches: false,
          addListener: (l) => listeners.add(l),
          removeListener: (l) => listeners.delete(l),
        }),
      },
      (q) => seen.push(q),
    );
    listeners.forEach((l) => l({ matches: true }));
    expect(seen).toEqual([false, true]);
    stop();
    expect(listeners.size).toBe(0);
  });

  it('stays lively without matchMedia, or when it throws', () => {
    const seen: boolean[] = [];
    watchReducedMotion({}, (q) => seen.push(q))();
    watchReducedMotion(
      {
        matchMedia: () => {
          throw new Error('unsupported');
        },
      },
      (q) => seen.push(q),
    )();
    expect(seen).toEqual([false, false]);
  });

  it('still reports the preference when the query cannot be listened to', () => {
    const seen: boolean[] = [];
    const stop = watchReducedMotion({ matchMedia: () => ({ matches: true }) }, (q) => seen.push(q));
    expect(seen).toEqual([true]);
    expect(() => stop()).not.toThrow();
  });
});

function memory(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => void (data[key] = value),
  };
}

describe('isQuiet', () => {
  it('follows the system by default', () => {
    expect(isQuiet('system', false)).toBe(false);
    expect(isQuiet('system', true)).toBe(true);
  });

  it('is quiet when Quiet is chosen, whatever the system says', () => {
    expect(isQuiet('quiet', false)).toBe(true);
    expect(isQuiet('quiet', true)).toBe(true);
  });

  it('tracks a system change while following, and ignores it while quiet', () => {
    const seen: boolean[] = [];
    const fake = modernQuery(false);
    let preference: MotionPreference = 'system';
    let system = false;
    const stop = watchReducedMotion({ matchMedia: () => fake.query }, (reduce) => {
      system = reduce;
      seen.push(isQuiet(preference, system));
    });
    fake.change(true);
    fake.change(false);
    preference = nextMotionPreference(preference);
    fake.change(false);
    fake.change(true);
    preference = nextMotionPreference(preference);
    fake.change(false);
    expect(seen).toEqual([false, true, false, true, true, false]);
    stop();
  });
});

describe('motion preference', () => {
  it('starts by following the system and remembers Quiet', () => {
    const storage = memory();
    const pref = createMotionPreference(storage);
    expect(pref.load()).toBe('system');
    expect(pref.save('quiet')).toBe(true);
    expect(storage.data[MOTION_KEY]).toBe('quiet');
    expect(pref.load()).toBe('quiet');
    expect(pref.save('system')).toBe(true);
    expect(pref.load()).toBe('system');
  });

  it('reads unknown values as following the system', () => {
    expect(createMotionPreference(memory({ [MOTION_KEY]: 'loud' })).load()).toBe('system');
  });

  it('falls back to the system when storage is missing or throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
    };
    expect(createMotionPreference(undefined).load()).toBe('system');
    expect(createMotionPreference(undefined).save('quiet')).toBe(false);
    expect(createMotionPreference(broken).load()).toBe('system');
    expect(createMotionPreference(broken).save('quiet')).toBe(false);
  });
});

describe('motion toggle', () => {
  it('switches between following the system and Quiet', () => {
    expect(nextMotionPreference('system')).toBe('quiet');
    expect(nextMotionPreference('quiet')).toBe('system');
  });

  it('keeps one toggle name, with pressed meaning Quiet is chosen', () => {
    expect(motionToggleState('system')).toEqual({ label: '🤫 Quiet midway', pressed: false });
    expect(motionToggleState('quiet')).toEqual({ label: '🤫 Quiet midway', pressed: true });
  });
});
