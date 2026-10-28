import { canvasFont, recordScore, theme, type CarnivalGame } from '../../carnival';

const { width: WIDTH, height: HEIGHT } = theme.canvas;

export const DARTS_PER_ROUND = 9;
export const BALLOON_POINTS = 20;
export const STAR_POINTS = 50;
/** The middle cell of the rack holds the star balloon. */
export const STAR_CELL = 4;
/** Seconds a dart is in the air. Only one dart flies at a time. */
export const FLIGHT_TIME = 0.35;
/** Seconds the pop burst shows. */
export const POP_TIME = 0.4;
export const BALLOON_RADIUS = 42;
/** The horizontal radius of a balloon's body. */
export const BALLOON_WIDTH = BALLOON_RADIUS - 6;
/** How far a balloon's body sits above its cell's centre. */
export const BALLOON_LIFT = 2;
const CELL = 120;
const RACK_LEFT = WIDTH / 2 - CELL * 1.5;
const RACK_TOP = 80;
export const THROWER = { x: WIDTH / 2, y: HEIGHT - 10 } as const;

const BALLOON_COLORS = [
  theme.colors.stripeA,
  theme.colors.water,
  theme.colors.accent,
  theme.colors.danger,
  theme.colors.accent,
  theme.colors.water,
  theme.colors.stripeA,
  theme.colors.muted,
  theme.colors.danger,
];

export interface Dart {
  /** The cell aimed at, or -1 for a throw that hits no cell. */
  cell: number;
  x: number;
  y: number;
  age: number;
}

export interface Pop {
  x: number;
  y: number;
  points: number;
  age: number;
}

export interface DartsState {
  phase: 'ready' | 'playing' | 'over';
  popped: boolean[];
  dartsLeft: number;
  dart: Dart | undefined;
  pops: Pop[];
  score: number;
  hits: number;
  scoreRecorded: boolean;
}

export function createState(phase: DartsState['phase'] = 'ready'): DartsState {
  return {
    phase,
    popped: Array.from({ length: 9 }, () => false),
    dartsLeft: DARTS_PER_ROUND,
    dart: undefined,
    pops: [],
    score: 0,
    hits: 0,
    scoreRecorded: false,
  };
}

/** The centre of a rack cell, 0 to 8, read left to right and top to bottom. */
export function cellCenter(cell: number): { x: number; y: number } {
  return {
    x: RACK_LEFT + (cell % 3) * CELL + CELL / 2,
    y: RACK_TOP + Math.floor(cell / 3) * CELL + CELL / 2,
  };
}

/** The balloon cell under (x, y), or -1 when the point is outside every balloon. */
export function cellAt(x: number, y: number): number {
  for (let cell = 0; cell < 9; cell++) {
    const c = cellCenter(cell);
    // Match the drawn body: an ellipse BALLOON_WIDTH across, raised by BALLOON_LIFT.
    const dx = (x - c.x) / BALLOON_WIDTH;
    const dy = (y - (c.y - BALLOON_LIFT)) / BALLOON_RADIUS;
    if (dx * dx + dy * dy <= 1) return cell;
  }
  return -1;
}

/** The cell a number key picks: 1 is top left, 9 is bottom right. */
export function cellForKey(key: string): number | undefined {
  return /^[1-9]$/.test(key) ? Number(key) - 1 : undefined;
}

export function pointsFor(cell: number): number {
  return cell === STAR_CELL ? STAR_POINTS : BALLOON_POINTS;
}

/** Starts the round from the ready screen. Returns false otherwise. */
export function begin(state: DartsState): boolean {
  if (state.phase !== 'ready') return false;
  state.phase = 'playing';
  return true;
}

/**
 * Throws a dart at a cell (or -1 for a miss) landing at (x, y). Returns false
 * when nothing was thrown: not playing, no darts left or a dart still flying.
 */
