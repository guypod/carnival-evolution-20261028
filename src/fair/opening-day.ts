/**
 * Opening Day: a short, optional challenge inside Run Your Own Fair. The
 * player builds, then opens the gates to a fixed, seeded set of visitor
 * groups that walk the real layout with the real visitor simulation. The
 * debrief reads only what the simulation measured. Plain functions, so goals,
 * early exit, retry and the pennant test without a browser.
 */
import { ENTRANCE, PIECE_NAME, attractions, key, reachable, spent, type Layout } from './fair';
import {
  KIND_NAME,
  SERVES,
  besideTree,
  createSim,
  tick,
  usable,
  type Group,
  type Need,
  type Sim,
  type Weather,
} from './visitors';

export const OPENING_SEED = 11;
export const OPENING_GROUPS = 8;
export const OPENING_BUDGET = 140;
export const GOAL_SERVED = 7;
export const GOAL_HAPPY = 6;
/** A safety stop: the gates close after this many ticks even if a group is still inside. */
export const CLOSING_TICK = 400;
export const PENNANT_KEY = 'tessl-carnival:opening-day';

export const GOALS_TEXT = `Opening Day: ${OPENING_GROUPS} visitor groups arrive, the same ${OPENING_GROUPS} every time. Goals: serve at least ${GOAL_SERVED}, keep at least ${GOAL_HAPPY} happy, and spend no more than ${OPENING_BUDGET} on the plaza. Build first, then open the gates: that saves your layout, and the visitors walk it. You can pause or end early, and retry with the same visitors after changing your layout.`;

export const DEFINITIONS = {
  served: 'Served: the group used at least one stall or bench before leaving.',
  happy: 'Happy: served, and never turned away for a need the plaza could not meet.',
  unreachable:
    'Turned away: the group needed a game, a bench or refreshments, and none touched a path connected to the gate.',
  wet: 'In the rain, a tired group is also turned away when every connected bench is wet, with no tree beside it.',
};

/** The forecasts a player can opt into, and the rule each one changes, told before the gates open. */
export const FORECASTS: Record<Weather, { name: string; rule: string }> = {
  heat: {
    name: 'Sunny heat',
    rule: 'Sunny heat: visitors get thirsty twice as fast, except while they stand on a path beside a tree, which gives shade. Refreshments matter more; trees along busy paths slow the thirst.',
  },
  rain: {
    name: 'Light rain',
    rule: 'Light rain: a bench with no tree beside it is wet, and tired visitors will not use it. A tree beside a bench gives shelter, so that bench still works.',
  },
};

/** What the forecast does to one square, drawn on the grid: a wet or sheltered bench, a sunny or shaded path. */
export type Cue = { x: number; y: number; cue: 'wet' | 'sheltered' | 'sun' | 'shade' };

/**
 * The squares a forecast changes, read from the same rules the visitors follow.
 * It depends only on the layout and the forecast, never on time, so it is
 * drawn still in every mode, Quiet included.
 */
export function atmosphere(layout: Layout, weather?: Weather): Cue[] {
  const cues: Cue[] = [];
  for (const [k, piece] of Object.entries(layout)) {
    const [x, y] = k.split(',').map(Number);
    const covered = besideTree(layout, { x, y });
    if (weather === 'rain' && piece === 'bench')
      cues.push({ x, y, cue: covered ? 'sheltered' : 'wet' });
    if (weather === 'heat' && piece === 'path') cues.push({ x, y, cue: covered ? 'shade' : 'sun' });
  }
  return cues;
}

/** The forecast's name for the debrief, with no forecast read as clear skies. */
export const forecastName = (weather?: Weather) =>
  weather ? FORECASTS[weather].name.toLowerCase() : 'clear skies';

/** Starts the gates on `layout`, with the same seeded visitors every time, under an optional forecast. */
export function openGates(layout: Layout, weather?: Weather): Sim {
  return createSim(layout, OPENING_SEED, false, OPENING_GROUPS, weather);
}

