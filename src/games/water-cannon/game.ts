import { canvasFont, recordScore, theme, type CarnivalGame } from '../../carnival';

const { width: WIDTH, height: HEIGHT } = theme.canvas;

export const TANK_SIZE = 15;
export const SHOT_SPEED = 700;
export const CANNON = { x: WIDTH / 2, y: HEIGHT - 30 } as const;
const RAILS = [
  { y: 110, speed: 180, radius: 22 },
  { y: 200, speed: -120, radius: 28 },
  { y: 290, speed: 60, radius: 34 },
];
const TARGETS_PER_RAIL = 3;
/** The streak multiplier never goes above this. */
export const MAX_MULTIPLIER = 3;
const POPUP_LIFE = 0.8;

export interface Target {
  x: number;
  y: number;
  radius: number;
  /** Pixels per second; negative moves left. */
  speed: number;
}

export interface Shot {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface Splash {
  x: number;
  y: number;
  age: number;
  /** Points the hit scored, shown as a popup above the splash. */
  points: number;
  multiplier: number;
}

export interface WaterCannonState {
  targets: Target[];
  shots: Shot[];
  splashes: Splash[];
  tank: number;
  score: number;
  /** Consecutive hits since the last miss. */
  streak: number;
  phase: 'playing' | 'over';
  /** True once the final score has been handed out by takeFinalScore. */
  scoreTaken: boolean;
}

export function createState(): WaterCannonState {
  const spacing = WIDTH / TARGETS_PER_RAIL;
  const targets = RAILS.flatMap((rail) =>
    Array.from({ length: TARGETS_PER_RAIL }, (_, i) => ({
      x: spacing * i + spacing / 2,
      y: rail.y,
      radius: rail.radius,
      speed: rail.speed,
    })),
  );
  return {
    targets,
    shots: [],
    splashes: [],
    tank: TANK_SIZE,
    score: 0,
    streak: 0,
    phase: 'playing',
    scoreTaken: false,
  };
}

/** Faster targets are worth more: 10 points per 60 px/s, rounded up. */
export function scoreForHit(target: Target): number {
  return 10 * Math.ceil(Math.abs(target.speed) / 60);
}

/** The multiplier for a hit that brings the streak to `streak`: x1, then x2, then x3 at most. */
export function multiplierFor(streak: number): number {
  return Math.min(Math.max(streak, 1), MAX_MULTIPLIER);
}

/** Scores a hit on `target`, growing the streak. Returns the points it scored. */
export function registerHit(state: WaterCannonState, target: Target): number {
  state.streak += 1;
  const multiplier = multiplierFor(state.streak);
  const points = scoreForHit(target) * multiplier;
  state.score += points;
  state.splashes.push({ x: target.x, y: target.y, age: 0, points, multiplier });
  return points;
}

/** A shot left the booth without hitting anything: the streak starts again. */
export function registerMiss(state: WaterCannonState): void {
  state.streak = 0;
}

/**
 * Hands out the final score once, when the round is over, and null otherwise.
 * A new round from createState can be scored again.
 */
export function takeFinalScore(state: WaterCannonState): number | null {
  if (state.phase !== 'over' || state.scoreTaken) return null;
  state.scoreTaken = true;
  return state.score;
}

export function isHit(shot: Shot, target: Target): boolean {
  return Math.hypot(shot.x - target.x, shot.y - target.y) <= target.radius;
}

/** Fires one shot of water towards the aim point. Returns false if nothing fired. */
export function fire(state: WaterCannonState, aimX: number, aimY: number): boolean {
  if (state.phase !== 'playing' || state.tank === 0) return false;
  const dx = aimX - CANNON.x;
  const dy = Math.min(aimY - CANNON.y, -1);
  const length = Math.hypot(dx, dy);
  state.shots.push({
    x: CANNON.x,
    y: CANNON.y,
    vx: (dx / length) * SHOT_SPEED,
    vy: (dy / length) * SHOT_SPEED,
  });
  state.tank -= 1;
  return true;
}

/** Advances the game by `dt` seconds. */
export function step(state: WaterCannonState, dt: number): void {
  for (const target of state.targets) {
    target.x += target.speed * dt;
    if (target.x > WIDTH + target.radius) target.x = -target.radius;
    if (target.x < -target.radius) target.x = WIDTH + target.radius;
  }

  const remaining: Shot[] = [];
  for (const shot of state.shots) {
    shot.x += shot.vx * dt;
    shot.y += shot.vy * dt;
    const target = state.targets.find((t) => isHit(shot, t));
    if (target) {
      registerHit(state, target);
      // Send the soaked target back to the start of its rail.
      target.x = target.speed > 0 ? -target.radius : WIDTH + target.radius;
    } else if (shot.y > -10 && shot.x > -10 && shot.x < WIDTH + 10) {
      remaining.push(shot);
    } else {
      registerMiss(state);
    }
  }
  state.shots = remaining;

  for (const splash of state.splashes) splash.age += dt;
  state.splashes = state.splashes.filter((s) => s.age < POPUP_LIFE);

  if (state.tank === 0 && state.shots.length === 0) state.phase = 'over';
}

function draw(
  ctx: CanvasRenderingContext2D,
  state: WaterCannonState,
  aim: { x: number; y: number },
) {
  const { colors } = theme;

  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Booth awning.
  const stripe = WIDTH / 16;
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = i % 2 === 0 ? colors.stripeA : colors.stripeB;
    ctx.fillRect(i * stripe, 0, stripe, 40);
  }