export function throwDart(state: DartsState, cell: number, x?: number, y?: number): boolean {
  if (state.phase !== 'playing' || state.dartsLeft === 0 || state.dart) return false;
  const target = cell >= 0 ? cellCenter(cell) : { x: x ?? WIDTH / 2, y: y ?? RACK_TOP };
  state.dart = { cell, x: x ?? target.x, y: y ?? target.y, age: 0 };
  state.dartsLeft -= 1;
  return true;
}

/** Settles a dart that has landed: pops a whole balloon, else it is a miss. */
export function resolveDart(state: DartsState, dart: Dart): void {
  const { cell } = dart;
  if (cell >= 0 && !state.popped[cell]) {
    const points = pointsFor(cell);
    state.popped[cell] = true;
    state.score += points;
    state.hits += 1;
    state.pops.push({ x: dart.x, y: dart.y, points, age: 0 });
  } else {
    state.pops.push({ x: dart.x, y: dart.y, points: 0, age: 0 });
  }
}

/** Advances the game by `dt` seconds. */
export function step(state: DartsState, dt: number): void {
  if (state.dart) {
    state.dart.age += dt;
    if (state.dart.age >= FLIGHT_TIME) {
      resolveDart(state, state.dart);
      state.dart = undefined;
    }
  }
  for (const pop of state.pops) pop.age += dt;
  state.pops = state.pops.filter((p) => p.age < POP_TIME);
  if (state.phase === 'playing' && state.dartsLeft === 0 && !state.dart) state.phase = 'over';
}

/** Hits as a whole percentage of the darts thrown. */
export function accuracy(state: DartsState): number {
  const thrown = DARTS_PER_ROUND - state.dartsLeft;
  return thrown === 0 ? 0 : Math.round((state.hits / thrown) * 100);
}

/**
 * Hands the score to `record` once, when the round ends. A failed save is
 * reported and returned instead of thrown, so the result still shows and the
 * game can be played again.
 */
export function saveFinalScore(state: DartsState, record: (score: number) => void): unknown {
  if (state.phase !== 'over' || state.scoreRecorded) return undefined;
  state.scoreRecorded = true;
  try {
    record(state.score);
  } catch (error) {
    console.error('Balloon Darts could not save the score', error);
    return error;
  }
  return undefined;
}

/** The action key (Space or Enter) moves on from ready and results screens. */
export function act(state: DartsState): DartsState {
  if (state.phase === 'ready') begin(state);
  else if (state.phase === 'over') return createState('playing');
  return state;
}

const PAGE_CONTROLS = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY'];

/** Whether the game may take a key: not while a link or control on the page has focus. */
export function gameOwnsKey(focusedTag?: string): boolean {
  return focusedTag === undefined || !PAGE_CONTROLS.includes(focusedTag.toUpperCase());
}

/** Adds the game's listeners and returns a function that removes them all. */
export function listen(
  canvas: EventTarget,
  win: EventTarget,
  handlers: { pointerdown: (event: PointerEvent) => void; keydown: (event: KeyboardEvent) => void },
): () => void {
  const pairs: [EventTarget, string, EventListener][] = [
    [canvas, 'pointerdown', handlers.pointerdown as EventListener],
    [win, 'keydown', handlers.keydown as EventListener],
  ];
  for (const [target, type, listener] of pairs) target.addEventListener(type, listener);
  return () => {
    for (const [target, type, listener] of pairs) target.removeEventListener(type, listener);
  };
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const radius = i % 2 === 0 ? r : r * 0.45;
    ctx.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
  }
  ctx.closePath();
  ctx.fill();
}

