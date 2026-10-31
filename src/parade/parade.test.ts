import { describe, expect, it } from 'vitest';
import {
  MAX_FLOATS,
  PARADE_KEY,
  READY,
  STARTER_COMPOSITION,
  addFloat,
  createParadeStore,
  duration,
  end,
  fitToUnlocked,
  moveFloat,
  pause,
  play,
  positionsAt,
  removeFloat,
  restart,
  storyboard,
  tick,
  unlockedMotifs,
  type Composition,
} from './parade';

const starters = unlockedMotifs(new Set());

describe('composition edits', () => {
  it('reorders floats and refuses moves past either end', () => {
    const moved = moveFloat(STARTER_COMPOSITION, 0, 1);
    expect(moved.ok && moved.composition.floats).toEqual(['ring', 'duck', 'lantern']);
    expect(moveFloat(STARTER_COMPOSITION, 0, -1).ok).toBe(false);
    expect(moveFloat(STARTER_COMPOSITION, 2, 1).ok).toBe(false);
  });

  it('keeps between 3 and 5 floats', () => {
    expect(removeFloat(STARTER_COMPOSITION, 0).ok).toBe(false);
    let c: Composition = STARTER_COMPOSITION;
    for (let i = 0; i < 2; i++) {
      const r = addFloat(c, 'music', starters);
      if (!r.ok) throw new Error(r.reason);
      c = r.composition;
    }
    expect(c.floats).toHaveLength(MAX_FLOATS);
    expect(addFloat(c, 'duck', starters).ok).toBe(false);
    const r = removeFloat(c, 4);
    expect(r.ok && r.composition.floats).toHaveLength(4);
  });

  it('refuses locked floats until their booth is stamped', () => {
    expect(starters).not.toContain('balloon');
    expect(addFloat(STARTER_COMPOSITION, 'balloon', starters).ok).toBe(false);
    const unlocked = unlockedMotifs(new Set(['balloon-darts']));
    expect(addFloat(STARTER_COMPOSITION, 'balloon', unlocked).ok).toBe(true);
  });

  it('falls back to starters when a saved float is locked', () => {
    const c: Composition = { floats: ['balloon', 'bell', 'mole', 'duck'], cadence: 'dance' };
    expect(fitToUnlocked(c, starters)).toEqual({
      floats: ['duck', 'duck', 'ring'],
      cadence: 'dance',
    });
  });
});

describe('the procession', () => {
  it('sends floats out in order and ends when the last arrives', () => {
    const c = STARTER_COMPOSITION;
    const early = positionsAt(c, 500);
    expect(early.map((p) => p.phase)).toEqual(['marching', 'waiting', 'waiting']);
    const done = positionsAt(c, duration(c));
    expect(done.every((p) => p.phase === 'arrived')).toBe(true);
    const mid = positionsAt(c, 2500);
    expect(mid[0].progress).toBeGreaterThan(mid[1].progress);
  });

  it('gives different compositions different sequences', () => {
    const a = positionsAt(STARTER_COMPOSITION, 3000);
    const b = positionsAt({ ...STARTER_COMPOSITION, cadence: 'stroll' }, 3000);
    const c = positionsAt({ ...STARTER_COMPOSITION, floats: ['music', 'ring', 'duck'] }, 3000);
    expect(a).not.toEqual(b);
    expect(a.map((p) => p.id)).not.toEqual(c.map((p) => p.id));
  });

  it('plays, pauses, restarts and ends', () => {
    const c = STARTER_COMPOSITION;
    let s = play(READY);
    s = tick(s, c, 1000);
    expect(s).toEqual({ phase: 'playing', t: 1000 });
    s = pause(s);
    expect(tick(s, c, 5000)).toEqual({ phase: 'paused', t: 1000 });
    s = tick(play(s), c, duration(c));
    expect(s.phase).toBe('ended');
    expect(play(s)).toEqual({ phase: 'playing', t: 0 });
    expect(restart()).toEqual({ phase: 'playing', t: 0 });
    expect(end(c)).toEqual({ phase: 'ended', t: duration(c) });
  });

  it('has a storyboard step for every float plus a start and finale', () => {
    const steps = storyboard(STARTER_COMPOSITION);
    expect(steps).toHaveLength(5);
    expect(steps.at(-1)).toEqual({ title: 'Finale', t: duration(STARTER_COMPOSITION) });
  });
});

describe('createParadeStore', () => {
  const memory = () => {
    const data = new Map<string, string>();
    return {
      data,
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    };
  };

  it('saves and loads a composition', () => {
    const storage = memory();
    const store = createParadeStore(storage);
    const c: Composition = { floats: ['music', 'lantern', 'ring', 'duck'], cadence: 'stroll' };
    expect(store.save(c)).toBe(true);
    expect(store.load()).toEqual({ composition: c });
  });

  it('keeps a bad save and loads the starter with a note', () => {
    const storage = memory();
    storage.data.set(PARADE_KEY, '{"version":1,"floats":["duck"],"cadence":"march"}');
    const loaded = createParadeStore(storage).load();
    expect(loaded.composition).toEqual(STARTER_COMPOSITION);
    expect(loaded.note).toMatch(/could not be read/);
    expect(storage.data.get(PARADE_KEY)).toContain('"duck"');
  });

  it('survives storage that throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
    };
    const store = createParadeStore(broken);
    expect(store.load().note).toMatch(/unavailable/);
    expect(store.save(STARTER_COMPOSITION)).toBe(false);
    expect(createParadeStore(undefined).save(STARTER_COMPOSITION)).toBe(false);
  });
});
