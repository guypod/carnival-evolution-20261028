import { canvasFont, recordScore, theme, type CarnivalGame } from '../../carnival';

const { width: WIDTH, height: HEIGHT } = theme.canvas;

export const RINGS_PER_ROUND = 10;
/** Seconds a ring is in the air. It lands exactly where it was aimed. */
export const FLIGHT_TIME = 0.5;
/** A ring scores when it lands this close to a bottle's neck. */
export const RINGER_RADIUS = 18;
export const THROWER = { x: WIDTH / 2, y: HEIGHT - 30 } as const;
/** The peg beside the thrower that holds the rings still to throw. */
export const RING_STACK = { x: THROWER.x + 56, y: THROWER.y + 14, gap: 4 } as const;
/** Pixels per second the aim moves when steered with the arrow keys. */
export const AIM_SPEED = 360;

export const SHELVES = [
  { y: 120, speed: 150, points: 30 },
  { y: 210, speed: -100, points: 20 },
  { y: 300, speed: 50, points: 10 },
] as const;
const BOTTLES_PER_SHELF = 4;
/** A golden bottle scores this many times its shelf's points. */
export const GOLDEN_MULTIPLIER = 2;

export interface Bottle {
  x: number;
  y: number;
  /** Pixels per second; negative moves left. */
  speed: number;
  points: number;
  /** One bottle on each shelf is golden and worth double. */
  golden: boolean;
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
  golden: boolean;
  age: number;
}

export interface RingTossState {
  bottles: Bottle[];
  rings: Ring[];
  landings: Landing[];
  ringsLeft: number;
  score: number;
  ringers: number;
  /** Rings that landed on a golden bottle this round. */
  bonusHits: number;
  /** Which round this is, counting from 0. It picks the golden bottles. */
  round: number;
  phase: 'playing' | 'over';
  /** Set once the round's score has been handed to the score board. */
  scoreRecorded: boolean;
}

/** The bottle on a shelf that is golden: it moves along one place each round. */
export function goldenIndex(shelfIndex: number, round: number): number {
  return (shelfIndex + round) % BOTTLES_PER_SHELF;
}

export function createState(round = 0): RingTossState {
  const spacing = WIDTH / BOTTLES_PER_SHELF;
  const bottles = SHELVES.flatMap((shelf, s) =>
    Array.from({ length: BOTTLES_PER_SHELF }, (_, i) => {
      const golden = i === goldenIndex(s, round);
      return {
        x: spacing * i + spacing / 2,
        y: shelf.y,
        speed: shelf.speed,
        points: golden ? shelf.points * GOLDEN_MULTIPLIER : shelf.points,
        golden,
      };
    }),
  );
  return {
    bottles,
    rings: [],
    landings: [],
    ringsLeft: RINGS_PER_ROUND,
    score: 0,
    ringers: 0,
    bonusHits: 0,
    round,
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

/** Where each ring left sits on the stack, bottom first: one entry per ring left. */
export function ringStack(ringsLeft: number): { x: number; y: number }[] {
  return Array.from({ length: Math.max(ringsLeft, 0) }, (_, i) => ({
    x: RING_STACK.x,
    y: RING_STACK.y - i * RING_STACK.gap,
  }));
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
    const golden = bottle?.golden ?? false;
    if (bottle) state.ringers += 1;
    if (golden) state.bonusHits += 1;
    state.landings.push({ x: ring.x, y: ring.y, points, golden, age: 0 });
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
    ctx.fillText(`${shelf.points} pts, gold ${shelf.points * GOLDEN_MULTIPLIER}`, 8, shelf.y + 58);
  }

  ctx.fillStyle = colors.text;
  ctx.textAlign = 'center';
  ctx.fillText('Lead moving bottles by half a second. Gold bottles score double.', WIDTH / 2, 62);

  for (const bottle of state.bottles) {
    // The scoring zone: land the ring's centre inside it.
    // Golden bottles keep the same zone size, so they are no easier to ring.
    ctx.strokeStyle = bottle.golden ? colors.accent : colors.muted;
    ctx.lineWidth = bottle.golden ? 2 : 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(bottle.x, bottle.y, RINGER_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = bottle.golden ? colors.accent : colors.water;
    ctx.fillRect(bottle.x - 12, bottle.y + 6, 24, 28);
    ctx.fillRect(bottle.x - 5, bottle.y - 10, 10, 18);
    if (bottle.golden) {
      ctx.strokeStyle = colors.text;
      ctx.lineWidth = 2;
      ctx.strokeRect(bottle.x - 12, bottle.y + 6, 24, 28);
    }
    ctx.fillStyle = bottle.golden ? colors.background : colors.text;
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
    if (landing.golden) ctx.fillStyle = colors.stripeB;
    ctx.fillText(
      landing.golden
        ? `Golden! +${landing.points}`
        : landing.points > 0
          ? `+${landing.points}`
          : 'Miss',
      landing.x,
      landing.y - 24 - landing.age * 30,
    );
  }
  ctx.globalAlpha = 1;

  // The thrower: a wooden post with a cream hand on top, outlined so it stands
  // out from the dark background.
  ctx.fillStyle = colors.wood;
  ctx.strokeStyle = colors.text;
  ctx.lineWidth = 2;
  ctx.fillRect(THROWER.x - 6, THROWER.y, 12, HEIGHT - THROWER.y);
  ctx.strokeRect(THROWER.x - 6, THROWER.y, 12, HEIGHT - THROWER.y);
  ctx.fillStyle = colors.text;
  ctx.beginPath();
  ctx.arc(THROWER.x, THROWER.y, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(THROWER.x - 13, THROWER.y - 22, 6, 14);
  ctx.fillRect(THROWER.x - 5, THROWER.y - 26, 6, 18);
  ctx.fillRect(THROWER.x + 3, THROWER.y - 24, 6, 16);
  ctx.fillRect(THROWER.x + 11, THROWER.y - 6, 10, 6);

  // The rings left, stacked on a peg beside the thrower.
  ctx.fillStyle = colors.wood;
  ctx.fillRect(
    RING_STACK.x - 3,
    RING_STACK.y - RINGS_PER_ROUND * RING_STACK.gap - 6,
    6,
    RINGS_PER_ROUND * RING_STACK.gap + 12,
  );
  ctx.strokeStyle = colors.stripeA;
  ctx.lineWidth = 3;
  for (const ring of ringStack(state.ringsLeft)) drawRing(ctx, ring.x, ring.y, 0.8);

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
      `${state.ringers} of ${RINGS_PER_ROUND} rings landed, ${state.bonusHits} on golden bottles.`,
      WIDTH / 2,
      HEIGHT / 2 + 40,
    );
    ctx.fillText('Click or press Space to play again', WIDTH / 2, HEIGHT / 2 + 70);
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
  description:
    'Ring the moving bottles with ten rings. Higher shelves score more, golden bottles double.',

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
        state = createState(state.round + 1);
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
