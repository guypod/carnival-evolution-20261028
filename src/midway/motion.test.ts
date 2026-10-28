import { describe, expect, it } from 'vitest';
import {
  advanceSceneClock,
  REDUCED_MOTION_QUERY,
  watchReducedMotion,
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