function drawBalloon(ctx: CanvasRenderingContext2D, cell: number) {
  const { colors } = theme;
  const { x, y } = cellCenter(cell);
  const star = cell === STAR_CELL;
  // String.
  ctx.strokeStyle = colors.muted;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + BALLOON_RADIUS);
  ctx.quadraticCurveTo(x + 8, y + BALLOON_RADIUS + 10, x, y + CELL / 2 - 2);
  ctx.stroke();
  // Body and knot.
  ctx.fillStyle = star ? colors.accent : BALLOON_COLORS[cell];
  ctx.beginPath();
  ctx.ellipse(x, y - BALLOON_LIFT, BALLOON_WIDTH, BALLOON_RADIUS, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - 5, y + BALLOON_RADIUS + 4);
  ctx.lineTo(x + 5, y + BALLOON_RADIUS + 4);
  ctx.lineTo(x, y + BALLOON_RADIUS - 4);
  ctx.fill();
  if (star) {
    ctx.strokeStyle = colors.text;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(x, y - BALLOON_LIFT, BALLOON_WIDTH, BALLOON_RADIUS, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = colors.stripeA;
    drawStar(ctx, x, y - 8, 18);
  }
  // Shine.
  ctx.fillStyle = colors.text;
  ctx.globalAlpha = 0.45;
  ctx.beginPath();
  ctx.ellipse(x - 14, y - 20, 6, 11, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  // Key number and points.
  ctx.fillStyle = star ? colors.background : colors.text;
  ctx.font = canvasFont('small', 'bold');
  ctx.textAlign = 'center';
  ctx.fillText(star ? `${STAR_POINTS}` : String(cell + 1), x, star ? y + 22 : y + 6);
  if (star) ctx.fillText('5', x - 22, y - 26);
}

function drawResults(ctx: CanvasRenderingContext2D, lines: string[], title: string) {
  const { colors } = theme;
  ctx.fillStyle = colors.background;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  ctx.fillStyle = colors.accent;
  ctx.font = canvasFont('title', 'bold');
  ctx.fillText(title, WIDTH / 2, HEIGHT / 2 - 40);
  ctx.fillStyle = colors.text;
  ctx.font = canvasFont('body');
  lines.forEach((line, i) => ctx.fillText(line, WIDTH / 2, HEIGHT / 2 + i * 30));
}

function draw(ctx: CanvasRenderingContext2D, state: DartsState) {
  const { colors } = theme;
  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Awning.
  const stripe = WIDTH / 16;
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = i % 2 === 0 ? colors.stripeA : colors.stripeB;
    ctx.fillRect(i * stripe, 0, stripe, 36);
  }
  ctx.fillStyle = colors.text;
  ctx.font = canvasFont('small', 'bold');
  ctx.textAlign = 'center';
  ctx.fillText(
    `Click a balloon or press 1 to 9. Balloons ${BALLOON_POINTS}, star ${STAR_POINTS}.`,
    WIDTH / 2,
    60,
  );

  // Rack: a wooden frame with a cork board behind the balloons.
  ctx.fillStyle = colors.wood;
  ctx.fillRect(RACK_LEFT - 14, RACK_TOP - 14, CELL * 3 + 28, CELL * 3 + 28);
  ctx.fillStyle = colors.surface;
  ctx.fillRect(RACK_LEFT, RACK_TOP, CELL * 3, CELL * 3);
  ctx.strokeStyle = colors.wood;
  ctx.lineWidth = 2;
  for (let i = 1; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(RACK_LEFT + i * CELL, RACK_TOP);
    ctx.lineTo(RACK_LEFT + i * CELL, RACK_TOP + CELL * 3);
    ctx.moveTo(RACK_LEFT, RACK_TOP + i * CELL);
    ctx.lineTo(RACK_LEFT + CELL * 3, RACK_TOP + i * CELL);
    ctx.stroke();
  }
  for (let cell = 0; cell < 9; cell++) {
    if (!state.popped[cell]) drawBalloon(ctx, cell);
    else {
      const { x, y } = cellCenter(cell);
      ctx.fillStyle = colors.muted;
      ctx.font = canvasFont('small');
      ctx.fillText('popped', x, y + 5);
    }
  }

  // Pops: a burst of rays.
  for (const pop of state.pops) {
    const t = pop.age / POP_TIME;
    ctx.globalAlpha = 1 - t;
    ctx.strokeStyle = pop.points > 0 ? colors.accent : colors.danger;
    ctx.lineWidth = 3;
    for (let i = 0; i < 10; i++) {
      const angle = (i * Math.PI) / 5;
      const inner = 10 + t * 30;
      const outer = 20 + t * 50;
      ctx.beginPath();
      ctx.moveTo(pop.x + Math.cos(angle) * inner, pop.y + Math.sin(angle) * inner);
      ctx.lineTo(pop.x + Math.cos(angle) * outer, pop.y + Math.sin(angle) * outer);
      ctx.stroke();
    }
    ctx.fillStyle = pop.points > 0 ? colors.accent : colors.danger;
    ctx.font = canvasFont('body', 'bold');
    ctx.fillText(pop.points > 0 ? `POP! +${pop.points}` : 'Miss', pop.x, pop.y - 30 - t * 20);
  }
  ctx.globalAlpha = 1;

  // The dart in flight.
  if (state.dart) {
    const t = Math.min(state.dart.age / FLIGHT_TIME, 1);
    const x = THROWER.x + (state.dart.x - THROWER.x) * t;
    const y = THROWER.y + (state.dart.y - THROWER.y) * t;
    const angle = Math.atan2(state.dart.y - THROWER.y, state.dart.x - THROWER.x);
    ctx.strokeStyle = colors.text;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - Math.cos(angle) * 30, y - Math.sin(angle) * 30);
    ctx.stroke();
    ctx.fillStyle = colors.stripeA;
    ctx.fillRect(x - Math.cos(angle) * 30 - 4, y - Math.sin(angle) * 30 - 4, 8, 8);
  }

  ctx.fillStyle = colors.text;
  ctx.font = canvasFont('body', 'bold');
  ctx.textAlign = 'left';
  ctx.fillText(`Score ${state.score}`, 16, HEIGHT - 20);
  ctx.textAlign = 'right';
  ctx.fillText(`Darts ${state.dartsLeft}/${DARTS_PER_ROUND}`, WIDTH - 16, HEIGHT - 20);

  if (state.phase === 'ready') {
    drawResults(
      ctx,
      [
        `${DARTS_PER_ROUND} darts. Each balloon pops once.`,
        'Click or press Space or Enter to start.',
      ],
      'Balloon Darts',
    );
  } else if (state.phase === 'over') {
    drawResults(
      ctx,
      [
        `${state.hits} hits from ${DARTS_PER_ROUND} darts, ${accuracy(state)}% accuracy.`,
        'Click or press Space or Enter to play again.',
      ],
      `You scored ${state.score}`,
    );
  }
}

