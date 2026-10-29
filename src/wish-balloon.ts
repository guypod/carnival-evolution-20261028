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

export const BALLOON_SCENE = { width: 360, height: 300 } as const;
/** How long a release takes, in milliseconds. */
export const RELEASE_MS = 4000;

/**
 * Where the balloon is at progress t (0 to 1): it rises from the stall in a
 * gentle arc and drifts off the top. Quiet uses a fixed resting spot instead.
 */
export function balloonPosition(t: number): { x: number; y: number } {
  const p = Math.min(1, Math.max(0, t));
  const { width, height } = BALLOON_SCENE;
  return {
    x: width / 2 + Math.sin(p * Math.PI) * 60,
    y: height - 70 - p * (height + 20),
  };
}

export const RESTING_POSITION = { x: BALLOON_SCENE.width / 2, y: 110 } as const;

/** Draws the sky, the stall and one balloon with its wish. Text goes through fillText, never HTML. */
export function drawBalloonScene(
  ctx: CanvasRenderingContext2D,
  balloon: WishBalloon | undefined,
  at: { x: number; y: number },
) {
  const { width, height } = BALLOON_SCENE;
  ctx.fillStyle = theme.colors.background;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = theme.colors.wood;
  ctx.fillRect(width / 2 - 50, height - 30, 100, 30);
  if (!balloon) return;
  ctx.strokeStyle = theme.colors.text;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(at.x, at.y + 34);
  ctx.quadraticCurveTo(at.x - 10, at.y + 60, at.x, at.y + 80);
  ctx.stroke();
  ctx.fillStyle = theme.colors[balloon.color];
  ctx.beginPath();
  ctx.ellipse(at.x, at.y, 26, 34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = theme.colors.text;
  ctx.font = canvasFont('small');
  ctx.textAlign = 'center';
  ctx.fillText(balloon.wish, at.x, at.y + 100, width - 20);
}
