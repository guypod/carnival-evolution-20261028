import { canvasFont, recordScore, theme, type CarnivalGame } from '../../carnival';

const { width: WIDTH, height: HEIGHT } = theme.canvas;

export const HOLES = 6;
/** Seconds in a round, counted from the moment Start is pressed. */
export const ROUND_TIME = 30;
/** Seconds a mole stays up before it ducks away. */
export const MOLE_UP_TIME = 1.2;
/** Seconds between one mole leaving and the next popping up. */
export const SPAWN_GAP = 0.25;
/** Seconds a whacked mole shows stars before its hole is empty again. */
export const BONK_TIME = 0.3;
export const POINTS_PER_HIT = 10;
export const MAX_MULTIPLIER = 3;

/** A random number in [0, 1). Injected so tests can choose where moles pop. */
export type Rng = () => number;

export interface Hole {
  /** Seconds left before the mole ducks; 0 when the hole is empty. */
  up: number;
  /** Seconds left showing a whacked mole; it cannot be hit again meanwhile. */
  bonk: number;
}

export interface MoleState {
  holes: Hole[];
  phase: 'ready' | 'playing' | 'over';
  timeLeft: number;
  /** Seconds until the next mole pops while no mole is up. */
  spawnIn: number;
  score: number;
  /** Hits in a row since the last miss. */
  streak: number;
  hits: number;
  misses: number;
  /** Set once the round's score has been handed to the score board. */
  scoreRecorded: boolean;
  rng: Rng;
}

/** A small seeded generator (mulberry32), so a seed always gives the same moles. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createState(rng: Rng = Math.random): MoleState {
  return {
    holes: Array.from({ length: HOLES }, () => ({ up: 0, bonk: 0 })),
    phase: 'ready',
    timeLeft: ROUND_TIME,
    spawnIn: 0,
    score: 0,
    streak: 0,
    hits: 0,
    misses: 0,
    scoreRecorded: false,
    rng,
  };
}

/** Starts the timer. Returns false unless the round is waiting to start. */
export function startRound(state: MoleState): boolean {
  if (state.phase !== 'ready') return false;
  state.phase = 'playing';
  state.spawnIn = 0;
  return true;
}

/** The points the next hit is worth with the current streak. */
export function multiplier(streak: number): number {
  return Math.min(streak + 1, MAX_MULTIPLIER);
}

/**
 * Whacks hole `index` (0 to HOLES - 1). A mole that is up scores and ducks at
 * once, so it can't be hit twice. An empty hole breaks the streak.
 */
export function whack(state: MoleState, index: number): 'hit' | 'miss' | 'ignored' {
  const hole = state.holes[index];
  if (state.phase !== 'playing' || !hole) return 'ignored';
  if (hole.up > 0) {
    state.score += POINTS_PER_HIT * multiplier(state.streak);
    state.streak += 1;
    state.hits += 1;
    hole.up = 0;
    hole.bonk = BONK_TIME;
    return 'hit';
  }
  // Tapping a mole that was just whacked again is not a fresh miss.
  if (hole.bonk > 0) return 'ignored';
  state.streak = 0;
  state.misses += 1;
  return 'miss';
}

function popMole(state: MoleState): void {
  const empty = state.holes.filter((h) => h.up === 0 && h.bonk === 0);
  if (empty.length === 0) return;
  const pick = Math.min(Math.floor(state.rng() * empty.length), empty.length - 1);
  empty[pick].up = MOLE_UP_TIME;
}

/** Advances the round by `dt` seconds. */
export function step(state: MoleState, dt: number): void {
  if (state.phase !== 'playing') return;

  state.timeLeft = Math.max(state.timeLeft - dt, 0);
  if (state.timeLeft === 0) {
    state.phase = 'over';
    for (const hole of state.holes) {
      hole.up = 0;
      hole.bonk = 0;
    }
    return;
  }

  // Exactly one mole is up at a time, with a short gap between moles. A long
  // step is split where a mole leaves or pops, so time before a mole leaves
  // never counts toward the gap after it, and time after a pop counts toward
  // the new mole's time up.
  let left = dt;
  while (left > 0) {
    const upNow = Math.max(0, ...state.holes.map((h) => h.up));
    const slice = Math.min(left, upNow > 0 ? upNow : Math.max(state.spawnIn, 0));
    for (const hole of state.holes) {
      hole.up = Math.max(hole.up - slice, 0);
      hole.bonk = Math.max(hole.bonk - slice, 0);
    }
    left -= slice;
    if (upNow > 0) {
      state.spawnIn = SPAWN_GAP;
      continue;
    }
    state.spawnIn -= slice;
    if (state.spawnIn <= 0) {
      popMole(state);
      state.spawnIn = SPAWN_GAP;
    }
  }
}

