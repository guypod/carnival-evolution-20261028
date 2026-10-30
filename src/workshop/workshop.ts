/**
 * The backstage repair workshop: three broken wind-up toys on a bench. The
 * player moves parts between slots and uses tools, then tests the toy. Every
 * test runs a small, deterministic model of the mechanism, so what moves (and
 * what does not) follows from where the parts are. Wrong set-ups are always
 * safe: a jam slips a clutch, an overshoot hits a stop. Nothing is scored.
 */

import { createSaveSlot, type SaveStorage } from '../carnival';
import type { RepairedToyId } from '../midway/repaired-toys';
import {
  CAM_REACH,
  PEBBLE,
  camOutline,
  frogPose,
  frogRig,
  stallTurn,
  stillPhase,
  type CamShape,
} from './cams';

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
  /** A gear's or cam's turn as drawn, in radians; its outline is turned this far. */
  angle?: number;
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
/** The lever's pivot pin. */
export const LEVER_PIN = { x: 120, y: 200 };

/** How far the bell lever is pulled at `phase` of a test run: 0 at rest, 1 at full pull. */
export function bellPull(phase: number): number {
  return Math.sin(Math.min(1, phase * 2) * Math.PI);
}

/** How far, in radians, the lever has turned about its pin from rest at `phase` of a run. */
export function leverTurn(phase: number): number {
  return -0.25 * bellPull(phase);
}

/** A point on the lever, carried round the pin as the lever turns at `phase`. */
export function onLever(p: { x: number; y: number }, phase: number): { x: number; y: number } {
  const a = leverTurn(phase);
  const dx = p.x - LEVER_PIN.x;
  const dy = p.y - LEVER_PIN.y;
  return {
    x: LEVER_PIN.x + dx * Math.cos(a) - dy * Math.sin(a),
    y: LEVER_PIN.y + dx * Math.sin(a) + dy * Math.cos(a),
  };
}

/** The lever's angle at rest: it rises from left to right. */
export const LEVER_REST = -0.46;
/** The hammer's own pivot, and the bell a full swing meets. */
export const HAMMER_PIVOT = { x: 520, y: 220 };
export const BELL_AT = { x: 650, y: 120 };

/** The hammer's angle about its pivot for a run with `travel` at `phase`: a full swing meets the bell. */
export function hammerAngle(travel: number, phase: number): number {
  return -Math.PI / 2 - 0.8 + travel * bellPull(phase) * 1.69;
}

/** A point `reach` pixels along the hammer from its pivot at `phase` of a run. */
export function onHammer(travel: number, phase: number, reach: number): { x: number; y: number } {
  const a = hammerAngle(travel, phase);
  return { x: HAMMER_PIVOT.x + Math.cos(a) * reach, y: HAMMER_PIVOT.y + Math.sin(a) * reach };
}

// The hopping frog: a shaft, three cams to choose from, and a pebble.
export const CAMS = ['round', 'snail', 'tall'] as const satisfies readonly CamShape[];
export type Cam = (typeof CAMS)[number];
/** Where the cam shaft is on the bench. */
export const SHAFT = { x: 200, y: 200 };
const ROD_REACH = 12;

/** A gear's drawn radius to its teeth's base; the teeth stand GEAR_TEETH further out. */
export function gearRadius(gear: string): number {
  return GEAR_RADII[gear] * GEAR_UNIT - 3;
}
export const GEAR_TEETH = 2;
/** How far a gear's tooth valleys sit inside its drawn radius. */
const GEAR_VALLEY = 4;

/** A gear's toothed outline as drawn, around (0, 0) and turned by `angle`. */
export function gearOutline(r: number, angle: number): { x: number; y: number }[] {
  const teeth = Math.max(8, Math.round(r / 4));
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < teeth * 2; i++) {
    const a = angle + (i * Math.PI) / teeth;
    const rr = i % 2 ? r - GEAR_VALLEY : r + GEAR_TEETH;
    out.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr });
  }
  return out;
}

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

/**
 * Every slot, part and fixture on the bench for a toy, where it is drawn at
 * `phase` of a test `run` (none, and phase 0, when nothing runs). The bell's
 * holes, and the rod in one, ride the turning lever. Mounted gears and the cam
 * on the shaft carry the turn they are drawn at, and a jammed train's shake.
 */
