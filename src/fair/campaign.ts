/**
 * Travelling fair campaign: an optional three-stop tour inside Run Your Own
 * Fair. Each stop blocks different squares of the plaza, so the buildable
 * topology changes, and weights visitor priorities differently. The player
 * packs equipment under a capacity budget, arranges it, and runs Opening Day.
 * A modest reputation carries to the next stop. Plain functions, so travel,
 * retries, impossible layouts and saves test without a browser. The sandbox
 * save under FAIR_KEY is never read or written here.
 */
import {
  ENTRANCE,
  PIECES,
  PIECE_NAME,
  inBounds,
  isEntrance,
  key,
  type Cell,
  type Layout,
  type Piece,
} from './fair';
import type { Outcome } from './opening-day';

export const CAMPAIGN_KEY = 'tessl-carnival:fair-campaign';
export const CAMPAIGN_VERSION = 1;

export type StopId = 'riverside' | 'market' | 'hilltop';

export type Stop = {
  id: StopId;
  name: string;
  /** Squares that cannot be built on or walked: water, market stalls, rock. */
  blocked: readonly string[];
  /** How many pieces the wagons can carry to this stop. */
  capacity: number;
  /** What visitors here care about most, told before packing. */
  priority: string;
  /** Extra weight a served or happy group earns here, by what mattered. */
  weight: { served: number; happy: number };
};

export const STOPS: readonly Stop[] = [
  {
    id: 'riverside',
    name: 'Riverside meadow',
    blocked: ['3,0', '3,1', '4,1', '4,2', '5,2', '5,3', '6,3', '6,4'],
    capacity: 14,
    priority: 'A river cuts the meadow: families want benches and shade on the near bank.',
    weight: { served: 1, happy: 2 },
  },
  {
    id: 'market',
    name: 'Market square',
    blocked: ['2,1', '2,2', '5,1', '5,2', '2,4', '5,4'],
    capacity: 12,
    priority:
      'Market stalls crowd the square: shoppers are thirsty and want refreshments close by.',
    weight: { served: 2, happy: 1 },
  },
  {
    id: 'hilltop',
    name: 'Hilltop green',
    blocked: ['1,0', '2,0', '1,5', '2,5', '4,0', '4,5', '6,1', '6,2', '6,4', '7,3'],
    capacity: 10,
    priority: 'A rocky hill with narrow tracks: thrill seekers climb up for the games.',
    weight: { served: 2, happy: 2 },
  },
];

export type Packing = Readonly<Record<Piece, number>>;
export const EMPTY_PACKING: Packing = { path: 0, game: 0, food: 0, bench: 0, tree: 0 };

export const packedCount = (p: Packing) => PIECES.reduce((n, piece) => n + p[piece], 0);

export function stopById(id: StopId): Stop {
  return STOPS.find((s) => s.id === id)!;
}

export const isBlocked = (stop: Stop, c: Cell) => stop.blocked.includes(key(c));

export type Change<T> = { ok: true; value: T } | { ok: false; reason: string };

/** Packs one more of a piece, refusing past the stop's wagon capacity. */
export function pack(stop: Stop, packing: Packing, piece: Piece): Change<Packing> {
  if (packedCount(packing) >= stop.capacity)
    return { ok: false, reason: `The wagons are full: ${stop.capacity} pieces at most.` };
  return { ok: true, value: { ...packing, [piece]: packing[piece] + 1 } };
}

export function unpack(packing: Packing, piece: Piece): Change<Packing> {
  if (packing[piece] === 0)
    return { ok: false, reason: `No ${PIECE_NAME[piece].toLowerCase()} is packed.` };
  return { ok: true, value: { ...packing, [piece]: packing[piece] - 1 } };
}

/** Places a packed piece at the stop, refusing blocked squares and pieces left at home. */
export function placeAtStop(
  stop: Stop,
  packing: Packing,
  layout: Layout,
  cell: Cell,
  piece: Piece,
): Change<Layout> {
  if (!inBounds(cell)) return { ok: false, reason: 'That spot is off the site.' };
  if (isEntrance(cell)) return { ok: false, reason: 'The entrance must stay clear.' };
  if (isBlocked(stop, cell))
    return { ok: false, reason: `Nothing can be built there at ${stop.name}.` };
  const used =
    Object.values(layout).filter((p) => p === piece).length - (layout[key(cell)] === piece ? 1 : 0);
  if (used >= packing[piece])
    return {
      ok: false,
      reason: `Every packed ${PIECE_NAME[piece].toLowerCase()} is already placed.`,
    };
  return { ok: true, value: { ...layout, [key(cell)]: piece } };
}

