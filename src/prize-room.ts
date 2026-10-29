import { bestScore, theme, canvasFont, type CarnivalGame } from './carnival';
import { PAVILION_TIERS, type PavilionTier } from './prize-pavilion';

/** What an object in the room looks like. Every shape is drawn, not loaded. */
export type RoomShape = 'duck' | 'penguin' | 'trophy' | 'rug' | 'lantern' | 'fern';

/** One object the visitor could put in the room. */
export interface RoomObject {
  id: string;
  name: string;
  shape: RoomShape;
  /** A theme colour name, so each booth's prizes look their own. */
  color: RoomColor;
  /** Where it came from, e.g. "Skee Ball, Bronze" or "Starter decor". */
  source: string;
  owned: boolean;
  /** For a locked prize: what earns it, using the booth's real goal. */
  howToEarn?: string;
}

export const ROOM_COLORS = ['accent', 'water', 'stripeA', 'muted', 'wood', 'danger'] as const;
export type RoomColor = (typeof ROOM_COLORS)[number];

const TIER_SHAPES: Record<PavilionTier['id'], RoomShape> = {
  bronze: 'duck',
  silver: 'penguin',
  gold: 'trophy',
};

/** Decor anyone can place, so a newcomer has a room before winning anything. */
export const STARTER_DECOR: readonly RoomObject[] = [
  {
    id: 'starter:rug',
    name: 'Striped Rug',
    shape: 'rug',
    color: 'stripeA',
    source: 'Starter decor',
    owned: true,
  },
  {
    id: 'starter:lantern',
    name: 'Paper Lantern',
    shape: 'lantern',
    color: 'accent',
    source: 'Starter decor',
    owned: true,
  },
  {
    id: 'starter:fern',
    name: 'Potted Fern',
    shape: 'fern',
    color: 'wood',
    source: 'Starter decor',
    owned: true,
  },
];

/**
 * Every object for the room: the starter decor, then one prize per booth and
 * Pavilion tier, owned once the booth's best score reaches that tier.
 */
export function roomObjects(
  games: readonly CarnivalGame[],
  best: (gameId: string) => number | undefined = bestScore,
): RoomObject[] {
  const prizes = games.flatMap((game, index) => {
    const points = best(game.id) ?? 0;
    return PAVILION_TIERS.map((tier): RoomObject => {
      const owned = points >= tier.minScore;
      return {
        id: `${game.id}:${tier.id}`,
        name: tier.prize,
        shape: TIER_SHAPES[tier.id],
        color: ROOM_COLORS[index % ROOM_COLORS.length],
        source: `${game.name}, ${tier.name}`,
        owned,
        howToEarn: owned
          ? undefined
          : `Score ${tier.minScore} or more in one round of ${game.name}.`,
      };
    });
  });
  return [...STARTER_DECOR, ...prizes];
}

/** The room's bounded slots: two shelves of four on the wall, four on the floor. */
export interface RoomSlot {
  id: string;
  row: number;
  col: number;
  label: string;
}

const ROW_NAMES = ['Top shelf', 'Lower shelf', 'Floor'] as const;
export const ROOM_COLS = 4;
export const ROOM_SLOTS: readonly RoomSlot[] = ROW_NAMES.flatMap((name, row) =>
  Array.from({ length: ROOM_COLS }, (_, col) => ({
    id: `${row}-${col}`,
    row,
    col,
    label: `${name}, spot ${col + 1}`,
  })),
);

export const BACKDROPS = ['striped-tent', 'starry-night', 'sunset-pier'] as const;
export type Backdrop = (typeof BACKDROPS)[number];
export const BACKDROP_NAMES: Record<Backdrop, string> = {
  'striped-tent': 'Striped tent',
  'starry-night': 'Starry night',
  'sunset-pier': 'Sunset pier',
};

export const ROTATIONS = [0, 90, 180, 270] as const;
export type Rotation = (typeof ROTATIONS)[number];
const FACING: Record<Rotation, string> = {
  0: 'facing front',
  90: 'turned right',
  180: 'upside down',
  270: 'turned left',
};

