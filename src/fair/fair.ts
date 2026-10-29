/**
 * Run Your Own Fair: a small editable plaza. Plain functions over a layout, so
 * placement, budget, connectivity and saves are testable without a browser.
 * The visitor-group animation can reuse `connectedAttractions` and `walkable`.
 */
export const FAIR_WIDTH = 8;
export const FAIR_HEIGHT = 6;
export const FAIR_BUDGET = 300;
export const FAIR_VERSION = 1;
export const FAIR_KEY = 'tessl-carnival:fair';
export const ENTRANCE = { x: 0, y: 3 } as const;

export type Piece = 'path' | 'game' | 'food' | 'bench' | 'tree';
export const PIECES: readonly Piece[] = ['path', 'game', 'food', 'bench', 'tree'];
export const PIECE_COST: Record<Piece, number> = {
  path: 5,
  game: 40,
  food: 30,
  bench: 10,
  tree: 8,
};
export const PIECE_NAME: Record<Piece, string> = {
  path: 'Path',
  game: 'Game stall',
  food: 'Refreshment stall',
  bench: 'Bench',
  tree: 'Tree',
};

/** Cells keyed "x,y". Empty cells are left out. */
export type Layout = Readonly<Record<string, Piece>>;
export type Cell = { x: number; y: number };

export const key = (c: Cell) => `${c.x},${c.y}`;
export const inBounds = (c: Cell) => c.x >= 0 && c.y >= 0 && c.x < FAIR_WIDTH && c.y < FAIR_HEIGHT;
export const isEntrance = (c: Cell) => c.x === ENTRANCE.x && c.y === ENTRANCE.y;

export function spent(layout: Layout): number {
  return Object.values(layout).reduce((sum, piece) => sum + PIECE_COST[piece], 0);
}

export function remaining(layout: Layout): number {
  return FAIR_BUDGET - spent(layout);
}

export type PlaceResult = { ok: true; layout: Layout } | { ok: false; reason: string };

/** Places a piece, replacing whatever was there. Never on the entrance, off the grid or over budget. */
export function place(layout: Layout, cell: Cell, piece: Piece): PlaceResult {
  if (!inBounds(cell)) return { ok: false, reason: 'That spot is off the plaza.' };
  if (isEntrance(cell)) return { ok: false, reason: 'The entrance must stay clear.' };
  const current = layout[key(cell)];
  if (current === piece)
    return { ok: false, reason: `There is already a ${PIECE_NAME[piece].toLowerCase()} here.` };
  const refund = current ? PIECE_COST[current] : 0;
  if (PIECE_COST[piece] - refund > remaining(layout))
    return {
      ok: false,
      reason: `Not enough budget: ${PIECE_NAME[piece]} costs ${PIECE_COST[piece]}, ${remaining(layout) + refund} left.`,
    };
  return { ok: true, layout: { ...layout, [key(cell)]: piece } };
}

export function remove(layout: Layout, cell: Cell): PlaceResult {
  if (!layout[key(cell)]) return { ok: false, reason: 'Nothing to remove here.' };
  const next = { ...layout };
  delete next[key(cell)];
  return { ok: true, layout: next };
}

/** Moves a piece to an empty cell. Cost is unchanged. */
export function move(layout: Layout, from: Cell, to: Cell): PlaceResult {
  const piece = layout[key(from)];
  if (!piece) return { ok: false, reason: 'Nothing to move here.' };
  if (!inBounds(to)) return { ok: false, reason: 'That spot is off the plaza.' };
  if (isEntrance(to)) return { ok: false, reason: 'The entrance must stay clear.' };
  if (layout[key(to)]) return { ok: false, reason: 'That spot is taken.' };
  const next = { ...layout, [key(to)]: piece };
  delete next[key(from)];
  return { ok: true, layout: next };
}

