import { describe, expect, it } from 'vitest';
import { STARTER, spent, type Layout } from './fair';
import {
  CLOSING_TICK,
  GOAL_HAPPY,
  GOAL_SERVED,
  OPENING_BUDGET,
  OPENING_GROUPS,
  PENNANT_KEY,
  createPennantStore,
  debrief,
  finished,
  improvement,
  measure,
  openGates,
  runToEnd,
  type Outcome,
} from './opening-day';
import { tick } from './visitors';

const paths = (cells: string[]) => Object.fromEntries(cells.map((c) => [c, 'path']));
/** Two games, a bench and refreshments on a short connected path: 135 spent. */
const GOOD = {
  ...paths(['1,3', '2,3', '3,3']),
  '2,2': 'game',
  '3,2': 'game',
  '2,4': 'bench',
  '3,4': 'food',
} as Layout;
/** The same, with the refreshment stall off the paths. */
const CUT_FOOD = {
  ...paths(['1,3', '2,3', '3,3']),
  '2,2': 'game',
  '3,2': 'game',
  '2,4': 'bench',
  '6,5': 'food',
} as Layout;

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe('Opening Day goals', () => {
  it('a well built plaza meets every goal on the real simulation', () => {
    const o = measure(runToEnd(openGates(GOOD)));
    expect(o).toMatchObject({ arrived: OPENING_GROUPS, complete: true, success: true });
    expect(o.served).toBeGreaterThanOrEqual(GOAL_SERVED);
    expect(o.happy).toBeGreaterThanOrEqual(GOAL_HAPPY);
    expect(o.unreachable).toBe(0);
  });

  it('fails honestly when refreshments are cut off, and names thirst as the bottleneck', () => {
    const o = measure(runToEnd(openGates(CUT_FOOD)));
    expect(o.success).toBe(false);
    expect(o.happy).toBeLessThan(GOAL_HAPPY);
    expect(o.worst).toMatchObject({ need: 'thirst' });
    expect(o.unreachable).toBe(o.unmet.thirst);
    const d = debrief(CUT_FOOD, o);
    expect(d.headline).toMatch(/not met/);
    expect(d.lines.join(' ')).toMatch(/thirsty.*Family/);
    expect(improvement(CUT_FOOD, o)).toMatch(
      /path from the gate to the refreshment stall at column 7, row 6/,
    );
  });

  it('counts the budget goal at its boundary', () => {
    const base = measure(runToEnd(openGates(GOOD)));
    expect(spent(GOOD)).toBeLessThanOrEqual(OPENING_BUDGET);
    const at: Outcome = { ...base, spent: OPENING_BUDGET };
    expect(at.spent <= OPENING_BUDGET).toBe(true);
    const over = measure(runToEnd(openGates({ ...GOOD, '7,0': 'tree' } as Layout)));
    expect(over.spent).toBe(spent(GOOD) + 8);
    expect(over.spent > OPENING_BUDGET).toBe(true);
    expect(over.success).toBe(false);
    expect(improvement(STARTER, measure(runToEnd(openGates(STARTER))))).toMatch(/Cut 18/);
  });

  it('counts served and happy at the goal boundaries', () => {
    const sim = runToEnd(openGates(GOOD));
    const make = (served: number, happy: number) => {
      const left = sim.left.map((g, i) => ({
        ...g,
        visits: i < served ? 1 : 0,
        unmet: i < happy ? undefined : ('thirst' as const),
      }));
      return measure({ ...sim, left });
    };
    expect(make(GOAL_SERVED, GOAL_HAPPY).success).toBe(true);
    expect(make(GOAL_SERVED - 1, GOAL_HAPPY).success).toBe(false);
    expect(make(GOAL_SERVED, GOAL_HAPPY - 1).success).toBe(false);
  });
});

describe('Opening Day flow', () => {
  it('ending early never succeeds and says how many groups arrived', () => {
    let sim = openGates(GOOD);
    for (let i = 0; i < 20; i++) sim = tick(sim);
    expect(finished(sim)).toBe(false);
    const o = measure(sim, false);
    expect(o.success).toBe(false);
    expect(o.arrived).toBeLessThan(OPENING_GROUPS);
    expect(debrief(GOOD, o).headline).toMatch(/Ended early: \d of 8/);
  });

  it('finishing now gives the same result as watching the whole day', () => {
    let watched = openGates(GOOD);
    while (!finished(watched)) watched = tick(watched);
    let part = openGates(GOOD);
    for (let i = 0; i < 30; i++) part = tick(part);
    expect(measure(runToEnd(part))).toEqual(measure(watched));
  });

  it('a paused day finishes now without unpausing the view', () => {
    const sim = runToEnd({ ...openGates(GOOD), paused: true });
    expect(sim.paused).toBe(true);
    expect(finished(sim)).toBe(true);
  });

  it('always closes the gates', () => {
    expect(runToEnd(openGates({} as Layout)).tick).toBeLessThanOrEqual(CLOSING_TICK);
  });

  it('a retry uses the same visitors, so a layout change shows up in the result', () => {
    const first = runToEnd(openGates(CUT_FOOD));
    const again = runToEnd(openGates(CUT_FOOD));
    expect(again.left.map((g) => g.kind)).toEqual(first.left.map((g) => g.kind));
    expect(measure(again)).toEqual(measure(first));
    const fixed = measure(runToEnd(openGates(GOOD)));
    expect(fixed.happy).toBeGreaterThan(measure(first).happy);
    expect(debrief(GOOD, fixed, measure(first)).lines.join(' ')).toMatch(/Last try: served/);
  });
});

