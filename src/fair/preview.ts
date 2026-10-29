import { canvasFont, theme } from '../carnival/theme';
import {
  ENTRANCE,
  FAIR_HEIGHT,
  FAIR_WIDTH,
  attractions,
  isEntrance,
  type Cell,
  type Layout,
  type Piece,
} from './fair';
import type { Group, Sim } from './visitors';

/** Isometric tile size of the preview, in canvas pixels. */
export const PREVIEW_TILE_W = 64;
export const PREVIEW_TILE_H = 32;
/** Room above the top tile for tents and trees, and around the edges. */
const HEADROOM = 48;
const MARGIN = 16;

export const PREVIEW_WIDTH = ((FAIR_WIDTH + FAIR_HEIGHT) * PREVIEW_TILE_W) / 2 + MARGIN * 2;
export const PREVIEW_HEIGHT =
  ((FAIR_WIDTH + FAIR_HEIGHT) * PREVIEW_TILE_H) / 2 + HEADROOM + MARGIN * 2;

/** The plaza's view mode: the precise editable grid, or the visitor-eye preview. */
export type ViewMode = 'grid' | 'preview';

export function toggleView(mode: ViewMode): ViewMode {
  return mode === 'grid' ? 'preview' : 'grid';
}

/** The top corner of the ground diamond under a plaza position (cells may be fractional), in canvas pixels. */
export function project(x: number, y: number): { x: number; y: number } {
  return {
    x: MARGIN + (FAIR_HEIGHT * PREVIEW_TILE_W) / 2 + ((x - y) * PREVIEW_TILE_W) / 2,
    y: MARGIN + HEADROOM + ((x + y) * PREVIEW_TILE_H) / 2,
  };
}

/** The centre of a cell's ground diamond. */
export function cellCentre(cell: Cell): { x: number; y: number } {
  return project(cell.x + 0.5, cell.y + 0.5);
}

/** One thing the preview draws, taken straight from the layout and the visitors. */
export type PreviewItem =
  | { kind: 'gate'; x: number; y: number }
  | { kind: Piece; x: number; y: number; unreachable: boolean }
  | { kind: 'visitor'; x: number; y: number; group: Group; slot: number };

/** Depth for painter's order: further back (smaller x + y) draws first. */
const depth = (item: PreviewItem) => item.x + item.y + (item.kind === 'visitor' ? 0.5 : 0);

/**
 * Everything the preview shows, back to front: the gate, every placed piece
 * (flagged when no connected path reaches it), and every visitor group where
 * it stands now.
 */
export function previewItems(layout: Layout, sim: Pick<Sim, 'groups'>): PreviewItem[] {
  const items: PreviewItem[] = [{ kind: 'gate', ...ENTRANCE }];
  const placed = new Map(attractions(layout).map((a) => [`${a.x},${a.y}`, a]));
  for (const [k, piece] of Object.entries(layout)) {
    const [x, y] = k.split(',').map(Number);
    if (isEntrance({ x, y })) continue;
    const info = placed.get(k);
    items.push({
      kind: piece,
      x,
      y,
      unreachable: piece !== 'path' && piece !== 'tree' && info?.connected === false,
    });
  }
  sim.groups.forEach((group, slot) =>
    items.push({ kind: 'visitor', x: group.at.x, y: group.at.y, group, slot }),
  );
  return items.sort((a, b) => depth(a) - depth(b));
}

/** How many placed stalls and benches no visitor can reach. */
export function unreachableCount(items: readonly PreviewItem[]): number {
  return items.filter((i) => 'unreachable' in i && i.unreachable).length;
}

type Ctx = CanvasRenderingContext2D;
type Pt = readonly [number, number];