  for (const rail of RAILS) {
    ctx.fillStyle = colors.wood;
    ctx.fillRect(0, rail.y + rail.radius + 4, WIDTH, 6);
  }

  for (const target of state.targets) {
    ctx.fillStyle = colors.stripeB;
    ctx.beginPath();
    ctx.arc(target.x, target.y, target.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colors.stripeA;
    ctx.beginPath();
    ctx.arc(target.x, target.y, target.radius * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colors.stripeB;
    ctx.beginPath();
    ctx.arc(target.x, target.y, target.radius * 0.25, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#4fc3f7';
  for (const shot of state.shots) {
    ctx.beginPath();
    ctx.arc(shot.x, shot.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = colors.water;
  ctx.lineWidth = 3;
  for (const splash of state.splashes) {
    if (splash.age < 0.4) {
      ctx.globalAlpha = 1 - splash.age / 0.4;
      ctx.beginPath();
      ctx.arc(splash.x, splash.y, 10 + splash.age * 90, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Score popups float up from each splash and fade.
  ctx.textAlign = 'center';
  for (const splash of state.splashes) {
    ctx.globalAlpha = 1 - splash.age / POPUP_LIFE;
    const bonus = splash.multiplier > 1;
    ctx.fillStyle = bonus ? colors.accent : colors.text;
    ctx.font = canvasFont(bonus ? 'title' : 'body', 'bold');
    const label = bonus ? `+${splash.points} x${splash.multiplier}` : `+${splash.points}`;
    ctx.fillText(label, splash.x, splash.y - 20 - splash.age * 60);
  }
  ctx.globalAlpha = 1;

  // Cannon, pointing at the aim.
  const angle = Math.atan2(Math.min(aim.y - CANNON.y, -1), aim.x - CANNON.x);
  ctx.save();
  ctx.translate(CANNON.x, CANNON.y);
  ctx.rotate(angle);
  ctx.fillStyle = colors.accent;
  ctx.fillRect(0, -8, 46, 16);
  ctx.restore();
  ctx.fillStyle = colors.surface;
  ctx.beginPath();
  ctx.arc(CANNON.x, CANNON.y, 20, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = colors.text;
  ctx.font = canvasFont('body', 'bold');
  ctx.textAlign = 'left';
  ctx.fillText(`Score ${state.score}`, 16, HEIGHT - 20);
  ctx.textAlign = 'right';
  ctx.fillText(`Water ${state.tank}/${TANK_SIZE}`, WIDTH - 16, HEIGHT - 20);

  // Streak indicator, lit up once the multiplier kicks in.
  const multiplier = multiplierFor(state.streak);
  ctx.fillStyle = colors.surface;
  ctx.fillRect(WIDTH - 196, 48, 180, 34);
  ctx.fillStyle = multiplier > 1 ? colors.accent : colors.muted;
  ctx.font = canvasFont(multiplier > 1 ? 'body' : 'small', 'bold');
  ctx.textAlign = 'center';
  ctx.fillText(`Streak ${state.streak}  x${multiplier}`, WIDTH - 106, 71);

  if (state.phase === 'over') {
    ctx.fillStyle = colors.background;
    ctx.globalAlpha = 0.8;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.fillStyle = colors.accent;
    ctx.font = canvasFont('title', 'bold');
    ctx.fillText(`Tank empty! You scored ${state.score}`, WIDTH / 2, HEIGHT / 2);
    ctx.fillStyle = colors.text;
    ctx.font = canvasFont('body');
    ctx.fillText('Click to play again', WIDTH / 2, HEIGHT / 2 + 40);
  }
}

export const waterCannon: CarnivalGame = {
  id: 'water-cannon',
  name: 'Water Cannon',
  description: 'Soak the targets before your tank runs dry. Faster targets score more.',

  start(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;

    let state = createState();
    const aim = { x: WIDTH / 2, y: 0 };

    const toCanvas = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((event.clientX - rect.left) / rect.width) * WIDTH,
        y: ((event.clientY - rect.top) / rect.height) * HEIGHT,
      };
    };
    const onMove = (event: PointerEvent) => Object.assign(aim, toCanvas(event));
    const onDown = (event: PointerEvent) => {
      Object.assign(aim, toCanvas(event));
      if (state.phase === 'over') {
        state = createState();
      } else {
        fire(state, aim.x, aim.y);
      }
    };
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerdown', onDown);

    let frame = 0;
    let last = performance.now();
    const loop = (time: number) => {
      // Cap the step so a background tab doesn't teleport everything.
      const dt = Math.min((time - last) / 1000, 0.05);
      last = time;
      step(state, dt);
      const finalScore = takeFinalScore(state);
      if (finalScore !== null) recordScore(waterCannon.id, finalScore);
      draw(ctx, state, aim);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onDown);
    };
  },
};
