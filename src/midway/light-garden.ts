/**
 * The light garden: a small patch of the midway, by the entrance, where the
 * player hangs their own lanterns and strings garlands between them. It only
 * shows in lantern evening, lights the ground without blocking anyone's way,
 * and keeps no score. Lanterns glow steadily: nothing flashes.
 */

import type { MidwayMap, Point, Rect } from './world';

/** The garden's grid, in tiles: lanterns sit on whole cells inside it. */
export const GARDEN_COLUMNS = 4;
export const GARDEN_ROWS = 3;
/** Few enough fixtures that the paths stay readable. */
export const MAX_LANTERNS = 8;
export const MAX_GARLANDS = 6;
/** How many steps undo remembers. */
export const UNDO_DEPTH = 20;

export type LanternColor = 'warm' | 'cool';

export interface GardenLantern {
  col: number;
  row: number;
  color: LanternColor;
}

export interface LightGardenDesign {
  lanterns: GardenLantern[];
  /** Pairs of lantern indexes with a garland strung between them. */
  garlands: [number, number][];
}

export interface LightGarden {
  design: LightGardenDesign;
  history: LightGardenDesign[];
}

/** A small arc of lanterns with one garland, so the patch is never bare. */
export function starterDesign(): LightGardenDesign {
  return {
    lanterns: [
      { col: 0, row: 1, color: 'warm' },
      { col: 2, row: 0, color: 'cool' },
      { col: 3, row: 2, color: 'warm' },
    ],
    garlands: [
      [0, 1],
      [1, 2],
    ],
  };
}

/**
 * Where the garden lies on the map: the open apron just inside the gate, right
 * of the avenue. Every cell there, its whole ground glow, and every garland
 * strung between them, is clear on screen of the entrance arch, its sign and
 * flags, the carousel, the booths and every other prop, so nothing the player
 * hangs is hidden and no hit area is covered. Saved designs use cells, not tiles, so they come along.
 */
export function gardenPatch(map: Pick<MidwayMap, 'avenueX' | 'height'>): Rect {
  return { x: map.avenueX + 2, y: map.height - 6, w: GARDEN_COLUMNS, h: GARDEN_ROWS };
}

/** The garden cell under a tile position, or undefined outside the garden. */
export function cellAt(patch: Rect, at: Point): { col: number; row: number } | undefined {
  const col = Math.floor(at.x - patch.x);
  const row = Math.floor(at.y - patch.y);
  if (col < 0 || row < 0 || col >= GARDEN_COLUMNS || row >= GARDEN_ROWS) return undefined;
  return { col, row };
}

export function createLightGarden(design: LightGardenDesign = starterDesign()): LightGarden {
  return { design, history: [] };
}

export type PlaceResult = 'placed' | 'out-of-bounds' | 'taken' | 'full';

/** Whether a lantern can go at col, row, and why not when it can't. */
export function canPlace(design: LightGardenDesign, col: number, row: number): PlaceResult {
  if (!Number.isInteger(col) || !Number.isInteger(row)) return 'out-of-bounds';
  if (col < 0 || row < 0 || col >= GARDEN_COLUMNS || row >= GARDEN_ROWS) return 'out-of-bounds';
  if (design.lanterns.some((l) => l.col === col && l.row === row)) return 'taken';
  if (design.lanterns.length >= MAX_LANTERNS) return 'full';
  return 'placed';
}

function commit(garden: LightGarden, design: LightGardenDesign): LightGarden {
  return { design, history: [...garden.history, garden.design].slice(-UNDO_DEPTH) };
}

export function placeLantern(
  garden: LightGarden,
  col: number,
  row: number,
  color: LanternColor,
): { garden: LightGarden; result: PlaceResult } {
  const result = canPlace(garden.design, col, row);
  if (result !== 'placed') return { garden, result };
  const lanterns = [...garden.design.lanterns, { col, row, color }];
  return { garden: commit(garden, { ...garden.design, lanterns }), result };
}

export type ConnectResult = 'connected' | 'missing' | 'same' | 'already' | 'full';

/** Strings a garland between lanterns a and b, by their index. */
export function connectLanterns(
  garden: LightGarden,
  a: number,
  b: number,
): { garden: LightGarden; result: ConnectResult } {
  const { lanterns, garlands } = garden.design;
  const exists = (i: number) => Number.isInteger(i) && i >= 0 && i < lanterns.length;
  let result: ConnectResult = 'connected';
  if (!exists(a) || !exists(b)) result = 'missing';
  else if (a === b) result = 'same';
  else if (garlands.some(([p, q]) => (p === a && q === b) || (p === b && q === a)))
    result = 'already';
  else if (garlands.length >= MAX_GARLANDS) result = 'full';
  if (result !== 'connected') return { garden, result };
  const next = { ...garden.design, garlands: [...garlands, [a, b] as [number, number]] };
  return { garden: commit(garden, next), result };
}

