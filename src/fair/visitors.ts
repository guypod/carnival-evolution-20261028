/**
 * Visitor groups for Run Your Own Fair: a fixed-tick simulation over a layout.
 * Groups enter at the gate, pick a reachable stall or bench by need and
 * distance, walk the connected paths one cell per tick, stay a while, and
 * leave. Plain functions, so it runs and tests without a browser.
 */
import { ENTRANCE, attractions, key, reachable, type Cell, type Layout, type Piece } from './fair';

export const TICK_MS = 400;
export const MAX_GROUPS = 4;
export const MAX_SPAWNS = 12;
export const SPAWN_EVERY = 12;
export const MAX_CATCHUP_TICKS = 20;
export const NEED_THRESHOLD = 50;
export const DWELL_TICKS = 6;
export const MAX_VISITS = 3;

export type Need = 'fun' | 'rest' | 'thirst';
export type Kind = 'thrill' | 'family';
export type Phase = 'walking' | 'enjoying' | 'leaving' | 'gone';
export type Needs = Record<Need, number>;
/** An optional forecast for the day. Without one the plaza behaves exactly as before. */
export type Weather = 'heat' | 'rain';
/** In heat, thirst grows this many times faster, except for a group standing beside a tree's shade. */
export const HEAT_THIRST = 2;

export const SERVES: Record<Need, Piece> = { fun: 'game', rest: 'bench', thirst: 'food' };
const NEED_WORD: Record<Need, string> = { fun: 'bored', rest: 'tired', thirst: 'thirsty' };
const PLACE_WORD: Record<Need, string> = {
  fun: 'a game stall',
  rest: 'a bench',
  thirst: 'refreshments',
};
export const KIND_NAME: Record<Kind, string> = {
  thrill: 'Thrill-seeking friends',
  family: 'Family',
};
/** How fast each need grows per tick, and how much each kind cares about it. */
const GROWTH: Record<Kind, Needs> = {
  thrill: { fun: 4, rest: 1, thirst: 2 },
  family: { fun: 1.5, rest: 3, thirst: 3 },
};
const START: Record<Kind, Needs> = {
  thrill: { fun: 70, rest: 10, thirst: 30 },
  family: { fun: 30, rest: 55, thirst: 45 },
};

/**
 * Who comes through the gate: the share of family groups, and how each kind
 * feels on arrival. A sim without one uses the plaza's own visitors: half
 * families, with the starting needs above.
 */
export type Crowd = { family: number; start: Record<Kind, Needs> };

export type Group = {
  id: number;
  kind: Kind;
  at: Cell;
  needs: Needs;
  phase: Phase;
  route: Cell[];
  target?: Cell & { need: Need };
  timer: number;
  visits: number;
  mood: number;
  intention: string;
  /** The need this group was turned away for, when no connected stall or bench served it. */
  unmet?: Need;
};

export type Sim = {
  layout: Layout;
  groups: Group[];
  tick: number;
  seed: number;
  rng: number;
  spawned: number;
  paused: boolean;
  carry: number;
  log: string[];
  /** How many groups arrive in total. */
  spawns: number;
  /** Every group that has left, as it was on its last tick. */
  left: Group[];
  /** The forecast, when the player picked one. */
  weather?: Weather;
  /** A different crowd from the plaza's own, such as a travelling fair stop's. */
  crowd?: Crowd;
};

/** A small seeded random number generator (mulberry32), returning [value, next state]. */
export function nextRandom(state: number): [number, number] {
  const s = (state + 0x6d2b79f5) | 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, s];
}

/** `paused` starts the visitors still, which is how the plaza opens in quiet mode. `spawns` caps how many groups arrive. */
export function createSim(
  layout: Layout,
  seed = 1,
  paused = false,
  spawns = MAX_SPAWNS,
  weather?: Weather,
  crowd?: Crowd,
): Sim {
  return {
    ...(weather ? { weather } : {}),
    ...(crowd ? { crowd } : {}),
    layout,
    groups: [],
    tick: 0,
    seed,
    rng: seed,
    spawned: 0,
    paused,
    carry: 0,
    log: [],
    spawns,
    left: [],
  };
}

/** Resets only the visitors, with the same seed, so a rerun is identical. */
export function resetSim(sim: Sim): Sim {
  return createSim(sim.layout, sim.seed, sim.paused, sim.spawns, sim.weather, sim.crowd);
}

