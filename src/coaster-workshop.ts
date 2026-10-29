/**
 * Coaster Workshop: an optional engineering sandbox reached from the visitor
 * guide (#/coaster). Shape a side-view track through seven control points and
 * test it on a toy model. It is not a booth: nothing is scored, and the layout
 * is kept through the shared save slot in src/carnival.
 */
import {
  browserSaveStorage,
  canvasFont,
  createSaveSlot,
  theme,
  type SaveStorage,
} from './carnival';
import {
  isQuiet,
  watchReducedMotion,
  type MotionHost,
  type MotionPreference,
} from './midway/motion';

const { width: WIDTH, height: HEIGHT } = theme.canvas;

/** A toy model: pixels, seconds and a made-up gravity. Not real engineering. */
export const GRAVITY = 400;
/** Speed lost per second to rolling drag, as a fraction of speed. */
export const DRAG = 0.08;
/** Speed the train leaves the station with, in pixels per second. */
export const LAUNCH_SPEED = 60;
/** Above this speed the toy model calls the run too fast. */
export const MAX_SPEED = 520;
/** Fixed time step, so a layout always runs the same way. */
export const STEP = 1 / 120;
/** A run that has not finished by now has stalled. */
export const MAX_TIME = 30;
export const POINT_COUNT = 7;
export const MIN_Y = 80;
export const MAX_Y = HEIGHT - 60;
export const NUDGE = 10;
const LEFT = 60;
const RIGHT = WIDTH - 60;
const SAMPLES_PER_SPAN = 16;

export interface Point {
  x: number;
  y: number;
}

export type Outcome = 'complete' | 'stall' | 'too-fast';

export interface Run {
  /** Distance along the track, in pixels. */
  s: number;
  v: number;
  time: number;
  peak: number;
  outcome?: Outcome;
  /** Where the outcome happened, for local feedback on the track. */
  at?: Point;
}

/** The working starter: a drop, a hill and a gentle run in. */
export function starterLayout(): Point[] {
  const ys = [120, 360, 220, 380, 300, 390, 360];
  return ys.map((y, i) => ({ x: pointX(i), y }));
}

export function pointX(index: number) {
  return LEFT + ((RIGHT - LEFT) * index) / (POINT_COUNT - 1);
}

export function clampY(y: number) {
  if (!Number.isFinite(y)) return MAX_Y;
  return Math.min(MAX_Y, Math.max(MIN_Y, Math.round(y)));
}

/** Moves one control point up or down, within the workshop's frame. */
export function nudge(points: readonly Point[], index: number, dy: number): Point[] {
  return points.map((p, i) => (i === index ? { x: p.x, y: clampY(p.y + dy) } : p));
}

/** A smooth (Catmull-Rom) polyline through the control points. */
export function trackPath(points: readonly Point[]): Point[] {
  const path: Point[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    for (let k = 0; k < SAMPLES_PER_SPAN; k++) {
      const t = k / SAMPLES_PER_SPAN;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 *
        (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      path.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: clampPath(f(p0.y, p1.y, p2.y, p3.y)) });
    }
  }
  path.push({ ...points[points.length - 1] });
  return path;
}

function clampPath(y: number) {
  return Math.min(HEIGHT - 10, Math.max(10, y));
}

export function pathLength(path: readonly Point[]) {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  }
  return total;
}

/** The point and downhill slope (sine of the angle) at distance s. */
export function sampleAt(path: readonly Point[], s: number): { point: Point; sinDown: number } {
  let remaining = Math.max(0, s);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len === 0) continue;
    if (remaining <= len || i === path.length - 1) {
      const t = Math.min(1, remaining / len);
      return {
        point: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
        // Screen y grows downward, so a positive dy is downhill.
        sinDown: (b.y - a.y) / len,
      };
    }
    remaining -= len;
  }
  return { point: { ...path[0] }, sinDown: 0 };
}

export function createRun(): Run {
  return { s: 0, v: LAUNCH_SPEED, time: 0, peak: LAUNCH_SPEED };
}