export interface Placement {
  objectId: string;
  slot: string;
  rotation: Rotation;
}

export interface RoomLayout {
  backdrop: Backdrop;
  placements: Placement[];
}

export const EMPTY_ROOM: RoomLayout = { backdrop: 'striped-tent', placements: [] };

export type Direction = 'left' | 'right' | 'up' | 'down';

export type RoomAction =
  | { type: 'place'; objectId: string; slot: string }
  | { type: 'move'; objectId: string; direction: Direction }
  | { type: 'rotate'; objectId: string }
  | { type: 'remove'; objectId: string }
  | { type: 'backdrop'; backdrop: Backdrop };

export function placementOf(layout: RoomLayout, objectId: string): Placement | undefined {
  return layout.placements.find((p) => p.objectId === objectId);
}

export function occupant(layout: RoomLayout, slot: string): Placement | undefined {
  return layout.placements.find((p) => p.slot === slot);
}

/** The slot next to `slot` in a direction, or undefined at the room's edge. */
export function neighbourSlot(slot: string, direction: Direction): string | undefined {
  const from = ROOM_SLOTS.find((s) => s.id === slot);
  if (!from) return undefined;
  const row = from.row + (direction === 'up' ? -1 : direction === 'down' ? 1 : 0);
  const col = from.col + (direction === 'left' ? -1 : direction === 'right' ? 1 : 0);
  return ROOM_SLOTS.find((s) => s.row === row && s.col === col)?.id;
}

/**
 * Puts an object in a slot. An object already in the room moves there, and an
 * object already in that slot swaps into the one it left, or goes back to the
 * collection when the newcomer was not in the room.
 */
function putInSlot(layout: RoomLayout, objectId: string, slot: string): RoomLayout {
  const current = placementOf(layout, objectId);
  if (current?.slot === slot) return layout;
  const other = occupant(layout, slot);
  const placements = layout.placements
    .filter((p) => p.objectId !== objectId && p !== other)
    .concat({ objectId, slot, rotation: current?.rotation ?? 0 });
  if (other && current) placements.push({ ...other, slot: current.slot });
  return { ...layout, placements };
}

/**
 * Applies one change to the room. Only owned objects can be placed, and only
 * in real slots. Returns the same layout when nothing changes.
 */
export function applyRoom(
  layout: RoomLayout,
  action: RoomAction,
  owned: ReadonlySet<string>,
): RoomLayout {
  switch (action.type) {
    case 'place':
      if (!owned.has(action.objectId)) return layout;
      if (!ROOM_SLOTS.some((s) => s.id === action.slot)) return layout;
      return putInSlot(layout, action.objectId, action.slot);
    case 'move': {
      const current = placementOf(layout, action.objectId);
      const target = current && neighbourSlot(current.slot, action.direction);
      return target ? putInSlot(layout, action.objectId, target) : layout;
    }
    case 'rotate': {
      const current = placementOf(layout, action.objectId);
      if (!current) return layout;
      const rotation = ROTATIONS[(ROTATIONS.indexOf(current.rotation) + 1) % ROTATIONS.length];
      return {
        ...layout,
        placements: layout.placements.map((p) => (p === current ? { ...p, rotation } : p)),
      };
    }
    case 'remove':
      return placementOf(layout, action.objectId)
        ? { ...layout, placements: layout.placements.filter((p) => p.objectId !== action.objectId) }
        : layout;
    case 'backdrop':
      return BACKDROPS.includes(action.backdrop) && action.backdrop !== layout.backdrop
        ? { ...layout, backdrop: action.backdrop }
        : layout;
  }
}

/**
 * Keeps only what can be shown: owned objects, real slots, one object per slot
 * and one slot per object. A prize the visitor no longer owns, for example
 * after scores were cleared, leaves the room.
 */