/** Whether every group has arrived and left, or the gates have closed. */
export function finished(sim: Sim): boolean {
  return (sim.spawned >= sim.spawns && sim.groups.length === 0) || sim.tick >= CLOSING_TICK;
}

/** Runs the rest of the day at once, with the same ticks the live view would run. */
export function runToEnd(sim: Sim): Sim {
  let next = { ...sim, paused: false };
  while (!finished(next)) next = tick(next);
  return { ...next, paused: sim.paused };
}

export const isServed = (g: Group) => g.visits > 0;
export const isHappy = (g: Group) => isServed(g) && !g.unmet;

export type Outcome = {
  /** Groups that arrived: the ones that left plus the ones still inside. */
  arrived: number;
  served: number;
  happy: number;
  unreachable: number;
  spent: number;
  complete: boolean;
  success: boolean;
  /** How many groups were turned away for each need. */
  unmet: Record<Need, number>;
  /** Groups turned away, by kind, for the need that turned away the most. */
  worst?: { need: Need; count: number; kinds: string[] };
  /** The forecast the day actually ran under, kept so a later change to the selector cannot relabel it. */
  weather?: Weather;
};

/** Measures a day from what the simulation recorded. `complete` is false when the player ended early. */
export function measure(sim: Sim, complete = finished(sim)): Outcome {
  const all = [...sim.left, ...sim.groups];
  const unmet: Record<Need, number> = { fun: 0, rest: 0, thirst: 0 };
  for (const g of all) if (g.unmet) unmet[g.unmet]++;
  const needs = (Object.keys(unmet) as Need[]).filter((n) => unmet[n] > 0);
  needs.sort((a, b) => unmet[b] - unmet[a]);
  const worstNeed = needs[0];
  const served = all.filter(isServed).length;
  const happy = all.filter(isHappy).length;
  const cost = spent(sim.layout);
  return {
    arrived: all.length,
    served,
    happy,
    unreachable: all.filter((g) => g.unmet).length,
    spent: cost,
    complete,
    success: complete && served >= GOAL_SERVED && happy >= GOAL_HAPPY && cost <= OPENING_BUDGET,
    unmet,
    worst: worstNeed && {
      need: worstNeed,
      count: unmet[worstNeed],
      kinds: [...new Set(all.filter((g) => g.unmet === worstNeed).map((g) => KIND_NAME[g.kind]))],
    },
    ...(sim.weather ? { weather: sim.weather } : {}),
  };
}

const NEED_WORD: Record<Need, string> = { fun: 'bored', rest: 'tired', thirst: 'thirsty' };
const where = (c: { x: number; y: number }) => `column ${c.x + 1}, row ${c.y + 1}`;

/** Whether rest went unmet because the rain made every connected bench wet, rather than for lack of a path. */
const wetBenches = (layout: Layout, o: Outcome) =>
  o.worst?.need === 'rest' &&
  attractions(layout).some(
    (a) => a.piece === 'bench' && a.connected && !usable(layout, a, a.piece, o.weather),
  );

/** What the forecast's trees do for visitors, in the budget advice. */
const TREE_ROLE: Record<Weather, string> = {
  rain: 'keep the trees that shelter a connected bench: tired visitors will use no other',
  heat: 'keep the trees that shade a connected path: that shade slows the thirst',
};

/**
 * The squares visitors can use whose forecast cue a tree decides: connected
 * benches in the rain, reachable paths and the entrance in the heat. Read from
 * `atmosphere` and `besideTree`, so the advice follows the same rules the
 * visitors do.
 */