export function targets(toy: ToyState, phase = 0, run?: Run): Target[] {
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
    HOLES.forEach((h) => {
      const at = onLever({ x: LEVER_PIN.x + h * 40, y: LEVER_PIN.y - h * 20 }, phase);
      slot(`hole-${h}`, `lever hole ${h}`, at.x, at.y, 12);
    });
    out.push({ id: 'pin', kind: 'fixture', label: 'pivot pin', ...LEVER_PIN, r: 14 });
  } else {
    const room = Math.max(...CAMS.map(partRadius));
    slot('shaft', 'cam shaft', SHAFT.x, SHAFT.y, room);
    [1, 2, 3].forEach((n) => slot(`tray-${n}`, `tray spot ${n}`, 330 + n * 70, 280, room));
    if (toy.pebble)
      out.push({
        id: 'pebble',
        kind: 'fixture',
        label: 'pebble',
        x: SHAFT.x + PEBBLE.dx,
        y: SHAFT.y + PEBBLE.dy,
        r: 12,
      });
  }
  for (const [part, at] of Object.entries(toy.parts)) {
    const s = slotAt.get(at)!;
    const t: Target = { ...s, id: part, kind: 'part', label: partLabel(part), r: partRadius(part) };
    if (run?.kind === 'gears' && at.startsWith('peg')) {
      t.x += run.jammed && phase < 1 ? Math.sin(phase * 80) * 2 : 0;
      t.angle = gearTurn(phase) * (run.spin[part] ?? 0);
    } else if (run?.kind === 'cam' && at === 'shaft') {
      t.angle = frogPose(run.cam, phase, run.stalled).turns * Math.PI * 2;
    }
    out.push(t);
  }
  return out;
}

/** How far, in radians, a gear with spin 1 (the crank's) has turned at `phase` of a run. */
export function gearTurn(phase: number): number {
  return phase * Math.PI * 4;
}

/** A part's outline as drawn on the bench, or undefined for the rod, which a click finds by its radius. */
export function partOutline(t: Target): { x: number; y: number }[] | undefined {
  const angle = t.angle ?? 0;
  let shape: { x: number; y: number }[];
  if (t.id in GEAR_RADII) shape = gearOutline(gearRadius(t.id), angle);
  else if ((CAMS as readonly string[]).includes(t.id))
    shape = camOutline(t.id as CamShape, angle / (Math.PI * 2));
  else return undefined;
  return shape.map((q) => ({ x: t.x + q.x, y: t.y + q.y }));
}

function inPolygon(
  p: { x: number; y: number },
  poly: readonly { x: number; y: number }[],
): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  return inside;
}

/** Whether `p` is on a part as drawn: inside a gear's teeth or a cam's outline, or the rod's reach. */
export function onPart(t: Target, p: { x: number; y: number }): boolean {
  if (Math.hypot(t.x - p.x, t.y - p.y) > t.r) return false;
  const outline = partOutline(t);
  return !outline || inPolygon(p, outline);
}

/** The parts in the order they are drawn: larger first, so a smaller part lying across a larger one stays on top. */
export function drawOrder(all: readonly Target[]): Target[] {
  return all.filter((t) => t.kind === 'part').sort((a, b) => b.r - a.r);
}

/**
 * The target a pointer at `p` (in bench pixels) lands on, using the same outlines
 * the bench draws at `phase` of a test `run`: a gear's teeth and valleys and a
 * cam's lobe, turned as drawn, tried from the top of the draw order down. A
 * point on no outline, such as a tooth valley, falls back to the topmost part
 * whose reach covers it, so a lone gear is still easy to pick up. With nothing
 * held: a fixture, else that part, else a spot. With a part held: the spot under the pointer, else the spot of the topmost
 * other part there, so it swaps. Spots never overlap, so each answer is
 * unambiguous.
 */
export function hitTarget(
  toy: ToyState,
  p: { x: number; y: number },
  held?: string,
  phase = 0,
  run?: Run,
): Target | undefined {
  const all = targets(toy, phase, run);
  const inside = (t: Target) => Math.hypot(t.x - p.x, t.y - p.y) <= t.r;
  const parts = drawOrder(all)
    .reverse()
    .filter((t) => t.id !== held);
  // The part drawn at the pointer wins; off every outline, the topmost one whose tooth tips reach it.
  const top = parts.find((t) => onPart(t, p)) ?? parts.find(inside);
  const slot = all.find((t) => t.kind === 'slot' && inside(t));
  if (held) return slot ?? top;
  return all.find((t) => t.kind === 'fixture' && inside(t)) ?? top ?? slot;
}

