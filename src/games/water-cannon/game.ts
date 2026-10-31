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

export type ModeId = 'calm' | 'classic' | 'rapid';

export interface Mode {
  id: ModeId;
  name: string;
  /** Multiplies how fast the targets move. Points per hit stay the same. */
  speedFactor: number;
}

/** The challenge modes, in the order the selector shows them. */
export const MODES: readonly Mode[] = [
  { id: 'calm', name: 'Calm', speedFactor: 0.5 },
  { id: 'classic', name: 'Classic', speedFactor: 1 },
  { id: 'rapid', name: 'Rapid', speedFactor: 1.5 },
];

export function modeById(id: ModeId): Mode {
  return MODES.find((mode) => mode.id === id) ?? MODES[1];
}

/** The mode `delta` places along the selector from `id`, wrapping at either end. */
export function cycleMode(id: ModeId, delta: number): ModeId {
  const index = MODES.findIndex((mode) => mode.id === id);
  const count = MODES.length;
  return MODES[(((index + delta) % count) + count) % count].id;
}

/** The selector's label for a mode, e.g. 'Rapid x1.5'. */
export function modeLabel(id: ModeId): string {
  const mode = modeById(id);
  return `${mode.name} x${mode.speedFactor}`;
}

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
  /** 'ready' shows the mode selector; nothing moves or fires until the round begins. */
  phase: 'ready' | 'playing' | 'over';
  /** The challenge mode, which sets how fast the targets move. */
  mode: ModeId;
  /** True once the final score has been handed out by takeFinalScore. */
  scoreTaken: boolean;
}

/** A round in progress in `mode`, with a full tank, no score and no streak. */
export function createState(mode: ModeId = 'classic'): WaterCannonState {
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
    mode,
    scoreTaken: false,
  };
}

/** The mode selector before a round, with `mode` picked to start with. */
export function createReadyState(mode: ModeId = 'classic'): WaterCannonState {
  return { ...createState(mode), phase: 'ready' };
}

/** Picks the mode on the selector. Returns false, changing nothing, outside the selector. */
export function selectMode(state: WaterCannonState, mode: ModeId): boolean {
  if (state.phase !== 'ready') return false;
  state.mode = mode;
  return true;
}

/** Starts the round from the selector in the picked mode. Returns the state unchanged otherwise. */
export function beginRound(state: WaterCannonState): WaterCannonState {
  if (state.phase !== 'ready') return state;
  return createState(state.mode);
}

