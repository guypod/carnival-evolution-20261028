import { describe, expect, it } from 'vitest';
import {
  createScenePreference,
  lanternGlow,
  nextScene,
  SCENE_KEY,
  sceneToggleState,
} from './scene';

function memory(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => void (data[key] = value),
  };
}

describe('scene preference', () => {
  it('starts as day and remembers evening', () => {
    const storage = memory();
    const pref = createScenePreference(storage);
    expect(pref.load()).toBe('day');
    expect(pref.save('evening')).toBe(true);
    expect(storage.data[SCENE_KEY]).toBe('evening');
    expect(pref.load()).toBe('evening');
  });

  it('reads unknown values as day', () => {
    expect(createScenePreference(memory({ [SCENE_KEY]: 'midnight' })).load()).toBe('day');
  });

  it('falls back to day when storage is missing or throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
    };
    expect(createScenePreference(undefined).load()).toBe('day');
    expect(createScenePreference(undefined).save('evening')).toBe(false);
    expect(createScenePreference(broken).load()).toBe('day');
    expect(createScenePreference(broken).save('evening')).toBe(false);
  });
});

describe('scene toggle', () => {
  it('switches between day and evening and names the next scene', () => {
    expect(nextScene('day')).toBe('evening');
    expect(nextScene('evening')).toBe('day');
  });

  it('keeps one toggle name, with pressed meaning evening is on', () => {
    expect(sceneToggleState('day')).toEqual({ label: '🏮 Lantern evening', pressed: false });
    expect(sceneToggleState('evening')).toEqual({ label: '🏮 Lantern evening', pressed: true });
  });
});

describe('lantern glow', () => {
  it('holds steady in quiet mode', () => {
    expect(lanternGlow(0, 1, true)).toBe(1);
    expect(lanternGlow(12.3, 4, true)).toBe(1);
  });

  it('breathes gently, never flashing', () => {
    for (let t = 0; t < 20; t += 0.1) {
      const glow = lanternGlow(t, 2, false);
      expect(glow).toBeGreaterThanOrEqual(0.85);
      expect(glow).toBeLessThanOrEqual(1);
      expect(Math.abs(lanternGlow(t + 0.1, 2, false) - glow)).toBeLessThan(0.01);
    }
  });
});
