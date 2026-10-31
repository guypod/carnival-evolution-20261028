import { describe, expect, it } from 'vitest';
import {
  ENTRANCE,
  FAIR_BUDGET,
  FAIR_KEY,
  STARTER,
  attractions,
  connectedAttractions,
  createFairStore,
  dropCarried,
  move,
  parseLayout,
  place,
  pushHistory,
  remaining,
  remove,
  settleWalker,
  step,
  type Layout,
} from './fair';

function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

describe('placement and budget', () => {
  it('charges the piece cost and refunds a replaced piece', () => {
    const r = place({}, { x: 2, y: 2 }, 'game');
    expect(r.ok && remaining(r.layout)).toBe(FAIR_BUDGET - 40);
    const swapped = r.ok ? place(r.layout, { x: 2, y: 2 }, 'bench') : r;
    expect(swapped.ok && remaining(swapped.layout)).toBe(FAIR_BUDGET - 10);
  });

  it('blocks the entrance, off-grid cells and over-budget pieces', () => {
    expect(place({}, ENTRANCE, 'path').ok).toBe(false);
    expect(place({}, { x: 99, y: 0 }, 'path').ok).toBe(false);
    let layout: Layout = {};
    for (let i = 0; i < 7; i++) {
      const r = place(layout, { x: i + 1, y: 0 }, 'game');
      if (r.ok) layout = r.layout;
    }
    expect(remaining(layout)).toBe(FAIR_BUDGET - 280);
    const over = place(layout, { x: 1, y: 1 }, 'food');
    expect(over).toEqual({ ok: false, reason: expect.stringContaining('Not enough budget') });
  });

  it('refuses to drop a pickup after the layout changed', () => {
    const carried = { from: { x: 3, y: 2 }, layout: STARTER };
    const swapped = place(STARTER, { x: 3, y: 2 }, 'tree');
    if (!swapped.ok) throw new Error(swapped.reason);
    expect(dropCarried(swapped.layout, carried, { x: 6, y: 0 }).ok).toBe(false);
    const moved = dropCarried(STARTER, carried, { x: 6, y: 0 });
    expect(moved.ok && moved.layout['6,0']).toBe('game');
  });

  it('moves and removes pieces', () => {
    const moved = move({ '2,2': 'food' }, { x: 2, y: 2 }, { x: 3, y: 3 });
    expect(moved).toEqual({ ok: true, layout: { '3,3': 'food' } });
    expect(move({ '2,2': 'food' }, { x: 2, y: 2 }, ENTRANCE).ok).toBe(false);
    expect(remove({ '2,2': 'food' }, { x: 2, y: 2 })).toEqual({ ok: true, layout: {} });
    expect(remove({}, { x: 2, y: 2 }).ok).toBe(false);
  });
});

describe('connectivity', () => {
  it('connects the starter plaza fully', () => {
    expect(
      attractions(STARTER)
        .filter((a) => a.piece !== 'tree')
        .every((a) => a.connected),
    ).toBe(true);
  });

  it('marks a stall cut off when its path is removed', () => {
    const r = remove(STARTER, { x: 3, y: 3 });
    if (!r.ok) throw new Error('expected removal');
    const cut = attractions(r.layout)
      .filter((a) => !a.connected)
      .map((a) => a.piece);
    expect(cut).toContain('bench');
    expect(connectedAttractions(r.layout).length).toBeLessThan(
      connectedAttractions(STARTER).length,
    );
  });

  it('lets the visitor walk only on reachable paths and never leaves the entrance stuck off-grid', () => {
    expect(step({}, ENTRANCE, -1, 0)).toEqual(ENTRANCE);
    expect(step({}, ENTRANCE, 1, 0)).toEqual(ENTRANCE);
    expect(step(STARTER, ENTRANCE, 1, 0)).toEqual({ x: 1, y: 3 });
  });

  it('never steps onto a path island cut off from the entrance', () => {
    const island: Layout = { ...STARTER, '1,1': 'path', '1,0': 'path' };
    expect(step(island, { x: 1, y: 0 }, 0, 1)).toEqual({ x: 1, y: 0 });
  });

  it('keeps a walker in place while reachable and sends them to the entrance otherwise', () => {
    const joined: Layout = { ...STARTER, '1,1': 'path', '1,0': 'path', '1,2': 'path' };
    expect(settleWalker(joined, { x: 1, y: 0 })).toEqual({ x: 1, y: 0 });
    const cut = Object.fromEntries(Object.entries(joined).filter(([k]) => k !== '1,2'));
    expect(settleWalker(cut, { x: 1, y: 0 })).toEqual(ENTRANCE);
    expect(settleWalker(STARTER, { x: 1, y: 0 })).toEqual(ENTRANCE);
    expect(settleWalker({}, { x: 2, y: 3 })).toEqual(ENTRANCE);
    expect(settleWalker(STARTER, undefined)).toBeUndefined();
  });
});

describe('undo history', () => {
  it('keeps earlier layouts, capped', () => {
    let h: Layout[] = [];
    for (let i = 0; i < 5; i++) h = pushHistory(h, { [`${i + 1},0`]: 'path' }, 3);
    expect(h).toHaveLength(3);
    expect(h.at(-1)).toEqual({ '5,0': 'path' });
  });
});

describe('storage', () => {
  it('round-trips a saved layout', () => {
    const storage = memory();
    const store = createFairStore(storage);
    expect(store.load()).toEqual({ layout: STARTER });
    expect(store.save({ '2,2': 'game' })).toBe(true);
    expect(store.load()).toEqual({ layout: { '2,2': 'game' } });
  });

  it('falls back to the starter on a corrupt save without overwriting it', () => {
    for (const bad of [
      'not json',
      '{"version":2,"cells":{}}',
      '{"version":1,"cells":{"0,3":"path"}}',
      '{"version":1,"cells":{"1,1":"rocket"}}',
    ]) {
      const storage = memory({ [FAIR_KEY]: bad });
      const result = createFairStore(storage).load();
      expect(result.layout).toBe(STARTER);
      expect(result.note).toBeDefined();
      expect(storage.data.get(FAIR_KEY)).toBe(bad);
    }
  });

  it('rejects an over-budget save', () => {
    const cells = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`${i},0`, 'game']));
    expect(parseLayout({ version: 1, cells })).toBeUndefined();
  });

  it('rejects noncanonical cell keys so every piece is visible and editable', () => {
    expect(parseLayout({ version: 1, cells: { '01,1': 'game' } })).toBeUndefined();
    expect(parseLayout({ version: 1, cells: { '1,1': 'game', '1,01': 'game' } })).toBeUndefined();
    expect(parseLayout({ version: 1, cells: { '0,0': 'tree', '7,5': 'bench' } })).toEqual({
      '0,0': 'tree',
      '7,5': 'bench',
    });
  });

  it('says saving is unavailable when there is no storage at all', () => {
    const result = createFairStore(undefined).load();
    expect(result.layout).toBe(STARTER);
    expect(result.note).toMatch(/unavailable/);
  });

  it('reports failure when storage throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    const store = createFairStore(broken);
    expect(store.load().note).toMatch(/unavailable/);
    expect(store.save({})).toBe(false);
    expect(store.reset()).toBe(false);
  });

  it('reset clears only the fair key', () => {
    const storage = memory({ [FAIR_KEY]: '{}', 'tessl-carnival:favorites': '["x"]' });
    createFairStore(storage).reset();
    expect(storage.data.has(FAIR_KEY)).toBe(false);
    expect(storage.data.has('tessl-carnival:favorites')).toBe(true);
  });
});