/** Why a layout cannot open at this stop, or undefined when it can. */
export function layoutProblem(stop: Stop, packing: Packing, layout: Layout): string | undefined {
  if (packedCount(packing) > stop.capacity) return `More than ${stop.capacity} pieces are packed.`;
  for (const [k, piece] of Object.entries(layout)) {
    if (stop.blocked.includes(k))
      return `A ${PIECE_NAME[piece].toLowerCase()} sits on blocked ground.`;
    if (k === key(ENTRANCE)) return 'The entrance must stay clear.';
  }
  for (const piece of PIECES) {
    const used = Object.values(layout).filter((p) => p === piece).length;
    if (used > packing[piece])
      return `More ${PIECE_NAME[piece].toLowerCase()}s are placed than packed.`;
  }
  if (!Object.values(layout).some((p) => p === 'game' || p === 'food' || p === 'bench'))
    return 'Place at least one stall or bench before opening.';
  return undefined;
}

export type Campaign = {
  version: typeof CAMPAIGN_VERSION;
  /** Index into STOPS; STOPS.length means the tour is complete. */
  stop: number;
  reputation: number;
  /** Keepsakes earned, one per stop passed. */
  keepsakes: StopId[];
  packing: Packing;
  layout: Layout;
};

export const NEW_CAMPAIGN: Campaign = {
  version: CAMPAIGN_VERSION,
  stop: 0,
  reputation: 0,
  keepsakes: [],
  packing: EMPTY_PACKING,
  layout: {},
};

/** Each point of reputation lets the wagons carry one more piece, up to three. */
export const capacityFor = (stop: Stop, campaign: Campaign) =>
  stop.capacity + Math.min(3, campaign.reputation);

export const complete = (c: Campaign) => c.stop >= STOPS.length;

/** Reputation a day earns at a stop, from what the simulation measured. */
export function reputationEarned(stop: Stop, o: Outcome): number {
  if (!o.complete || !o.success) return 0;
  return Math.max(
    1,
    Math.round((o.served * stop.weight.served + o.happy * stop.weight.happy) / 10),
  );
}

/** Records a day. A success travels on with a keepsake; anything else stays for a retry with the layout kept. */
export function recordDay(c: Campaign, o: Outcome): Campaign {
  if (complete(c)) return c;
  const stop = STOPS[c.stop];
  const earned = reputationEarned(stop, o);
  if (earned === 0) return c;
  return {
    ...c,
    stop: c.stop + 1,
    reputation: c.reputation + earned,
    keepsakes: [...c.keepsakes, stop.id],
    packing: EMPTY_PACKING,
    layout: {},
  };
}

/** Reads a stored campaign defensively, or undefined when it is not a valid version-1 campaign. */
export function parseCampaign(raw: unknown): Campaign | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const d = raw as Record<string, unknown>;
  if (d.version !== CAMPAIGN_VERSION) return undefined;
  if (!Number.isInteger(d.stop) || (d.stop as number) < 0 || (d.stop as number) > STOPS.length)
    return undefined;
  if (!Number.isInteger(d.reputation) || (d.reputation as number) < 0) return undefined;
  const ids = STOPS.map((s) => s.id);
  if (!Array.isArray(d.keepsakes) || !d.keepsakes.every((k) => ids.includes(k as StopId)))
    return undefined;
  if (!d.packing || typeof d.packing !== 'object' || !d.layout || typeof d.layout !== 'object')
    return undefined;
  const packing = { ...EMPTY_PACKING };
  for (const piece of PIECES) {
    const n = (d.packing as Record<string, unknown>)[piece] ?? 0;
    if (!Number.isInteger(n) || (n as number) < 0) return undefined;
    packing[piece] = n as number;
  }
  const layout: Record<string, Piece> = {};
  for (const [k, piece] of Object.entries(d.layout as Record<string, unknown>)) {
    const m = /^(0|[1-9]\d*),(0|[1-9]\d*)$/.exec(k);
    if (!m || !PIECES.includes(piece as Piece)) return undefined;
    if (!inBounds({ x: Number(m[1]), y: Number(m[2]) })) return undefined;
    layout[k] = piece as Piece;
  }
  return {
    version: CAMPAIGN_VERSION,
    stop: d.stop as number,
    reputation: d.reputation as number,
    keepsakes: d.keepsakes as StopId[],
    packing,
    layout,
  };
}

type CampaignStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function createCampaignStore(storage: CampaignStorage | undefined) {
  /** The saved campaign, or a new one when nothing valid is saved. Never overwrites a bad save on load. */
  function load(): Campaign {
    try {
      const raw = storage?.getItem(CAMPAIGN_KEY);
      return (raw && parseCampaign(JSON.parse(raw))) || NEW_CAMPAIGN;
    } catch {
      return NEW_CAMPAIGN;
    }
  }
  function save(c: Campaign): boolean {
    try {
      if (!storage) return false;
      storage.setItem(CAMPAIGN_KEY, JSON.stringify(c));
      return true;
    } catch {
      return false;
    }
  }
  /** Resets only the campaign. The sandbox plaza and scores are untouched. */
  function reset(): boolean {
    try {
      storage?.removeItem(CAMPAIGN_KEY);
      return Boolean(storage);
    } catch {
      return false;
    }
  }
  return { load, save, reset };
}