function covered(layout: Layout, weather: Weather): Set<string> {
  const reach = reachable(layout);
  const connected = new Set(
    attractions(layout)
      .filter((a) => a.connected)
      .map((a) => `${a.x},${a.y}`),
  );
  const squares = atmosphere(layout, weather)
    .filter((c) => c.cue === 'sheltered' || c.cue === 'shade')
    .map((c) => `${c.x},${c.y}`)
    .filter((k) => reach.has(k) || connected.has(k));
  // Groups arrive and leave at the entrance, and `grow` slows their thirst there too.
  if (weather === 'heat' && besideTree(layout, ENTRANCE)) squares.push(key(ENTRANCE));
  return new Set(squares);
}

/** Whether a tree stands beside any of these squares. */
const touches = (t: { x: number; y: number }, squares: Set<string>) =>
  [...squares].some((k) => {
    const [x, y] = k.split(',').map(Number);
    return Math.abs(x - t.x) + Math.abs(y - t.y) === 1;
  });

/** Trees whose removal would leave a used bench wet or a used path in the sun under this forecast. */
export function criticalTrees(layout: Layout, weather?: Weather) {
  const trees = attractions(layout).filter((a) => a.piece === 'tree');
  if (!weather) return { critical: [], spare: trees };
  const before = covered(layout, weather);
  const loses = (t: { x: number; y: number }) => {
    const rest = Object.fromEntries(
      Object.entries(layout).filter(([k]) => k !== `${t.x},${t.y}`),
    ) as Layout;
    const after = covered(rest, weather);
    return [...before].some((k) => !after.has(k));
  };
  return { critical: trees.filter(loses), spare: trees.filter((t) => !loses(t)) };
}

/** The over-budget advice. Under a forecast it never names a tree the forecast makes useful. */
function budgetAdvice(layout: Layout, o: Outcome): string {
  const over = `Cut ${o.spent - OPENING_BUDGET} from the plaza.`;
  const general = ' Remove a piece no group used, such as a second stall of the same kind.';
  const { critical, spare } = criticalTrees(layout, o.weather);
  if (!o.weather)
    return `${over}${spare.length ? ' Trees serve no visitor need, so they are the cheapest cut.' : general}`;
  const keep = critical.length ? ` In ${forecastName(o.weather)}, ${TREE_ROLE[o.weather]}.` : '';
  const used = covered(layout, o.weather);
  const idle = spare.find((t) => !touches(t, used));
  const role = o.weather === 'rain' ? 'shelters no connected bench' : 'shades no connected path';
  const shared =
    o.weather === 'rain'
      ? 'only shelters benches another tree also shelters'
      : 'only shades squares another tree also shades';
  const cut = idle ?? spare[0];
  const cheap = cut
    ? ` The tree at ${where(cut)} ${idle ? role : shared}, so it is the cheapest cut.`
    : general;
  return `${over}${keep}${cheap}`;
}

/** The one change most likely to help, read from the outcome and the layout. */
export function improvement(layout: Layout, o: Outcome): string {
  if (o.worst) {
    const piece = SERVES[o.worst.need];
    const name = PIECE_NAME[piece].toLowerCase();
    const cut = attractions(layout).find((a) => a.piece === piece && !a.connected);
    if (wetBenches(layout, o))
      return 'Plant a tree beside a connected bench: in the rain, only a sheltered bench can be used.';
    return cut
      ? `Lay a path from the gate to the ${name} at ${where(cut)}: it is not connected, so nobody can use it.`
      : `Place a ${name} beside a path connected to the gate.`;
  }
  if (o.spent > OPENING_BUDGET) return budgetAdvice(layout, o);
  if (!o.complete) return 'Let the day run to the end, or press Finish now, to see every group.';
  return 'Every goal was met. Try the same goals with fewer pieces.';
}

export type Debrief = { headline: string; lines: string[] };

