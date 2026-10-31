import { bestScore, theme, canvasFont, type CarnivalGame } from './carnival';
import { boothTiers, type PrizeMotif } from './prize-pavilion';

/**
 * What an object in the room looks like. Every shape is drawn, not loaded: a
 * prize uses its tier's motif from `boothTiers`, so it looks like its name.
 */
export type RoomShape = PrizeMotif | 'rug' | 'lantern' | 'fern';

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
    return boothTiers(game.id).map((tier): RoomObject => {
      const owned = points >= tier.minScore;
      return {
        id: `${game.id}:${tier.id}`,
        name: tier.prize,
        shape: tier.motif,
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
  drawShape(canvasPen(ctx), object);
}

/**
 * The few drawing moves a room object is made of, each filled in one colour
 * and outlined. Drawing goes through a pen so tests can check every drawing
 * without a canvas.
 */
export interface Pen {
  ellipse(at: [x: number, y: number, rx: number, ry: number, turn?: number], color: string): void;
  arc(at: [x: number, y: number, r: number], color: string): void;
  rect(at: [x: number, y: number, w: number, h: number], color: string): void;
  /** A closed shape through x, y pairs. */
  poly(points: number[], color: string): void;
  /** A five pointed star. */
  star(at: [x: number, y: number, r: number], color: string): void;
  /** A ring with a hole in the middle. */
  ring(at: [x: number, y: number, outer: number, inner: number], color: string): void;
  /** Straight strokes, four numbers per line. */
  lines(segments: number[], color: string): void;
  label(text: string, x: number, y: number, color: string): void;
}

/** Draws an object's shape, in its booth's colour, with any pen. */
export function drawShape(pen: Pen, object: Pick<RoomObject, 'shape' | 'color'>) {
  const c = theme.colors;
  DRAWINGS[object.shape](pen, c[object.color], c);
}

function canvasPen(ctx: CanvasRenderingContext2D): Pen {
  const c = theme.colors;
  ctx.lineWidth = 2;
  const filled = (color: string, draw: () => void, rule: CanvasFillRule = 'nonzero') => {
    ctx.beginPath();
    draw();
    ctx.fillStyle = color;
    ctx.strokeStyle = c.background;
    ctx.lineWidth = 2;
    ctx.fill(rule);
    ctx.stroke();
  };
  const path = (points: number[]) => {
    ctx.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
    ctx.closePath();
  };
  return {
    ellipse: ([x, y, rx, ry, turn = 0], color) =>
      filled(color, () => ctx.ellipse(x, y, rx, ry, turn, 0, Math.PI * 2)),
    arc: ([x, y, r], color) => filled(color, () => ctx.arc(x, y, r, 0, Math.PI * 2)),
    rect: ([x, y, w, h], color) => filled(color, () => ctx.rect(x, y, w, h)),
    poly: (points, color) => filled(color, () => path(points)),
    star: ([x, y, r], color) => filled(color, () => path(starPoints(x, y, r))),
    ring: ([x, y, outer, inner], color) =>
      filled(
        color,
        () => {
          ctx.arc(x, y, outer, 0, Math.PI * 2);
          ctx.moveTo(x + inner, y);
          ctx.arc(x, y, inner, 0, Math.PI * 2);
        },
        'evenodd',
      ),
    lines: (segments, color) => {
      ctx.beginPath();
      for (let i = 0; i < segments.length; i += 4) {
        ctx.moveTo(segments[i], segments[i + 1]);
        ctx.lineTo(segments[i + 2], segments[i + 3]);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
    },
    label: (text, x, y, color) => {
      ctx.fillStyle = color;
      ctx.font = canvasFont('small', 'bold');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x, y);
      ctx.textBaseline = 'alphabetic';
    },
  };
}

/** The points of a five pointed star centred on x, y. */
function starPoints(x: number, y: number, r: number): number[] {
  const points: number[] = [];
  for (let i = 0; i < 10; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const d = i % 2 === 0 ? r : r * 0.45;
    points.push(x + Math.cos(a) * d, y + Math.sin(a) * d);
  }
  return points;
}

type Colors = typeof theme.colors;

/** A drawing for each shape, centred on the origin and about 56 pixels across. */
const DRAWINGS: Record<RoomShape, (pen: Pen, fill: string, c: Colors) => void> = {
  duck: (pen, fill, c) => {
    pen.ellipse([0, 10, 24, 16], fill);
    pen.arc([10, -12, 12], fill);
    pen.poly([20, -14, 30, -10, 20, -6], c.danger);
  },
  penguin: (pen, fill, c) => {
    pen.ellipse([0, 4, 20, 26], c.background);
    pen.ellipse([0, 8, 13, 18], c.text);
    pen.arc([0, -20, 6], fill);
    pen.ellipse([0, 28, 14, 4], fill);
  },
  mallet: (pen, fill, c) => {
    pen.poly([-3, -6, 3, -6, 3, 28, -3, 28], c.wood);
    pen.rect([-22, -26, 44, 20], fill);
    pen.arc([0, -28, 5], c.accent);
  },
  moustache: (pen, fill, c) => {
    for (const side of [-1, 1]) {
      pen.poly(
        [0, 0, side * 14, -8, side * 26, -2, side * 30, -12, side * 28, 6, side * 12, 8],
        c.text,
      );
    }
    pen.ellipse([0, 0, 6, 5], fill);
  },
  bell: (pen, fill, c) => {
    pen.poly([-6, -28, 6, -28, 22, 14, -22, 14], c.accent);
    pen.rect([-26, 14, 52, 6], c.accent);
    pen.arc([0, 22, 5], c.wood);
    pen.rect([-14, 26, 28, 4], fill);
  },
  'golf-tee': (pen, fill, c) => {
    pen.poly([-10, -6, 10, -6, 2, 0, 1, 28, -1, 28, -2, 0], c.wood);
    pen.arc([0, -16, 10], c.text);
    pen.arc([-3, -19, 2], fill);
  },
  windmill: (pen, fill, c) => {
    pen.arc([0, 0, 27], fill);
    pen.poly([-8, 22, -5, -2, 5, -2, 8, 22], c.stripeB);
    for (const [x, y] of [
      [0, -22],
      [16, 0],
      [0, 16],
      [-16, 0],
    ]) {
      pen.poly([0, -4, x - y / 4, y + x / 4, x + y / 4, y - x / 4], c.stripeA);
    }
    pen.rect([-18, 24, 36, 6], c.wood);
  },
  'golf-flag': (pen, fill, c) => {
    pen.ellipse([0, 24, 22, 5], c.background);
    pen.rect([-2, -28, 3, 52], c.text);
    pen.poly([1, -28, 24, -20, 1, -12], c.stripeA);
    pen.arc([-12, 20, 4], fill);
  },
  card: (pen, fill, c) => {
    pen.rect([-18, -26, 36, 52], c.surface);
    pen.rect([-12, -20, 24, 40], fill);
    pen.label('?', 0, 0, c.text);
  },
  lollipop: (pen, fill, c) => {
    pen.rect([-2, 0, 4, 28], c.text);
    pen.arc([0, -12, 16], fill);
    pen.arc([0, -12, 9], c.stripeB);
    pen.arc([0, -12, 4], c.danger);
  },
  medal: (pen, fill, c) => {
    pen.poly([-14, -28, -4, -28, 4, -4, -6, -4], fill);
    pen.poly([14, -28, 4, -28, -4, -4, 6, -4], c.stripeA);
    pen.arc([0, 10, 16], c.accent);
    pen.label('★', 0, 10, c.background);
  },
  tickets: (pen, fill, c) => {
    pen.poly([0, 6, 28, 6, 28, 24, 0, 24], c.danger);
    pen.arc([-6, 0, 22], fill);
    pen.arc([-6, 0, 8], c.background);
  },
  'skee-ball': (pen, fill, c) => {
    pen.poly([-28, 28, 28, 28, 28, 8], c.wood);
    pen.arc([-2, -6, 18], fill);
    pen.arc([-8, -12, 4], c.stripeB);
  },
  crown: (pen, fill, c) => {
    pen.poly([-24, 18, -24, -16, -12, -2, 0, -24, 12, -2, 24, -16, 24, 18], c.accent);
    pen.rect([-24, 10, 48, 10], fill);
    pen.label('100', 0, -2, c.background);
  },
  poodle: (pen, fill, c) => {
    for (const [x, y, r] of [
      [-10, 4, 12],
      [8, 4, 11],
      [18, -14, 9],
      [-22, -6, 6],
      [-12, 22, 5],
      [10, 22, 5],
    ]) {
      pen.arc([x, y, r], fill);
    }
    pen.arc([22, -16, 2], c.background);
    pen.poly([-8, 12, -8, 22, -16, 22, -16, 12], c.text);
  },
  dart: (pen, fill, c) => {
    pen.poly([26, -26, 14, -10, 10, -14], c.text);
    pen.poly([12, -12, -12, 12, -9, 15, 15, -9], c.wood);
    pen.poly([-10, 10, -28, 10, -16, 20, -10, 28, -12, 14], fill);
  },
  balloons: (pen, fill, c) => {
    pen.lines([0, 28, -14, -6, 0, 28, 0, -14, 0, 28, 14, -6], c.text);
    pen.ellipse([-14, -10, 10, 12], c.water);
    pen.ellipse([14, -10, 10, 12], c.danger);
    pen.star([0, -18, 14], fill);
  },
  bottle: (pen, fill, c) => {
    pen.poly([-5, -28, 5, -28, 5, -12, 14, -2, 14, 28, -14, 28, -14, -2, -5, -12], c.water);
    pen.rect([-14, 4, 28, 12], fill);
    pen.rect([-6, -32, 12, 5], c.wood);
  },
  hoop: (pen, fill, c) => {
    pen.ring([0, 0, 27, 20], fill);
    for (let i = 0; i < 6; i += 1) {
      const a = (i * Math.PI) / 3;
      pen.arc([Math.cos(a) * 23.5, Math.sin(a) * 23.5, 3], c.stripeB);
    }
    pen.rect([-6, -6, 12, 12], c.danger);
  },
  'bottle-trophy': (pen, fill, c) => {
    pen.poly([-4, -28, 4, -28, 4, -16, 11, -8, 11, 14, -11, 14, -11, -8, -4, -16], c.accent);
    pen.ellipse([0, -6, 18, 4], c.stripeA);
    pen.rect([-18, 14, 36, 12], fill);
  },
  'lily-pad': (pen, fill, c) => {
    pen.ellipse([0, 6, 28, 18], c.water);
    pen.poly([0, 6, 22, -4, 26, 6, 22, 18, -22, 18, -26, 6, -22, -4, -4, -6], fill);
    pen.arc([-6, -8, 7], c.danger);
    pen.arc([-6, -8, 3], c.accent);
  },
  'duck-cup': (pen, fill, c) => {
    pen.poly([-20, -6, 20, -6, 12, 16, -12, 16], c.accent);
    pen.rect([-14, 16, 28, 10], fill);
    pen.ellipse([-2, -12, 12, 7], c.accent);
    pen.arc([8, -22, 7], c.accent);
    pen.poly([14, -24, 22, -21, 14, -18], c.danger);
  },
  'foam-hammer': (pen, fill, c) => {
    pen.poly([-3, -4, 3, -4, 3, 28, -3, 28], c.stripeA);
    pen.ellipse([0, -16, 26, 13], fill);
    pen.ellipse([-26, -16, 4, 12], c.stripeB);
    pen.ellipse([26, -16, 4, 12], c.stripeB);
  },
  mole: (pen, fill, c) => {
    pen.ellipse([0, 26, 26, 6], c.wood);
    pen.ellipse([0, 4, 18, 22], fill);
    pen.arc([-7, -6, 3], c.background);
    pen.arc([7, -6, 3], c.background);
    pen.ellipse([0, 2, 6, 4], c.danger);
    pen.rect([-4, 8, 8, 6], c.text);
  },
  'mole-statue': (pen, fill, c) => {
    pen.rect([-22, 18, 44, 10], c.muted);
    pen.ellipse([0, 2, 15, 17], fill);
    pen.arc([-6, -2, 2.5], c.background);
    pen.arc([6, -2, 2.5], c.background);
    pen.poly([-12, -12, -12, -26, -6, -18, 0, -28, 6, -18, 12, -26, 12, -12], c.accent);
  },
  'bucket-hat': (pen, fill, c) => {
    pen.ellipse([0, 10, 28, 8], c.water);
    pen.poly([-16, 8, -12, -16, 12, -16, 16, 8], fill);
    pen.rect([-15, -2, 30, 5], c.stripeB);
    for (const x of [-18, 0, 18]) pen.ellipse([x, 24, 3, 5], c.water);
  },
  'ferris-wheel': (pen, fill, c) => {
    pen.poly([0, -4, 16, 28, -16, 28], c.wood);
    pen.ring([0, -6, 22, 18], c.accent);
    const spokes: number[] = [];
    for (let i = 0; i < 8; i += 1) {
      const a = (i * Math.PI) / 4;
      spokes.push(0, -6, Math.cos(a) * 20, -6 + Math.sin(a) * 20);
    }
    pen.lines(spokes, c.accent);
    for (let i = 0; i < 8; i += 2) {
      const a = (i * Math.PI) / 4;
      pen.rect([Math.cos(a) * 22 - 4, -6 + Math.sin(a) * 22 - 3, 8, 7], fill);
    }
  },
  rug: (pen, fill, c) => {
    for (let i = 0; i < 4; i += 1) {
      pen.rect([-28 + i * 14, -16, 14, 32], i % 2 === 0 ? fill : c.stripeB);
    }
  },
  lantern: (pen, fill, c) => {
    pen.rect([-2, -28, 4, 8], c.text);
    pen.ellipse([0, 0, 22, 20], fill);
    pen.rect([-10, 18, 20, 6], c.stripeA);
  },
  fern: (pen, fill, c) => {
    for (const lean of [-0.5, 0, 0.5]) {
      pen.ellipse([lean * 30, -10, 8, 20, lean], c.water);
    }
    pen.poly([-18, 6, 18, 6, 12, 28, -12, 28], fill);
  },
};
