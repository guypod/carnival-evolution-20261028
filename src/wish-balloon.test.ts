import { describe, expect, it } from 'vitest';
import {
  KEEPSAKE_KEY,
  KEEPSAKE_MAX,
  WISH_MAX,
  addKeepsake,
  balloonPosition,
  BALLOON_SCENE,
  cleanWish,
  createKeepsakeStore,
  makeBalloon,
  parseKeepsakes,
} from './wish-balloon';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

describe('wish balloons', () => {
  it('keeps the wish as plain text with no HTML', () => {
    expect(cleanWish('<img src=x onerror=alert(1)>')).toBe('img src=x onerror=alert(1)');
    expect(cleanWish('a\n\tb')).toBe('a b');
  });

  it('refuses an empty wish and an unknown colour', () => {
    expect(makeBalloon('accent', '   ')).toBeUndefined();
    expect(makeBalloon('#fff', 'hi')).toBeUndefined();
    expect(makeBalloon('water', ' hi ')).toEqual({ color: 'water', wish: 'hi' });
  });

  it('cuts a long wish to the limit, counting characters', () => {
    expect(Array.from(cleanWish('🎈'.repeat(WISH_MAX + 10)))).toHaveLength(WISH_MAX);
  });

  it('keeps only the newest keepsakes', () => {
    let list = [] as ReturnType<typeof addKeepsake>;
    for (let i = 0; i < KEEPSAKE_MAX + 2; i += 1) {
      list = addKeepsake(list, { color: 'accent', wish: `wish ${i}` });
    }
    expect(list).toHaveLength(KEEPSAKE_MAX);
    expect(list[0].wish).toBe(`wish ${KEEPSAKE_MAX + 1}`);
  });

  it('saves and reloads keepsakes, and ignores damaged storage', () => {
    const storage = memoryStorage();
    const store = createKeepsakeStore(storage);
    expect(store.save([{ color: 'muted', wish: 'see the stars' }])).toBe(true);
    expect(store.load()).toEqual([{ color: 'muted', wish: 'see the stars' }]);
    storage.setItem(KEEPSAKE_KEY, '{not json');
    expect(store.load()).toEqual([]);
    expect(
      parseKeepsakes('[{"color":"accent","wish":"<b>x</b>"},{"color":"nope","wish":"y"}]'),
    ).toEqual([{ color: 'accent', wish: 'b x /b' }]);
    expect(createKeepsakeStore(undefined).save([])).toBe(false);
  });

  it('rises in a gentle arc and leaves the top of the scene', () => {
    const start = balloonPosition(0);
    const middle = balloonPosition(0.5);
    const end = balloonPosition(1);
    expect(middle.x).toBeGreaterThan(start.x);
    expect(end.x).toBeCloseTo(start.x);
    expect(middle.y).toBeLessThan(start.y);
    expect(end.y).toBeLessThan(0);
    expect(start.y).toBeLessThan(BALLOON_SCENE.height);
  });
});