/** After a round, goes back to the selector with the same mode picked. */
export function replay(state: WaterCannonState): WaterCannonState {
  if (state.phase !== 'over') return state;
  return createReadyState(state.mode);
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
  if (state.phase === 'ready') return;
  const { speedFactor } = modeById(state.mode);
  for (const target of state.targets) {
    target.x += target.speed * speedFactor * dt;
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

const PAGE_CONTROLS = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY'];

export type KeyAction = { type: 'select'; mode: ModeId } | { type: 'start' } | { type: 'replay' };

/**
 * What a key press does on the selector or the results screen, if anything.
 * Keys 1 to 3 or the arrow keys pick a mode, Space or Enter starts the round
 * or plays again. Nothing happens while a link or control on the page has
 * focus, so the key still activates that control, or during a round.
 */
export function keyAction(
  state: WaterCannonState,
  code: string,
  key: string,
  focusedTag?: string,
): KeyAction | undefined {
  if (focusedTag !== undefined && PAGE_CONTROLS.includes(focusedTag.toUpperCase()))
    return undefined;
  const confirm = code === 'Space' || key === 'Enter';
  if (state.phase === 'over') return confirm ? { type: 'replay' } : undefined;
  if (state.phase !== 'ready') return undefined;
  if (confirm) return { type: 'start' };
  const n = Number(key);
  if (Number.isInteger(n) && n >= 1 && n <= MODES.length) {
    return { type: 'select', mode: MODES[n - 1].id };
  }
  if (key === 'ArrowLeft' || key === 'ArrowUp') {
    return { type: 'select', mode: cycleMode(state.mode, -1) };
  }
  if (key === 'ArrowRight' || key === 'ArrowDown') {
    return { type: 'select', mode: cycleMode(state.mode, 1) };
  }
  return undefined;
}

/** Applies a key or pointer action. Returns the state to carry on with. */
export function applyAction(state: WaterCannonState, action: KeyAction): WaterCannonState {
  if (action.type === 'select') {
    selectMode(state, action.mode);
    return state;
  }
  return action.type === 'start' ? beginRound(state) : replay(state);
}

const MODE_BUTTON = { w: 200, h: 56, gap: 24, y: 210 } as const;
const START_BUTTON = { x: WIDTH / 2 - 110, y: 320, w: 220, h: 52 } as const;

/** The top-left corner of the selector button for the mode at `index`. */
function modeButtonX(index: number): number {
  const total = MODES.length * MODE_BUTTON.w + (MODES.length - 1) * MODE_BUTTON.gap;
  return WIDTH / 2 - total / 2 + index * (MODE_BUTTON.w + MODE_BUTTON.gap);
}

/** The selector action under canvas point (x, y), if any. */
export function selectorActionAt(x: number, y: number): KeyAction | undefined {
  if (y >= MODE_BUTTON.y && y <= MODE_BUTTON.y + MODE_BUTTON.h) {
    const index = MODES.findIndex(
      (_, i) => x >= modeButtonX(i) && x <= modeButtonX(i) + MODE_BUTTON.w,
    );
    if (index !== -1) return { type: 'select', mode: MODES[index].id };
  }
  const inStart =
    x >= START_BUTTON.x &&
    x <= START_BUTTON.x + START_BUTTON.w &&
    y >= START_BUTTON.y &&
    y <= START_BUTTON.y + START_BUTTON.h;
  return inStart ? { type: 'start' } : undefined;
}

/**
 * What a pointer press does: on the selector only its buttons act, so a stray
 * click never starts a round; on the results screen any click plays again;
 * during a round it fires.
 */
export function pointerAction(
  state: WaterCannonState,
  x: number,
  y: number,
): KeyAction | { type: 'fire' } | undefined {
  if (state.phase === 'ready') return selectorActionAt(x, y);
  if (state.phase === 'over') return { type: 'replay' };
  return { type: 'fire' };
}

function drawSelector(ctx: CanvasRenderingContext2D, state: WaterCannonState) {
  const { colors } = theme;
  ctx.fillStyle = colors.background;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  ctx.fillStyle = colors.accent;
  ctx.font = canvasFont('title', 'bold');
  ctx.fillText('Pick a challenge', WIDTH / 2, 150);
  ctx.fillStyle = colors.muted;
  ctx.font = canvasFont('small');
  ctx.fillText('Target speed changes, points stay the same. Keys 1-3 or arrows', WIDTH / 2, 185);

  MODES.forEach((mode, i) => {
    const x = modeButtonX(i);
    const picked = mode.id === state.mode;
    ctx.fillStyle = picked ? colors.accent : colors.surface;
    ctx.fillRect(x, MODE_BUTTON.y, MODE_BUTTON.w, MODE_BUTTON.h);
    if (picked) {
      ctx.strokeStyle = colors.text;
      ctx.lineWidth = 3;
      ctx.strokeRect(x, MODE_BUTTON.y, MODE_BUTTON.w, MODE_BUTTON.h);
    }
    ctx.fillStyle = picked ? colors.background : colors.text;
    ctx.font = canvasFont('body', 'bold');
    ctx.fillText(`${i + 1}. ${modeLabel(mode.id)}`, x + MODE_BUTTON.w / 2, MODE_BUTTON.y + 35);
  });

  ctx.fillStyle = colors.stripeA;
  ctx.fillRect(START_BUTTON.x, START_BUTTON.y, START_BUTTON.w, START_BUTTON.h);
  ctx.fillStyle = colors.text;
  ctx.font = canvasFont('body', 'bold');
  ctx.fillText('Start (Space)', WIDTH / 2, START_BUTTON.y + 33);
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

  // The round's mode, top left.
  ctx.fillStyle = colors.surface;
  ctx.fillRect(16, 48, 180, 34);
  ctx.fillStyle = colors.text;
  ctx.font = canvasFont('small', 'bold');
  ctx.fillText(`Mode ${modeLabel(state.mode)}`, 106, 71);

  if (state.phase === 'ready') drawSelector(ctx, state);

  if (state.phase === 'over') {
    ctx.fillStyle = colors.background;
    ctx.globalAlpha = 0.8;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.fillStyle = colors.accent;
    ctx.font = canvasFont('title', 'bold');
    ctx.fillText(`Tank empty! You scored ${state.score}`, WIDTH / 2, HEIGHT / 2);
    ctx.fillStyle = colors.muted;
    ctx.font = canvasFont('body');
    ctx.fillText(`Mode: ${modeLabel(state.mode)}`, WIDTH / 2, HEIGHT / 2 + 36);
    ctx.fillStyle = colors.text;
    ctx.fillText('Click or press Space to play again', WIDTH / 2, HEIGHT / 2 + 72);
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

    let state = createReadyState();
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
      const action = pointerAction(state, aim.x, aim.y);
      if (action?.type === 'fire') fire(state, aim.x, aim.y);
      else if (action) state = applyAction(state, action);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const target = event.target instanceof HTMLElement ? event.target : undefined;
      if (target?.isContentEditable) return;
      const action = keyAction(state, event.code, event.key, target?.tagName);
      if (!action) return;
      event.preventDefault();
      state = applyAction(state, action);
    };
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKeyDown);

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
      window.removeEventListener('keydown', onKeyDown);
    };
  },
};
