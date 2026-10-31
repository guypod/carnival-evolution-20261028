import { describe, expect, it } from 'vitest';
import {
  createGarden,
  gardenInReach,
  GUST_SPIN,
  GUST_STAGGER,
  raiseGust,
  turnWheels,
  wheelState,
} from './pinwheels';

const garden = createGarden({ x: 10, y: 10 }, 3);

describe('pinwheel garden', () => {
  it('stays still before any gust', () => {
    expect(wheelState(garden, 0, 5)).toBe('still');
    expect(turnWheels([0, 0, 0], garden, 5, 0.1, false)).toEqual([0, 0, 0]);
  });

  it('turns the wheels in sequence, then lets each settle', () => {
    const gusty = raiseGust(garden, 1);
    const early = 1 + GUST_STAGGER / 2;
    expect([0, 1, 2].map((i) => wheelState(gusty, i, early))).toEqual([
      'turning',
      'still',
      'still',
    ]);
    const later = 1 + GUST_STAGGER * 2 + 0.01;
    expect([0, 1, 2].map((i) => wheelState(gusty, i, later))).toEqual([
      'turning',
      'turning',
      'turning',
    ]);
    const done = 1 + GUST_STAGGER * 2 + GUST_SPIN + 0.01;
    expect([0, 1, 2].map((i) => wheelState(gusty, i, done))).toEqual([
      'settled',
      'settled',
      'settled',
    ]);
    expect(turnWheels([1, 2, 3], gusty, done, 0.1, false)).toEqual([1, 2, 3]);
  });

  it('starts over from the first wheel when activated again', () => {
    const first = raiseGust(garden, 1);
    const again = raiseGust(first, 2);
    expect(wheelState(again, 0, 2.01)).toBe('turning');
    expect(wheelState(again, 2, 2.01)).toBe('still');
  });

  it('holds the wheels still in quiet mode but still tells the sequence', () => {
    const gusty = raiseGust(garden, 0);
    expect(turnWheels([0.5, 0.5, 0.5], gusty, 0.1, 0.05, true)).toEqual([0.5, 0.5, 0.5]);
    expect(wheelState(gusty, 0, 0.1)).toBe('turning');
    const moving = turnWheels([0, 0, 0], gusty, 0.1, 0.05, false);
    expect(moving[0]).toBeGreaterThan(0);
  });

  it('is in reach only near the wheels, so walking away leaves it', () => {
    expect(gardenInReach(garden, { x: 10.5, y: 10.5 })).toBe(true);
    expect(gardenInReach(garden, { x: 20, y: 10 })).toBe(false);
  });
});
