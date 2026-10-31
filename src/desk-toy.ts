import { canvasFont, theme } from './carnival';
import type { RoomObject } from './prize-room';

/** How many turns the key takes. More turns mean a longer walk, never more. */
export const MAX_WINDS = 3;
/** How long one turn of walking lasts, there and back. */
export const WALK_MS_PER_WIND = 1200;

export type ToyPhase = 'resting' | 'wound' | 'walking';

export interface DeskToy {
  phase: ToyPhase;
  winds: number;
}

export const RESTING_TOY: DeskToy = { phase: 'resting', winds: 0 };

export type ToyAction = 'wind' | 'release' | 'finish' | 'reset';

/** The toy's state machine. Winding stops at MAX_WINDS; a walk always ends at rest. */
export function applyToy(toy: DeskToy, action: ToyAction): DeskToy {
  switch (action) {
    case 'wind':
      if (toy.phase === 'walking' || toy.winds >= MAX_WINDS) return toy;
      return { phase: 'wound', winds: toy.winds + 1 };
    case 'release':
      return toy.phase === 'wound' ? { phase: 'walking', winds: toy.winds } : toy;
    case 'finish':
      return toy.phase === 'walking' ? RESTING_TOY : toy;
    case 'reset':
      return RESTING_TOY;
  }
}

export function walkDuration(toy: DeskToy): number {
  return toy.winds * WALK_MS_PER_WIND;
}

/** The desk vignette, in canvas pixels. */
export const DESK_SCENE = { width: 360, height: 160 } as const;
export const REST_X = 60;
const STEP_PX = 70;
const DESK_Y = 120;

/**
 * Where the toy is at progress t (0 to 1) of a walk of `winds` turns: out to
 * the right and back to rest, with a small waddle. Outside 0 to 1 it rests.
 */
export function toyPosition(t: number, winds: number): { x: number; y: number; facing: 1 | -1 } {
  if (!(t > 0 && t < 1) || winds <= 0) return { x: REST_X, y: DESK_Y, facing: 1 };
  const reach = Math.min(winds, MAX_WINDS) * STEP_PX;
  const out = t < 0.5;
  const x = REST_X + reach * (out ? t * 2 : (1 - t) * 2);
  const y = DESK_Y - Math.abs(Math.sin(t * winds * Math.PI * 4)) * 4;
  return { x, y, facing: out ? 1 : -1 };
}

/**
 * The toy to wind: the first owned duck prize, else a starter demonstration
 * that is clearly not a prize the visitor owns.
 */
export function pickToy(objects: readonly RoomObject[]): { name: string; demo: boolean } {
  const duck = objects.find((o) => o.owned && o.shape === 'duck');
  return duck ? { name: duck.name, demo: false } : { name: 'Demo Wind-up Duck', demo: true };
}

export function describeToy(toy: DeskToy, name: string): string {
  if (toy.phase === 'walking') return `${name} waddles along the desk.`;
  if (toy.phase === 'wound')
    return `${name} is wound ${toy.winds} of ${MAX_WINDS} turns. Let it go when ready.`;
  return `${name} rests on the desk. Wind the key to start.`;
}

/** Draws the desk and the duck. `windsShown` sets how far the key is turned. */
export function drawDesk(
  ctx: CanvasRenderingContext2D,
  at: { x: number; y: number; facing: 1 | -1 },
  windsShown: number,
  demo: boolean,
) {
  const { width, height } = DESK_SCENE;
  ctx.fillStyle = theme.colors.surface;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = theme.colors.wood;
  ctx.fillRect(0, DESK_Y + 14, width, height - DESK_Y - 14);
  ctx.fillStyle = theme.colors.muted;
  ctx.font = canvasFont('small');
  ctx.fillText(demo ? 'Starter demonstration' : 'Your prize', 10, 20);

  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.scale(at.facing, 1);
  ctx.fillStyle = theme.colors.accent;
  ctx.beginPath();
  ctx.ellipse(0, 0, 22, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(16, -16, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = theme.colors.stripeA;
  ctx.beginPath();
  ctx.moveTo(25, -18);
  ctx.lineTo(34, -14);
  ctx.lineTo(25, -11);
  ctx.fill();
  ctx.fillStyle = theme.colors.background;
  ctx.beginPath();
  ctx.arc(19, -19, 2, 0, Math.PI * 2);
  ctx.fill();
  // The key on its back turns a quarter for every wind.
  ctx.strokeStyle = theme.colors.muted;
  ctx.lineWidth = 3;
  ctx.translate(-20, -6);
  ctx.rotate((windsShown * Math.PI) / 2);
  ctx.beginPath();
  ctx.moveTo(-8, 0);
  ctx.lineTo(8, 0);
  ctx.stroke();
  ctx.restore();
}