/**
 * The round's final score the first time it is asked for after the round ends,
 * and undefined before that and every time after, so the score is saved once.
 */
export function takeFinalScore(state: MoleState): number | undefined {
  if (state.phase !== 'over' || state.scoreRecorded) return undefined;
  state.scoreRecorded = true;
  return state.score;
}

/**
 * Times the animation frames. `tick` gives the whole time since the last frame,
 * so a slow frame rate never stretches the round. `resume` restarts timing
 * when a hidden tab comes back, so the round pauses instead of skipping ahead.
 */
export function frameClock(now: number) {
  let last = now;
  return {
    tick(time: number): number {
      const seconds = Math.max((time - last) / 1000, 0);
      last = time;
      return seconds;
    },
    resume(time: number): void {
      last = time;
    },
  };
}

/**
 * Starts a round from the ready or end screen, and restarts the clock at that
 * moment so time spent on the screen before it never counts against the round.
 * Returns the state that is now playing: a fresh one after a finished round.
 */
export function beginRound(
  state: MoleState,
  clock: ReturnType<typeof frameClock>,
  now: number,
  fresh: () => MoleState = createState,
): MoleState {
  const next = state.phase === 'over' ? fresh() : state;
  if (startRound(next)) clock.resume(now);
  return next;
}

/**
 * Hands the final score to `record` once, when the round ends. A failed save is
 * reported and returned instead of thrown, so the result still shows and the
 * game can be played again.
 */
export function saveFinalScore(state: MoleState, record: (score: number) => void): unknown {
  const score = takeFinalScore(state);
  if (score === undefined) return undefined;
  try {
    record(score);
  } catch (error) {
    console.error('Mole Mayhem could not save the score', error);
    return error;
  }
  return undefined;
}

const PAGE_CONTROLS = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY'];

/**
 * Whether a key press starts the round: Space or Enter, unless a link or
 * control on the page has focus, so the key still activates that control.
 */
export function isStartKey(code: string, key: string, focusedTag?: string): boolean {
  if (focusedTag !== undefined && PAGE_CONTROLS.includes(focusedTag.toUpperCase())) return false;
  return code === 'Space' || key === 'Enter';
}

/** The hole a key press whacks: keys 1 to 6 are holes 0 to 5. */
export function holeForKey(key: string): number | undefined {
  const n = Number(key);
  return Number.isInteger(n) && n >= 1 && n <= HOLES ? n - 1 : undefined;
}

const HOLE_RADIUS = 56;
const BUTTON = { x: WIDTH / 2 - 110, y: HEIGHT - 82, w: 220, h: 52 } as const;

/** The centre of each hole: two rows of three. */
export function holeCentre(index: number): { x: number; y: number } {
  const col = index % 3;
  const row = Math.floor(index / 3);
  return { x: WIDTH / 2 + (col - 1) * 220, y: 170 + row * 150 };
}

/** The hole under canvas point (x, y), if any. */
export function holeAt(x: number, y: number): number | undefined {
  for (let i = 0; i < HOLES; i++) {
    const c = holeCentre(i);
    if (Math.hypot(c.x - x, c.y - y) <= HOLE_RADIUS + 10) return i;
  }
  return undefined;
}

function onButton(x: number, y: number) {
  return x >= BUTTON.x && x <= BUTTON.x + BUTTON.w && y >= BUTTON.y && y <= BUTTON.y + BUTTON.h;
}

