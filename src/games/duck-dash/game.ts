import { canvasFont, recordScore, theme, type CarnivalGame } from '../../carnival';
import { REDUCED_MOTION_QUERY, isQuiet, motionPreference } from '../../midway/motion';

const { width: WIDTH, height: HEIGHT } = theme.canvas;

export const LANES = 3;
/** Seconds in a round, counted from the moment Start is pressed. */
export const ROUND_TIME = 20;
export const STAR_POINTS = 10;
export const REED_PENALTY = 5;
/** Seconds between one row of objects and the next. */
export const SPAWN_GAP = 0.9;
/** Seconds an object takes to float from the top of the river to the duck. */
export const TRAVEL_TIME = 2.2;
/** The longest slice of time one step simulates, so slow frames stay fair. */
export const MAX_STEP = 1 / 30;
/** The most time one frame may advance the round, so a stalled tab never skips ahead. */
export const MAX_FRAME = 0.25;
/** Extra points per star already in the streak when the next star is caught. */
export const STREAK_BONUS = 2;
/** The most bonus one caught star can earn. */
export const MAX_STREAK_BONUS = 10;
/** Seconds the duck flashes after collecting or hitting something. */
export const FLASH_TIME = 0.4;

/** A random number in [0, 1). Injected so tests can choose what spawns. */
export type Rng = () => number;

export interface RiverObject {
  id: number;
  lane: number;
  kind: 'star' | 'reed';
  /** 0 at the top of the river, 1 when it reaches the duck. */
  progress: number;
  /**
   * Pending until the object meets the duck's row, then caught (in the duck's
   * lane, so it stops drawing) or missed. It resolves once, so it counts once.
   */
  outcome: 'pending' | 'caught' | 'missed';
}

export interface DuckState {
  phase: 'ready' | 'playing' | 'over';
  lane: number;
  objects: RiverObject[];
  timeLeft: number;
  spawnIn: number;
  nextId: number;
  score: number;
  collected: number;
  hits: number;
  /** Stars caught in a row since the last reed hit or missed star. */
  streak: number;
  /** The longest streak this round. */
  peakStreak: number;
  /** Streak bonus points earned this round, already counted in `score`. */
  bonus: number;
  /** Brief feedback after the last collision. */
  flash: { kind: 'star' | 'reed'; bonus: number; left: number } | undefined;
  scoreRecorded: boolean;
  /** The last save threw. Only an explicit replay or exit tries again. */
  saveFailed: boolean;
  rng: Rng;
}

/** A small seeded generator (mulberry32), so a seed always gives the same river. */
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

export function createState(rng: Rng = Math.random): DuckState {
  return {
    phase: 'ready',
    lane: 1,
    objects: [],
    timeLeft: ROUND_TIME,
    spawnIn: 0,
    nextId: 1,
    score: 0,
    collected: 0,
    hits: 0,
    streak: 0,
    peakStreak: 0,
    bonus: 0,
    flash: undefined,
    scoreRecorded: false,
    saveFailed: false,
    rng,
  };
}

/** Starts the timer. Returns false unless the round is waiting to start. */
export function startRound(state: DuckState): boolean {
  if (state.phase !== 'ready') return false;
  state.phase = 'playing';
  state.spawnIn = 0;
  return true;
}

export function clampLane(lane: number): number {
  return Math.min(Math.max(Math.round(lane), 0), LANES - 1);
}

/** Moves the duck to `lane`, clamped to the river. Ignored outside a round. */
export function setLane(state: DuckState, lane: number): void {
  if (state.phase !== 'playing') return;
  state.lane = clampLane(lane);
}

export function moveDuck(state: DuckState, by: -1 | 1): void {
  setLane(state, state.lane + by);
}

function pick(rng: Rng, n: number): number {
  return Math.min(Math.floor(rng() * n), n - 1);
}

