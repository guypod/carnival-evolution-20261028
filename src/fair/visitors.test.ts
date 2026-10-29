import { describe, expect, it } from 'vitest';
import { ENTRANCE, STARTER, remove, type Layout } from './fair';
import {
  MAX_CATCHUP_TICKS,
  MAX_GROUPS,
  MAX_SPAWNS,
  NEED_THRESHOLD,
  TICK_MS,
  advance,
  choose,
  createSim,
  relayout,
  resetSim,
  route,
  tick,
  type Sim,
} from './visitors';

function run(sim: Sim, ticks: number) {
  const visited: string[] = [];
  for (let i = 0; i < ticks; i++) {
    sim = tick(sim);
    for (const g of sim.groups)
      if (g.phase === 'enjoying' && g.timer === 6) visited.push(`${g.target!.need}`);
  }
  return { sim, visited };
}

const row = (cells: string[]): Layout =>
  Object.fromEntries(cells.map((c) => [c, 'path'])) as Layout;

describe('choices', () => {
  it('only acts on needs over the threshold', () => {
    const calm = { at: { ...ENTRANCE }, needs: { fun: 10, rest: 10, thirst: NEED_THRESHOLD - 1 } };
    expect('reason' in choose(STARTER, calm)).toBe(true);
    const thirsty = { ...calm, needs: { ...calm.needs, thirst: NEED_THRESHOLD } };
    const c = choose(STARTER, thirsty);
    expect('target' in c && c.need).toBe('thirst');
  });

  it('explains an unreachable refreshment stall and never routes to it', () => {
    const cut = { ...row(['1,3']), '5,5': 'food' } as Layout;
    const c = choose(cut, { at: { ...ENTRANCE }, needs: { fun: 0, rest: 0, thirst: 90 } });
    expect('reason' in c && c.reason).toMatch(/thirsty.*not reachable/i);
  });

  it('two layouts give different outcomes', () => {
    const games = { ...row(['1,3', '2,3', '3,3']), '2,2': 'game', '3,2': 'game' } as Layout;
    const rest = { ...row(['1,3', '2,3', '3,3']), '2,2': 'bench', '3,4': 'food' } as Layout;
    const a = run(createSim(games, 7), 120).visited;
    const b = run(createSim(rest, 7), 120).visited;
    expect(new Set(a)).toEqual(new Set(['fun']));
    expect(b).not.toContain('fun');
    expect(b.length).toBeGreaterThan(0);
  });
});

describe('routes', () => {
  it('walks connected paths only', () => {
    const layout = row(['1,3', '2,3']);
    expect(route(layout, ENTRANCE, new Set(['2,3']))).toEqual([
      { x: 1, y: 3 },
      { x: 2, y: 3 },
    ]);
    expect(route(layout, ENTRANCE, new Set(['4,3']))).toBeUndefined();
  });

  it('a path edit invalidates routes and groups replan without teleporting past the gap', () => {
    let sim = tick(createSim(STARTER, 3));
    const g = sim.groups[0];
    expect(g.route.length).toBeGreaterThan(0);
    const cutLayout = (remove(STARTER, { x: 1, y: 3 }) as { layout: Layout }).layout;
    sim = relayout(sim, cutLayout);
    const after = sim.groups[0];
    expect(after.route).toEqual([]);
    expect(after.intention).toMatch(/not reachable|home/i);
    for (let i = 0; i < 30; i++) {
      sim = tick(sim);
      for (const x of sim.groups) expect(x.at).toEqual(ENTRANCE);
    }
  });
});

describe('population, pause and time', () => {
  it('keeps spawns and live groups bounded, and everyone leaves', () => {
    let sim = createSim(STARTER, 11);
    let peak = 0;
    for (let i = 0; i < 2000; i++) {
      sim = tick(sim);
      peak = Math.max(peak, sim.groups.length);
    }
    expect(peak).toBeLessThanOrEqual(MAX_GROUPS);
    expect(sim.spawned).toBe(MAX_SPAWNS);
    expect(sim.groups).toEqual([]);
  });

  it('pause stops time, catchup is capped, and reset is deterministic', () => {
    const sim = createSim(STARTER, 5);
    expect(advance({ ...sim, paused: true }, 10_000).tick).toBe(0);
    expect(advance(sim, TICK_MS * 1000).tick).toBe(MAX_CATCHUP_TICKS);
    expect(advance(sim, TICK_MS * 3 + 10).tick).toBe(3);
    const later = run(sim, 50).sim;
    expect(resetSim(later)).toEqual(createSim(STARTER, 5));
    expect(run(resetSim(later), 50).sim).toEqual(later);
  });
});
