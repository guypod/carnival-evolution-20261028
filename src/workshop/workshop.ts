/**
 * The backstage repair workshop: three broken wind-up toys on a bench. The
 * player moves parts between slots and uses tools, then tests the toy. Every
 * test runs a small, deterministic model of the mechanism, so what moves (and
 * what does not) follows from where the parts are. Wrong set-ups are always
 * safe: a jam slips a clutch, an overshoot hits a stop. Nothing is scored.
 */

import { createSaveSlot, type SaveStorage } from '../carnival';
import type { RepairedToyId } from '../midway/repaired-toys';

export type ToyId = RepairedToyId;
export type Tool = 'hand' | 'screwdriver' | 'tweezers';
export const TOOLS: readonly Tool[] = ['hand', 'screwdriver', 'tweezers'];

/** Where each movable part sits: a part id to a slot id. */
export type Placement = Record<string, string>;

export interface ToyState {
  id: ToyId;
  parts: Placement;
  /** Bell: whether the pivot pin is tightened. */
  pinTight: boolean;
  /** Frog: whether the pebble is still lodged in the cam track. */
  pebble: boolean;
}

export interface Target {
  id: string;
  kind: 'slot' | 'part' | 'fixture';
  label: string;
  /** Bench position in canvas pixels, and the radius a click or drop lands in. */
  x: number;
  y: number;
  r: number;
}

export interface ToyInfo {
  id: ToyId;
  name: string;
  fault: string;
  /** What the midway prop does once the toy works. */
  repairedNote: string;
}

export const TOYS: readonly ToyInfo[] = [
  {
    id: 'music-box',
    name: 'Dancing Bear Music Box',
    fault: 'Turn the crank and the bear stays still: the gear train is out of line.',
    repairedNote: 'The bear spins on its music box beside the entrance.',
  },
  {
    id: 'rooster-bell',
    name: 'Rooster Bell',
    fault: 'Pull the lever and the hammer barely moves: the linkage is loose.',
    repairedNote: 'The rooster rings its bell beside the entrance.',
  },
  {
    id: 'hopping-frog',
    name: 'Hopping Frog Automaton',
    fault: 'Turn the crank and the frog will not hop: the cam is stuck.',
    repairedNote: 'The frog hops on its cam beside the entrance.',
  },
];

export function toyInfo(id: ToyId): ToyInfo {
  return TOYS.find((t) => t.id === id)!;
}

/**
 * The bench canvas in pixels. Every target below is in these units; a pointer is
 * mapped onto them with benchPoint, whatever size the canvas is shown at.
 */
export const BENCH = { width: 720, height: 470 };

// The music box: a crank gear and the bear's gear, with five pegs between.
/** Gear radii in peg units; one peg unit is GEAR_UNIT pixels on the bench. */
export const GEAR_RADII: Record<string, number> = { small: 1, medium: 2, large: 3 };
const CRANK = { x: 0, r: 2 };
const BEAR = { x: 10, r: 2 };
export const PEGS = [3, 4, 5, 6, 7];
const GEAR_UNIT = 30;
const GEAR_LEFT = 60;
const GEAR_Y = 150;
/** The music box tray: a row on the bench below the pegs, each spot as wide as the large gear. */
const GEAR_TRAY = { left: 150, gap: 210, y: 360 };

// The rooster bell: a lever with three holes, a link rod, and the hammer.
export const HOLES = [1, 2, 3];
/** Hammer travel for each hole: the bell rings only at the middle one. */
const RING_HOLE = 2;

// The hopping frog: a shaft, three cams to choose from, and a pebble.
export const CAMS = ['round', 'snail', 'tall'] as const;
export type Cam = (typeof CAMS)[number];
/** How far each cam reaches from the shaft at its widest, as drawn. */
export const CAM_REACH: Record<Cam, number> = { round: 22, snail: 30, tall: 34 };
const ROD_REACH = 12;

/** A gear's drawn radius to its teeth's base; the teeth stand GEAR_TEETH further out. */
export function gearRadius(gear: string): number {
  return GEAR_RADII[gear] * GEAR_UNIT - 3;
}
export const GEAR_TEETH = 2;

