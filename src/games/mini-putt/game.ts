import { canvasFont, recordScore, theme, type CarnivalGame } from '../../carnival';

const { width: WIDTH, height: HEIGHT } = theme.canvas;

/** The green every hole is played on. Its edges are walls. */
export const COURSE = { x: 40, y: 70, w: 720, h: 370 } as const;
export const BALL_RADIUS = 8;
export const CUP_RADIUS = 13;
/** The ball only drops in the cup at or below this speed, in pixels a second. */
export const SINK_SPEED = 260;
/** Speed of a full-power putt, in pixels a second. */
export const MAX_SPEED = 900;
/** How fast the ball slows, in pixels a second per second. */
export const FRICTION = 320;
/** Below this speed the ball stops. */
export const STOP_SPEED = 6;
/** Share of the speed into a wall or bumper the ball keeps after bouncing. */
export const BOUNCE = 0.8;
/** Strokes allowed on each hole. A hole not sunk by then scores nothing. */
export const MAX_STROKES = 6;
/** Points for each stroke under the limit, so a hole in one scores 60. */
export const POINTS_PER_STROKE = 10;
/** The fixed physics step, so the same putt always rolls the same way. */
export const PHYSICS_STEP = 1 / 240;
/** The most time one frame may advance, so a stalled tab never skips ahead. */
export const MAX_FRAME = 0.25;
export const AIM_STEP = Math.PI / 36;
export const POWER_STEP = 0.05;