const STEPS: readonly Cell[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

/** Whether a visitor can stand here: the entrance or a path. */
export function walkable(layout: Layout, cell: Cell): boolean {
  return inBounds(cell) && (isEntrance(cell) || layout[key(cell)] === 'path');
}

/** Every walkable cell reachable from the entrance, as keys. */
export function reachable(layout: Layout): Set<string> {
  const seen = new Set([key(ENTRANCE)]);
  const queue: Cell[] = [ENTRANCE];
  while (queue.length) {
    const at = queue.shift()!;
    for (const step of STEPS) {
      const next = { x: at.x + step.x, y: at.y + step.y };
      if (walkable(layout, next) && !seen.has(key(next))) {
        seen.add(key(next));
        queue.push(next);
      }
    }
  }
  return seen;
}

export type Placed = Cell & { piece: Piece; connected: boolean };

/** Every non-path piece, and whether a visitor on the paths can reach it (stand next to it). */
export function attractions(layout: Layout): Placed[] {
  const reach = reachable(layout);
  return Object.entries(layout)
    .filter(([, piece]) => piece !== 'path')
    .map(([k, piece]) => {
      const [x, y] = k.split(',').map(Number);
      const connected = STEPS.some((s) => reach.has(key({ x: x + s.x, y: y + s.y })));
      return { x, y, piece, connected };
    })
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

export function connectedAttractions(layout: Layout): Placed[] {
  return attractions(layout).filter((a) => a.connected && a.piece !== 'tree');
}

/** How the plaza's space splits between play, rest and service, counting placed pieces. */
export function balance(layout: Layout) {
  const pieces = Object.values(layout);
  return {
    play: pieces.filter((p) => p === 'game').length,
    rest: pieces.filter((p) => p === 'bench' || p === 'tree').length,
    service: pieces.filter((p) => p === 'food').length,
  };
}

export function summary(layout: Layout): string {
  const all = attractions(layout).filter((a) => a.piece !== 'tree');
  const cut = all.filter((a) => !a.connected).length;
  const b = balance(layout);
  const reach =
    cut === 0
      ? 'Every stall and bench is reachable from the entrance.'
      : `${cut} of ${all.length} stalls and benches are not connected to the entrance by a path.`;
  return `Spent ${spent(layout)} of ${FAIR_BUDGET}, ${remaining(layout)} left. Play ${b.play}, rest ${b.rest}, service ${b.service}. ${reach}`;
}

/** Moves the walking visitor one step if the next cell is walkable and reachable. */
export function step(layout: Layout, at: Cell, dx: number, dy: number): Cell {
  const next = { x: at.x + dx, y: at.y + dy };
  return walkable(layout, next) ? next : at;
}

export const STARTER: Layout = {
  '1,3': 'path',
  '2,3': 'path',
  '3,3': 'path',
  '4,3': 'path',
  '3,2': 'game',
  '4,2': 'game',
  '3,4': 'food',
  '2,4': 'bench',
  '5,3': 'bench',
  '1,1': 'tree',
};

/** Undo history: a stack of earlier layouts, capped so it stays small. */
export function pushHistory(history: readonly Layout[], layout: Layout, cap = 50): Layout[] {
  return [...history, layout].slice(-cap);
}

/** Reads a stored value back into a layout, or undefined when it is not a valid version-1 layout. */
export function parseLayout(raw: unknown): Layout | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const data = raw as { version?: unknown; cells?: unknown };
  if (data.version !== FAIR_VERSION || !data.cells || typeof data.cells !== 'object')
    return undefined;
  const cells: Record<string, Piece> = {};
  const entries = Object.entries(data.cells as Record<string, unknown>);
  if (entries.length > FAIR_WIDTH * FAIR_HEIGHT) return undefined;
  for (const [k, piece] of entries) {
    const m = /^(\d+),(\d+)$/.exec(k);
    if (!m || !PIECES.includes(piece as Piece)) return undefined;
    const cell = { x: Number(m[1]), y: Number(m[2]) };
    if (!inBounds(cell) || isEntrance(cell)) return undefined;
    cells[k] = piece as Piece;
  }
  if (spent(cells) > FAIR_BUDGET) return undefined;
  return cells;
}

type FairStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type LoadResult = { layout: Layout; note?: string };

export function createFairStore(storage: FairStorage | undefined) {
  /** The saved layout, or the starter with a note when nothing valid is saved. Never overwrites a bad save. */
  function load(): LoadResult {
    let raw: string | null;
    try {
      raw = storage ? storage.getItem(FAIR_KEY) : null;
    } catch {
      return {
        layout: STARTER,
        note: 'Saving is unavailable in this browser, so this is the starter plaza.',
      };
    }
    if (raw === null) return { layout: STARTER };
    try {
      const layout = parseLayout(JSON.parse(raw));
      if (layout) return { layout };
    } catch {
      // fall through
    }
    return {
      layout: STARTER,
      note: 'Your saved plaza could not be read, so this is the starter plaza. Your old save is kept until you save again.',
    };
  }

  /** Saves the layout. Returns false when the write failed. */
  function save(layout: Layout): boolean {
    try {
      if (!storage) return false;
      storage.setItem(FAIR_KEY, JSON.stringify({ version: FAIR_VERSION, cells: layout }));
      return true;
    } catch {
      return false;
    }
  }

  /** Forgets only this district's save. */
  function reset(): boolean {
    try {
      storage?.removeItem(FAIR_KEY);
      return Boolean(storage);
    } catch {
      return false;
    }
  }

  return { load, save, reset };
}

export function browserFairStorage(): FairStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