/** Advances a run by one fixed step on this exact track. */
export function stepRun(run: Run, path: readonly Point[], length = pathLength(path)): Run {
  if (run.outcome) return run;
  const { sinDown } = sampleAt(path, run.s);
  const v = run.v + (GRAVITY * sinDown - DRAG * run.v) * STEP;
  const s = run.s + v * STEP;
  const next: Run = { s, v, time: run.time + STEP, peak: Math.max(run.peak, Math.abs(v)) };
  if (Math.abs(v) > MAX_SPEED) {
    next.outcome = 'too-fast';
  } else if (s >= length) {
    next.s = length;
    next.outcome = 'complete';
  } else if (s <= 0 || v <= 0 || next.time >= MAX_TIME) {
    // The train ran out of speed before the end and would roll back.
    next.s = Math.max(0, s);
    next.outcome = 'stall';
  }
  if (next.outcome) next.at = sampleAt(path, next.s).point;
  return next;
}

/** Runs the layout to its outcome. Same layout, same result, every time. */
export function simulate(points: readonly Point[]): Run {
  const path = trackPath(points);
  const length = pathLength(path);
  let run = createRun();
  while (!run.outcome) run = stepRun(run, path, length);
  return run;
}

export function describeOutcome(run: Run) {
  switch (run.outcome) {
    case 'complete':
      return `Safe finish. Top speed ${Math.round(run.peak)} of ${MAX_SPEED} in this toy model.`;
    case 'stall':
      return 'Stalled: the train ran out of speed before the end. Lower the hill marked in red.';
    case 'too-fast':
      return 'Too fast: the train passed the toy speed limit. Make the drop marked in red gentler.';
    default:
      return 'Testing...';
  }
}

/** A layout is saved as its seven heights; the x positions are fixed. */
export function parseLayout(value: unknown): Point[] | undefined {
  if (!Array.isArray(value) || value.length !== POINT_COUNT) return undefined;
  if (!value.every((y) => typeof y === 'number' && Number.isFinite(y))) return undefined;
  return value.map((y: number, i) => ({ x: pointX(i), y: clampY(y) }));
}

export const COASTER_KEY = 'tessl-carnival:coaster-layout';
/** Seven heights fit in well under this; anything longer is not a layout. */
export const COASTER_SAVE_MAX = 200;

export interface CoasterStore {
  load(): Point[] | undefined;
  /** Returns whether the browser kept the layout. Never throws. */
  save(points: readonly Point[]): boolean;
}

/** Keeps one layout in this browser through the shared save slot. */
export function createCoasterStore(storage: SaveStorage | undefined): CoasterStore {
  const slot = createSaveSlot(storage, {
    key: COASTER_KEY,
    maxLength: COASTER_SAVE_MAX,
    parse: (value) => parseLayout(value)?.map((p) => p.y),
  });
  return {
    load: () => parseLayout(slot.load()),
    save: (points) => slot.save(points.map((p) => p.y)),
  };
}

export interface Workshop {
  points: Point[];
  history: Point[][];
  selected: number;
  run?: Run;
  paused: boolean;
  /** The static view's dots for the current run, worked out once per test. */
  samples?: Point[];
  /** True while a press that landed on a point is held. */
  dragging: boolean;
  /** The layout when a drag began, kept for undo once the drag changes it. */
  dragOrigin?: Point[];
}

export function createWorkshop(points = starterLayout()): Workshop {
  return { points, history: [], selected: 1, paused: false, dragging: false };
}

/** Ends any test, because the track it ran on has changed or was stopped. */
function clearRun(w: Workshop) {
  w.run = undefined;
  w.samples = undefined;
  w.paused = false;
}

/** Moves the selected point, keeping the old layout for undo. Clears any test run. */
export function adjust(w: Workshop, dy: number) {
  const next = nudge(w.points, w.selected, dy);
  if (next[w.selected].y === w.points[w.selected].y) return;
  w.history.push(w.points);
  w.points = next;
  clearRun(w);
}

export function undo(w: Workshop) {
  const previous = w.history.pop();
  if (previous) {
    w.points = previous;
    clearRun(w);
  }
}

