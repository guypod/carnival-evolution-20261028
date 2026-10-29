import { describe, expect, it } from 'vitest';
import { ENTRANCE, FAIR_HEIGHT, FAIR_WIDTH, STARTER, type Layout } from './fair';
import {
  PREVIEW_HEIGHT,
  PREVIEW_WIDTH,
  cellCentre,
  previewItems,
  project,
  toggleView,
  unreachableCount,
} from './preview';
import { TICK_MS, advance, createSim } from './visitors';

describe('preview projection', () => {
  it('keeps every corner of the plaza inside the canvas', () => {
    for (const [x, y] of [
      [0, 0],
      [FAIR_WIDTH, 0],
      [0, FAIR_HEIGHT],
      [FAIR_WIDTH, FAIR_HEIGHT],
    ]) {
      const p = project(x, y);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(PREVIEW_WIDTH);
      expect(p.y).toBeGreaterThanOrEqual(40);
      expect(p.y).toBeLessThanOrEqual(PREVIEW_HEIGHT);
    }
  });

  it('puts a cell further right lower-right and a cell further down lower-left', () => {
    const a = cellCentre({ x: 2, y: 2 });
    const right = cellCentre({ x: 3, y: 2 });
    const down = cellCentre({ x: 2, y: 3 });
    expect(right.x).toBeGreaterThan(a.x);
    expect(right.y).toBeGreaterThan(a.y);
    expect(down.x).toBeLessThan(a.x);
    expect(down.y).toBeGreaterThan(a.y);
  });
});

describe('preview model', () => {
  const layout: Layout = {
    '1,3': 'path',
    '2,3': 'path',
    '2,2': 'game',
    '6,0': 'food',
    '5,5': 'tree',
  };

  it('draws the gate, every piece and flags only the unreachable stalls', () => {
    const items = previewItems(layout, { groups: [] });
    expect(items.find((i) => i.kind === 'gate')).toMatchObject(ENTRANCE);
    expect(items.find((i) => i.kind === 'game')).toMatchObject({ x: 2, y: 2, unreachable: false });
    expect(items.find((i) => i.kind === 'food')).toMatchObject({ x: 6, y: 0, unreachable: true });
    expect(items.find((i) => i.kind === 'tree')).toMatchObject({ unreachable: false });
    expect(unreachableCount(items)).toBe(1);
  });

  it('updates when an edit connects a stall', () => {
    const before = previewItems(layout, { groups: [] });
    const after = previewItems({ ...layout, '3,3': 'path', '3,2': 'food' }, { groups: [] });
    expect(unreachableCount(before)).toBe(1);
    expect(after.find((i) => i.kind === 'food' && i.x === 3)).toMatchObject({ unreachable: false });
  });

  it('places every visitor group where the simulation has it, back to front', () => {
    const sim = advance(createSim(STARTER, 1), TICK_MS * 30);
    expect(sim.groups.length).toBeGreaterThan(0);
    const items = previewItems(STARTER, sim);
    const visitors = items.filter((i) => i.kind === 'visitor');
    expect(visitors.map((v) => [v.x, v.y]).sort()).toEqual(
      sim.groups.map((g) => [g.at.x, g.at.y]).sort(),
    );
    const depth = (i: (typeof items)[number]) => i.x + i.y + (i.kind === 'visitor' ? 0.5 : 0);
    for (let i = 1; i < items.length; i++)
      expect(depth(items[i])).toBeGreaterThanOrEqual(depth(items[i - 1]));
  });
});

describe('view mode', () => {
  it('toggles between the grid and the preview', () => {
    expect(toggleView('grid')).toBe('preview');
    expect(toggleView(toggleView('grid'))).toBe('grid');
  });
});
