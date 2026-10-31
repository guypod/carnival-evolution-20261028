import { canvasFont, theme } from './theme';

/** What a start or result card says. */
export interface RoundCard {
  title: string;
  /** Up to four lines of body text. Extra lines are dropped. */
  lines?: readonly string[];
  /** The prompt at the bottom, such as "Press Space to play". */
  action?: string;
}

export interface RoundCardBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Where each part of a round card goes. Text y values are line centres. */
export interface RoundCardLayout {
  panel: RoundCardBox;
  title: { text: string; x: number; y: number };
  lines: { text: string; x: number; y: number }[];
  action?: { text: string; x: number; y: number };
}

export const ROUND_CARD = {
  maxLines: 4,
  width: 480,
  padding: 28,
  titleHeight: theme.font.title * 1.25,
  lineHeight: theme.font.body * 1.5,
  actionHeight: theme.font.body * 1.5,
  gap: 16,
} as const;

/**
 * Lays out a round card centred on a canvas of the given size. Plain maths,
 * so it can be tested without a browser.
 */
export function layoutRoundCard(
  card: RoundCard,
  canvas: { width: number; height: number } = theme.canvas,
): RoundCardLayout {
  const lines = (card.lines ?? []).slice(0, ROUND_CARD.maxLines);
  const width = Math.min(ROUND_CARD.width, canvas.width);
  const linesHeight = lines.length * ROUND_CARD.lineHeight;
  const height =
    ROUND_CARD.padding * 2 +
    ROUND_CARD.titleHeight +
    (lines.length > 0 ? ROUND_CARD.gap + linesHeight : 0) +
    (card.action ? ROUND_CARD.gap + ROUND_CARD.actionHeight : 0);
  const panel = {
    x: (canvas.width - width) / 2,
    y: (canvas.height - height) / 2,
    width,
    height,
  };
  const x = canvas.width / 2;

  let top = panel.y + ROUND_CARD.padding;
  const title = { text: card.title, x, y: top + ROUND_CARD.titleHeight / 2 };
  top += ROUND_CARD.titleHeight;

  if (lines.length > 0) top += ROUND_CARD.gap;
  const placed = lines.map((text, i) => ({
    text,
    x,
    y: top + (i + 0.5) * ROUND_CARD.lineHeight,
  }));
  top += linesHeight;

  const action = card.action
    ? { text: card.action, x, y: top + ROUND_CARD.gap + ROUND_CARD.actionHeight / 2 }
    : undefined;

  return { panel, title, lines: placed, action };
}

/** Draws a round card in the carnival's one panel style, centred on the canvas. */
export function drawRoundCard(ctx: CanvasRenderingContext2D, card: RoundCard): RoundCardLayout {
  const layout = layoutRoundCard(card, ctx.canvas);
  const { panel } = layout;

  ctx.save();
  ctx.fillStyle = theme.colors.surface;
  ctx.strokeStyle = theme.colors.accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(panel.x, panel.y, panel.width, panel.height, theme.radius);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = theme.colors.accent;
  ctx.font = canvasFont('title', 'bold');
  ctx.fillText(layout.title.text, layout.title.x, layout.title.y);

  ctx.fillStyle = theme.colors.text;
  ctx.font = canvasFont('body');
  for (const line of layout.lines) ctx.fillText(line.text, line.x, line.y);

  if (layout.action) {
    ctx.fillStyle = theme.colors.muted;
    ctx.font = canvasFont('body', 'bold');
    ctx.fillText(layout.action.text, layout.action.x, layout.action.y);
  }
  ctx.restore();
  return layout;
}