function poly(ctx: Ctx, points: readonly Pt[], color: string, stroke?: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function diamond(x: number, y: number, inset = 0): Pt[] {
  const p = (a: number, b: number): Pt => {
    const s = project(a, b);
    return [s.x, s.y];
  };
  return [
    p(x + inset, y + inset),
    p(x + 1 - inset, y + inset),
    p(x + 1 - inset, y + 1 - inset),
    p(x + inset, y + 1 - inset),
  ];
}

/** A striped tent: a box with a pointed roof, in the theme's colours. */
function tent(ctx: Ctx, cx: number, cy: number, roof: string, height: number) {
  const c = theme.colors;
  const w = PREVIEW_TILE_W * 0.3;
  const h = PREVIEW_TILE_H * 0.3;
  poly(
    ctx,
    [
      [cx - w, cy],
      [cx, cy + h],
      [cx, cy + h - height],
      [cx - w, cy - height],
    ],
    c.stripeB,
  );
  poly(
    ctx,
    [
      [cx, cy + h],
      [cx + w, cy],
      [cx + w, cy - height],
      [cx, cy + h - height],
    ],
    c.muted,
  );
  poly(
    ctx,
    [
      [cx - w, cy - height],
      [cx, cy + h - height],
      [cx, cy - height - 22],
    ],
    roof,
  );
  poly(
    ctx,
    [
      [cx, cy + h - height],
      [cx + w, cy - height],
      [cx, cy - height - 22],
    ],
    c.stripeA,
  );
}

/** Draws the preview of `items` onto `ctx`, sized PREVIEW_WIDTH by PREVIEW_HEIGHT. */
export function drawPreview(ctx: Ctx, items: readonly PreviewItem[], selected?: number) {
  const c = theme.colors;
  ctx.fillStyle = c.background;
  ctx.fillRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
  for (let y = 0; y < FAIR_HEIGHT; y++)
    for (let x = 0; x < FAIR_WIDTH; x++) poly(ctx, diamond(x, y), c.surface, c.background);
  // Paths first, so everything stands on them.
  for (const item of items)
    if (item.kind === 'path') poly(ctx, diamond(item.x, item.y, 0.08), c.wood);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const item of items) {
    const { x: cx, y: cy } = cellCentre(item);
    if (item.kind === 'gate') {
      poly(ctx, diamond(item.x, item.y, 0.08), c.wood);
      ctx.fillStyle = c.stripeA;
      ctx.fillRect(cx - 18, cy - 34, 6, 34);
      ctx.fillRect(cx + 12, cy - 34, 6, 34);
      ctx.fillStyle = c.accent;
      ctx.fillRect(cx - 20, cy - 40, 40, 10);
      ctx.fillStyle = c.text;
      ctx.font = canvasFont('small', 'bold');
      ctx.fillText('GATE', cx, cy + 6);
    } else if (item.kind === 'game') {
      tent(ctx, cx, cy, c.accent, 18);
    } else if (item.kind === 'food') {
      tent(ctx, cx, cy, c.water, 14);
    } else if (item.kind === 'bench') {
      poly(
        ctx,
        [
          [cx - 14, cy - 6],
          [cx + 6, cy + 4],
          [cx + 6, cy],
          [cx - 14, cy - 10],
        ],
        c.wood,
      );
      ctx.fillStyle = c.wood;
      ctx.fillRect(cx - 13, cy - 6, 3, 8);
      ctx.fillRect(cx + 3, cy + 2, 3, 8);
    } else if (item.kind === 'tree') {
      ctx.fillStyle = c.wood;
      ctx.fillRect(cx - 3, cy - 14, 6, 14);
      ctx.fillStyle = c.muted;
      ctx.beginPath();
      ctx.arc(cx, cy - 24, 14, 0, Math.PI * 2);
      ctx.fill();
    } else if (item.kind === 'visitor') {
      const ox = ((item.slot % 2) * 2 - 1) * 8;
      const oy = item.slot < 2 ? -4 : 4;
      ctx.fillStyle = item.group.kind === 'thrill' ? c.danger : c.water;
      ctx.fillRect(cx + ox - 3, cy + oy - 14, 6, 12);
      ctx.beginPath();
      ctx.arc(cx + ox, cy + oy - 18, 4, 0, Math.PI * 2);
      ctx.fill();
      if (item.group.id === selected) {
        ctx.strokeStyle = c.text;
        ctx.lineWidth = 2;
        ctx.strokeRect(cx + ox - 6, cy + oy - 25, 12, 25);
        ctx.lineWidth = 1;
      }
    }
    if ('unreachable' in item && item.unreachable) {
      // Shape and words, not colour alone: a dashed outline and a "No path" sign.
      ctx.strokeStyle = c.danger;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      const d = diamond(item.x, item.y, 0.04);
      ctx.beginPath();
      d.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
      ctx.fillStyle = c.background;
      ctx.fillRect(cx - 28, cy + 2, 56, 16);
      ctx.fillStyle = c.text;
      ctx.font = canvasFont('small', 'bold');
      ctx.fillText('✕ No path', cx, cy + 10);
    }
  }
}
