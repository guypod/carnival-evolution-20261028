import { canvasFont, recordScore, theme, type CarnivalGame } from '../../carnival';

const { width: WIDTH, height: HEIGHT } = theme.canvas;

export const RINGS_PER_ROUND = 10;
/** Seconds a ring is in the air. It lands exactly where it was aimed. */
export const FLIGHT_TIME = 0.5;
/** A ring scores when it lands this close to a bottle's neck. */
export const RINGER_RADIUS = 18;
export const THROWER = { x: WIDTH / 2, y: HEIGHT - 30 } as const;
/** Pixels per second the aim moves when steered with the arrow keys. */
export const AIM_SPEED = 360;

export const SHELVES = [
  { y: 120, speed: 150, points: 30 },
  { y: 210, speed: -100, points: 20 },
  { y: 300, speed: 50, points: 10 },
] as const;
const BOTTLES_PER_SHELF = 4;

export interface Bottle {
  x: number;
  y: number;
  /** Pixels per second; negative moves left. */
  speed: number;
  points: number;
}

export interface Ring {
  /** Where the ring will land. */
  x: number;
  y: number;
  /** Seconds since the throw. */
  age: number;
}

export interface Landing {
  x: number;
  y: number;
  points: number;
  age: number;
}

export interface RingTossState {
  bottles: Bottle[];
  rings: Ring[];
  landings: Landing[];
  ringsLeft: number;
  score: number;
  ringers: number;
  phase: 'playing' | 'over';
  /** Set once the round's score has been handed to the score board. */
  scoreRecorded: boolean;
}

export function createState(): RingTossState {
  const spacing = WIDTH / BOTTLES_PER_SHELF;
  const bottles = SHELVES.flatMap((shelf) =>
    Array.from({ length: BOTTLES_PER_SHELF }, (_, i) => ({
      x: spacing * i + spacing / 2,
      y: shelf.y,
      speed: shelf.speed,
      points: shelf.points,
    })),
  );
  return {
    bottles,
    rings: [],
    landings: [],
    ringsLeft: RINGS_PER_ROUND,
    score: 0,
    ringers: 0,
    phase: 'playing',
    scoreRecorded: false,
  };
}

/** The bottle a ring landing at (x, y) rings, if any: the closest neck within RINGER_RADIUS. */
export function bottleAt(bottles: readonly Bottle[], x: number, y: number): Bottle | undefined {
  let best: Bottle | undefined;
  let bestDistance = RINGER_RADIUS;
  for (const bottle of bottles) {
    const distance = Math.hypot(bottle.x - x, bottle.y - y);
    if (distance <= bestDistance) {
      best = bottle;
      bestDistance = distance;
    }
  }
  return best;
}

/** Throws one ring at the aim point. Returns false if nothing was thrown. */
export function toss(state: RingTossState, aimX: number, aimY: number): boolean {
  if (state.phase !== 'playing' || state.ringsLeft === 0) return false;
  state.rings.push({
    x: Math.min(Math.max(aimX, 0), WIDTH),
    y: Math.min(Math.max(aimY, 0), THROWER.y - 40),
    age: 0,
  });
  state.ringsLeft -= 1;
  return true;
}

function moveBottle(bottle: Bottle, dt: number) {
  bottle.x += bottle.speed * dt;
  const margin = RINGER_RADIUS;
  if (bottle.x > WIDTH + margin) bottle.x -= WIDTH + margin * 2;
  if (bottle.x < -margin) bottle.x += WIDTH + margin * 2;
}

/** Advances the game by `dt` seconds. */
export function step(state: RingTossState, dt: number): void {
  for (const bottle of state.bottles) moveBottle(bottle, dt);

  const flying: Ring[] = [];
  for (const ring of state.rings) {
    ring.age += dt;
    if (ring.age < FLIGHT_TIME) {
      flying.push(ring);
      continue;
    }
    const bottle = bottleAt(state.bottles, ring.x, ring.y);
    const points = bottle ? bottle.points : 0;
    state.score += points;
    if (bottle) state.ringers += 1;
    state.landings.push({ x: ring.x, y: ring.y, points, age: 0 });
  }
  state.rings = flying;

  for (const landing of state.landings) landing.age += dt;
  state.landings = state.landings.filter((l) => l.age < 0.8);

  if (state.ringsLeft === 0 && state.rings.length === 0) state.phase = 'over';
}

/**
 * The round's final score the first time it is asked for after the round ends,
 * and undefined before that and every time after, so the score is saved once.
 */
export function takeFinalScore(state: RingTossState): number | undefined {
  if (state.phase !== 'over' || state.scoreRecorded) return undefined;
  state.scoreRecorded = true;
  return state.score;
}

/** Moves the aim by the arrow keys held, kept inside the throwing area. */
export function steerAim(aim: { x: number; y: number }, dx: number, dy: number, dt: number): void {
  aim.x = Math.min(Math.max(aim.x + dx * AIM_SPEED * dt, 0), WIDTH);
  aim.y = Math.min(Math.max(aim.y + dy * AIM_SPEED * dt, 0), THROWER.y - 40);
}