export interface Point {
  x: number;
  y: number;
}
export interface Wall {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Bumper {
  x: number;
  y: number;
  r: number;
}
export interface Hole {
  start: Point;
  cup: Point;
  walls: readonly Wall[];
  bumpers: readonly Bumper[];
}

export const HOLES: readonly Hole[] = [
  {
    start: { x: 120, y: 255 },
    cup: { x: 680, y: 255 },
    walls: [{ x: 385, y: 140, w: 30, h: 230 }],
    bumpers: [],
  },
  {
    start: { x: 120, y: 380 },
    cup: { x: 690, y: 340 },
    walls: [{ x: 570, y: 200, w: 22, h: 240 }],
    bumpers: [
      { x: 290, y: 250, r: 30 },
      { x: 440, y: 160, r: 30 },
      { x: 460, y: 350, r: 30 },
    ],
  },
  {
    start: { x: 110, y: 120 },
    cup: { x: 690, y: 390 },
    walls: [
      { x: 250, y: 70, w: 24, h: 260 },
      { x: 480, y: 180, w: 24, h: 260 },
    ],
    bumpers: [{ x: 620, y: 230, r: 26 }],
  },
];

export interface HoleResult {
  strokes: number;
  sunk: boolean;
}

export interface PuttState {
  phase: 'ready' | 'aiming' | 'rolling' | 'holeDone' | 'over';
  hole: number;
  ball: Point;
  velocity: Point;
  /** Aim direction in radians, 0 pointing right. */
  angle: number;
  /** Shot power from 0.1 to 1. */
  power: number;
  strokes: number;
  results: HoleResult[];
  /** Time not yet simulated, always under one PHYSICS_STEP. */
  pending: number;
  scoreRecorded: boolean;
  /** The last save threw. Only an explicit replay or exit tries again. */
  saveFailed: boolean;
}

export function createState(): PuttState {
  return {
    phase: 'ready',
    hole: 0,
    ball: { ...HOLES[0].start },
    velocity: { x: 0, y: 0 },
    angle: 0,
    power: 0.5,
    strokes: 0,
    results: [],
    pending: 0,
    scoreRecorded: false,
    saveFailed: false,
  };
}

/** Points for one hole: 10 for each stroke under the limit plus one, 0 if not sunk. */
export function holeScore(result: HoleResult): number {
  if (!result.sunk) return 0;
  return Math.max(MAX_STROKES + 1 - result.strokes, 0) * POINTS_PER_STROKE;
}

export function totalScore(state: PuttState): number {
  return state.results.reduce((sum, result) => sum + holeScore(result), 0);
}

/** Strokes taken on finished holes plus the current one. */
export function totalStrokes(state: PuttState): number {
  const done = state.results.reduce((sum, result) => sum + result.strokes, 0);
  return state.results.length > state.hole ? done : done + state.strokes;
}

function setUpHole(state: PuttState, hole: number): void {
  state.hole = hole;
  state.ball = { ...HOLES[hole].start };
  state.velocity = { x: 0, y: 0 };
  state.strokes = 0;
  state.pending = 0;
  const cup = HOLES[hole].cup;
  state.angle = Math.atan2(cup.y - state.ball.y, cup.x - state.ball.x);
}

/** Starts the first hole. Returns false unless the round is waiting to start. */
export function startRound(state: PuttState): boolean {
  if (state.phase !== 'ready') return false;
  setUpHole(state, 0);
  state.phase = 'aiming';
  return true;
}

export function setAngle(state: PuttState, angle: number): void {
  if (state.phase !== 'aiming') return;
  state.angle = angle;
}

/** Aims at canvas point (x, y). Ignored when it is on the ball itself. */
export function aimAt(state: PuttState, x: number, y: number): void {
  const dx = x - state.ball.x;
  const dy = y - state.ball.y;
  if (Math.hypot(dx, dy) < 1) return;
  setAngle(state, Math.atan2(dy, dx));
}

export function turnAim(state: PuttState, by: -1 | 1): void {
  setAngle(state, state.angle + by * AIM_STEP);
}

export function clampPower(power: number): number {
  return Math.min(Math.max(Math.round(power * 100) / 100, 0.1), 1);
}

export function setPower(state: PuttState, power: number): void {
  if (state.phase !== 'aiming') return;
  state.power = clampPower(power);
}

export function changePower(state: PuttState, by: -1 | 1): void {
  setPower(state, state.power + by * POWER_STEP);
}

/** Putts the ball at the current aim and power. Returns false unless aiming. */
export function putt(state: PuttState): boolean {
  if (state.phase !== 'aiming' || state.strokes >= MAX_STROKES) return false;
  const speed = state.power * MAX_SPEED;
  state.velocity = { x: Math.cos(state.angle) * speed, y: Math.sin(state.angle) * speed };
  state.strokes += 1;
  state.pending = 0;
  state.phase = 'rolling';
  return true;
}

/** Pushes the ball out of a circle of radius `reach` round (cx, cy) and bounces it. */
function bounceOff(state: PuttState, cx: number, cy: number, reach: number): void {
  const dx = state.ball.x - cx;
  const dy = state.ball.y - cy;
  const distance = Math.hypot(dx, dy);
  if (distance >= reach) return;
  const nx = distance > 0 ? dx / distance : 1;
  const ny = distance > 0 ? dy / distance : 0;
  state.ball.x = cx + nx * reach;
  state.ball.y = cy + ny * reach;
  const into = state.velocity.x * nx + state.velocity.y * ny;
  if (into < 0) {
    state.velocity.x -= (1 + BOUNCE) * into * nx;
    state.velocity.y -= (1 + BOUNCE) * into * ny;
  }
}

/** Bounces the ball off a wall, if it overlaps it. */
export function collideWall(state: PuttState, wall: Wall): void {
  const cx = Math.min(Math.max(state.ball.x, wall.x), wall.x + wall.w);
  const cy = Math.min(Math.max(state.ball.y, wall.y), wall.y + wall.h);
  bounceOff(state, cx, cy, BALL_RADIUS);
}

export function collideBumper(state: PuttState, bumper: Bumper): void {
  bounceOff(state, bumper.x, bumper.y, bumper.r + BALL_RADIUS);
}

/** Keeps the ball on the green, bouncing it off the edges. */
export function collideEdges(state: PuttState): void {
  const { ball, velocity } = state;
  const left = COURSE.x + BALL_RADIUS;
  const right = COURSE.x + COURSE.w - BALL_RADIUS;
  const top = COURSE.y + BALL_RADIUS;
  const bottom = COURSE.y + COURSE.h - BALL_RADIUS;
  if (ball.x < left) {
    ball.x = left;
    if (velocity.x < 0) velocity.x = -velocity.x * BOUNCE;
  } else if (ball.x > right) {
    ball.x = right;
    if (velocity.x > 0) velocity.x = -velocity.x * BOUNCE;
  }
  if (ball.y < top) {
    ball.y = top;
    if (velocity.y < 0) velocity.y = -velocity.y * BOUNCE;
  } else if (ball.y > bottom) {
    ball.y = bottom;
    if (velocity.y > 0) velocity.y = -velocity.y * BOUNCE;
  }
}

/** Whether a ball at `ball` moving at `speed` drops into `cup`. */
export function dropsIn(ball: Point, speed: number, cup: Point): boolean {
  return Math.hypot(ball.x - cup.x, ball.y - cup.y) <= CUP_RADIUS && speed <= SINK_SPEED;
}

function finishHole(state: PuttState, sunk: boolean): void {
  state.results.push({ strokes: state.strokes, sunk });
  state.velocity = { x: 0, y: 0 };
  state.phase = 'holeDone';
}

/** One fixed physics step of the rolling ball. */
export function physicsStep(state: PuttState): void {
  const hole = HOLES[state.hole];
  const { ball, velocity } = state;
  ball.x += velocity.x * PHYSICS_STEP;
  ball.y += velocity.y * PHYSICS_STEP;
  collideEdges(state);
  for (const wall of hole.walls) collideWall(state, wall);
  for (const bumper of hole.bumpers) collideBumper(state, bumper);

  const speed = Math.hypot(velocity.x, velocity.y);
  if (dropsIn(ball, speed, hole.cup)) {
    state.ball = { ...hole.cup };
    finishHole(state, true);
    return;
  }
  const slowed = Math.max(speed - FRICTION * PHYSICS_STEP, 0);
  if (slowed <= STOP_SPEED) {
    velocity.x = 0;
    velocity.y = 0;
    if (state.strokes >= MAX_STROKES) finishHole(state, false);
    else state.phase = 'aiming';
    return;
  }
  velocity.x *= slowed / speed;
  velocity.y *= slowed / speed;
}

/** Advances the rolling ball by `dt` seconds, at most MAX_FRAME, in fixed steps. */
export function step(state: PuttState, dt: number): void {
  if (state.phase !== 'rolling') return;
  state.pending += Math.min(Math.max(dt, 0), MAX_FRAME);
  while (state.pending >= PHYSICS_STEP && state.phase === 'rolling') {
    state.pending -= PHYSICS_STEP;
    physicsStep(state);
  }
  if (state.phase !== 'rolling') state.pending = 0;
}

/** Moves on from a finished hole to the next one, or ends the round after the last. */
export function nextHole(state: PuttState): boolean {
  if (state.phase !== 'holeDone') return false;
  if (state.hole + 1 >= HOLES.length) {
    state.phase = 'over';
  } else {
    setUpHole(state, state.hole + 1);
    state.phase = 'aiming';
  }
  return true;
}

/**
 * Hands the final score to `record` once the round is over. The score counts as
 * saved only after `record` returns. A failed save is reported, not thrown, and
 * the frame loop does not try again; pass `retry` from an explicit replay or
 * exit to try once more.
 */
export function saveFinalScore(
  state: PuttState,
  record: (score: number) => void,
  retry = false,
): unknown {
  if (state.phase !== 'over' || state.scoreRecorded) return undefined;
  if (state.saveFailed && !retry) return undefined;
  try {
    record(totalScore(state));
  } catch (error) {
    if (!state.saveFailed) console.error('Mini Putt could not save the score', error);
    state.saveFailed = true;
    return error;
  }
  state.scoreRecorded = true;
  state.saveFailed = false;
  return undefined;
}

/**
 * Starts a round from the ready or result screen. A finished round's score is
 * saved first, retrying once if an earlier save failed.
 */
export function beginRound(state: PuttState, record: (score: number) => void): PuttState {
  saveFinalScore(state, record, true);
  const next = state.phase === 'over' ? createState() : state;
  startRound(next);
  return next;
}

const PAGE_CONTROLS = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY'];

/** Whether a link or control on the page has focus, so its keys stay its own. */
export function isPageControl(focusedTag?: string): boolean {
  return focusedTag !== undefined && PAGE_CONTROLS.includes(focusedTag.toUpperCase());
}

export type KeyAction = 'go' | 'left' | 'right' | 'up' | 'down';

/** What a key press does, or undefined when the game should leave it alone. */
export function keyAction(code: string, key: string, focusedTag?: string): KeyAction | undefined {
  if (isPageControl(focusedTag)) return undefined;
  if (code === 'Space' || key === 'Enter') return 'go';
  if (key === 'ArrowLeft') return 'left';
  if (key === 'ArrowRight') return 'right';
  if (key === 'ArrowUp') return 'up';
  if (key === 'ArrowDown') return 'down';
  return undefined;
}

const BUTTON = { x: WIDTH / 2 - 110, y: 380, w: 220, h: 52 } as const;
/** The Putt or Next button, below the green so a press on the green only aims. */
const ACTION_BUTTON = { x: 600, y: 448, w: 160, h: 46 } as const;
/** The power meter, below the green. A press on it sets the power. */
export const METER = { x: 230, y: 456, w: 300, h: 26 } as const;

function inside(box: { x: number; y: number; w: number; h: number }, x: number, y: number) {
  return x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;
}

export type PointerAction =
  | { kind: 'begin' }
  | { kind: 'putt' }
  | { kind: 'next' }
  | { kind: 'power'; power: number }
  | { kind: 'aim'; x: number; y: number };

/**
 * What a press at canvas (x, y) does: start or replay from the big button, putt
 * or move on from the action button, set the power from the meter, or aim at a
 * point on the green. Undefined when the press does nothing right now.
 */
export function pointerAction(state: PuttState, x: number, y: number): PointerAction | undefined {
  if (state.phase === 'ready' || state.phase === 'over') {
    return inside(BUTTON, x, y) ? { kind: 'begin' } : undefined;
  }
  if (inside(ACTION_BUTTON, x, y)) {
    if (state.phase === 'aiming') return { kind: 'putt' };
    if (state.phase === 'holeDone') return { kind: 'next' };
    return undefined;
  }
  if (state.phase !== 'aiming') return undefined;
  if (inside(METER, x, y)) return { kind: 'power', power: (x - METER.x) / METER.w };
  if (inside(COURSE, x, y)) return { kind: 'aim', x, y };
  return undefined;
}

function draw(ctx: CanvasRenderingContext2D, state: PuttState) {
  const { colors } = theme;
  const hole = HOLES[state.hole];
  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const stripe = WIDTH / 16;
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = i % 2 === 0 ? colors.stripeA : colors.stripeB;
    ctx.fillRect(i * stripe, 0, stripe, 20);
  }