describe('Opening Day pennant', () => {
  const success = () => measure(runToEnd(openGates(GOOD)));
  const failure = () => measure(runToEnd(openGates(CUT_FOOD)));

  it('is earned only from a measured success', () => {
    const storage = memoryStorage();
    const pennants = createPennantStore(storage);
    expect(pennants.award(failure())).toEqual({ earned: false, saved: false });
    expect(pennants.load()).toBeUndefined();
    expect(pennants.award(success())).toEqual({ earned: true, saved: true });
    expect(pennants.load()).toMatchObject({ version: 1, served: OPENING_GROUPS });
  });

  it('is earned once: a second success keeps the first award', () => {
    let now = 1000;
    const storage = memoryStorage();
    const pennants = createPennantStore(storage, () => now);
    pennants.award(success());
    now = 2000;
    expect(pennants.award(success())).toEqual({ earned: false, saved: true });
    expect(pennants.load()?.at).toBe(1000);
  });

  it('never touches scores or stamps', () => {
    const scores = '[{"gameId":"ring-toss","score":40,"at":1}]';
    const stamps = '{"version":1,"stamps":["ring-toss"]}';
    const storage = memoryStorage({
      'tessl-carnival:scores': scores,
      'tessl-carnival:circuit': stamps,
    });
    createPennantStore(storage).award(success());
    expect(storage.data.get('tessl-carnival:scores')).toBe(scores);
    expect(storage.data.get('tessl-carnival:circuit')).toBe(stamps);
    expect([...storage.data.keys()].sort()).toEqual(
      [PENNANT_KEY, 'tessl-carnival:circuit', 'tessl-carnival:scores'].sort(),
    );
  });

  it('reports a failed save instead of pretending', () => {
    const broken = {
      getItem: () => null,
      setItem: () => {
        throw new Error('full');
      },
    };
    expect(createPennantStore(broken).award(success())).toEqual({ earned: true, saved: false });
    expect(createPennantStore(undefined).award(success())).toEqual({ earned: true, saved: false });
  });
});

describe('forecasts', () => {
  // A path from the gate east, a refreshment stall, a game stall and a bench all beside it.
  const base: Layout = {
    '1,3': 'path',
    '2,3': 'path',
    '3,3': 'path',
    '4,3': 'path',
    '1,2': 'game',
    '2,2': 'food',
    '3,4': 'bench',
  };

  it('leaves a day with no forecast exactly as it was', () => {
    const plain = runToEnd(openGates(base));
    const none = runToEnd(openGates(base, undefined));
    expect(none).toEqual(plain);
    expect(plain.weather).toBeUndefined();
  });

  it('runs the same forecast the same way every time', () => {
    expect(runToEnd(openGates(base, 'rain'))).toEqual(runToEnd(openGates(base, 'rain')));
    expect(runToEnd(openGates(base, 'heat'))).toEqual(runToEnd(openGates(base, 'heat')));
  });

  it('turns tired visitors away from a wet bench in the rain, and a tree beside it fixes that', () => {
    const wet = measure(runToEnd(openGates(base, 'rain')));
    expect(wet.unmet.rest).toBeGreaterThan(0);
    expect(measure(runToEnd(openGates(base))).unmet.rest).toBe(0);
    const sheltered = measure(runToEnd(openGates({ ...base, '3,5': 'tree' }, 'rain')));
    expect(sheltered.unmet.rest).toBe(0);
    expect(sheltered.happy).toBeGreaterThan(wet.happy);
    expect(improvement(base, wet)).toMatch(/tree beside a connected bench/);
  });

  it('makes visitors thirstier in the heat, and shade slows it', () => {
    const thirst = (s: ReturnType<typeof openGates>) =>
      [...s.left, ...s.groups].reduce((n, g) => n + g.needs.thirst, 0);
    const at = (layout: Layout, w?: 'heat') => {
      let s = openGates(layout, w);
      for (let i = 0; i < 6; i++) s = tick(s);
      return thirst(s);
    };
    const shaded = { ...base, '1,4': 'tree', '2,4': 'tree', '4,4': 'tree' } as Layout;
    expect(at(base, 'heat')).toBeGreaterThan(at(base));
    expect(at(shaded, 'heat')).toBeLessThan(at(base, 'heat'));
  });
});
