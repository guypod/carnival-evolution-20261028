import { describe, expect, it } from 'vitest';
import {
  PLUSH_HISTORY_MAX,
  PLUSH_KEY,
  PLUSH_NAME_MAX,
  STARTER_PLUSH,
  availableAccessories,
  benchApply,
  benchFor,
  benchReset,
  benchUndo,
  createPlushStore,
  describePlush,
  parsePlush,
} from './plush';

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    items,
  };
}

describe('the plush bench', () => {
  it('attaches, removes and undoes accessories', () => {
    let bench = benchFor(STARTER_PLUSH);
    bench = benchApply(bench, { type: 'attach', accessory: 'wings' });
    bench = benchApply(bench, { type: 'attach', accessory: 'wings' });
    expect(bench.current.accessories).toEqual(['wings']);
    expect(bench.history).toHaveLength(1);
    bench = benchApply(bench, { type: 'remove', accessory: 'wings' });
    expect(bench.current.accessories).toEqual([]);
    bench = benchUndo(bench);
    expect(bench.current.accessories).toEqual(['wings']);
    bench = benchUndo(benchUndo(bench));
    expect(bench.current).toEqual(STARTER_PLUSH);
  });

  it('ignores choices outside the bench', () => {
    const bench = benchFor(STARTER_PLUSH);
    expect(benchApply(bench, { type: 'body', body: 'dragon' as never })).toBe(bench);
    expect(benchApply(bench, { type: 'attach', accessory: 'cape' as never })).toBe(bench);
    expect(benchApply(bench, { type: 'color', color: 'pink' as never })).toBe(bench);
  });

  it('bounds the name and the history', () => {
    let bench = benchFor(STARTER_PLUSH);
    bench = benchApply(bench, { type: 'name', name: '  <Sir>   Fluffington the Third ' });
    expect(Array.from(bench.current.name).length).toBeLessThanOrEqual(PLUSH_NAME_MAX);
    expect(bench.current.name).not.toMatch(/[<>]/);
    for (let i = 0; i < PLUSH_HISTORY_MAX + 10; i += 1) {
      bench = benchApply(bench, { type: 'face', face: i % 2 ? 'smile' : 'sleepy' });
    }
    expect(bench.history).toHaveLength(PLUSH_HISTORY_MAX);
  });

  it('resets to the starter plush, and the reset can be undone', () => {
    let bench = benchApply(benchFor(STARTER_PLUSH), { type: 'body', body: 'octopus' });
    bench = benchReset(bench);
    expect(bench.current).toEqual(STARTER_PLUSH);
    expect(benchUndo(bench).current.body).toBe('octopus');
    expect(benchReset(benchFor(STARTER_PLUSH)).history).toHaveLength(0);
  });

  it('gives the full starter set to everyone and the crown to players with a score', () => {
    expect(availableAccessories(false)).toEqual(['party-hat', 'bow', 'wings']);
    expect(availableAccessories(true)).toContain('crown');
  });

  it('describes the plush', () => {
    const plush = {
      ...STARTER_PLUSH,
      body: 'bunny' as const,
      accessories: ['bow' as const],
      name: 'Pip',
    };
    expect(describePlush(plush)).toBe('Pip: A gold bunny with a smile face wearing bow.');
  });
});

describe('saving a plush', () => {
  it('keeps one creation and loads it back', () => {
    const storage = memoryStorage();
    const store = createPlushStore(storage);
    const first = { ...STARTER_PLUSH, body: 'octopus' as const, name: 'Inky' };
    const second = { ...STARTER_PLUSH, body: 'bunny' as const, accessories: ['wings' as const] };
    expect(store.save(first)).toBe(true);
    expect(store.save(second)).toBe(true);
    expect(store.load()).toEqual(second);
    expect(storage.items.size).toBe(1);
  });

  it('rejects broken or tampered saves', () => {
    expect(parsePlush(null)).toBeUndefined();
    expect(parsePlush('{')).toBeUndefined();
    expect(parsePlush(JSON.stringify({ ...STARTER_PLUSH, body: 'dragon' }))).toBeUndefined();
    expect(
      parsePlush(JSON.stringify({ ...STARTER_PLUSH, accessories: ['bow', 'cape', 'bow'] }))
        ?.accessories,
    ).toEqual(['bow']);
  });

  it('survives storage that throws or is missing', () => {
    const throwing = createPlushStore({
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
    });
    expect(throwing.load()).toBeUndefined();
    expect(throwing.save(STARTER_PLUSH)).toBe(false);
    expect(createPlushStore(undefined).save(STARTER_PLUSH)).toBe(false);
    const storage = memoryStorage();
    storage.setItem(PLUSH_KEY, 'not json');
    expect(createPlushStore(storage).load()).toBeUndefined();
  });
});