export function reconcileRoom(layout: RoomLayout, owned: ReadonlySet<string>): RoomLayout {
  const seenObjects = new Set<string>();
  const seenSlots = new Set<string>();
  const placements = layout.placements.filter((p) => {
    const keep =
      owned.has(p.objectId) &&
      ROOM_SLOTS.some((s) => s.id === p.slot) &&
      ROTATIONS.includes(p.rotation) &&
      !seenObjects.has(p.objectId) &&
      !seenSlots.has(p.slot);
    if (keep) {
      seenObjects.add(p.objectId);
      seenSlots.add(p.slot);
    }
    return keep;
  });
  const backdrop = BACKDROPS.includes(layout.backdrop) ? layout.backdrop : EMPTY_ROOM.backdrop;
  return placements.length === layout.placements.length && backdrop === layout.backdrop
    ? layout
    : { backdrop, placements };
}

export const ROOM_HISTORY_MAX = 50;

/** The room being arranged, with an undo history. */
export interface RoomEditor {
  current: RoomLayout;
  history: RoomLayout[];
}

export function editorFor(layout: RoomLayout): RoomEditor {
  return { current: layout, history: [] };
}

export function editorApply(
  editor: RoomEditor,
  action: RoomAction,
  owned: ReadonlySet<string>,
): RoomEditor {
  const next = applyRoom(editor.current, action, owned);
  if (next === editor.current) return editor;
  return push(editor, next);
}

export function editorUndo(editor: RoomEditor): RoomEditor {
  if (editor.history.length === 0) return editor;
  return {
    current: editor.history[editor.history.length - 1],
    history: editor.history.slice(0, -1),
  };
}

/** Empties the room and its backdrop. Scores and prizes are untouched, and Undo brings it back. */
export function editorReset(editor: RoomEditor): RoomEditor {
  const empty = editor.current;
  if (empty.placements.length === 0 && empty.backdrop === EMPTY_ROOM.backdrop) return editor;
  return push(editor, EMPTY_ROOM);
}

function push(editor: RoomEditor, next: RoomLayout): RoomEditor {
  return { current: next, history: [...editor.history, editor.current].slice(-ROOM_HISTORY_MAX) };
}

/** Reads a saved layout, or undefined when the saved value is not one. */
export function parseRoom(raw: string | null): RoomLayout | undefined {
  if (raw === null) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof value !== 'object' || value === null) return undefined;
  const v = value as Record<string, unknown>;
  if (!BACKDROPS.includes(v.backdrop as Backdrop)) return undefined;
  if (!Array.isArray(v.placements)) return undefined;
  const placements = v.placements.filter(
    (p): p is Placement =>
      typeof p === 'object' &&
      p !== null &&
      typeof p.objectId === 'string' &&
      typeof p.slot === 'string' &&
      ROTATIONS.includes(p.rotation),
  );
  return {
    backdrop: v.backdrop as Backdrop,
    placements: placements.map(({ objectId, slot, rotation }) => ({ objectId, slot, rotation })),
  };
}

/** Its own key: the room never touches the scores' storage. */
export const ROOM_KEY = 'carnival:prize-room';

export interface RoomStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Keeps the room's layout in this browser. Nothing is uploaded. */
export function createRoomStore(storage: RoomStorage | undefined) {
  return {
    load(): RoomLayout | undefined {
      try {
        return parseRoom(storage?.getItem(ROOM_KEY) ?? null);
      } catch {
        return undefined;
      }
    },
    save(layout: RoomLayout): boolean {
      try {
        if (!storage) return false;
        storage.setItem(ROOM_KEY, JSON.stringify(layout));
        return true;
      } catch {
        return false;
      }
    },
  };
}

function browserStorage(): RoomStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export const roomStore = createRoomStore(browserStorage());

/** What is in one slot, in words, for the inspection list and the walk. */
export function describeSlot(
  layout: RoomLayout,
  objects: readonly RoomObject[],
  slot: RoomSlot,
): string {
  const placed = occupant(layout, slot.id);
  const object = placed && objects.find((o) => o.id === placed.objectId);
  if (!placed || !object) return `${slot.label}: empty.`;
  return `${slot.label}: ${object.name} (${object.source}), ${FACING[placed.rotation]}.`;
}