export type EditResult = PlaceResult | ConnectResult | 'selected' | 'deselected';

/**
 * One pick on a garden cell, the same from a click on the map or from the
 * column and row fields. An empty cell gets a new lantern, which is then
 * selected. A lantern is selected, or let go when it already was. Picking a
 * second lantern strings a garland to it from the selected one.
 */
export function editAt(
  garden: LightGarden,
  selected: number | undefined,
  col: number,
  row: number,
  color: LanternColor,
): { garden: LightGarden; selected: number | undefined; result: EditResult } {
  const index = garden.design.lanterns.findIndex((l) => l.col === col && l.row === row);
  if (index === -1) {
    const next = placeLantern(garden, col, row, color);
    const placed = next.result === 'placed';
    return {
      garden: next.garden,
      selected: placed ? next.garden.design.lanterns.length - 1 : selected,
      result: next.result,
    };
  }
  if (index === selected) return { garden, selected: undefined, result: 'deselected' };
  if (selected === undefined) return { garden, selected: index, result: 'selected' };
  const next = connectLanterns(garden, selected, index);
  return { garden: next.garden, selected: index, result: next.result };
}

/** Steps back one change. Nothing happens when there is nothing to undo. */
export function undo(garden: LightGarden): LightGarden {
  const previous = garden.history[garden.history.length - 1];
  if (!previous) return garden;
  return { design: previous, history: garden.history.slice(0, -1) };
}

/** Back to the starter design. Undo can bring the old design back. */
export function resetGarden(garden: LightGarden): LightGarden {
  return commit(garden, starterDesign());
}

/** A text description of the design, the same arrangement the map shows. */
export function describeDesign(design: LightGardenDesign): string {
  const { lanterns, garlands } = design;
  if (lanterns.length === 0) return 'No lanterns yet.';
  const name = (i: number) => `lantern ${i + 1}`;
  const list = lanterns
    .map((l, i) => `${name(i)}: ${l.color} at column ${l.col + 1}, row ${l.row + 1}`)
    .join('; ');
  const strings = garlands.length
    ? `Garlands join ${garlands.map(([a, b]) => `${a + 1} and ${b + 1}`).join(', ')}.`
    : 'No garlands.';
  return `${lanterns.length} of ${MAX_LANTERNS} lanterns, ${garlands.length} of ${MAX_GARLANDS} garlands. ${list}. ${strings}`;
}

/** Reads a saved design, keeping only what fits the garden's rules. */
export function parseDesign(raw: unknown): LightGardenDesign | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const { lanterns, garlands } = raw as Partial<LightGardenDesign>;
  if (!Array.isArray(lanterns) || !Array.isArray(garlands)) return undefined;
  let garden = createLightGarden({ lanterns: [], garlands: [] });
  for (const l of lanterns) {
    if (!l || (l.color !== 'warm' && l.color !== 'cool')) continue;
    garden = placeLantern(garden, l.col, l.row, l.color).garden;
  }
  if (garden.design.lanterns.length !== lanterns.length) return undefined;
  for (const g of garlands) {
    if (!Array.isArray(g)) return undefined;
    const next = connectLanterns(garden, g[0], g[1]);
    if (next.result !== 'connected') return undefined;
    garden = next.garden;
  }
  return garden.design;
}

/** What the panel says after a save, true to whether the browser kept it. */
export function saveNote(saved: boolean): string {
  return saved
    ? 'Saved in this browser.'
    : 'Not saved: this browser would not keep it, so the design lasts until you leave the page.';
}

export const LIGHT_GARDEN_KEY = 'tessl-carnival:light-garden';

export interface GardenStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Saves and loads the design. Falls back to the starter when storage is missing or broken. */
export function createLightGardenStore(storage: GardenStorage | undefined) {
  return {
    load(): LightGardenDesign {
      try {
        const raw = storage?.getItem(LIGHT_GARDEN_KEY);
        return (raw && parseDesign(JSON.parse(raw))) || starterDesign();
      } catch {
        return starterDesign();
      }
    },
    save(design: LightGardenDesign): boolean {
      try {
        if (!storage) return false;
        storage.setItem(LIGHT_GARDEN_KEY, JSON.stringify(design));
        return true;
      } catch {
        return false;
      }
    },
  };
}

function browserStorage(): GardenStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export const lightGardenStore = createLightGardenStore(
  typeof window === 'undefined' ? undefined : browserStorage(),
);