/** Puts just this layout back to the starter. Undo can bring it back. */
export function resetLayout(w: Workshop) {
  w.history.push(w.points);
  w.points = starterLayout();
  clearRun(w);
}

export function select(w: Workshop, delta: number) {
  w.selected = (w.selected + delta + POINT_COUNT) % POINT_COUNT;
}

/** How close, in canvas pixels, a press has to be to a point to grab it. */
export const GRAB_RADIUS = 30;

/** The point nearest a press along the track, and whether the press grabs it. */
export function pickPoint(points: readonly Point[], at: Point): { index: number; grab: boolean } {
  let index = 0;
  points.forEach((q, i) => {
    if (Math.abs(q.x - at.x) < Math.abs(points[index].x - at.x)) index = i;
  });
  const p = points[index];
  return { index, grab: Math.hypot(p.x - at.x, p.y - at.y) < GRAB_RADIUS };
}

/** A press selects the nearest point, and starts a drag when it lands on it. */
export function press(w: Workshop, at: Point): boolean {
  const { index, grab } = pickPoint(w.points, at);
  w.selected = index;
  w.dragging = grab;
  w.dragOrigin = grab ? w.points : undefined;
  return grab;
}

export function release(w: Workshop) {
  w.dragging = false;
  w.dragOrigin = undefined;
}

/** Drags the selected point to height y. The first change keeps the layout for undo. */
export function dragTo(w: Workshop, y: number) {
  if (!w.dragging) return;
  const next = nudge(w.points, w.selected, y - w.points[w.selected].y);
  if (next[w.selected].y === w.points[w.selected].y) return;
  if (w.dragOrigin) w.history.push(w.dragOrigin);
  w.dragOrigin = undefined;
  w.points = next;
  clearRun(w);
}

/** Every half second of a run, for the static view. */
export function simulateSamples(points: readonly Point[]): Point[] {
  const path = trackPath(points);
  const length = pathLength(path);
  const samples: Point[] = [];
  let run = createRun();
  let count = 0;
  while (!run.outcome) {
    run = stepRun(run, path, length);
    if (++count % 60 === 0) samples.push(sampleAt(path, run.s).point);
  }
  return samples;
}

/**
 * Starts a test. Quiet shows the outcome straight away with static dots for
 * where the train was; otherwise the train sets off from the station.
 */
export function startTest(w: Workshop, quiet: boolean) {
  w.paused = false;
  w.samples = undefined;
  if (quiet) showStatic(w);
  else w.run = createRun();
}

/** Finishes the test at once and works out the static dots, once. */
export function showStatic(w: Workshop) {
  w.run = simulate(w.points);
  w.samples = simulateSamples(w.points);
}

/** One fixed step, paused. Starts a test when there is none; does nothing once it has ended. */
export function stepOnce(w: Workshop, path: readonly Point[], length = pathLength(path)) {
  if (!w.run) {
    w.run = createRun();
    w.samples = undefined;
  }
  w.paused = true;
  w.run = stepRun(w.run, path, length);
}

export function togglePause(w: Workshop) {
  if (w.run && !w.run.outcome) w.paused = !w.paused;
}

/** Stops the test and returns true, or returns false when there was none to stop. */
export function stopTest(w: Workshop): boolean {
  if (!w.run) return false;
  clearRun(w);
  return true;
}

/** Playback never catches up more than this after a stalled tab. */
export const MAX_FRAME = 0.25;

/**
 * Advances playback by the real time since the last frame, in fixed steps, so
 * the train moves at the same speed at any frame rate. Leftover time carries
 * over to the next frame. Returns the new carry.
 */
export function advancePlayback(
  w: Workshop,
  path: readonly Point[],
  length: number,
  elapsed: number,
  carry: number,
): number {
  if (!w.run || w.run.outcome || w.paused) return 0;
  let time = carry + Math.min(MAX_FRAME, Math.max(0, elapsed));
  while (time >= STEP && !w.run.outcome) {
    w.run = stepRun(w.run, path, length);
    time -= STEP;
  }
  return w.run.outcome ? 0 : time;
}

export type CoasterAction =
  'previous' | 'next' | 'up' | 'down' | 'test' | 'pause' | 'step' | 'undo' | 'reset' | 'escape';

