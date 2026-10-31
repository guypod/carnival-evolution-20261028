/**
 * The parade composer: pick and order 3 to 5 floats, choose a cadence, and
 * stage a procession along a fixed route. Plain functions so the sequence can
 * be tested without a browser; only `view.ts` touches the canvas.
 */

export const PARADE_KEY = 'tessl-carnival:parade';
export const PARADE_VERSION = 1;
export const MIN_FLOATS = 3;
export const MAX_FLOATS = 5;

export type MotifId = 'duck' | 'ring' | 'lantern' | 'music' | 'balloon' | 'bell' | 'mole';
export interface Motif {
  id: MotifId;
  name: string;
  icon: string;
  /** A booth whose stamp unlocks this float. Starters have none. */
  unlockedBy?: string;
}

export const MOTIFS: readonly Motif[] = [
  { id: 'duck', name: 'Duck float', icon: '🦆' },
  { id: 'ring', name: 'Ring float', icon: '⭕' },
  { id: 'lantern', name: 'Lantern float', icon: '🏮' },
  { id: 'music', name: 'Music float', icon: '🎵' },
  { id: 'balloon', name: 'Balloon float', icon: '🎈', unlockedBy: 'balloon-darts' },
  { id: 'bell', name: 'Bell float', icon: '🔔', unlockedBy: 'high-striker' },
  { id: 'mole', name: 'Mole float', icon: '🐹', unlockedBy: 'mole-mayhem' },
];
const MOTIF_IDS = new Set<string>(MOTIFS.map((m) => m.id));
export const motif = (id: MotifId) => MOTIFS.find((m) => m.id === id)!;

export type Cadence = 'stroll' | 'march' | 'dance';
export const CADENCES: readonly Cadence[] = ['stroll', 'march', 'dance'];
/** Milliseconds between floats leaving the start, and how long one float takes to walk the route. */
export const CADENCE_TIMING: Record<Cadence, { gap: number; walk: number }> = {
  stroll: { gap: 1600, walk: 9000 },
  march: { gap: 1000, walk: 6000 },
  dance: { gap: 1300, walk: 7500 },
};

export interface Composition {
  floats: readonly MotifId[];
  cadence: Cadence;
}

export const STARTER_COMPOSITION: Composition = {
  floats: ['duck', 'ring', 'lantern'],
  cadence: 'march',
};

/** Which floats can be used, given the booths the player has stamped. */
export function unlockedMotifs(stamped: ReadonlySet<string>): MotifId[] {
  return MOTIFS.filter((m) => !m.unlockedBy || stamped.has(m.unlockedBy)).map((m) => m.id);
}

export type EditResult = { ok: true; composition: Composition } | { ok: false; reason: string };

export function addFloat(c: Composition, id: MotifId, unlocked: readonly MotifId[]): EditResult {
  if (!unlocked.includes(id)) return { ok: false, reason: `${motif(id).name} is locked.` };
  if (c.floats.length >= MAX_FLOATS)
    return { ok: false, reason: `A parade has at most ${MAX_FLOATS} floats.` };
  return { ok: true, composition: { ...c, floats: [...c.floats, id] } };
}

export function removeFloat(c: Composition, index: number): EditResult {
  if (index < 0 || index >= c.floats.length) return { ok: false, reason: 'No float there.' };
  if (c.floats.length <= MIN_FLOATS)
    return { ok: false, reason: `A parade needs at least ${MIN_FLOATS} floats.` };
  return { ok: true, composition: { ...c, floats: c.floats.filter((_, i) => i !== index) } };
}

/** Moves the float at `index` by `delta` places (-1 earlier, 1 later). */
export function moveFloat(c: Composition, index: number, delta: number): EditResult {
  const to = index + delta;
  if (index < 0 || index >= c.floats.length || to < 0 || to >= c.floats.length)
    return { ok: false, reason: 'That float cannot move further.' };
  const floats = [...c.floats];
  [floats[index], floats[to]] = [floats[to], floats[index]];
  return { ok: true, composition: { ...c, floats } };
}

/**
 * Keeps a composition playable with the floats available now: locked floats
 * are dropped, and starters fill it back up to the minimum.
 */
export function fitToUnlocked(c: Composition, unlocked: readonly MotifId[]): Composition {
  const floats = c.floats.filter((id) => unlocked.includes(id)).slice(0, MAX_FLOATS);
  for (const starter of STARTER_COMPOSITION.floats) {
    if (floats.length >= MIN_FLOATS) break;
    floats.push(starter);
  }
  return { ...c, floats };
}