/** How far, in bench pixels, a pointer moves between press and release before it counts as a drag. */
export const DRAG_DISTANCE = 6;

/**
 * Where a part picked up on pointer-down goes on pointer-up: the target to drop
 * it on, or nothing to keep holding it. A release that barely moved is a click,
 * so the part stays in hand for the next click to place, even when its edge lies
 * over another spot. A real drag drops on what is under the pointer, unless that
 * is the spot the part came from.
 */
export function releaseTarget(
  toy: ToyState,
  held: string,
  down: { x: number; y: number },
  up: { x: number; y: number },
  phase = 0,
  run?: Run,
): Target | undefined {
  if (Math.hypot(up.x - down.x, up.y - down.y) < DRAG_DISTANCE) return undefined;
  const target = hitTarget(toy, up, held, phase, run);
  if (target?.kind === 'slot' && toy.parts[held] === target.id) return undefined;
  return target;
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

/** What the arrow keys step through, where they are drawn at `phase`: every part and fixture, and the empty spots. */
export function benchStops(toy: ToyState, phase = 0, run?: Run): Target[] {
  const filled = new Set(Object.values(toy.parts));
  return targets(toy, phase, run).filter((t) => t.kind !== 'slot' || !filled.has(t.id));
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
      ? 'The hammer swings short and never reaches the bell: the rod is too near the pivot to swing it far.'
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

// The inspection rig: the same test run, cranked by hand one still step at a time.

/** How many presses of Inspect step take the toy through one crank turn (one full pull for the bell). */
export const INSPECT_STEPS = 8;

/** The run phase an inspection step shows: the same phase a test run passes through, in even steps. */
export function inspectPhase(step: number): number {
  const at = ((step % INSPECT_STEPS) + INSPECT_STEPS) % INSPECT_STEPS;
  return (at + 1) / (INSPECT_STEPS * 2);
}

/**
 * What the bench shows: a test animating from `startedAt`, or an inspection held
 * at `step`. Both carry the one run of the toy's model, so drawing, clicks and
 * the keyboard ring read the same pose whichever is on.
 */
export type BenchRun = { result: Run } & (
  { mode: 'test'; startedAt: number } | { mode: 'inspect'; step: number }
);

/** Test starts a timed run, and leaves any inspection. */
export function startTest(toy: ToyState, now: number): BenchRun {
  return { result: runToy(toy), mode: 'test', startedAt: now };
}

/**
 * Putting a held part down on `slot`. Back in its own slot nothing moves, but it
 * is still an edit, so like every edit it clears any test or inspection.
 */
export function putDown(
  bench: Bench,
  part: string,
  slot: string,
): { bench: Bench; run: BenchRun | undefined; moved: boolean; message: string } {
  if (slot === bench.toy.parts[part])
    return {
      bench,
      run: undefined,
      moved: false,
      message: `Put the ${partLabel(part)} back down.`,
    };
  const result = movePart(bench.toy, part, slot);
  return { bench: commit(bench, result), run: undefined, moved: true, message: result.message };
}

/** One press of Inspect step: the next step of an inspection, or the first one, which stops any test. */
export function stepInspection(current: BenchRun | undefined, toy: ToyState): BenchRun {
  const step = current?.mode === 'inspect' ? current.step + 1 : 0;
  return { result: runToy(toy), mode: 'inspect', step };
}

/** How far through its run the bench is, 0 to 1. Quiet tests show one still frame that explains the result. */
export function benchPhase(run: BenchRun | undefined, now: number, quiet: boolean, runMs: number) {
  if (!run) return 0;
  if (run.mode === 'inspect') return inspectPhase(run.step);
  if (quiet)
    return run.result.kind === 'cam' ? stillPhase(run.result.cam, run.result.stalled) : 0.25;
  return Math.min(1, (now - run.startedAt) / runMs);
}

export interface Stage {
  /** The part's id on the bench, such as `crank`, `small` or `hammer`. */
  id: string;
  /** The part this stage looks at, as the player reads it. */
  part: string;
  moving: boolean;
  note: string;
}

export interface Inspection {
  stages: Stage[];
  /** The first stage that does not move, where the motion stops; undefined when it all moves. */
  stopsAt: number | undefined;
}

const turnWord = (spin: number) =>
  spin > 0 ? 'turns with the crank' : spin < 0 ? 'turns against the crank' : 'stays still';

/**
 * Walks the same run the Test button uses, from input to output, so the rig never
 * disagrees with a test. Given the `phase` an inspection holds, a shaft that will
 * stall only stalls once its pose has turned the cam onto the pebble.
 */
export function inspectToy(toy: ToyState, run: Run = runToy(toy), phase?: number): Inspection {
  const stages: Stage[] = [];
  if (run.kind === 'gears') {
    const gears = gearsOf(toy).sort((a, b) => a.x - b.x);
    for (const g of gears) {
      const name = g.id === 'crank' || g.id === 'bear' ? `${g.id} gear` : partLabel(g.id);
      stages.push(
        run.jammed
          ? {
              id: g.id,
              part: name,
              moving: false,
              note: `The ${name} is jammed: two gears overlap.`,
            }
          : {
              id: g.id,
              part: name,
              moving: run.spin[g.id] !== 0,
              note: `The ${name} ${turnWord(run.spin[g.id])}.`,
            },
      );
    }
  } else if (run.kind === 'bell') {
    stages.push({ id: 'lever', part: 'lever', moving: true, note: 'The lever swings.' });
    const hole = toy.parts.rod.slice(5);
    stages.push({
      id: 'rod',
      part: 'link rod',
      moving: true,
      note: `The rod's end in hole ${hole} rides the lever.`,
    });
    if (!toy.pinTight) {
      stages.push({
        id: 'hammer',
        part: 'hammer',
        moving: false,
        note: 'The rod slides on the loose pivot pin, so its push never reaches the hammer, which stays still.',
      });
    } else {
      stages.push({
        id: 'hammer',
        part: 'hammer',
        moving: true,
        note: 'The tight pin passes the push down the rod, and the hammer swings.',
      });
      stages.push({
        id: 'bell',
        part: 'bell',
        moving: run.working,
        note: run.working
          ? 'The hammer strikes the bell squarely.'
          : run.travel < 1
            ? 'The hammer swings short and never reaches the bell.'
            : 'The hammer swings past the bell into the rubber stop.',
      });
    }
  } else {
    const stalls =
      run.stalled &&
      (phase === undefined || frogPose(run.cam, phase, true).turns >= stallTurn(run.cam));
    stages.push(
      stalls
        ? {
            id: 'shaft',
            part: 'shaft',
            moving: false,
            note: 'The shaft stalls: the cam is wedged on a pebble.',
          }
        : {
            id: 'shaft',
            part: 'shaft',
            moving: true,
            note: run.stalled
              ? 'The shaft turns with the crank, and the cam is closing on a pebble.'
              : 'The shaft turns with the crank.',
          },
    );
    if (!stalls) {
      stages.push(
        run.cam
          ? {
              id: run.cam,
              part: `${run.cam} cam`,
              moving: true,
              note: `The ${run.cam} cam turns under the rod.`,
            }
          : {
              id: 'cam',
              part: 'cam',
              moving: false,
              note: 'There is no cam on the shaft, so nothing lifts the rod.',
            },
      );
      if (run.cam)
        stages.push({
          id: 'frog',
          part: 'frog',
          moving: true,
          note: run.stalled ? 'The follower lifts the frog.' : run.message,
        });
    }
  }
  // A stall upstream means nothing after it moves either.
  const first = stages.findIndex((s) => !s.moving);
  return { stages, stopsAt: first < 0 ? undefined : first };
}

/** What the rig says at a step: which parts carry the motion, and where and why it stops. */
export function inspectionLine(inspection: Inspection, step: number): string {
  const { stages, stopsAt } = inspection;
  const at = ((step % INSPECT_STEPS) + INSPECT_STEPS) % INSPECT_STEPS;
  const head = `Inspect step ${at + 1} of ${INSPECT_STEPS}:`;
  if (stopsAt === undefined)
    return `${head} motion reaches the ${stages.at(-1)!.part}. ${stages.at(-1)!.note}`;
  const moving = stages.slice(0, stopsAt).map((s) => s.part);
  const passes = moving.length ? `motion passes the ${moving.join(', ')} and ` : 'motion ';
  return `${head} ${passes}stops at the ${stages[stopsAt].part}. ${stages[stopsAt].note}`;
}

/** One labelled arrow the rig draws on the bench, beside a part where it is drawn now. */
export interface InspectionMark {
  id: string;
  /** The words beside the arrow, such as "2 large gear: turns": never colour alone. */
  label: string;
  /** Where the part is drawn at this step, in bench pixels. */
  x: number;
  y: number;
  /** Moves: the motion reaches it. Stops: the first still part. Still: past the stop. */
  state: 'moves' | 'stops' | 'still';
  /** For a turning part, its direction against the crank's: 1 with it, -1 against. */
  turn?: number;
}

/**
 * Where the rig's arrows go at `phase` of `run`: on each stage's part, read from
 * the same targets the bench draws, clicks and rings, so a mark sits on its part.
 */
export function inspectionMarks(toy: ToyState, run: Run, phase: number): InspectionMark[] {
  const { stages, stopsAt } = inspectToy(toy, run, phase);
  const at = new Map(targets(toy, phase, run).map((t) => [t.id, t]));
  const fixed: Record<string, { x: number; y: number }> = {
    crank: { x: GEAR_LEFT + CRANK.x * GEAR_UNIT, y: GEAR_Y },
    bear: { x: GEAR_LEFT + BEAR.x * GEAR_UNIT, y: GEAR_Y },
    lever: onLever(
      { x: LEVER_PIN.x + 100 * Math.cos(LEVER_REST), y: LEVER_PIN.y + 100 * Math.sin(LEVER_REST) },
      phase,
    ),
    hammer: onHammer(run.kind === 'bell' ? run.travel : 0, phase, 130),
    bell: BELL_AT,
    shaft: SHAFT,
    cam: SHAFT,
    frog: { x: SHAFT.x, y: SHAFT.y + frogRig(frogPose(undefined, 0, false)).frog },
  };
  const caught = run.kind === 'cam' && frogPose(run.cam, phase, run.stalled).caught;
  if (run.kind === 'cam') {
    const pose = frogPose(run.cam, phase, run.stalled);
    fixed.frog = { x: SHAFT.x, y: SHAFT.y + frogRig(pose).frog };
  }
  return stages.map((s, i) => {
    const where = at.get(s.id) ?? fixed[s.id];
    // Past the catch, the guard holds the frog still while the follower drops.
    const held = caught && s.id === 'frog';
    const state = held
      ? 'stops'
      : stopsAt === undefined || i < stopsAt
        ? 'moves'
        : i === stopsAt
          ? 'stops'
          : 'still';
    const word = held
      ? 'held still by the guard'
      : state === 'stops'
        ? 'stops here'
        : state === 'still'
          ? 'still'
          : motionWord(run, s.id);
    const turn = run.kind === 'gears' && state === 'moves' ? Math.sign(run.spin[s.id]) : undefined;
    return { id: s.id, label: `${i + 1} ${s.part}: ${word}`, x: where.x, y: where.y, state, turn };
  });
}

function motionWord(run: Run, id: string): string {
  if (run.kind === 'gears') return run.spin[id] > 0 ? 'turns with crank' : 'turns against crank';
  if (run.kind === 'bell') return id === 'bell' ? 'rings' : id === 'hammer' ? 'swings' : 'moves';
  return id === 'frog' ? 'rises and falls' : 'turns';
}

/** The bench's accessible name for the ringed target, with what the rig says about it while inspecting. */
export function benchLabel(
  focus: Target | undefined,
  tool: Tool,
  marks?: readonly InspectionMark[],
): string {
  const keys = 'Left and right arrows pick a part or spot, Enter or Space acts on it';
  if (!focus) return `Repair bench. ${keys}.`;
  const mark = marks?.find((m) => m.id === focus.id);
  const inspected = mark ? `, inspecting: ${mark.label.replace(/^\d+ /, '')}` : '';
  return `Repair bench, ${focus.label} picked${inspected}. ${keys} with the ${tool}.`;
}
