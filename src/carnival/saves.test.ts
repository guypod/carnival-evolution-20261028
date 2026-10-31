import { describe, expect, it } from 'vitest';
import { createSaveSlot, type SaveStorage } from './saves';

function memoryStorage(): SaveStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

const parseNumbers = (value: unknown) =>
  Array.isArray(value) && value.every((n) => typeof n === 'number')
    ? (value as number[])
    : undefined;

const options = { key: 'tessl-carnival:test', maxLength: 20, parse: parseNumbers };

describe('save slot', () => {
  it('saves and loads a value across slots on the same storage, as after a reload', () => {
    const storage = memoryStorage();
    expect(createSaveSlot(storage, options).save([1, 2, 3])).toBe(true);
    expect(createSaveSlot(storage, options).load()).toEqual([1, 2, 3]);
  });

  it('reads nothing saved, malformed or invalid saves as none', () => {
    const storage = memoryStorage();
    const slot = createSaveSlot(storage, options);
    expect(slot.load()).toBeUndefined();
    storage.data.set(options.key, 'not json');
    expect(slot.load()).toBeUndefined();
    storage.data.set(options.key, '{"a":1}');
    expect(slot.load()).toBeUndefined();
    storage.data.set(options.key, '["x"]');
    expect(slot.load()).toBeUndefined();
  });

  it('refuses to read or write anything over its size limit', () => {
    const storage = memoryStorage();
    const slot = createSaveSlot(storage, options);
    storage.data.set(options.key, JSON.stringify(Array(20).fill(1)));
    expect(slot.load()).toBeUndefined();
    expect(slot.save(Array(20).fill(1))).toBe(false);
    expect(storage.data.get(options.key)).toBe(JSON.stringify(Array(20).fill(1)));
  });

  it('reports a failed write without throwing, and a failed read as none', () => {
    const broken: SaveStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    const slot = createSaveSlot(broken, options);
    expect(slot.save([1])).toBe(false);
    expect(slot.load()).toBeUndefined();
    expect(createSaveSlot(undefined, options).save([1])).toBe(false);
  });

  it('only accepts carnival keys', () => {
    expect(() => createSaveSlot(memoryStorage(), { ...options, key: 'scores' })).toThrow();
  });
});