function drawRing(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  ctx.beginPath();
  ctx.ellipse(x, y, RINGER_RADIUS * scale, RINGER_RADIUS * 0.45 * scale, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function draw(ctx: CanvasRenderingContext2D, state: RingTossState, aim: { x: number; y: number }) {
  const { colors } = theme;

  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Booth awning.
  const stripe = WIDTH / 16;
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = i % 2 === 0 ? colors.stripeA : colors.stripeB;
    ctx.fillRect(i * stripe, 0, stripe, 40);
  }

  ctx.font = canvasFont('small', 'bold');
  ctx.textAlign = 'left';
  for (const shelf of SHELVES) {
    ctx.fillStyle = colors.wood;
    ctx.fillRect(0, shelf.y + 34, WIDTH, 8);
    ctx.fillStyle = colors.accent;
    ctx.fillText(`${shelf.points} pts`, 8, shelf.y + 58);
  }

  for (const bottle of state.bottles) {
    // The scoring zone: land the ring's centre inside it.
    ctx.strokeStyle = colors.muted;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(bottle.x, bottle.y, RINGER_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = colors.water;
    ctx.fillRect(bottle.x - 12, bottle.y + 6, 24, 28);
    ctx.fillRect(bottle.x - 5, bottle.y - 10, 10, 18);
    ctx.fillStyle = colors.text;
    ctx.font = canvasFont('small', 'bold');
    ctx.textAlign = 'center';
    ctx.fillText(String(bottle.points), bottle.x, bottle.y + 26);
  }

  // Aim preview: the arc the ring will fly and where it will land.
  ctx.strokeStyle = colors.muted;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(THROWER.x, THROWER.y);
  ctx.quadraticCurveTo((THROWER.x + aim.x) / 2, Math.min(aim.y, THROWER.y) - 80, aim.x, aim.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = colors.accent;
  drawRing(ctx, aim.x, aim.y, 1);
  ctx.beginPath();
  ctx.moveTo(aim.x - 6, aim.y);
  ctx.lineTo(aim.x + 6, aim.y);
  ctx.moveTo(aim.x, aim.y - 6);
  ctx.lineTo(aim.x, aim.y + 6);
  ctx.stroke();

  ctx.strokeStyle = colors.stripeA;
  ctx.lineWidth = 4;
  for (const ring of state.rings) {
    const t = ring.age / FLIGHT_TIME;
    const x = THROWER.x + (ring.x - THROWER.x) * t;
    const y = THROWER.y + (ring.y - THROWER.y) * t - Math.sin(Math.PI * t) * 80;
    drawRing(ctx, x, y, 1.6 - 0.6 * t);
  }

  ctx.font = canvasFont('body', 'bold');
  ctx.textAlign = 'center';
  for (const landing of state.landings) {
    ctx.globalAlpha = 1 - landing.age / 0.8;
    ctx.strokeStyle = landing.points > 0 ? colors.accent : colors.danger;
    ctx.lineWidth = 4;
    drawRing(ctx, landing.x, landing.y, 1);
    ctx.fillStyle = landing.points > 0 ? colors.accent : colors.danger;
    ctx.fillText(
      landing.points > 0 ? `+${landing.points}` : 'Miss',
      landing.x,
      landing.y - 24 - landing.age * 30,
    );
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = colors.surface;
  ctx.beginPath();
  ctx.arc(THROWER.x, THROWER.y, 20, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = colors.text;
  ctx.font = canvasFont('body', 'bold');
  ctx.textAlign = 'left';
  ctx.fillText(`Score ${state.score}`, 16, HEIGHT - 20);
  ctx.textAlign = 'right';
  ctx.fillText(`Rings ${state.ringsLeft}/${RINGS_PER_ROUND}`, WIDTH - 16, HEIGHT - 20);

  if (state.phase === 'over') {
    ctx.fillStyle = colors.background;
    ctx.globalAlpha = 0.8;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.fillStyle = colors.accent;
    ctx.font = canvasFont('title', 'bold');
    ctx.fillText(`Out of rings! You scored ${state.score}`, WIDTH / 2, HEIGHT / 2);
    ctx.fillStyle = colors.text;
    ctx.font = canvasFont('body');
    ctx.fillText(
      `${state.ringers} of ${RINGS_PER_ROUND} rings landed. Click or press Space to play again`,
      WIDTH / 2,
      HEIGHT / 2 + 40,
    );
  }
}

const KEYS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

export const ringToss: CarnivalGame = {
  id: 'ring-toss',
  name: 'Ring Toss',
  description: 'Ring the moving bottles with ten rings. Higher shelves score more.',

  start(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;

    let state = createState();
    const aim = { x: WIDTH / 2, y: SHELVES[1].y };
    const held = new Set<string>();

    const throwOrReplay = () => {
      if (state.phase === 'over') {
        state = createState();
      } else {
        toss(state, aim.x, aim.y);
      }
    };
    const toCanvas = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((event.clientX - rect.left) / rect.width) * WIDTH,
        y: ((event.clientY - rect.top) / rect.height) * HEIGHT,
      };
    };
    const onMove = (event: PointerEvent) => {
      const point = toCanvas(event);
      steerAim(aim, point.x - aim.x, point.y - aim.y, 1 / AIM_SPEED);
    };
    const onDown = (event: PointerEvent) => {
      onMove(event);
      throwOrReplay();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        event.preventDefault();
        if (!event.repeat) throwOrReplay();
      } else if (event.key in KEYS) {
        event.preventDefault();
        held.add(event.key);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => held.delete(event.key);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    let frame = 0;
    let last = performance.now();
    const loop = (time: number) => {
      // Cap the step so a background tab doesn't teleport everything.
      const dt = Math.min((time - last) / 1000, 0.05);
      last = time;
      let dx = 0;
      let dy = 0;
      for (const key of held) {
        dx += KEYS[key][0];
        dy += KEYS[key][1];
      }
      steerAim(aim, dx, dy, dt);
      step(state, dt);
      const finalScore = takeFinalScore(state);
      if (finalScore !== undefined) recordScore(ringToss.id, finalScore);
      draw(ctx, state, aim);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  },
};