/** The workshop's keys. Anything else is left to the page. */
export function keyAction(key: string): CoasterAction | undefined {
  const actions: Record<string, CoasterAction> = {
    arrowleft: 'previous',
    arrowright: 'next',
    arrowup: 'up',
    arrowdown: 'down',
    t: 'test',
    p: 'pause',
    s: 'step',
    u: 'undo',
    r: 'reset',
    escape: 'escape',
  };
  return actions[key.toLowerCase()];
}

export const KEYS_HELP =
  '←/→ pick point  ↑/↓ move  T test  P pause  S step  U undo  R reset  Esc stop test';

/** What the test is doing, without the speed, so a screen reader hears changes, not every frame. */
export function announcement(w: Workshop): string {
  const run = w.run;
  if (!run) {
    const height = MAX_Y - w.points[w.selected].y;
    return `Point ${w.selected + 1} of ${POINT_COUNT} selected, height ${height}. Shape the track, then press T to test it.`;
  }
  return `${describeOutcome(run)}${!run.outcome && w.paused ? ' (paused)' : ''}`;
}

export function statusText(w: Workshop): string {
  const run = w.run;
  if (!run) return 'Shape the track, then press T to test it.';
  return `${announcement(w)}  Speed ${Math.round(Math.abs(run.v))}`;
}

