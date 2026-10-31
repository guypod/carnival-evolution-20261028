import { canvasFont, recordScore, theme, type CarnivalGame } from '../../carnival';

const { width: WIDTH, height: HEIGHT } = theme.canvas;

/** Balls in a round. */
export const BALLS = 6;
/** How far either side of a coconut's middle a throw still hits it. */
export const HIT_RADIUS = 26;
/** Seconds a ball is in the air before it lands. */
export const FLIGHT_TIME = 0.4;
/** Seconds a hit coconut wobbles before it falls. */
export const WOBBLE_TIME = 0.6;
/** Seconds the aim marker takes to swing across and back. */
export const SWING_PERIOD = 2.4;
/** The left and right ends of the aim marker's swing. */
export const SWING = { left: 80, right: WIDTH - 80 } as const;
const GROUND = HEIGHT - 120;
const THROW_FROM = { x: WIDTH / 2, y: HEIGHT - 20 } as const;
/** Each post's height above the ground. Higher posts score more. */
const POST_HEIGHTS = [80, 160, 120, 200, 100];

export interface Coconut {
  x: number;
  /** Top of the post, where the coconut sits. */
  y: number;
  points: number;
  state: 'standing' | 'wobbling' | 'fallen';
  /** Seconds since the coconut was hit. */
  age: number;
}

export interface Ball {
  /** Where the throw lands. */
  x: number;
  age: number;
}

export interface CoconutShyState {
  coconuts: Coconut[];
  balls: Ball[];
  ballsLeft: number;
  score: number;
  /** Seconds the round has run, which sets where the aim marker is. */
  time: number;
  phase: 'playing' | 'over';
  scoreTaken: boolean;
}

/** Points for a coconut on a post `height` px tall: 10 per 40 px, rounded up. */
export function scoreForPost(height: number): number {
  return 10 * Math.ceil(height / 40);
}

export function createState(): CoconutShyState {
  const spacing = (SWING.right - SWING.left) / (POST_HEIGHTS.length - 1);
  return {
    coconuts: POST_HEIGHTS.map((height, i) => ({
      x: SWING.left + spacing * i,
      y: GROUND - height,
      points: scoreForPost(height),
      state: 'standing',
      age: 0,
    })),
    balls: [],
    ballsLeft: BALLS,
    score: 0,
    time: 0,
    phase: 'playing',
    scoreTaken: false,
  };
}

/** Where the aim marker is `time` seconds into a round: it swings left and right. */
export function aimX(time: number): number {
  const t = (time / SWING_PERIOD) % 1;
  const along = t < 0.5 ? t * 2 : 2 - t * 2;
  return SWING.left + (SWING.right - SWING.left) * along;
}

/** The standing coconut a throw landing at `x` hits, if any. */
export function coconutAt(state: CoconutShyState, x: number): Coconut | undefined {
  return state.coconuts.find((c) => c.state === 'standing' && Math.abs(c.x - x) <= HIT_RADIUS);
}

/** Throws a ball at the aim marker. Returns false with no balls left or after the round. */
export function throwBall(state: CoconutShyState): boolean {
  if (state.phase !== 'playing' || state.ballsLeft <= 0) return false;
  state.ballsLeft -= 1;
  state.balls.push({ x: aimX(state.time), age: 0 });
  return true;
}

/** A ball lands at `x`: a coconut there starts to wobble and scores its points. */
export function landBall(state: CoconutShyState, x: number): number {
  const coconut = coconutAt(state, x);
  if (!coconut) return 0;
  coconut.state = 'wobbling';
  coconut.age = 0;
  state.score += coconut.points;
  return coconut.points;
}

/** True when nothing more can happen: every coconut is down, or no balls are left or in play. */
export function isRoundOver(state: CoconutShyState): boolean {
  if (state.coconuts.every((c) => c.state === 'fallen')) return true;
  if (state.coconuts.some((c) => c.state === 'wobbling') || state.balls.length > 0) return false;
  return state.ballsLeft === 0;
}

export function step(state: CoconutShyState, dt: number): void {
  if (state.phase !== 'playing') return;
  state.time += dt;
  for (const ball of state.balls) {
    ball.age += dt;
    if (ball.age >= FLIGHT_TIME) landBall(state, ball.x);
  }
  state.balls = state.balls.filter((ball) => ball.age < FLIGHT_TIME);
  for (const coconut of state.coconuts) {
    if (coconut.state === 'standing') continue;
    coconut.age += dt;
    if (coconut.state === 'wobbling' && coconut.age >= WOBBLE_TIME) coconut.state = 'fallen';
  }
  if (isRoundOver(state)) {
    state.phase = 'over';
    state.balls = [];
  }
}

/** Hands out the final score once, when the round is over, and null otherwise. */
export function takeFinalScore(state: CoconutShyState): number | null {
  if (state.phase !== 'over' || state.scoreTaken) return null;
  state.scoreTaken = true;
  return state.score;
}

/**
 * Hands the final score to `record` once, when the round ends. A failed save is
 * reported and returned instead of thrown, so the result still shows and the
 * game can be played again.
 */