/**
 * What the walking visitor sees at their spot in the current layout, or
 * nothing before their first step. The page calls it after every edit.
 */
export function describeLook(
  layout: RoomLayout,
  objects: readonly RoomObject[],
  slot: RoomSlot,
  walked: boolean,
): string {
  return walked ? `You look at: ${describeSlot(layout, objects, slot)}` : '';
}

/** A one-line summary of the whole room. */
export function describeRoom(layout: RoomLayout): string {
  const count = layout.placements.length;
  const things = count === 1 ? 'object' : 'objects';
  return `${BACKDROP_NAMES[layout.backdrop]} backdrop, ${count} ${things} placed of ${ROOM_SLOTS.length} spots.`;
}

export const ROOM_SIZE = { width: 640, height: 400 } as const;
const FLOOR_Y = 250;

/** The centre of a slot on the canvas, in canvas pixels. */
export function slotCenter(slot: RoomSlot): { x: number; y: number } {
  if (slot.row < 2) return { x: 140 + slot.col * 120, y: 75 + slot.row * 90 };
  return { x: 110 + slot.col * 140, y: 320 };
}

/** The slot under a canvas point, or undefined. */
export function slotAt(x: number, y: number): RoomSlot | undefined {
  return ROOM_SLOTS.find((slot) => {
    const center = slotCenter(slot);
    return Math.abs(x - center.x) <= 34 && Math.abs(y - center.y) <= 34;
  });
}

/** Draws the room: backdrop, shelves, floor, placed objects, and the visitor. */
export function drawRoom(
  ctx: CanvasRenderingContext2D,
  layout: RoomLayout,
  objects: readonly RoomObject[],
  focus: { selected?: string; visitorSlot?: string },
) {
  const { width, height } = ROOM_SIZE;
  const c = theme.colors;
  ctx.clearRect(0, 0, width, height);

  // The backdrop fills the wall.
  if (layout.backdrop === 'striped-tent') {
    for (let x = 0; x < width; x += 40) {
      ctx.fillStyle = (x / 40) % 2 === 0 ? c.stripeA : c.stripeB;
      ctx.fillRect(x, 0, 40, FLOOR_Y);
    }
  } else if (layout.backdrop === 'starry-night') {
    ctx.fillStyle = c.background;
    ctx.fillRect(0, 0, width, FLOOR_Y);
    ctx.fillStyle = c.text;
    for (let i = 0; i < 40; i += 1) {
      ctx.fillRect((i * 97) % width, (i * 53) % (FLOOR_Y - 10), 3, 3);
    }
  } else {
    ctx.fillStyle = c.accent;
    ctx.fillRect(0, 0, width, FLOOR_Y);
    ctx.fillStyle = c.danger;
    ctx.beginPath();
    ctx.arc(width / 2, FLOOR_Y, 90, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = c.water;
    ctx.fillRect(0, FLOOR_Y - 30, width, 30);
  }

  ctx.fillStyle = c.wood;
  ctx.fillRect(0, FLOOR_Y, width, height - FLOOR_Y);
  for (const row of [0, 1]) {
    const y = slotCenter({ id: '', row, col: 0, label: '' }).y + 32;
    ctx.fillStyle = c.wood;
    ctx.fillRect(70, y, 500, 10);
    ctx.strokeStyle = c.background;
    ctx.lineWidth = 2;
    ctx.strokeRect(70, y, 500, 10);
  }

  for (const slot of ROOM_SLOTS) {
    const { x, y } = slotCenter(slot);
    const placed = occupant(layout, slot.id);
    const object = placed && objects.find((o) => o.id === placed.objectId);
    if (placed && object) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((placed.rotation * Math.PI) / 180);
      drawObject(ctx, object);
      ctx.restore();
    } else {
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = c.muted;
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 28, y - 28, 56, 56);
      ctx.setLineDash([]);
    }
    if (placed && placed.objectId === focus.selected) {
      ctx.strokeStyle = c.accent;
      ctx.lineWidth = 4;
      ctx.strokeRect(x - 34, y - 34, 68, 68);
    }
  }

  if (focus.visitorSlot) {
    const slot = ROOM_SLOTS.find((s) => s.id === focus.visitorSlot);
    if (slot) drawVisitor(ctx, slot);
  }
}

