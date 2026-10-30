import { canvasFont, theme } from './carnival';

/** Balloon colours, all from the carnival theme. */
export const BALLOON_COLORS = ['stripeA', 'accent', 'water', 'muted'] as const;
export type BalloonColor = (typeof BALLOON_COLORS)[number];
export const BALLOON_COLOR_NAMES: Record<BalloonColor, string> = {
  stripeA: 'red',
  accent: 'gold',
  water: 'blue',
  muted: 'lavender',
};
export const WISH_MAX = 40;
/** The keepsake list keeps the newest few balloons only. */
export const KEEPSAKE_MAX = 5;

export interface WishBalloon {
  color: BalloonColor;
  wish: string;
}

/** Plain text only: control characters and angle brackets become spaces. */
export function cleanWish(raw: string): string {
  const text = raw
    .replace(/[\p{Cc}<>]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(text).slice(0, WISH_MAX).join('');
}

/** A balloon ready to release, or undefined when the wish is empty or the colour unknown. */
export function makeBalloon(color: string, wish: string): WishBalloon | undefined {
  const text = cleanWish(wish);
  if (!text || !BALLOON_COLORS.includes(color as BalloonColor)) return undefined;
  return { color: color as BalloonColor, wish: text };
}

/** Adds a released balloon to the front of the keepsakes, dropping the oldest. */
export function addKeepsake(list: readonly WishBalloon[], balloon: WishBalloon): WishBalloon[] {
  return [balloon, ...list].slice(0, KEEPSAKE_MAX);
}

export function parseKeepsakes(raw: string | null): WishBalloon[] {
  if (!raw) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  const list: WishBalloon[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue;
    const v = item as Record<string, unknown>;
    if (typeof v.color !== 'string' || typeof v.wish !== 'string') continue;
    const balloon = makeBalloon(v.color, v.wish);
    if (balloon) list.push(balloon);
  }
  return list.slice(0, KEEPSAKE_MAX);
}

export const KEEPSAKE_KEY = 'carnival:wish-balloons';

export interface KeepsakeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Keeps the keepsake list in this browser. Nothing is uploaded. */
export function createKeepsakeStore(storage: KeepsakeStorage | undefined) {
  return {
    load(): WishBalloon[] {
      try {
        return parseKeepsakes(storage?.getItem(KEEPSAKE_KEY) ?? null);
      } catch {
        return [];
      }
    },
    save(list: readonly WishBalloon[]): boolean {
      try {
        if (!storage) return false;
        storage.setItem(KEEPSAKE_KEY, JSON.stringify(list.slice(0, KEEPSAKE_MAX)));
        return true;
      } catch {
        return false;
      }
    },
  };
}

function browserStorage(): KeepsakeStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export const keepsakeStore = createKeepsakeStore(browserStorage());

export const BALLOON_SCENE = { width: 480, height: 400 } as const;
/** How long a release takes, in milliseconds. */
export const RELEASE_MS = 4000;
/** How far below its centre the drawing reaches: string and wish tag. */
const DRAWING_BELOW = 120;
/** Where the stall's counter top sits; the balloon starts just above it. */
const COUNTER_Y = BALLOON_SCENE.height - 92;

/**
 * Where the balloon is at progress t (0 to 1): it rises from the stall in a
 * gentle arc and drifts off the top, wish and all. Quiet uses a fixed resting
 * spot instead.
 */
export function balloonPosition(t: number): { x: number; y: number } {
  const p = Math.min(1, Math.max(0, t));
  const { width } = BALLOON_SCENE;
  const startY = COUNTER_Y - 70;
  return {
    x: width / 2 + Math.sin(p * Math.PI) * 70,
    y: startY - p * (startY + DRAWING_BELOW),
  };
}

export const RESTING_POSITION = { x: BALLOON_SCENE.width / 2, y: 104 } as const;

/** Fixed star positions, so every frame and every Quiet redraw looks the same. */
export const STARS: readonly { x: number; y: number; r: number }[] = Array.from(
  { length: 28 },
  (_, i) => ({
    x: (i * 137 + 23) % BALLOON_SCENE.width,
    y: ((i * 71 + 11) % 150) + 8,
    r: i % 5 === 0 ? 1.8 : 1,
  }),
);

/** Lanterns on the string across the top of the stall. */
export const LANTERNS: readonly { x: number; y: number }[] = Array.from({ length: 7 }, (_, i) => {
  const x = 40 + i * 66.7;
  const sag = Math.sin((i / 6) * Math.PI) * 26;
  return { x, y: 40 + sag };
});

/** The bunch of balloons tied to the stall, one of each colour. */
const BUNCH: readonly { dx: number; dy: number; color: BalloonColor }[] = [
  { dx: -150, dy: -78, color: 'water' },
  { dx: -124, dy: -100, color: 'stripeA' },
  { dx: 126, dy: -96, color: 'accent' },
  { dx: 152, dy: -74, color: 'muted' },
];

function drawBalloonShape(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: BalloonColor,
  scale: number,
) {
  const rx = 26 * scale;
  const ry = 34 * scale;
  ctx.fillStyle = theme.colors[color];
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  // Knot.
  ctx.beginPath();
  ctx.moveTo(x - 5 * scale, y + ry + 6 * scale);
  ctx.lineTo(x + 5 * scale, y + ry + 6 * scale);
  ctx.lineTo(x, y + ry - 1);
  ctx.closePath();
  ctx.fill();
  // Shine.
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = theme.colors.stripeB;
  ctx.beginPath();
  ctx.ellipse(x - rx * 0.4, y - ry * 0.4, rx * 0.22, ry * 0.3, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawString(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.strokeStyle = theme.colors.stripeB;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo((x1 + x2) / 2 - 12, (y1 + y2) / 2, x2, y2);
  ctx.stroke();
}

function drawSky(ctx: CanvasRenderingContext2D) {
  const { width, height } = BALLOON_SCENE;
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, theme.colors.background);
  sky.addColorStop(1, theme.colors.surface);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = theme.colors.stripeB;
  for (const star of STARS) {
    ctx.globalAlpha = star.r > 1 ? 0.9 : 0.55;
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Far hills.
  ctx.fillStyle = theme.colors.background;
  ctx.beginPath();
  ctx.moveTo(0, height - 70);
  ctx.quadraticCurveTo(width * 0.25, height - 130, width * 0.5, height - 86);
  ctx.quadraticCurveTo(width * 0.78, height - 140, width, height - 92);
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.fill();
}

function drawLanterns(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = theme.colors.muted;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, 30);
  for (const lantern of LANTERNS) ctx.lineTo(lantern.x, lantern.y - 10);
  ctx.lineTo(BALLOON_SCENE.width, 30);
  ctx.stroke();
  for (const { x, y } of LANTERNS) {
    // A soft glow: three faint rings of lantern light.
    ctx.fillStyle = theme.colors.accent;
    for (const [radius, alpha] of [
      [26, 0.08],
      [18, 0.12],
      [12, 0.18],
    ]) {
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.ellipse(x, y, 8, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = theme.colors.wood;
    ctx.fillRect(x - 5, y - 12, 10, 3);
    ctx.fillRect(x - 5, y + 9, 10, 3);
  }
}

function drawStall(ctx: CanvasRenderingContext2D) {
  const { width, height } = BALLOON_SCENE;
  const left = width / 2 - 120;
  const right = width / 2 + 120;
  const roof = COUNTER_Y - 120;
  // Posts.
  ctx.fillStyle = theme.colors.wood;
  ctx.fillRect(left + 6, roof, 10, COUNTER_Y - roof);
  ctx.fillRect(right - 16, roof, 10, COUNTER_Y - roof);
  // Striped awning with a scalloped edge.
  const stripes = 8;
  const stripe = (right - left + 20) / stripes;
  for (let i = 0; i < stripes; i += 1) {
    const x = left - 10 + i * stripe;
    ctx.fillStyle = i % 2 === 0 ? theme.colors.stripeA : theme.colors.stripeB;
    ctx.beginPath();
    ctx.moveTo(x + stripe * 0.2, roof - 28);
    ctx.lineTo(x + stripe * 0.8 + stripe * 0.2, roof - 28);
    ctx.lineTo(x + stripe, roof);
    ctx.arc(x + stripe / 2, roof, stripe / 2, 0, Math.PI);
    ctx.closePath();
    ctx.fill();
  }
  // Counter.
  ctx.fillStyle = theme.colors.wood;
  ctx.fillRect(left - 6, COUNTER_Y, right - left + 12, 12);
  ctx.fillStyle = theme.colors.stripeA;
  ctx.fillRect(left, COUNTER_Y + 12, right - left, height - COUNTER_Y - 30);
  ctx.fillStyle = theme.colors.stripeB;
  for (let x = left + 12; x < right - 12; x += 36) {
    ctx.fillRect(x, COUNTER_Y + 12, 14, height - COUNTER_Y - 30);
  }
  // Sign, on the front of the counter.
  const signY = COUNTER_Y + 26;
  ctx.fillStyle = theme.colors.background;
  ctx.fillRect(width / 2 - 70, signY, 140, 28);
  ctx.strokeStyle = theme.colors.accent;
  ctx.lineWidth = 2;
  ctx.strokeRect(width / 2 - 70, signY, 140, 28);
  ctx.fillStyle = theme.colors.accent;
  ctx.font = canvasFont('small', 'bold');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('WISH BALLOONS', width / 2, signY + 14);
  ctx.textBaseline = 'alphabetic';
  // Ground.
  ctx.fillStyle = theme.colors.wood;
  ctx.fillRect(0, height - 18, width, 18);
}

function drawBunch(ctx: CanvasRenderingContext2D) {
  const anchor = { x: BALLOON_SCENE.width / 2, y: COUNTER_Y };
  for (const b of BUNCH) {
    const x = anchor.x + b.dx;
    const y = anchor.y + b.dy;
    drawString(ctx, x, y + 32, anchor.x + Math.sign(b.dx) * 104, anchor.y);
    drawBalloonShape(ctx, x, y, b.color, 0.8);
  }
}

/** Draws the lantern-lit stall and one balloon with its wish. Text goes through fillText, never HTML. */
export function drawBalloonScene(
  ctx: CanvasRenderingContext2D,
  balloon: WishBalloon | undefined,
  at: { x: number; y: number },
) {
  const { width } = BALLOON_SCENE;
  drawSky(ctx);
  drawLanterns(ctx);
  drawStall(ctx);
  drawBunch(ctx);
  if (!balloon) return;
  drawString(ctx, at.x, at.y + 40, at.x, at.y + 82);
  drawBalloonShape(ctx, at.x, at.y, balloon.color, 1.2);
  // The wish hangs on a paper tag under the balloon.
  ctx.font = canvasFont('small', 'bold');
  ctx.textAlign = 'center';
  // The tag is centred on the balloon, which drifts right on its way up, so
  // it is capped by the room on its nearer side to stay inside the scene.
  const room = 2 * Math.min(at.x, width - at.x);
  const tagWidth = Math.min(room - 24, ctx.measureText(balloon.wish).width + 24);
  ctx.fillStyle = theme.colors.stripeB;
  ctx.fillRect(at.x - tagWidth / 2, at.y + 82, tagWidth, 26);
  ctx.fillStyle = theme.colors.background;
  ctx.fillText(balloon.wish, at.x, at.y + 100, tagWidth - 12);
}