  ctx.fillStyle = colors.text;
  ctx.font = canvasFont('body', 'bold');
  ctx.textAlign = 'left';
  ctx.fillText(`Hole ${state.hole + 1}/${HOLES.length}`, 40, 52);
  ctx.fillText(`Strokes ${state.strokes}/${MAX_STROKES}`, 220, 52);
  ctx.fillText(`Total strokes ${totalStrokes(state)}`, 420, 52);
  ctx.textAlign = 'right';
  ctx.fillText(`Score ${totalScore(state)}`, 760, 52);

  // The green, its walls and bumpers.
  ctx.fillStyle = colors.wood;
  ctx.fillRect(COURSE.x - 6, COURSE.y - 6, COURSE.w + 12, COURSE.h + 12);
  ctx.fillStyle = colors.surface;
  ctx.fillRect(COURSE.x, COURSE.y, COURSE.w, COURSE.h);
  ctx.fillStyle = colors.wood;
  for (const wall of hole.walls) ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
  for (const bumper of hole.bumpers) {
    ctx.fillStyle = colors.stripeA;
    ctx.beginPath();
    ctx.arc(bumper.x, bumper.y, bumper.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colors.stripeB;
    ctx.beginPath();
    ctx.arc(bumper.x, bumper.y, bumper.r * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }

  // The tee and the cup with its flag.
  ctx.strokeStyle = colors.muted;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(hole.start.x, hole.start.y, BALL_RADIUS + 5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = colors.background;
  ctx.beginPath();
  ctx.arc(hole.cup.x, hole.cup.y, CUP_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = colors.text;
  ctx.beginPath();
  ctx.moveTo(hole.cup.x, hole.cup.y);
  ctx.lineTo(hole.cup.x, hole.cup.y - 40);
  ctx.stroke();
  ctx.fillStyle = colors.accent;
  ctx.beginPath();
  ctx.moveTo(hole.cup.x, hole.cup.y - 40);
  ctx.lineTo(hole.cup.x + 22, hole.cup.y - 33);
  ctx.lineTo(hole.cup.x, hole.cup.y - 26);
  ctx.fill();

  if (state.phase === 'aiming') {
    const length = 30 + state.power * 90;
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(state.ball.x, state.ball.y);
    ctx.lineTo(
      state.ball.x + Math.cos(state.angle) * length,
      state.ball.y + Math.sin(state.angle) * length,
    );
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (!(state.phase === 'holeDone' && state.results[state.results.length - 1]?.sunk)) {
    ctx.fillStyle = colors.text;
    ctx.beginPath();
    ctx.arc(state.ball.x, state.ball.y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }

  if (state.phase === 'aiming' || state.phase === 'rolling' || state.phase === 'holeDone') {
    ctx.fillStyle = colors.text;
    ctx.font = canvasFont('small', 'bold');
    ctx.textAlign = 'left';
    ctx.fillText('Power', METER.x - 60, METER.y + 18);
    ctx.fillStyle = colors.surface;
    ctx.fillRect(METER.x, METER.y, METER.w, METER.h);
    ctx.fillStyle = colors.accent;
    ctx.fillRect(METER.x, METER.y, METER.w * state.power, METER.h);
    ctx.fillStyle = colors.background;
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(state.power * 100)}%`, METER.x + METER.w / 2, METER.y + 18);

    ctx.fillStyle = colors.muted;
    ctx.font = canvasFont('small');
    ctx.textAlign = 'left';
    ctx.fillText('Aim: tap the green', 16, 462);
    ctx.fillText('or Left/Right. Up/Down: power', 16, 482);

    const label = state.phase === 'holeDone' ? 'Next' : 'Putt';
    const active = state.phase !== 'rolling';
    ctx.fillStyle = active ? colors.stripeA : colors.surface;
    ctx.fillRect(ACTION_BUTTON.x, ACTION_BUTTON.y, ACTION_BUTTON.w, ACTION_BUTTON.h);
    ctx.fillStyle = active ? colors.text : colors.muted;
    ctx.font = canvasFont('body', 'bold');
    ctx.textAlign = 'center';
    ctx.fillText(`${label} (Space)`, ACTION_BUTTON.x + ACTION_BUTTON.w / 2, ACTION_BUTTON.y + 30);
  }

  if (state.phase === 'holeDone') {
    const result = state.results[state.results.length - 1];
    ctx.fillStyle = colors.background;
    ctx.globalAlpha = 0.8;
    ctx.fillRect(COURSE.x + 160, COURSE.y + 120, COURSE.w - 320, 110);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.font = canvasFont('title', 'bold');
    ctx.fillStyle = result.sunk ? colors.accent : colors.danger;
    ctx.fillText(
      result.sunk ? `Sunk in ${result.strokes}! +${holeScore(result)}` : `Out of strokes: +0`,
      WIDTH / 2,
      COURSE.y + 170,
    );
    ctx.fillStyle = colors.text;
    ctx.font = canvasFont('body');
    ctx.fillText(
      state.hole + 1 >= HOLES.length
        ? 'Press Next to see your total'
        : 'Press Next for the next hole',
      WIDTH / 2,
      COURSE.y + 208,
    );
  }

  if (state.phase === 'ready' || state.phase === 'over') {
    ctx.fillStyle = colors.background;
    ctx.globalAlpha = 0.88;
    ctx.fillRect(0, 20, WIDTH, HEIGHT - 20);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.fillStyle = colors.accent;
    ctx.font = canvasFont('title', 'bold');
    const title =
      state.phase === 'ready' ? 'Mini Putt' : `Course done! You scored ${totalScore(state)}`;
    ctx.fillText(title, WIDTH / 2, 130);
    ctx.fillStyle = colors.text;
    ctx.font = canvasFont('body');
    if (state.phase === 'ready') {
      ctx.fillText(`Three holes, up to ${MAX_STROKES} strokes each.`, WIDTH / 2, 190);
      ctx.fillText(
        'Aim by tapping the green or with Left/Right. Set power on the meter or with Up/Down.',
        WIDTH / 2,
        225,
      );
      ctx.fillText('Putt with the Putt button, Space or Enter.', WIDTH / 2, 260);
      ctx.fillText(
        `Each hole sunk scores ${POINTS_PER_STROKE} for every stroke under ${MAX_STROKES + 1}.`,
        WIDTH / 2,
        295,
      );
    } else {
      ctx.fillText(`Total strokes ${totalStrokes(state)}`, WIDTH / 2, 190);
      state.results.forEach((result, i) => {
        ctx.fillText(
          `Hole ${i + 1}: ${result.sunk ? `${result.strokes} strokes` : 'not sunk'}, +${holeScore(result)}`,
          WIDTH / 2,
          225 + i * 30,
        );
      });
      if (state.saveFailed) {
        ctx.fillStyle = colors.danger;
        ctx.fillText('Your score could not be saved.', WIDTH / 2, 340);
      }
    }
    ctx.fillStyle = colors.stripeA;
    ctx.fillRect(BUTTON.x, BUTTON.y, BUTTON.w, BUTTON.h);
    ctx.fillStyle = colors.text;
    ctx.font = canvasFont('body', 'bold');
    ctx.fillText(
      state.phase === 'ready' ? 'Start (Space)' : 'Play again (Space)',
      WIDTH / 2,
      BUTTON.y + 33,
    );
  }
}

export const miniPutt: CarnivalGame = {
  id: 'mini-putt',
  name: 'Mini Putt',
  description: 'Aim, set your power and putt round three holes of walls and bumpers.',

  start(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;

    const record = (score: number) => recordScore(miniPutt.id, score);
    let state = createState();
    let last = performance.now();
    const begin = () => {
      state = beginRound(state, record);
      last = performance.now();
    };
    const go = () => {
      if (state.phase === 'ready' || state.phase === 'over') begin();
      else if (state.phase === 'holeDone') nextHole(state);
      else putt(state);
    };

    const onDown = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0) return;
      const rect = canvas.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * WIDTH;
      const y = ((event.clientY - rect.top) / rect.height) * HEIGHT;
      const action = pointerAction(state, x, y);
      if (!action) return;
      event.preventDefault();
      if (action.kind === 'begin') begin();
      else if (action.kind === 'putt') putt(state);
      else if (action.kind === 'next') nextHole(state);
      else if (action.kind === 'power') setPower(state, action.power);
      else aimAt(state, action.x, action.y);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : undefined;
      if (target?.isContentEditable) return;
      const action = keyAction(event.code, event.key, target?.tagName);
      if (!action) return;
      event.preventDefault();
      if (action === 'go') {
        if (!event.repeat) go();
      } else if (action === 'left' || action === 'right') {
        turnAim(state, action === 'left' ? -1 : 1);
      } else {
        changePower(state, action === 'up' ? 1 : -1);
      }
    };
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKeyDown);

    let frame = 0;
    const loop = (time: number) => {
      frame = requestAnimationFrame(loop);
      step(state, Math.max((time - last) / 1000, 0));
      last = time;
      saveFinalScore(state, record);
      draw(ctx, state);
    };
    frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      saveFinalScore(state, record, true);
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  },
};