export const balloonDarts: CarnivalGame = {
  id: 'balloon-darts',
  name: 'Balloon Darts',
  description: 'Nine darts, nine balloons. Pop them for 20 each, and the star for 50.',

  start(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;

    let state = createState();

    const stopListening = listen(canvas, window, {
      pointerdown(event) {
        if (state.phase !== 'playing') {
          state = act(state);
          return;
        }
        const rect = canvas.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * WIDTH;
        const y = ((event.clientY - rect.top) / rect.height) * HEIGHT;
        throwDart(state, cellAt(x, y), x, y);
      },
      keydown(event) {
        if (event.repeat) return;
        const target = event.target instanceof HTMLElement ? event.target : undefined;
        if (target?.isContentEditable || !gameOwnsKey(target?.tagName)) return;
        const cell = cellForKey(event.key);
        if (cell !== undefined) {
          event.preventDefault();
          throwDart(state, cell);
        } else if (event.code === 'Space' || event.key === 'Enter') {
          event.preventDefault();
          state = act(state);
        }
      },
    });

    let frame = 0;
    let last = performance.now();
    const loop = (time: number) => {
      frame = requestAnimationFrame(loop);
      const dt = Math.min((time - last) / 1000, 0.05);
      last = time;
      step(state, dt);
      saveFinalScore(state, (score) => recordScore(balloonDarts.id, score));
      draw(ctx, state);
    };
    frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      stopListening();
    };
  },
};