/**
 * How far a part reaches from its centre as drawn: a gear's tooth tips, a cam's
 * widest lobe. A part is the same size on a peg, on the shaft or in the tray,
 * and a click picks it up anywhere inside this outline.
 */
export function partRadius(part: string): number {
  if (part in GEAR_RADII) return gearRadius(part) + GEAR_TEETH;
  if (part === 'rod') return ROD_REACH;
  return CAM_REACH[part as Cam];
}

export function faultyToy(id: ToyId): ToyState {
  switch (id) {
    case 'music-box':
      return {
        id,
        parts: { small: 'tray-1', medium: 'peg-4', large: 'tray-3' },
        pinTight: false,
        pebble: false,
      };
    case 'rooster-bell':
      return { id, parts: { rod: 'hole-1' }, pinTight: false, pebble: false };
    case 'hopping-frog':
      return {
        id,
        parts: { round: 'shaft', snail: 'tray-2', tall: 'tray-3' },
        pinTight: false,
        pebble: true,
      };
  }
}

/** Every slot, part and fixture on the bench for a toy, where it is drawn now. */
export function targets(toy: ToyState): Target[] {
  const out: Target[] = [];
  const slotAt = new Map<string, Target>();
  const slot = (id: string, label: string, x: number, y: number, r: number) => {
    const t: Target = { id, kind: 'slot', label, x, y, r };
    slotAt.set(id, t);
    out.push(t);
  };
  if (toy.id === 'music-box') {
    for (const p of PEGS) slot(`peg-${p}`, `peg ${p - 2}`, GEAR_LEFT + p * GEAR_UNIT, GEAR_Y, 14);
    // Each tray spot holds the largest gear whole, inside the bench and clear of the others.
    const room = Math.max(...Object.keys(GEAR_RADII).map(partRadius));
    [1, 2, 3].forEach((n) =>
      slot(
        `tray-${n}`,
        `tray spot ${n}`,
        GEAR_TRAY.left + (n - 1) * GEAR_TRAY.gap,
        GEAR_TRAY.y,
        room,
      ),
    );
  } else if (toy.id === 'rooster-bell') {
    HOLES.forEach((h) => slot(`hole-${h}`, `lever hole ${h}`, 120 + h * 40, 200 - h * 20, 12));
    out.push({ id: 'pin', kind: 'fixture', label: 'pivot pin', x: 120, y: 200, r: 14 });
  } else {
    const room = Math.max(...CAMS.map(partRadius));
    slot('shaft', 'cam shaft', 200, 200, room);
    [1, 2, 3].forEach((n) => slot(`tray-${n}`, `tray spot ${n}`, 330 + n * 70, 280, room));
    if (toy.pebble)
      out.push({ id: 'pebble', kind: 'fixture', label: 'pebble', x: 236, y: 172, r: 12 });
  }
  for (const [part, at] of Object.entries(toy.parts)) {
    const s = slotAt.get(at)!;
    out.push({ ...s, id: part, kind: 'part', label: partLabel(part), r: partRadius(part) });
  }
  return out;
}

/** The parts in the order they are drawn: larger first, so a smaller part lying across a larger one stays on top. */
export function drawOrder(all: readonly Target[]): Target[] {
  return all.filter((t) => t.kind === 'part').sort((a, b) => b.r - a.r);
}

/**
 * The target a pointer at `p` (in bench pixels) lands on, using the same outlines
 * the bench draws. With nothing held: a fixture, else the topmost part, else a
 * spot. With a part held: the spot under the pointer, else the spot of the
 * topmost other part there, so it swaps. Spots never overlap, so each answer is
 * unambiguous.
 */
export function hitTarget(
  toy: ToyState,
  p: { x: number; y: number },
  held?: string,
): Target | undefined {
  const all = targets(toy);
  const inside = (t: Target) => Math.hypot(t.x - p.x, t.y - p.y) <= t.r;
  const top = drawOrder(all)
    .filter((t) => t.id !== held && inside(t))
    .pop();
  const slot = all.find((t) => t.kind === 'slot' && inside(t));
  if (held) return slot ?? top;
  return all.find((t) => t.kind === 'fixture' && inside(t)) ?? top ?? slot;
}