/**
 * One row of objects. A row holds one or two objects in different lanes, so at
 * least one lane is always free of reeds and no row is unavoidable.
 */
export function spawnRow(rng: Rng): { lane: number; kind: 'star' | 'reed' }[] {
  const first = pick(rng, LANES);
  const row: { lane: number; kind: 'star' | 'reed' }[] = [
    { lane: first, kind: rng() < 0.5 ? 'star' : 'reed' },
  ];
  if (rng() < 0.4) {
    const others = [...Array(LANES).keys()].filter((l) => l !== first);
    row.push({ lane: others[pick(rng, others.length)], kind: rng() < 0.5 ? 'star' : 'reed' });
  }
  return row;
}

/** The bonus for catching a star when `streak` stars were already caught in a row. */
export function streakBonus(streak: number): number {
  return Math.min(Math.max(streak, 0) * STREAK_BONUS, MAX_STREAK_BONUS);
}

/**
 * Settles an object that has reached the duck's row. A pending object resolves
 * once; calling this again on a caught or missed object does nothing.
 */
export function resolveObject(state: DuckState, object: RiverObject): void {
  if (object.outcome !== 'pending') return;
  if (object.lane !== state.lane) {
    object.outcome = 'missed';
    if (object.kind === 'star') state.streak = 0;
    return;
  }
  object.outcome = 'caught';
  let bonus = 0;
  if (object.kind === 'star') {
    bonus = streakBonus(state.streak);
    state.score += STAR_POINTS + bonus;
    state.bonus += bonus;
    state.collected += 1;
    state.streak += 1;
    state.peakStreak = Math.max(state.peakStreak, state.streak);
  } else {
    state.score = Math.max(state.score - REED_PENALTY, 0);
    state.hits += 1;
    state.streak = 0;
  }
  state.flash = { kind: object.kind, bonus, left: FLASH_TIME };
}

/**
 * Settles the objects that reach the duck's row together, which is always one
 * row. The object in the duck's lane resolves first, whatever the array order.
 * A star caught in the row keeps its streak: a star in another lane of the same
 * row could not have been caught too, so its miss does not reset the streak.
 */
export function resolveArrivals(state: DuckState, arrivals: RiverObject[]): void {
  const pending = arrivals.filter((o) => o.outcome === 'pending');
  const inLane = pending.filter((o) => o.lane === state.lane);
  for (const object of inLane) resolveObject(state, object);
  const caughtStar = inLane.some((o) => o.kind === 'star');
  for (const object of pending) {
    if (object.outcome !== 'pending') continue;
    if (caughtStar) object.outcome = 'missed';
    else resolveObject(state, object);
  }
}

function stepSlice(state: DuckState, dt: number): void {
  state.timeLeft = Math.max(state.timeLeft - dt, 0);
  if (state.flash) {
    state.flash.left -= dt;
    if (state.flash.left <= 0) state.flash = undefined;
  }
  for (const object of state.objects) object.progress += dt / TRAVEL_TIME;
  resolveArrivals(
    state,
    state.objects.filter((o) => o.progress >= 1),
  );
  state.objects = state.objects.filter((o) => o.progress < 1.15);
  state.spawnIn -= dt;
  if (state.spawnIn <= 0 && state.timeLeft > 0) {
    for (const { lane, kind } of spawnRow(state.rng)) {
      state.objects.push({
        id: state.nextId++,
        lane,
        kind,
        progress: 0,
        outcome: 'pending',
      });
    }
    state.spawnIn += SPAWN_GAP;
  }
  if (state.timeLeft === 0) {
    state.phase = 'over';
    state.objects = [];
    state.flash = undefined;
  }
}

/** Advances the round by `dt` seconds, at most MAX_FRAME, in slices of MAX_STEP. */
export function step(state: DuckState, dt: number): void {
  let left = Math.min(Math.max(dt, 0), MAX_FRAME);
  while (left > 0 && state.phase === 'playing') {
    const slice = Math.min(left, MAX_STEP);
    stepSlice(state, slice);
    left -= slice;
  }
}