export function drawWorkshop(ctx: CanvasRenderingContext2D, w: Workshop, path: readonly Point[]) {
  const { colors } = theme;
  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = colors.surface;
  ctx.fillRect(0, MAX_Y + 20, WIDTH, HEIGHT - MAX_Y - 20);

  // Supports, so the shape reads as a structure.
  ctx.strokeStyle = colors.wood;
  ctx.lineWidth = 2;
  for (const p of w.points) {
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x, MAX_Y + 20);
    ctx.stroke();
  }

  ctx.strokeStyle = colors.text;
  ctx.lineWidth = 4;
  ctx.beginPath();
  path.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.stroke();

  w.points.forEach((p, i) => {
    ctx.fillStyle = i === w.selected ? colors.accent : colors.muted;
    ctx.beginPath();
    ctx.arc(p.x, p.y, i === w.selected ? 9 : 6, 0, Math.PI * 2);
    ctx.fill();
  });

  const run = w.run;
  if (run) {
    if (w.samples) {
      // Static dots for where the train was, instead of a moving train.
      ctx.fillStyle = colors.water;
      for (const p of w.samples) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      const { point } = sampleAt(path, run.s);
      ctx.fillStyle = colors.stripeA;
      ctx.fillRect(point.x - 12, point.y - 16, 24, 14);
    }
    if (run.at) {
      ctx.strokeStyle = run.outcome === 'complete' ? colors.accent : colors.danger;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(run.at.x, run.at.y, 22, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  ctx.fillStyle = colors.text;
  ctx.font = canvasFont('title', 'bold');
  ctx.textAlign = 'left';
  ctx.fillText('Coaster Workshop', 20, 40);
  ctx.font = canvasFont('body');
  ctx.fillText(statusText(w), 20, 66);
  ctx.font = canvasFont('small');
  ctx.fillStyle = colors.muted;
  ctx.fillText(KEYS_HELP, 20, HEIGHT - 14);
}

/** The canvas parts the workshop uses, so tests can pass a fake. */
export interface CoasterCanvas extends EventTarget {
  width: number;
  height: number;
  getContext(kind: '2d'): CanvasRenderingContext2D | null;
  getBoundingClientRect(): { left: number; top: number; width: number; height: number };
}

/** The window parts the workshop uses, so tests can drive frames and keys by hand. */
export interface CoasterHost extends EventTarget, MotionHost {
  requestAnimationFrame(callback: (now: number) => void): number;
  cancelAnimationFrame(id: number): void;
}

export interface CoasterOptions {
  host: CoasterHost;
  store: CoasterStore;
  /** The midway's Quiet choice, read again for every test. */
  preference: () => MotionPreference;
  /** Escape with no test running: leave the workshop. */
  onExit: () => void;
  /** The words for the page's status line and save note. */
  onStatus?: (status: string, saved: boolean) => void;
}

export interface CoasterSession {
  act(action: CoasterAction): void;
  /** Cancels the frame and removes every listener. Safe to call twice. */
  stop(): void;
}

/**
 * Runs the workshop on a canvas. Nothing here records a score: it is a
 * sandbox, not a booth. The layout is saved after every change.
 */
export function startCoasterWorkshop(
  canvas: CoasterCanvas,
  { host, store, preference, onExit, onStatus }: CoasterOptions,
): CoasterSession {
  const ctx = canvas.getContext('2d');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const w = createWorkshop(store.load() ?? starterLayout());
  let path = trackPath(w.points);
  let length = pathLength(path);
  let saved = true;
  let systemReduces = false;
  let frame = 0;
  let last: number | undefined;
  let carry = 0;
  let stopped = false;
  const quiet = () => isQuiet(preference(), systemReduces);

  const render = () => {
    if (ctx) drawWorkshop(ctx, w, path);
    onStatus?.(announcement(w), saved);
  };
  const playing = () => !!w.run && !w.run.outcome && !w.paused;
  const loop = (now: number) => {
    frame = 0;
    const elapsed = last === undefined ? 0 : (now - last) / 1000;
    last = now;
    carry = advancePlayback(w, path, length, elapsed, carry);
    render();
    if (playing()) frame = host.requestAnimationFrame(loop);
  };
  /** Draws now, and keeps frames coming only while the train is moving. */
  const update = () => {
    render();
    if (!playing() && frame) {
      host.cancelAnimationFrame(frame);
      frame = 0;
    } else if (playing() && !frame && !stopped) {
      last = undefined;
      carry = 0;
      frame = host.requestAnimationFrame(loop);
    }
  };
  const layoutChanged = () => {
    path = trackPath(w.points);
    length = pathLength(path);
    saved = store.save(w.points);
  };

  const act = (action: CoasterAction) => {
    if (stopped) return;
    const before = w.points;
    if (action === 'previous') select(w, -1);
    else if (action === 'next') select(w, 1);
    else if (action === 'up') adjust(w, -NUDGE);
    else if (action === 'down') adjust(w, NUDGE);
    else if (action === 'undo') undo(w);
    else if (action === 'reset') resetLayout(w);
    else if (action === 'test') startTest(w, quiet());
    else if (action === 'pause') togglePause(w);
    else if (action === 'step') stepOnce(w, path, length);
    else if (action === 'escape' && !stopTest(w)) return onExit();
    if (w.points !== before) layoutChanged();
    update();
  };

  const toCanvas = (event: PointerEvent): Point => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * HEIGHT,
    };
  };
  const onDown = (event: Event) => {
    press(w, toCanvas(event as PointerEvent));
    update();
  };
  const onMove = (event: Event) => {
    if (!w.dragging) return;
    const before = w.points;
    dragTo(w, toCanvas(event as PointerEvent).y);
    if (w.points !== before) layoutChanged();
    update();
  };
  const onUp = () => release(w);
  const onKeyDown = (event: Event) => {
    const e = event as KeyboardEvent;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const action = keyAction(e.key);
    if (!action) return;
    e.preventDefault();
    act(action);
  };

  canvas.addEventListener('pointerdown', onDown);
  host.addEventListener('pointermove', onMove);
  host.addEventListener('pointerup', onUp);
  host.addEventListener('keydown', onKeyDown);
  const stopWatching = watchReducedMotion(host, (reduces) => {
    systemReduces = reduces;
    // Quiet can switch on mid-test: show the outcome and static dots instead.
    if (quiet() && playing()) {
      showStatic(w);
      update();
    }
  });
  update();

  return {
    act,
    stop() {
      if (stopped) return;
      stopped = true;
      host.cancelAnimationFrame(frame);
      frame = 0;
      stopWatching();
      canvas.removeEventListener('pointerdown', onDown);
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerup', onUp);
      host.removeEventListener('keydown', onKeyDown);
    },
  };
}

export const coasterStore = createCoasterStore(browserSaveStorage());