function draw(ctx: CanvasRenderingContext2D, state: MoleState) {
  const { colors } = theme;

  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const stripe = WIDTH / 16;
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = i % 2 === 0 ? colors.stripeA : colors.stripeB;
    ctx.fillRect(i * stripe, 0, stripe, 40);
  }

  ctx.fillStyle = colors.text;
  ctx.font = canvasFont('body', 'bold');
  ctx.textAlign = 'left';
  ctx.fillText(`Time ${Math.ceil(state.timeLeft)}s`, 16, 70);
  ctx.textAlign = 'center';
  ctx.fillText(`Score ${state.score}`, WIDTH / 2, 70);
  ctx.textAlign = 'right';
  ctx.fillText(`Streak ${state.streak} (x${multiplier(state.streak)})`, WIDTH - 16, 70);

  for (let i = 0; i < HOLES; i++) {
    const { x, y } = holeCentre(i);
    const hole = state.holes[i];
    ctx.fillStyle = colors.wood;
    ctx.beginPath();
    ctx.ellipse(x, y + 24, HOLE_RADIUS, HOLE_RADIUS * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    if (hole.up > 0 || hole.bonk > 0) {
      ctx.fillStyle = hole.bonk > 0 ? colors.muted : colors.surface;
      ctx.beginPath();
      ctx.arc(x, y, 38, Math.PI, 0);
      ctx.fillRect(x - 38, y, 76, 24);
      ctx.fill();
      ctx.fillStyle = colors.text;
      ctx.beginPath();
      ctx.arc(x - 13, y - 10, 5, 0, Math.PI * 2);
      ctx.arc(x + 13, y - 10, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = colors.danger;
      ctx.beginPath();
      ctx.arc(x, y + 2, 6, 0, Math.PI * 2);
      ctx.fill();
      if (hole.bonk > 0) {
        ctx.fillStyle = colors.accent;
        ctx.font = canvasFont('body', 'bold');
        ctx.textAlign = 'center';
        ctx.fillText('BONK!', x, y - 48);
      }
    }

    ctx.fillStyle = colors.accent;
    ctx.font = canvasFont('body', 'bold');
    ctx.textAlign = 'center';
    ctx.fillText(String(i + 1), x, y + 70);
  }

  ctx.fillStyle = colors.muted;
  ctx.font = canvasFont('small');
  ctx.textAlign = 'center';
  if (state.phase === 'playing') {
    ctx.fillText('Click or tap a mole, or press keys 1 to 6', WIDTH / 2, HEIGHT - 24);
  }

  if (state.phase !== 'playing') {
    ctx.fillStyle = colors.background;
    ctx.globalAlpha = 0.8;
    ctx.fillRect(0, 80, WIDTH, HEIGHT - 80);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.fillStyle = colors.accent;
    ctx.font = canvasFont('title', 'bold');
    const title = state.phase === 'ready' ? 'Mole Mayhem' : `Time's up! You scored ${state.score}`;
    ctx.fillText(title, WIDTH / 2, 200);
    ctx.fillStyle = colors.text;
    ctx.font = canvasFont('body');
    ctx.fillText(
      state.phase === 'ready'
        ? `Whack moles for ${ROUND_TIME} seconds: click or tap them, or press keys 1 to 6.`
        : `${state.hits} hits, ${state.misses} misses.`,
      WIDTH / 2,
      250,
    );
    ctx.fillText('Hits in a row score x2, then x3. Missing resets it.', WIDTH / 2, 284);

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

export const moleMayhem: CarnivalGame = {
  id: 'mole-mayhem',
  name: 'Mole Mayhem',
  description: 'Whack the moles in six holes for 30 seconds. Hits in a row score more.',

  start(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;

    let state = createState();
    const clock = frameClock(performance.now());

    const begin = () => {
      state = beginRound(state, clock, performance.now());
    };
    const onDown = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * WIDTH;
      const y = ((event.clientY - rect.top) / rect.height) * HEIGHT;
      if (state.phase !== 'playing') {
        if (onButton(x, y)) begin();
        return;
      }
      const hole = holeAt(x, y);
      if (hole !== undefined) whack(state, hole);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const target = event.target instanceof HTMLElement ? event.target : undefined;
      if (target?.isContentEditable) return;
      if (isStartKey(event.code, event.key, target?.tagName)) {
        event.preventDefault();
        if (state.phase !== 'playing') begin();
        return;
      }
      const hole = holeForKey(event.key);
      if (hole !== undefined) {
        event.preventDefault();
        whack(state, hole);
      }
    };
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKeyDown);

    let frame = 0;
    const onVisibility = () => {
      if (!document.hidden) clock.resume(performance.now());
    };
    document.addEventListener('visibilitychange', onVisibility);
    const loop = (time: number) => {
      frame = requestAnimationFrame(loop);
      step(state, clock.tick(time));
      saveFinalScore(state, (score) => recordScore(moleMayhem.id, score));
      draw(ctx, state);
    };
    frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  },
};