/**
 * Hands the final score to `record` once the round is over. The score counts as
 * saved only after `record` returns. A failed save is reported, not thrown, and
 * the frame loop does not try again; pass `retry` from an explicit replay or
 * exit to try once more.
 */
export function saveFinalScore(
  state: DuckState,
  record: (score: number) => void,
  retry = false,
): unknown {
  if (state.phase !== 'over' || state.scoreRecorded) return undefined;
  if (state.saveFailed && !retry) return undefined;
  try {
    record(state.score);
  } catch (error) {
    if (!state.saveFailed) console.error('Duck Dash could not save the score', error);
    state.saveFailed = true;
    return error;
  }
  state.scoreRecorded = true;
  state.saveFailed = false;
  return undefined;
}

/**
 * Times the animation frames. `resume` restarts timing when a hidden tab comes
 * back or a round starts, so time off the river never counts.
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
 * Starts a round from the ready or end screen. A finished round's score is
 * saved first, synchronously, retrying once if an earlier save failed.
 */
export function beginRound(
  state: DuckState,
  clock: ReturnType<typeof frameClock>,
  now: number,
  record: (score: number) => void,
  fresh: () => DuckState = createState,
): DuckState {
  saveFinalScore(state, record, true);
  const next = state.phase === 'over' ? fresh() : state;
  if (startRound(next)) clock.resume(now);
  return next;
}

const PAGE_CONTROLS = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY'];

/** Whether a link or control on the page has focus, so its keys stay its own. */
export function isPageControl(focusedTag?: string): boolean {
  return focusedTag !== undefined && PAGE_CONTROLS.includes(focusedTag.toUpperCase());
}

/** What a key press does, or undefined when the game should leave it alone. */
export function keyAction(
  code: string,
  key: string,
  focusedTag?: string,
): 'start' | 'left' | 'right' | undefined {
  if (isPageControl(focusedTag)) return undefined;
  if (code === 'Space' || key === 'Enter') return 'start';
  if (key === 'ArrowLeft' || code === 'KeyA') return 'left';
  if (key === 'ArrowRight' || code === 'KeyD') return 'right';
  return undefined;
}

export const RIVER = { x: 160, y: 80, w: 480, h: 420 } as const;
const LANE_W = RIVER.w / LANES;
const TOP_Y = RIVER.y + 10;
const DUCK_Y = 380;
const BUTTON_Y = 430;
const BUTTON = { x: WIDTH / 2 - 110, y: 380, w: 220, h: 52 } as const;

/** Pixels the river flows per second: the same speed the stars and reeds float. */
export const FLOW_SPEED = (DUCK_Y - TOP_Y) / TRAVEL_TIME;
/** Pixels between one row of current ripples and the next. */
export const RIPPLE_GAP = 60;

/**
 * How far down the current ripples sit after `seconds` of flowing, wrapped to
 * one ripple gap. Under Quiet the current holds still.
 */
export function currentOffset(seconds: number, quiet: boolean): number {
  if (quiet) return 0;
  return (((seconds * FLOW_SPEED) % RIPPLE_GAP) + RIPPLE_GAP) % RIPPLE_GAP;
}

export function laneCentre(lane: number): number {
  return RIVER.x + LANE_W * (lane + 0.5);
}

/** The lane under canvas x, or undefined outside the river. */
export function laneAt(x: number): number | undefined {
  if (x < RIVER.x || x >= RIVER.x + RIVER.w) return undefined;
  return clampLane(Math.floor((x - RIVER.x) / LANE_W));
}

function onButton(x: number, y: number) {
  return x >= BUTTON.x && x <= BUTTON.x + BUTTON.w && y >= BUTTON.y && y <= BUTTON.y + BUTTON.h;
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.fillStyle = theme.colors.accent;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const len = i % 2 === 0 ? r : r * 0.45;
    ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
  }
  ctx.closePath();
  ctx.fill();
}