const STEPS: readonly Cell[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

/** Whether a tree stands beside `c`: shade in heat, shelter in rain. */
export function besideTree(layout: Layout, c: Cell): boolean {
  return STEPS.some((s) => layout[key({ x: c.x + s.x, y: c.y + s.y })] === 'tree');
}

/** Whether a piece can serve visitors in this weather: in rain, a bench without a tree beside it is wet. */
export function usable(layout: Layout, c: Cell, piece: Piece, weather?: Weather): boolean {
  return !(weather === 'rain' && piece === 'bench' && !besideTree(layout, c));
}

/** Shortest walk over reachable cells from `from` to any cell in `goals`, excluding `from`. Undefined when none. */
export function route(layout: Layout, from: Cell, goals: Set<string>): Cell[] | undefined {
  const reach = reachable(layout);
  if (!reach.has(key(from))) return undefined;
  if (goals.has(key(from))) return [];
  const prev = new Map<string, Cell | null>([[key(from), null]]);
  const queue: Cell[] = [from];
  while (queue.length) {
    const at = queue.shift()!;
    for (const s of STEPS) {
      const next = { x: at.x + s.x, y: at.y + s.y };
      const k = key(next);
      if (!reach.has(k) || prev.has(k)) continue;
      prev.set(k, at);
      if (goals.has(k)) {
        const path: Cell[] = [next];
        let back = at;
        while (key(back) !== key(from)) {
          path.unshift(back);
          back = prev.get(key(back))!;
        }
        return path;
      }
      queue.push(next);
    }
  }
  return undefined;
}

/** Picks the most pressing need that a reachable facility can serve, nearest first. */
export function choose(
  layout: Layout,
  group: Pick<Group, 'at' | 'needs'>,
  weather?: Weather,
): { need: Need; target: Cell; route: Cell[] } | { need?: Need; reason: string } {
  const pressing = (Object.keys(group.needs) as Need[])
    .filter((n) => group.needs[n] >= NEED_THRESHOLD)
    .sort((a, b) => group.needs[b] - group.needs[a]);
  if (!pressing.length) return { reason: 'Content for now, so heading home.' };
  const missing: Need[] = [];
  const all = attractions(layout);
  let wet = false;
  for (const need of pressing) {
    let best: { target: Cell; route: Cell[] } | undefined;
    for (const a of all) {
      if (a.piece !== SERVES[need] || !a.connected) continue;
      if (!usable(layout, a, a.piece, weather)) {
        wet = true;
        continue;
      }
      const goals = new Set(
        STEPS.map((s) => key({ x: a.x + s.x, y: a.y + s.y })).filter((k) =>
          reachable(layout).has(k),
        ),
      );
      const r = route(layout, group.at, goals);
      if (r && (!best || r.length < best.route.length)) best = { target: a, route: r };
    }
    if (best) return { need, ...best };
    missing.push(need);
  }
  const first = missing[0];
  if (first === 'rest' && wet)
    return {
      need: first,
      reason:
        'Tired, but every reachable bench is wet in the rain with no tree beside it, so heading home.',
    };
  return {
    need: first,
    reason: `${cap(NEED_WORD[first])}, but ${PLACE_WORD[first]} ${first === 'thirst' ? 'are' : 'is'} not reachable from the paths, so heading home.`,
  };
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const clamp = (n: number) => Math.max(0, Math.min(100, n));

function leave(sim: Sim, g: Group, why: string): Group {
  const r = route(sim.layout, g.at, new Set([key(ENTRANCE)]));
  return {
    ...g,
    phase: 'leaving',
    target: undefined,
    route: r ?? [],
    intention: why,
  };
}

function decide(sim: Sim, g: Group): Group {
  if (g.visits >= MAX_VISITS) return leave(sim, g, 'Had a full visit, so heading home.');
  const c = choose(sim.layout, g, sim.weather);
  if ('reason' in c)
    return c.need
      ? { ...leave(sim, g, c.reason), mood: g.mood - 10, unmet: g.unmet ?? c.need }
      : leave(sim, g, c.reason);
  return {
    ...g,
    phase: 'walking',
    route: c.route,
    target: { ...c.target, need: c.need },
    intention: `${cap(NEED_WORD[c.need])}, so walking to ${PLACE_WORD[c.need]} ${c.route.length} steps away.`,
  };
}

function grow(sim: Sim, g: Group): Needs {
  const r = GROWTH[g.kind];
  const heat = sim.weather === 'heat' && !besideTree(sim.layout, g.at) ? HEAT_THIRST : 1;
  return {
    fun: clamp(g.needs.fun + r.fun * 0.25),
    rest: clamp(g.needs.rest + r.rest * 0.25),
    thirst: clamp(g.needs.thirst + r.thirst * 0.25 * heat),
  };
}

function stepGroup(sim: Sim, g: Group): Group {
  if (g.phase === 'gone') return g;
  if (g.phase === 'enjoying') {
    const need = g.target!.need;
    const needs = { ...grow(sim, g), [need]: clamp(g.needs[need] - 15) };
    if (g.timer > 1) return { ...g, needs, timer: g.timer - 1 };
    return decide(sim, { ...g, needs, timer: 0, visits: g.visits + 1, mood: clamp(g.mood + 15) });
  }
  const needs = grow(sim, g);
  const next = g.route[0];
  if (!next) {
    if (g.phase === 'leaving') return key(g.at) === key(ENTRANCE) ? { ...g, phase: 'gone' } : g;
    return {
      ...g,
      needs,
      phase: 'enjoying',
      timer: DWELL_TICKS,
      intention: `${g.target!.need === 'rest' ? 'Resting' : g.target!.need === 'thirst' ? 'Having a drink' : 'Playing'} at ${PLACE_WORD[g.target!.need]}.`,
    };
  }
  // Never step onto a cell the layout no longer connects.
  if (!reachable(sim.layout).has(key(next)))
    return g.phase === 'leaving'
      ? leave(sim, { ...g, needs }, g.intention)
      : decide(sim, { ...g, needs });
  return { ...g, needs, at: next, route: g.route.slice(1) };
}

function spawn(sim: Sim): Sim {
  const [r, rng] = nextRandom(sim.rng);
  const kind: Kind = r < 1 - (sim.crowd?.family ?? 0.5) ? 'thrill' : 'family';
  const base: Group = {
    id: sim.spawned + 1,
    kind,
    at: { ...ENTRANCE },
    needs: { ...(sim.crowd?.start ?? START)[kind] },
    phase: 'walking',
    route: [],
    timer: 0,
    visits: 0,
    mood: 50,
    intention: '',
  };
  const next = { ...sim, rng, spawned: sim.spawned + 1 };
  return { ...next, groups: [...sim.groups, decide(next, base)] };
}

/** Advances one fixed tick: groups move or stay, the gone are dropped, a new group may arrive. */
export function tick(sim: Sim): Sim {
  const stepped = sim.groups.map((g) => stepGroup(sim, g));
  const gone = stepped.filter((g) => g.phase === 'gone');
  let next: Sim = {
    ...sim,
    tick: sim.tick + 1,
    groups: stepped.filter((g) => g.phase !== 'gone'),
    left: gone.length ? [...sim.left, ...gone] : sim.left,
  };
  if (next.tick % SPAWN_EVERY === 1 && next.groups.length < MAX_GROUPS && next.spawned < sim.spawns)
    next = spawn(next);
  return next;
}

/** Feeds real elapsed time into fixed ticks. Paused does nothing; a long gap (a hidden tab) runs at most MAX_CATCHUP_TICKS. */
export function advance(sim: Sim, elapsedMs: number): Sim {
  if (sim.paused) return sim;
  let carry = sim.carry + Math.max(0, elapsedMs);
  let ticks = Math.floor(carry / TICK_MS);
  carry -= ticks * TICK_MS;
  if (ticks > MAX_CATCHUP_TICKS) {
    ticks = MAX_CATCHUP_TICKS;
    carry = 0;
  }
  let next: Sim = { ...sim, carry };
  for (let i = 0; i < ticks; i++) next = tick(next);
  return next;
}

/** After an edit, every group replans on the new layout. A group stranded off the paths goes back to the gate. */
export function relayout(sim: Sim, layout: Layout): Sim {
  const s = { ...sim, layout };
  const reach = reachable(layout);
  return {
    ...s,
    groups: s.groups.map((g) => {
      const at = reach.has(key(g.at)) ? g.at : { ...ENTRANCE };
      const moved = { ...g, at, route: [] };
      if (g.phase === 'leaving') return leave(s, moved, g.intention);
      if (g.phase === 'enjoying') {
        const still = attractions(layout).some(
          (a) =>
            a.connected &&
            a.x === g.target!.x &&
            a.y === g.target!.y &&
            a.piece === SERVES[g.target!.need],
        );
        if (still && at === g.at) return g;
      }
      return decide(s, moved);
    }),
  };
}

export function moodWord(mood: number): string {
  return mood >= 70 ? 'delighted' : mood >= 45 ? 'content' : 'disappointed';
}

/** The text on a selected group's card. */
export function describeGroup(g: Group): string {
  const n = g.needs;
  return `${KIND_NAME[g.kind]} (group ${g.id}), ${moodWord(g.mood)}. ${g.intention} Fun need ${Math.round(n.fun)}, rest need ${Math.round(n.rest)}, thirst ${Math.round(n.thirst)}.`;
}