/** Maps a pointer's page position onto bench pixels, for a canvas shown at any size. */
export function benchPoint(
  client: { x: number; y: number },
  box: { left: number; top: number; width: number; height: number },
): { x: number; y: number } {
  return {
    x: ((client.x - box.left) / box.width) * BENCH.width,
    y: ((client.y - box.top) / box.height) * BENCH.height,
  };
}

/** What the arrow keys step through: every part and fixture, and the empty spots. */
export function benchStops(toy: ToyState): Target[] {
  const filled = new Set(Object.values(toy.parts));
  return targets(toy).filter((t) => t.kind !== 'slot' || !filled.has(t.id));
}

/** The spot a held part goes to when placed on a target: the spot itself, or the spot of the part there. */
export function dropSlot(toy: ToyState, target: Target): string {
  return target.kind === 'slot' ? target.id : (toy.parts[target.id] ?? target.id);
}

export function partLabel(part: string): string {
  if (part === 'rod') return 'link rod';
  if (part in GEAR_RADII) return `${part} gear`;
  return `${part} cam`;
}

export interface Result {
  toy: ToyState;
  /** Whether the bench changed, so undo has a step to keep. */
  changed: boolean;
  message: string;
}

/** Moves a part onto a slot. A part already there swaps into the part's old slot. */
export function movePart(toy: ToyState, part: string, slot: string): Result {
  const from = toy.parts[part];
  const label = partLabel(part);
  if (from === undefined) return { toy, changed: false, message: 'That part does not move.' };
  if (!targets(toy).some((t) => t.kind === 'slot' && t.id === slot))
    return { toy, changed: false, message: `The ${label} does not fit there.` };
  if (from === slot) return { toy, changed: false, message: `The ${label} is already there.` };
  if (toy.id === 'rooster-bell' && toy.pinTight)
    return {
      toy,
      changed: false,
      message: 'The tight pin holds the rod in place. Loosen it with the screwdriver first.',
    };
  if (toy.id === 'hopping-frog' && toy.pebble && (from === 'shaft' || slot === 'shaft'))
    return {
      toy,
      changed: false,
      message: 'The pebble wedges the cam on its shaft. Lift it out with the tweezers first.',
    };
  const parts = { ...toy.parts };
  const other = Object.keys(parts).find((p) => parts[p] === slot);
  parts[part] = slot;
  if (other) parts[other] = from;
  const swapped = other ? `, and the ${partLabel(other)} goes where it was` : '';
  return {
    toy: { ...toy, parts },
    changed: true,
    message: `Moved the ${label} to the ${slotLabel(toy, slot)}${swapped}.`,
  };
}

function slotLabel(toy: ToyState, slot: string): string {
  return targets(toy).find((t) => t.id === slot)?.label ?? slot;
}

/** Uses a tool on a fixture. The hand moves parts instead, through movePart. */
export function useTool(toy: ToyState, tool: Tool, target: string): Result {
  if (tool === 'screwdriver' && toy.id === 'rooster-bell' && target === 'pin') {
    const pinTight = !toy.pinTight;
    return {
      toy: { ...toy, pinTight },
      changed: true,
      message: pinTight ? 'Tightened the pivot pin.' : 'Loosened the pivot pin.',
    };
  }
  if (tool === 'tweezers' && toy.id === 'hopping-frog' && target === 'pebble' && toy.pebble)
    return {
      toy: { ...toy, pebble: false },
      changed: true,
      message: 'Lifted the pebble out of the cam track.',
    };
  return { toy, changed: false, message: `The ${tool} has nothing to do there.` };
}

// The models. Each says what every moving piece does as the input turns once.

export interface GearRun {
  kind: 'gears';
  /** Each gear's turn for one crank turn: + with the crank, - against, 0 still. */
  spin: Record<string, number>;
  jammed: boolean;
}
export interface BellRun {
  kind: 'bell';
  /** How far the hammer swings, 0 to 1.5; 1 strikes the bell squarely. */
  travel: number;
}
export interface CamRun {
  kind: 'cam';
  cam: Cam | undefined;
  stalled: boolean;
}
export type Run = (GearRun | BellRun | CamRun) & { working: boolean; message: string };

