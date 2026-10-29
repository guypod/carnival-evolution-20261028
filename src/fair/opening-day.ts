/**
 * Opening Day: a short, optional challenge inside Run Your Own Fair. The
 * player builds, then opens the gates to a fixed, seeded set of visitor
 * groups that walk the real layout with the real visitor simulation. The
 * debrief reads only what the simulation measured. Plain functions, so goals,
 * early exit, retry and the pennant test without a browser.
 */
import { PIECE_NAME, attractions, spent, type Layout } from './fair';
import { KIND_NAME, SERVES, createSim, tick, type Group, type Need, type Sim } from './visitors';

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
};

/** Starts the gates on `layout`, with the same seeded visitors every time. */
export function openGates(layout: Layout): Sim {
  return createSim(layout, OPENING_SEED, false, OPENING_GROUPS);
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
  };
}

const NEED_WORD: Record<Need, string> = { fun: 'bored', rest: 'tired', thirst: 'thirsty' };
const where = (c: { x: number; y: number }) => `column ${c.x + 1}, row ${c.y + 1}`;

/** The one change most likely to help, read from the outcome and the layout. */
export function improvement(layout: Layout, o: Outcome): string {
  if (o.worst) {
    const piece = SERVES[o.worst.need];
    const name = PIECE_NAME[piece].toLowerCase();
    const cut = attractions(layout).find((a) => a.piece === piece && !a.connected);
    return cut
      ? `Lay a path from the gate to the ${name} at ${where(cut)}: it is not connected, so nobody can use it.`
      : `Place a ${name} beside a path connected to the gate.`;
  }
  if (o.spent > OPENING_BUDGET) {
    const trees = attractions(layout).filter((a) => a.piece === 'tree').length;
    return `Cut ${o.spent - OPENING_BUDGET} from the plaza.${trees ? ' Trees serve no visitor need, so they are the cheapest cut.' : ' Remove a piece no group used, such as a second stall of the same kind.'}`;
  }
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
      `Bottleneck: ${o.worst.count} ${o.worst.count === 1 ? 'group was' : 'groups were'} ${NEED_WORD[o.worst.need]} (${o.worst.kinds.join(', ')}) and no ${PIECE_NAME[SERVES[o.worst.need]].toLowerCase()} touched a connected path.`,
    );
  else if (o.spent > OPENING_BUDGET)
    lines.push(`Bottleneck: the plaza is ${o.spent - OPENING_BUDGET} over the Opening Day budget.`);
  lines.push(`Try: ${improvement(layout, o)}`);
  if (previous)
    lines.push(
      `Last try: served ${previous.served}, happy ${previous.happy}, turned away ${previous.unreachable}, spent ${previous.spent}. This try: served ${o.served}, happy ${o.happy}, turned away ${o.unreachable}, spent ${o.spent}.`,
    );
  lines.push(DEFINITIONS.served, DEFINITIONS.happy, DEFINITIONS.unreachable);
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