/** How long the whole parade runs, from the first float leaving to the last one arriving. */
export function duration(c: Composition): number {
  const { gap, walk } = CADENCE_TIMING[c.cadence];
  return gap * (c.floats.length - 1) + walk;
}

export interface FloatPosition {
  id: MotifId;
  index: number;
  /** 0 at the start gate, 1 at the finale stage. Absent when the float has not left or has arrived. */
  progress: number;
  phase: 'waiting' | 'marching' | 'arrived';
  /** A small sideways sway in -1..1, shaped by the cadence. */
  sway: number;
}

/** Where every float is `t` milliseconds into the parade. */
export function positionsAt(c: Composition, t: number): FloatPosition[] {
  const { gap, walk } = CADENCE_TIMING[c.cadence];
  return c.floats.map((id, index) => {
    const local = t - index * gap;
    const progress = Math.min(1, Math.max(0, local / walk));
    const phase = local <= 0 ? 'waiting' : local >= walk ? 'arrived' : 'marching';
    const sway =
      phase !== 'marching'
        ? 0
        : c.cadence === 'march'
          ? (Math.floor(local / 250) % 2) * 2 - 1
          : c.cadence === 'dance'
            ? Math.sin(local / 180)
            : Math.sin(local / 600) * 0.4;
    return { id, index, progress, phase, sway };
  });
}

/** The storyboard used in quiet mode: one step per float, each a still frame of who is on the route. */
export function storyboard(c: Composition): { title: string; t: number }[] {
  const { gap, walk } = CADENCE_TIMING[c.cadence];
  const steps = c.floats.map((id, i) => ({
    title: `${i + 1}. ${motif(id).name} sets off`,
    t: i * gap + walk * 0.3,
  }));
  return [{ title: 'Ready at the gate', t: 0 }, ...steps, { title: 'Finale', t: duration(c) }];
}

export type ShowPhase = 'ready' | 'playing' | 'paused' | 'ended';
export interface Show {
  phase: ShowPhase;
  t: number;
}
export const READY: Show = { phase: 'ready', t: 0 };

export const play = (s: Show): Show =>
  s.phase === 'ended' ? { phase: 'playing', t: 0 } : { ...s, phase: 'playing' };
export const pause = (s: Show): Show => (s.phase === 'playing' ? { ...s, phase: 'paused' } : s);
export const restart = (): Show => ({ phase: 'playing', t: 0 });
export const end = (c: Composition): Show => ({ phase: 'ended', t: duration(c) });

/** Moves a playing show on by `dt` milliseconds; it ends itself at the finale. */
export function tick(s: Show, c: Composition, dt: number): Show {
  if (s.phase !== 'playing') return s;
  const t = s.t + Math.max(0, dt);
  return t >= duration(c) ? end(c) : { phase: 'playing', t };
}

export function parseComposition(value: unknown): Composition | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as { version?: unknown; floats?: unknown; cadence?: unknown };
  if (v.version !== PARADE_VERSION) return undefined;
  if (!CADENCES.includes(v.cadence as Cadence)) return undefined;
  if (!Array.isArray(v.floats)) return undefined;
  if (v.floats.length < MIN_FLOATS || v.floats.length > MAX_FLOATS) return undefined;
  if (!v.floats.every((f) => typeof f === 'string' && MOTIF_IDS.has(f))) return undefined;
  return { floats: v.floats as MotifId[], cadence: v.cadence as Cadence };
}

type ParadeStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function createParadeStore(storage: ParadeStorage | undefined) {
  /** The saved composition, or the starter with a note. Never overwrites a bad save. */
  function load(): { composition: Composition; note?: string } {
    const unavailable = {
      composition: STARTER_COMPOSITION,
      note: 'Saving is unavailable in this browser, so this is the starter parade.',
    };
    if (!storage) return unavailable;
    let raw: string | null;
    try {
      raw = storage.getItem(PARADE_KEY);
    } catch {
      return unavailable;
    }
    if (raw === null) return { composition: STARTER_COMPOSITION };
    try {
      const composition = parseComposition(JSON.parse(raw));
      if (composition) return { composition };
    } catch {
      // fall through
    }
    return {
      composition: STARTER_COMPOSITION,
      note: 'Your saved parade could not be read, so this is the starter parade.',
    };
  }

  /** Saves the composition. Returns false when the write failed. */
  function save(c: Composition): boolean {
    try {
      if (!storage) return false;
      storage.setItem(PARADE_KEY, JSON.stringify({ version: PARADE_VERSION, ...c }));
      return true;
    } catch {
      return false;
    }
  }

  return { load, save };
}