interface Gear {
  id: string;
  x: number;
  r: number;
}

function gearsOf(toy: ToyState): Gear[] {
  const loose = Object.entries(toy.parts)
    .filter(([, at]) => at.startsWith('peg-'))
    .map(([id, at]) => ({ id, x: Number(at.slice(4)), r: GEAR_RADII[id] }));
  return [{ id: 'crank', ...CRANK }, ...loose, { id: 'bear', ...BEAR }];
}

/** Turns the crank once and works out which gears follow. */
export function runToy(toy: ToyState): Run {
  if (toy.id === 'music-box') return runGears(toy);
  if (toy.id === 'rooster-bell') return runBell(toy);
  return runCam(toy);
}

function runGears(toy: ToyState): Run {
  const gears = gearsOf(toy);
  const meshes = (a: Gear, b: Gear) => Math.abs(a.x - b.x) === a.r + b.r;
  const overlaps = (a: Gear, b: Gear) => Math.abs(a.x - b.x) < a.r + b.r;
  const jammed = gears.some((a, i) => gears.slice(i + 1).some((b) => overlaps(a, b)));
  const spin: Record<string, number> = Object.fromEntries(gears.map((g) => [g.id, 0]));
  if (jammed) {
    return {
      kind: 'gears',
      spin,
      jammed,
      working: false,
      message:
        'Two gears overlap, so the crank will not turn. The slip clutch gives way and nothing breaks.',
    };
  }
  // Drive spreads tooth to tooth: each meshed neighbour turns the other way, scaled by size.
  spin.crank = 1;
  const queue = ['crank'];
  while (queue.length) {
    const id = queue.shift();
    const g = gears.find((x) => x.id === id)!;
    for (const n of gears) {
      if (spin[n.id] !== 0 || !meshes(g, n)) continue;
      spin[n.id] = (-spin[g.id] * g.r) / n.r;
      queue.push(n.id);
    }
  }
  const bear = spin.bear;
  const message =
    bear > 0
      ? 'The bear dances forward as the crank turns.'
      : bear < 0
        ? 'The bear spins, but backwards. Every meshed gear turns the next one the other way.'
        : 'The crank turns, but the drive never reaches the bear: there is a gap in the gear train.';
  return { kind: 'gears', spin, jammed, working: bear > 0, message };
}

function runBell(toy: ToyState): Run {
  if (!toy.pinTight)
    return {
      kind: 'bell',
      travel: 0,
      working: false,
      message: 'The lever swings, but the rod slides on the loose pin and the hammer stays put.',
    };
  const hole = Number(toy.parts.rod.slice(5));
  const travel = hole / RING_HOLE;
  const message =
    hole < RING_HOLE
      ? 'The hammer only taps the bell: the rod is too near the pivot to swing it far.'
      : hole > RING_HOLE
        ? 'The hammer swings past the bell and thumps the rubber stop. Too far from the pivot.'
        : 'The hammer strikes the bell squarely. Ding!';
  return { kind: 'bell', travel, working: hole === RING_HOLE, message };
}

function runCam(toy: ToyState): Run {
  const cam = CAMS.find((c) => toy.parts[c] === 'shaft');
  if (toy.pebble)
    return {
      kind: 'cam',
      cam,
      stalled: true,
      working: false,
      message: 'The cam catches on a pebble and stalls. The clutch slips, so nothing breaks.',
    };
  const message = !cam
    ? 'The shaft turns with no cam on it, so the frog sits still.'
    : cam === 'round'
      ? 'The round cam only bobs the frog up and down. A hop needs a sudden drop.'
      : cam === 'tall'
        ? 'The tall cam lifts the frog right off its rod, and the safety guard catches it.'
        : 'The snail cam lifts the frog slowly and drops it: a proper hop!';
  return { kind: 'cam', cam, stalled: false, working: cam === 'snail', message };
}