/** The debrief: each goal with its measured value, the bottleneck, one improvement and the definitions. */
export function debrief(layout: Layout, o: Outcome, previous?: Outcome): Debrief {
  const mark = (ok: boolean) => (ok ? 'met' : 'not met');
  const headline = !o.complete
    ? `Ended early: ${o.arrived} of ${OPENING_GROUPS} groups had arrived. Ended days never earn the pennant.`
    : o.success
      ? 'Opening Day goals met.'
      : 'Opening Day goals not met yet.';
  const lines = [
    `Served ${o.served} of ${OPENING_GROUPS} (goal ${GOAL_SERVED}): ${mark(o.served >= GOAL_SERVED)}.`,
    `Happy ${o.happy} of ${OPENING_GROUPS} (goal ${GOAL_HAPPY}): ${mark(o.happy >= GOAL_HAPPY)}.`,
    `Turned away ${o.unreachable} of ${OPENING_GROUPS}.`,
    `Spent ${o.spent} of ${OPENING_BUDGET}: ${mark(o.spent <= OPENING_BUDGET)}.`,
  ];
  if (o.worst)
    lines.push(
      `Bottleneck: ${o.worst.count} ${o.worst.count === 1 ? 'group was' : 'groups were'} ${NEED_WORD[o.worst.need]} (${o.worst.kinds.join(', ')}) and ${wetBenches(layout, o) ? 'every connected bench was wet in the rain, with no tree beside it' : `no ${PIECE_NAME[SERVES[o.worst.need]].toLowerCase()} touched a connected path`}.`,
    );
  else if (o.spent > OPENING_BUDGET)
    lines.push(`Bottleneck: the plaza is ${o.spent - OPENING_BUDGET} over the Opening Day budget.`);
  lines.push(`Try: ${improvement(layout, o)}`);
  // With no forecast on either try, the debrief reads exactly as it did before forecasts existed.
  const forecasts = Boolean(o.weather || previous?.weather);
  const label = (w?: Weather) => (forecasts ? ` (${forecastName(w)})` : '');
  if (forecasts) lines.push(`Forecast this try: ${forecastName(o.weather)}.`);
  if (previous)
    lines.push(
      `Last try${label(previous.weather)}: served ${previous.served}, happy ${previous.happy}, turned away ${previous.unreachable}, spent ${previous.spent}. This try${label(o.weather)}: served ${o.served}, happy ${o.happy}, turned away ${o.unreachable}, spent ${o.spent}.${previous.weather === o.weather ? '' : ' The forecasts differ, so this is not a same-weather comparison.'}`,
    );
  lines.push(DEFINITIONS.served, DEFINITIONS.happy, DEFINITIONS.unreachable);
  if (o.weather === 'rain') lines.push(DEFINITIONS.wet);
  return { headline, lines };
}

type PennantStorage = Pick<Storage, 'getItem' | 'setItem'>;

export type Pennant = { version: 1; served: number; happy: number; spent: number; at: number };

function parsePennant(raw: string | null): Pennant | undefined {
  if (raw === null) return undefined;
  try {
    const p = JSON.parse(raw) as Partial<Pennant>;
    return p && p.version === 1 && typeof p.at === 'number' ? (p as Pennant) : undefined;
  } catch {
    return undefined;
  }
}

/** The Opening Day pennant, kept under its own key. It never reads or writes scores or stamps. */
export function createPennantStore(storage: PennantStorage | undefined, now = Date.now) {
  function load(): Pennant | undefined {
    try {
      return parsePennant(storage?.getItem(PENNANT_KEY) ?? null);
    } catch {
      return undefined;
    }
  }

  /**
   * Awards the pennant for a successful day. Earning it again keeps the first
   * award. Returns whether this call newly earned it.
   */
  function award(o: Outcome): { earned: boolean; saved: boolean } {
    if (!o.success) return { earned: false, saved: false };
    if (load()) return { earned: false, saved: true };
    try {
      if (!storage) return { earned: true, saved: false };
      const pennant: Pennant = {
        version: 1,
        served: o.served,
        happy: o.happy,
        spent: o.spent,
        at: now(),
      };
      storage.setItem(PENNANT_KEY, JSON.stringify(pennant));
      return { earned: true, saved: true };
    } catch {
      return { earned: true, saved: false };
    }
  }

  return { load, award };
}
