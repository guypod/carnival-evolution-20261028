import { describe, expect, it } from 'vitest';
import {
  MAX_WINDS,
  REST_X,
  RESTING_TOY,
  WALK_MS_PER_WIND,
  applyToy,
  describeToy,
  pickToy,
  toyPosition,
  walkDuration,
} from './desk-toy';
import type { RoomObject } from './prize-room';

const duck = (owned: boolean): RoomObject => ({
  id: 'duck-dash:bronze',
  name: 'Squeaky Rubber Duck',
  shape: 'duck',
  color: 'accent',
  source: 'Duck Dash, Bronze',
  owned,
});

describe('desk toy', () => {
  it('winds up to the limit and no further', () => {
    let toy = RESTING_TOY;
    for (let i = 0; i < MAX_WINDS + 3; i++) toy = applyToy(toy, 'wind');
    expect(toy).toEqual({ phase: 'wound', winds: MAX_WINDS });
  });

  it('walks only once wound, then returns to rest', () => {
    expect(applyToy(RESTING_TOY, 'release')).toBe(RESTING_TOY);
    const walking = applyToy(applyToy(RESTING_TOY, 'wind'), 'release');
    expect(walking).toEqual({ phase: 'walking', winds: 1 });
    expect(applyToy(walking, 'wind')).toBe(walking);
    expect(walkDuration(walking)).toBe(WALK_MS_PER_WIND);
    expect(applyToy(walking, 'finish')).toEqual(RESTING_TOY);
  });

  it('resets from any phase', () => {
    const wound = applyToy(applyToy(RESTING_TOY, 'wind'), 'wind');
    expect(applyToy(wound, 'reset')).toEqual(RESTING_TOY);
    expect(applyToy(applyToy(wound, 'release'), 'reset')).toEqual(RESTING_TOY);
  });

  it('follows a bounded path that starts and ends at rest', () => {
    expect(toyPosition(0, 2).x).toBe(REST_X);
    expect(toyPosition(1, 2).x).toBe(REST_X);
    expect(toyPosition(0.25, 2).facing).toBe(1);
    expect(toyPosition(0.75, 2).facing).toBe(-1);
    const far = toyPosition(0.5 - 1e-9, MAX_WINDS + 5).x;
    expect(far).toBeLessThanOrEqual(toyPosition(0.5 - 1e-9, MAX_WINDS).x);
  });

  it('uses an owned duck, else a demonstration that grants nothing', () => {
    expect(pickToy([duck(true)])).toEqual({ name: 'Squeaky Rubber Duck', demo: false });
    expect(pickToy([duck(false)])).toEqual({ name: 'Demo Wind-up Duck', demo: true });
  });

  it('describes each phase in words, for the Quiet view', () => {
    expect(describeToy(RESTING_TOY, 'Duck')).toMatch(/rests/);
    expect(describeToy({ phase: 'wound', winds: 2 }, 'Duck')).toMatch(/2 of 3/);
    expect(describeToy({ phase: 'walking', winds: 2 }, 'Duck')).toMatch(/waddles/);
  });
});