// A reed clump: tall leaning blades with cattail heads on a muddy base, so it
// reads as an upright tuft rather than a round star.
function drawReed(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = theme.colors.surface;
  ctx.beginPath();
  ctx.ellipse(x, y + 14, 26, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = theme.colors.wood;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  for (const lean of [-16, -8, 0, 8, 16]) {
    ctx.beginPath();
    ctx.moveTo(x + lean / 3, y + 12);
    ctx.quadraticCurveTo(x + lean / 2, y - 10, x + lean, y - 30);
    ctx.stroke();
  }
  ctx.fillStyle = theme.colors.danger;
  for (const lean of [-8, 8]) {
    ctx.beginPath();
    ctx.ellipse(x + lean * 0.8, y - 20, 4, 9, lean / 60, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.lineCap = 'butt';
}

function drawDuck(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = theme.colors.accent;
  ctx.beginPath();
  ctx.ellipse(x, y + 8, 30, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y - 16, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = theme.colors.stripeA;
  ctx.beginPath();
  ctx.moveTo(x - 6, y - 24);
  ctx.lineTo(x, y - 40);
  ctx.lineTo(x + 6, y - 24);
  ctx.fill();
  ctx.fillStyle = theme.colors.danger;
  ctx.fillRect(x - 6, y - 14, 12, 6);
  ctx.fillStyle = theme.colors.background;
  ctx.beginPath();
  ctx.arc(x - 6, y - 19, 2.5, 0, Math.PI * 2);
  ctx.arc(x + 6, y - 19, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

export const BANK_W = 18;

/** The score panel: one box on the left bank, level with the top of the river. */
export const HUD_PANEL = { x: 8, y: RIVER.y, w: 126, h: 186 } as const;
const HUD_ROW = 28;
/** The key hint: beside the lane buttons, on the right bank. */
export const KEY_HINT = { x: RIVER.x + RIVER.w + BANK_W + 10, y: BUTTON_Y, w: 122, h: 56 } as const;

function drawHud(ctx: CanvasRenderingContext2D, state: DuckState) {
  const { colors } = theme;
  const { x, y, w, h } = HUD_PANEL;
  ctx.fillStyle = colors.surface;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = colors.accent;
  ctx.fillRect(x, y, w, 4);
  const rows: [string, string][] = [
    ['Time', `${Math.ceil(state.timeLeft)}s`],
    ['Score', `${state.score}`],
    ['Streak', `${state.streak}`],
    ['Best', `${state.peakStreak}`],
    ['Stars', `${state.collected}`],
    ['Reeds hit', `${state.hits}`],
  ];
  ctx.font = canvasFont('body', 'bold');
  rows.forEach(([label, value], i) => {
    const rowY = y + 32 + i * HUD_ROW;
    ctx.fillStyle = i < 3 ? colors.text : colors.muted;
    ctx.textAlign = 'left';
    ctx.fillText(label, x + 10, rowY);
    ctx.fillStyle = i < 3 ? colors.accent : colors.muted;
    ctx.textAlign = 'right';
    ctx.fillText(value, x + w - 10, rowY);
  });
}

function drawRiver(ctx: CanvasRenderingContext2D, state: DuckState, offset: number) {
  const { colors } = theme;
  ctx.fillStyle = colors.water;
  ctx.fillRect(RIVER.x, RIVER.y, RIVER.w, RIVER.h);
  for (let lane = 0; lane < LANES; lane++) {
    if (lane === state.lane) {
      ctx.fillStyle = colors.surface;
      ctx.globalAlpha = 0.25;
      ctx.fillRect(RIVER.x + lane * LANE_W, RIVER.y, LANE_W, RIVER.h);
      ctx.globalAlpha = 1;
    }
  }

  // The current: soft ripples that drift down at the items' speed.
  ctx.save();
  ctx.beginPath();
  ctx.rect(RIVER.x, RIVER.y, RIVER.w, RIVER.h);
  ctx.clip();
  ctx.strokeStyle = colors.stripeB;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 2;
  for (let lane = 0; lane < LANES; lane++) {
    for (let y = RIVER.y - RIPPLE_GAP + offset; y < RIVER.y + RIVER.h; y += RIPPLE_GAP) {
      for (const dx of [-0.25, 0.2]) {
        const cx = laneCentre(lane) + dx * LANE_W;
        const cy = y + (dx < 0 ? 0 : RIPPLE_GAP / 2);
        ctx.beginPath();
        ctx.moveTo(cx - 14, cy);
        ctx.quadraticCurveTo(cx - 7, cy - 5, cx, cy);
        ctx.quadraticCurveTo(cx + 7, cy + 5, cx + 14, cy);
        ctx.stroke();
      }
    }
  }
  ctx.restore();

  for (let lane = 1; lane < LANES; lane++) {
    ctx.fillStyle = colors.stripeB;
    ctx.fillRect(RIVER.x + lane * LANE_W - 1.5, RIVER.y, 3, RIVER.h);
  }

  // Banks: earth on both sides with a pale waterline.
  for (const x of [RIVER.x - BANK_W, RIVER.x + RIVER.w]) {
    ctx.fillStyle = colors.wood;
    ctx.fillRect(x, RIVER.y, BANK_W, RIVER.h);
    ctx.fillStyle = colors.stripeB;
    ctx.fillRect(x === RIVER.x - BANK_W ? RIVER.x - 3 : RIVER.x, RIVER.y, 3, RIVER.h);
  }
}

function draw(ctx: CanvasRenderingContext2D, state: DuckState, offset: number) {
  const { colors } = theme;
  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const stripe = WIDTH / 16;
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = i % 2 === 0 ? colors.stripeA : colors.stripeB;
    ctx.fillRect(i * stripe, 0, stripe, 30);
  }

  drawHud(ctx, state);
  drawRiver(ctx, state, offset);

  for (const object of state.objects) {
    const x = laneCentre(object.lane);
    const y = TOP_Y + (DUCK_Y - TOP_Y) * object.progress;
    if (object.outcome === 'caught') continue;
    if (object.kind === 'star') drawStar(ctx, x, y, 20);
    else drawReed(ctx, x, y);
  }

  if (state.phase === 'playing') {
    drawDuck(ctx, laneCentre(state.lane), DUCK_Y);
    if (state.flash) {
      ctx.globalAlpha = Math.min(state.flash.left / 0.2, 1);
      ctx.fillStyle = state.flash.kind === 'star' ? colors.accent : colors.danger;
      ctx.font = canvasFont('title', 'bold');
      ctx.textAlign = 'center';
      const { kind, bonus } = state.flash;
      const text =
        kind === 'reed'
          ? `Ouch! -${REED_PENALTY}`
          : bonus > 0
            ? `+${STAR_POINTS} +${bonus} streak`
            : `+${STAR_POINTS}`;
      ctx.fillText(text, laneCentre(state.lane), DUCK_Y - 60);
      ctx.globalAlpha = 1;
    }
    // Lane buttons along the bottom for pointer and touch.
    for (let lane = 0; lane < LANES; lane++) {
      ctx.fillStyle = lane === state.lane ? colors.accent : colors.surface;
      ctx.fillRect(RIVER.x + lane * LANE_W + 6, BUTTON_Y, LANE_W - 12, 56);
      ctx.fillStyle = lane === state.lane ? colors.background : colors.text;
      ctx.font = canvasFont('body', 'bold');
      ctx.textAlign = 'center';
      ctx.fillText(['Left', 'Middle', 'Right'][lane], laneCentre(lane), BUTTON_Y + 34);
    }
    ctx.fillStyle = colors.text;
    ctx.font = canvasFont('small', 'bold');
    ctx.textAlign = 'left';
    ctx.fillText('Left/Right', KEY_HINT.x, KEY_HINT.y + 16);
    ctx.fillText('or A/D,', KEY_HINT.x, KEY_HINT.y + 34);
    ctx.fillText('or tap a lane', KEY_HINT.x, KEY_HINT.y + 52);
  } else {
    ctx.fillStyle = colors.background;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(0, 30, WIDTH, HEIGHT - 30);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.fillStyle = colors.accent;
    ctx.font = canvasFont('title', 'bold');
    const title = state.phase === 'ready' ? 'Duck Dash' : `Time's up! You scored ${state.score}`;
    ctx.fillText(title, WIDTH / 2, 150);
    ctx.fillStyle = colors.text;
    ctx.font = canvasFont('body');
    if (state.phase === 'ready') {
      ctx.fillText(`Steer the duck between three lanes for ${ROUND_TIME} seconds.`, WIDTH / 2, 210);
      ctx.fillText(
        `Stars score ${STAR_POINTS}. Reeds take ${REED_PENALTY} away (never below 0).`,
        WIDTH / 2,
        245,
      );
      ctx.fillText(
        `Each star in a row adds +${STREAK_BONUS} more, up to +${MAX_STREAK_BONUS}.`,
        WIDTH / 2,
        280,
      );
      ctx.fillText('Left/Right or A/D, or tap a lane button.', WIDTH / 2, 315);
    } else {
      ctx.fillText(
        `${state.collected} stars (${state.collected * STAR_POINTS} points), ${state.hits} reeds hit.`,
        WIDTH / 2,
        205,
      );
      ctx.fillText(
        `Streak bonus +${state.bonus}, best streak ${state.peakStreak}.`,
        WIDTH / 2,
        240,
      );
      if (state.saveFailed) {
        ctx.fillStyle = colors.danger;
        ctx.fillText('Your score could not be saved.', WIDTH / 2, 280);
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

export const duckDash: CarnivalGame = {
  id: 'duck-dash',
  name: 'Duck Dash',
  description: 'Steer a duck between three river lanes for 20 seconds: catch stars, dodge reeds.',

  start(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;

    const record = (score: number) => recordScore(duckDash.id, score);
    let state = createState();
    const clock = frameClock(performance.now());
    const begin = () => {
      state = beginRound(state, clock, performance.now(), record);
    };

    const onDown = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * WIDTH;
      const y = ((event.clientY - rect.top) / rect.height) * HEIGHT;
      if (state.phase !== 'playing') {
        if (onButton(x, y)) begin();
        return;
      }
      const lane = laneAt(x);
      if (lane !== undefined && y >= RIVER.y) setLane(state, lane);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const target = event.target instanceof HTMLElement ? event.target : undefined;
      if (target?.isContentEditable) return;
      const action = keyAction(event.code, event.key, target?.tagName);
      if (!action) return;
      event.preventDefault();
      if (action === 'start') {
        if (state.phase !== 'playing') begin();
      } else {
        moveDuck(state, action === 'left' ? -1 : 1);
      }
    };
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKeyDown);

    const onVisibility = () => {
      if (!document.hidden) clock.resume(performance.now());
    };
    document.addEventListener('visibilitychange', onVisibility);

    const quiet = isQuiet(
      motionPreference.load(),
      window.matchMedia?.(REDUCED_MOTION_QUERY).matches ?? false,
    );
    let flowed = 0;
    let frame = 0;
    const loop = (time: number) => {
      frame = requestAnimationFrame(loop);
      const dt = clock.tick(time);
      if (state.phase === 'playing') flowed += Math.min(dt, MAX_FRAME);
      step(state, dt);
      saveFinalScore(state, record);
      draw(ctx, state, currentOffset(flowed, quiet));
    };
    frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      saveFinalScore(state, record, true);
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  },
};
