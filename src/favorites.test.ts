import { describe, expect, it } from 'vitest';
import { FAVORITES_KEY, createFavorites } from './favorites';

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

describe('createFavorites', () => {
  it('adds and removes booths under its own key, leaving scores alone', () => {
    const scores = '[{"gameId":"ring-toss","score":7,"at":1}]';
    const storage = memoryStorage({ 'tessl-carnival:scores': scores });
    const favorites = createFavorites(storage);
    expect(favorites.load()).toEqual([]);
    expect(favorites.set('ring-toss', true)).toBe(true);
    expect(favorites.set('duck-dash', true)).toBe(true);
    expect(favorites.set('ring-toss', true)).toBe(true);
    expect(favorites.load()).toEqual(['duck-dash', 'ring-toss']);
    expect(favorites.has('duck-dash')).toBe(true);
    expect(favorites.set('duck-dash', false)).toBe(false);
    expect(favorites.load()).toEqual(['ring-toss']);
    expect(storage.map.get(FAVORITES_KEY)).toBe('["ring-toss"]');
    expect(storage.map.get('tessl-carnival:scores')).toBe(scores);
  });

  it('survives a reload', () => {
    const storage = memoryStorage();
    createFavorites(storage).set('mole-mayhem', true);
    expect(createFavorites(storage).load()).toEqual(['mole-mayhem']);
  });

  it('reads malformed storage as no favorites and drops non-string ids', () => {
    expect(createFavorites(memoryStorage({ [FAVORITES_KEY]: '{oops' })).load()).toEqual([]);
    expect(createFavorites(memoryStorage({ [FAVORITES_KEY]: '{"a":1}' })).load()).toEqual([]);
    expect(
      createFavorites(memoryStorage({ [FAVORITES_KEY]: '["a", 3, null, "a", "b"]' })).load(),
    ).toEqual(['a', 'b']);
  });

  it('reports a failed write and keeps the old list', () => {
    const storage = memoryStorage({ [FAVORITES_KEY]: '["a"]' });
    const favorites = createFavorites({
      getItem: storage.getItem,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    });
    expect(favorites.set('b', true)).toBeUndefined();
    expect(favorites.load()).toEqual(['a']);
  });

  it('reports a failed read and never overwrites the saved list', () => {
    const storage = memoryStorage({ [FAVORITES_KEY]: '["a", "b"]' });
    const favorites = createFavorites({
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: storage.setItem,
    });
    expect(favorites.load()).toEqual([]);
    expect(favorites.set('c', true)).toBeUndefined();
    expect(favorites.set('a', false)).toBeUndefined();
    expect(storage.map.get(FAVORITES_KEY)).toBe('["a", "b"]');
  });

  it('works with no storage at all', () => {
    const favorites = createFavorites(undefined);
    expect(favorites.load()).toEqual([]);
    expect(favorites.set('a', true)).toBeUndefined();
  });
});