/** The little visitor who walks the room and looks at one spot. */
function drawVisitor(ctx: CanvasRenderingContext2D, slot: RoomSlot) {
  const c = theme.colors;
  const { x, y } = slotCenter(slot);
  const vx = x + 40;
  const vy = slot.row < 2 ? 375 : y + 30;
  ctx.fillStyle = c.text;
  ctx.strokeStyle = c.background;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(vx, vy - 34, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillRect(vx - 7, vy - 25, 14, 25);
  ctx.strokeRect(vx - 7, vy - 25, 14, 25);
  ctx.strokeStyle = c.accent;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(vx, vy - 34);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = c.text;
  ctx.font = canvasFont('small', 'bold');
  ctx.textAlign = 'center';
  ctx.fillText('You', vx, vy + 14);
}

/** Draws one object centred on the origin, about 56 pixels across. */
function drawObject(ctx: CanvasRenderingContext2D, object: RoomObject) {
  const c = theme.colors;
  const fill = c[object.color];
  ctx.lineWidth = 2;
  ctx.strokeStyle = c.background;
  const shape = (draw: () => void, color: string = fill) => {
    ctx.beginPath();
    draw();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.stroke();
  };
  switch (object.shape) {
    case 'duck':
      shape(() => ctx.ellipse(0, 10, 24, 16, 0, 0, Math.PI * 2));
      shape(() => ctx.arc(10, -12, 12, 0, Math.PI * 2));
      shape(() => {
        ctx.moveTo(20, -14);
        ctx.lineTo(30, -10);
        ctx.lineTo(20, -6);
        ctx.closePath();
      }, c.danger);
      break;
    case 'penguin':
      shape(() => ctx.ellipse(0, 4, 20, 26, 0, 0, Math.PI * 2), c.background);
      shape(() => ctx.ellipse(0, 8, 13, 18, 0, 0, Math.PI * 2), c.text);
      shape(() => ctx.arc(0, -20, 6, 0, Math.PI * 2));
      shape(() => ctx.ellipse(0, 28, 14, 4, 0, 0, Math.PI * 2));
      break;
    case 'trophy':
      shape(() => {
        ctx.moveTo(-20, -24);
        ctx.lineTo(20, -24);
        ctx.lineTo(10, 4);
        ctx.lineTo(-10, 4);
        ctx.closePath();
      }, c.accent);
      shape(() => ctx.rect(-4, 4, 8, 14), c.accent);
      shape(() => ctx.rect(-16, 18, 32, 8), fill);
      break;
    case 'rug':
      for (let i = 0; i < 4; i += 1) {
        shape(() => ctx.rect(-28 + i * 14, -16, 14, 32), i % 2 === 0 ? fill : c.stripeB);
      }
      break;
    case 'lantern':
      shape(() => ctx.rect(-2, -28, 4, 8), c.text);
      shape(() => ctx.ellipse(0, 0, 22, 20, 0, 0, Math.PI * 2));
      shape(() => ctx.rect(-10, 18, 20, 6), c.stripeA);
      break;
    case 'fern':
      for (const lean of [-0.5, 0, 0.5]) {
        shape(() => ctx.ellipse(lean * 30, -10, 8, 20, lean, 0, Math.PI * 2), c.water);
      }
      shape(() => {
        ctx.moveTo(-18, 6);
        ctx.lineTo(18, 6);
        ctx.lineTo(12, 28);
        ctx.lineTo(-12, 28);
        ctx.closePath();
      });
      break;
  }
}
