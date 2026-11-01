import { describe, expect, it } from 'vitest';
import { onEscapeKey } from '../escape';
import { ENTRANCE, FAIR_HEIGHT, FAIR_WIDTH, STARTER, type Layout } from './fair';
import {
  PREVIEW_HEIGHT,
  PREVIEW_WIDTH,
  bindPreviewKeys,
  cellCentre,
  intentCue,
  previewItems,
  project,
  toggleView,
  unreachableCount,
  viewState,
  type KeyTarget,
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

  it('updates when an edit connects the unreachable stall', () => {
    const stall = (items: ReturnType<typeof previewItems>) =>
      items.find((i) => i.kind === 'food' && i.x === 6 && i.y === 0);
    const before = previewItems(layout, { groups: [] });
    expect(stall(before)).toMatchObject({ unreachable: true });
    // Paths from the existing path at 2,3 up to the cell beside the stall at 6,0.
    const linked: Layout = {
      ...layout,
      ...Object.fromEntries(['3,3', '4,3', '5,3', '5,2', '5,1', '5,0'].map((k) => [k, 'path'])),
    };
    const after = previewItems(linked, { groups: [] });
    expect(stall(after)).toMatchObject({ unreachable: false });
    expect(unreachableCount(after)).toBe(0);
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

  it('shows one view at a time and puts focus on the one shown', () => {
    expect(viewState('preview')).toMatchObject({
      gridHidden: true,
      previewHidden: false,
      pressed: true,
      focus: 'preview',
    });
    expect(viewState('grid')).toMatchObject({
      gridHidden: false,
      previewHidden: true,
      pressed: false,
      focus: 'grid',
    });
  });
});

describe('preview keys', () => {
  /** A preview canvas inside a page: keys it does not stop bubble up to `page`. */
  function previewInPage() {
    const listeners = new Set<(event: KeyboardEvent) => void>();
    const preview: KeyTarget = {
      addEventListener: (_type, l) => listeners.add(l),
      removeEventListener: (_type, l) => listeners.delete(l),
    };
    const page = new EventTarget();
    const press = (key: string) => {
      let stopped = false;
      let prevented = false;
      const event = {
        key,
        stopPropagation: () => (stopped = true),
        preventDefault: () => (prevented = true),
      } as unknown as KeyboardEvent;
      listeners.forEach((l) => l(event));
      if (!stopped) page.dispatchEvent(Object.assign(new Event('keydown'), { key }));
      return { prevented };
    };
    return { preview, page, press, listeners };
  }

  it('Escape leaves the preview without reaching the route Escape that leaves the fair', () => {
    const { preview, page, press } = previewInPage();
    let leftFair = 0;
    const acts: string[] = [];
    onEscapeKey(page, () => leftFair++);
    bindPreviewKeys(preview, (name) => acts.push(name));
    expect(press('Escape')).toEqual({ prevented: true });
    expect(acts).toEqual(['view']);
    expect(leftFair).toBe(0);
  });

  it('sends V, G and P to their actions and lets other keys through', () => {
    const { preview, page, press } = previewInPage();
    let reachedPage = 0;
    page.addEventListener('keydown', () => reachedPage++);
    const acts: string[] = [];
    bindPreviewKeys(preview, (name) => acts.push(name));
    press('V');
    press('g');
    press('p');
    press('x');
    expect(acts).toEqual(['view', 'next-group', 'pause']);
    expect(reachedPage).toBe(4);
  });

  it('removes its listener on cleanup, so Escape then goes back to the route', () => {
    const { preview, page, press, listeners } = previewInPage();
    let leftFair = 0;
    onEscapeKey(page, () => leftFair++);
    const stop = bindPreviewKeys(preview, () => {});
    stop();
    expect(listeners.size).toBe(0);
    press('Escape');
    expect(leftFair).toBe(1);
  });
});

describe('selected group intent', () => {
  it('shows where the group is heading, or that it is leaving', () => {
    expect(intentCue({ phase: 'leaving' })).toBe('👋');
    expect(intentCue({ phase: 'walking', target: { x: 1, y: 1, need: 'thirst' } })).toBe('🥤');
    expect(intentCue({ phase: 'walking', target: { x: 1, y: 1, need: 'rest' } })).toBe('💤');
    expect(intentCue({ phase: 'walking', target: { x: 1, y: 1, need: 'fun' } })).toBe('🎯');
  });
});