/** The frog's lift, 0 to 1 and above, at a point (0 to 1) of one cam turn. */
export function camLift(cam: Cam | undefined, t: number): number {
  const p = ((t % 1) + 1) % 1;
  if (cam === 'round') return 0.3 * (1 - Math.cos(p * Math.PI * 2));
  if (cam === 'snail') return p;
  if (cam === 'tall') return Math.min(1.5, 2 * p);
  return 0;
}

// The bench: the toy in hand, an undo history, and the toys already repaired.

export const UNDO_DEPTH = 30;

export interface Bench {
  toy: ToyState;
  history: ToyState[];
}

export function openBench(toy: ToyState): Bench {
  return { toy, history: [] };
}

/** Keeps a changed toy, with the old one on the undo history. */
export function commit(bench: Bench, result: Result): Bench {
  if (!result.changed) return bench;
  return { toy: result.toy, history: [...bench.history, bench.toy].slice(-UNDO_DEPTH) };
}

export function undo(bench: Bench): Bench {
  const previous = bench.history[bench.history.length - 1];
  if (!previous) return bench;
  return { toy: previous, history: bench.history.slice(0, -1) };
}

/** Back to the toy's original faults. Undo brings the bench back. */
export function resetBench(bench: Bench): Bench {
  return commit(bench, { toy: faultyToy(bench.toy.id), changed: true, message: '' });
}

/** Rebuilds a saved toy from scratch, keeping it only if every part is in a real slot. */
export function parseToy(raw: unknown, id: ToyId): ToyState | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const { parts, pinTight, pebble } = raw as Partial<ToyState>;
  if (typeof pinTight !== 'boolean' || typeof pebble !== 'boolean') return undefined;
  if (!parts || typeof parts !== 'object') return undefined;
  const base = faultyToy(id);
  if (id !== 'hopping-frog' && pebble) return undefined;
  const names = Object.keys(base.parts);
  const entries = Object.entries(parts);
  if (entries.length !== names.length) return undefined;
  const slots = new Set(
    targets(base)
      .filter((t) => t.kind === 'slot')
      .map((t) => t.id),
  );
  const used = new Set<string>();
  for (const [name, at] of entries) {
    if (!names.includes(name) || typeof at !== 'string' || !slots.has(at) || used.has(at))
      return undefined;
    used.add(at);
  }
  return { id, parts: { ...(parts as Placement) }, pinTight, pebble };
}

export interface Repairs {
  /** The working toy for each repaired toy, so the bench opens as it was left. */
  toys: Partial<Record<ToyId, ToyState>>;
  /** Whether repaired toys stand on the midway. */
  shown: boolean;
}

export const NO_REPAIRS: Repairs = { toys: {}, shown: true };

/** Reads saved repairs. A toy whose saved set-up does not actually work is dropped. */
export function parseRepairs(raw: unknown): Repairs | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const { toys, shown } = raw as Partial<Repairs>;
  if (typeof shown !== 'boolean' || !toys || typeof toys !== 'object') return undefined;
  const kept: Repairs['toys'] = {};
  for (const { id } of TOYS) {
    const toy = parseToy((toys as Record<string, unknown>)[id], id);
    if (toy && runToy(toy).working) kept[id] = toy;
  }
  return { toys: kept, shown };
}

/** Records a repair, only when the toy's own test says it works. */
export function recordRepair(repairs: Repairs, toy: ToyState): Repairs {
  if (!runToy(toy).working) return repairs;
  return { ...repairs, toys: { ...repairs.toys, [toy.id]: toy } };
}

/** The toys that stand on the midway now. */
export function midwayToys(repairs: Repairs): RepairedToyId[] {
  if (!repairs.shown) return [];
  return TOYS.map((t) => t.id).filter((id) => repairs.toys[id]);
}

export const REPAIRS_KEY = 'tessl-carnival:repair-workshop';

export function createRepairsStore(storage: SaveStorage | undefined) {
  const slot = createSaveSlot(storage, {
    key: REPAIRS_KEY,
    maxLength: 2000,
    parse: parseRepairs,
  });
  return {
    load: (): Repairs => slot.load() ?? NO_REPAIRS,
    save: (repairs: Repairs) => slot.save(repairs),
  };
}