export function saveFinalScore(state: CoconutShyState, record: (score: number) => void): unknown {
  const score = takeFinalScore(state);
  if (score === null) return undefined;
  try {
    record(score);
  } catch (error) {
    console.error('Coconut Shy could not save the score', error);
    return error;
  }
  return undefined;
}

/** Throws during a round, or starts a new round after one. Returns the state to carry on with. */
export function press(state: CoconutShyState): CoconutShyState {
  if (state.phase === 'over') return createState();
  throwBall(state);
  return state;
}

function draw(ctx: CanvasRenderingContext2D, state: CoconutShyState): void {
  const { colors } = theme;
  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Awning.
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = i % 2 === 0 ? colors.stripeA : colors.stripeB;
    ctx.fillRect((WIDTH / 10) * i, 0, WIDTH / 10, 36);
  }

  ctx.fillStyle = colors.surface;
  ctx.fillRect(0, GROUND, WIDTH, HEIGHT - GROUND);

  for (const coconut of state.coconuts) {
    ctx.fillStyle = colors.wood;
    ctx.fillRect(coconut.x - 6, coconut.y, 12, GROUND - coconut.y);
    ctx.fillStyle = colors.muted;
    ctx.font = canvasFont('small', 'bold');
    ctx.textAlign = 'center';
    ctx.fillText(`${coconut.points}`, coconut.x, GROUND + 20);

    if (coconut.state === 'fallen' && coconut.age > WOBBLE_TIME + 0.5) continue;
    let cx = coconut.x;
    let cy = coconut.y - 18;
    if (coconut.state === 'wobbling') {
      cx += Math.sin(coconut.age * 40) * 5 * (1 - coconut.age / WOBBLE_TIME);
    } else if (coconut.state === 'fallen') {
      const t = coconut.age - WOBBLE_TIME;
      cx += t * 60;
      cy += 0.5 * 1800 * t * t;
      ctx.globalAlpha = Math.max(0, 1 - t * 2);
    }
    ctx.fillStyle = colors.wood;
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colors.background;
    ctx.beginPath();
    ctx.arc(cx - 5, cy - 4, 3, 0, Math.PI * 2);
    ctx.arc(cx + 5, cy - 4, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // The swinging aim marker.
  if (state.phase === 'playing' && state.ballsLeft > 0) {
    const x = aimX(state.time);
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, 50);
    ctx.lineTo(x, GROUND);
    ctx.stroke();
    ctx.fillStyle = colors.accent;
    ctx.beginPath();
    ctx.moveTo(x - 10, 44);
    ctx.lineTo(x + 10, 44);
    ctx.lineTo(x, 60);
    ctx.fill();
  }

  // Balls in flight, from the player up to where they land.
  ctx.fillStyle = colors.text;
  for (const ball of state.balls) {
    const t = ball.age / FLIGHT_TIME;
    const target = coconutAt(state, ball.x);
    const toY = target ? target.y - 18 : GROUND - 100;
    const x = THROW_FROM.x + (ball.x - THROW_FROM.x) * t;
    const y = THROW_FROM.y + (toY - THROW_FROM.y) * t - Math.sin(Math.PI * t) * 60;
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = colors.text;
  ctx.font = canvasFont('body', 'bold');
  ctx.textAlign = 'left';
  ctx.fillText(`Score ${state.score}`, 16, HEIGHT - 20);
  ctx.textAlign = 'right';
  ctx.fillText(`Balls ${state.ballsLeft}/${BALLS}`, WIDTH - 16, HEIGHT - 20);
  ctx.textAlign = 'center';
  ctx.fillStyle = colors.muted;
  ctx.font = canvasFont('small');
  ctx.fillText('Click or press Space to throw', WIDTH / 2, HEIGHT - 20);

  if (state.phase === 'over') {
    ctx.fillStyle = colors.background;
    ctx.globalAlpha = 0.8;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.globalAlpha = 1;
    ctx.fillStyle = colors.accent;
    ctx.font = canvasFont('title', 'bold');
    ctx.fillText(`You scored ${state.score}`, WIDTH / 2, HEIGHT / 2);
    ctx.fillStyle = colors.text;
    ctx.font = canvasFont('body');
    ctx.fillText('Click or press Space to play again', WIDTH / 2, HEIGHT / 2 + 40);
  }
}

export const coconutShy: CarnivalGame = {
  id: 'coconut-shy',
  name: 'Coconut Shy',
  description: 'Time your throws to knock the coconuts off their posts. Higher posts score more.',

  start(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;

    let state = createState();
    const onDown = () => {
      state = press(state);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.code !== 'Space' && event.key !== 'Enter') return;
      const target = event.target instanceof HTMLElement ? event.target : undefined;
      if (target && ['A', 'BUTTON', 'INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (target?.isContentEditable) return;
      event.preventDefault();
      state = press(state);
    };
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKeyDown);

    let frame = 0;
    let last = performance.now();
    const loop = (time: number) => {
      const dt = Math.min((time - last) / 1000, 0.05);
      last = time;
      step(state, dt);
      saveFinalScore(state, (score) => recordScore(coconutShy.id, score));
      draw(ctx, state);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  },
};
