import { canvasFont, recordScore, theme, type CarnivalGame } from '../../carnival';

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

/** A complete run scores more the closer its peak sits to the limit. */
export function scoreFor(run: Run) {
  if (run.outcome !== 'complete') return 0;
  return Math.round((run.peak / MAX_SPEED) * 100);
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

/** Turns a layout into a saved string. */
export function serializeLayout(points: readonly Point[]) {
  return JSON.stringify(points.map((p) => p.y));
}

/** Reads a saved layout back, or undefined when it is not a valid one. */
export function parseLayout(saved: string | null | undefined): Point[] | undefined {
  if (!saved) return undefined;
  let ys: unknown;
  try {
    ys = JSON.parse(saved);
  } catch {
    return undefined;
  }
  if (!Array.isArray(ys) || ys.length !== POINT_COUNT) return undefined;
  if (!ys.every((y) => typeof y === 'number' && Number.isFinite(y))) return undefined;
  return ys.map((y: number, i) => ({ x: pointX(i), y: clampY(y) }));
}

export interface Workshop {
  points: Point[];
  history: Point[][];
  selected: number;
  run?: Run;
  paused: boolean;
}

export function createWorkshop(points = starterLayout()): Workshop {
  return { points, history: [], selected: 1, paused: false };
}

/** Moves the selected point, keeping the old layout for undo. Clears any test run. */
export function adjust(w: Workshop, dy: number) {
  const next = nudge(w.points, w.selected, dy);
  if (next[w.selected].y === w.points[w.selected].y) return;
  w.history.push(w.points);
  w.points = next;
  w.run = undefined;
}

export function undo(w: Workshop) {
  const previous = w.history.pop();
  if (previous) {
    w.points = previous;
    w.run = undefined;
  }
}

/** Puts just this layout back to the starter. Undo can bring it back. */
export function resetLayout(w: Workshop) {
  w.history.push(w.points);
  w.points = starterLayout();
  w.run = undefined;
}

export function select(w: Workshop, delta: number) {
  w.selected = (w.selected + delta + POINT_COUNT) % POINT_COUNT;
}

/** Saved for this visit only, so the game never touches local storage. */
let savedLayout: string | undefined;

const KEYS_HELP =
  '←/→ pick point  ↑/↓ move  T test  P pause  S step  U undo  R reset  Esc stop test';

function draw(ctx: CanvasRenderingContext2D, w: Workshop, path: Point[], reduced: boolean) {
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
    if (reduced) {
      // Static samples of where the train was, instead of a moving train.
      const result = simulateSamples(w.points);
      ctx.fillStyle = colors.water;
      for (const p of result) {
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
  const status = run
    ? `${describeOutcome(run)}${!run.outcome && w.paused ? ' (paused)' : ''}  Speed ${Math.round(Math.abs(run.v))}`
    : 'Shape the track, then press T to test it.';
  ctx.fillText(status, 20, 66);
  ctx.font = canvasFont('small');
  ctx.fillStyle = colors.muted;
  ctx.fillText(KEYS_HELP, 20, HEIGHT - 14);
}

/** Every half second of a run, for the reduced-motion view. */
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

export const coasterWorkshop: CarnivalGame = {
  id: 'coaster-workshop',
  name: 'Coaster Workshop',
  description:
    'Shape a toy coaster track, then test whether the train finishes, stalls or goes too fast.',

  start(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    const w = createWorkshop(parseLayout(savedLayout) ?? starterLayout());
    let path = trackPath(w.points);
    let length = pathLength(path);
    let dragging = false;

    const changed = () => {
      path = trackPath(w.points);
      length = pathLength(path);
      savedLayout = serializeLayout(w.points);
    };
    const finish = () => {
      if (w.run?.outcome) recordScore(coasterWorkshop.id, scoreFor(w.run));
    };
    const test = () => {
      w.run = createRun();
      w.paused = false;
      if (reduced) {
        // No animation: show the outcome and static samples at once.
        w.run = simulate(w.points);
        finish();
      }
    };
    const toCanvas = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((event.clientX - rect.left) / rect.width) * WIDTH,
        y: ((event.clientY - rect.top) / rect.height) * HEIGHT,
      };
    };
    const onDown = (event: PointerEvent) => {
      const p = toCanvas(event);
      let best = 0;
      w.points.forEach((q, i) => {
        if (Math.abs(q.x - p.x) < Math.abs(w.points[best].x - p.x)) best = i;
      });
      w.selected = best;
      if (Math.hypot(w.points[best].x - p.x, w.points[best].y - p.y) < 30) {
        dragging = true;
        w.history.push(w.points);
      }
    };
    const onMove = (event: PointerEvent) => {
      if (!dragging) return;
      const p = toCanvas(event);
      w.points = nudge(w.points, w.selected, p.y - w.points[w.selected].y);
      w.run = undefined;
      changed();
    };
    const onUp = () => {
      dragging = false;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      let handled = true;
      if (key === 'arrowleft') select(w, -1);
      else if (key === 'arrowright') select(w, 1);
      else if (key === 'arrowup') adjust(w, -NUDGE);
      else if (key === 'arrowdown') adjust(w, NUDGE);
      else if (key === 'u') undo(w);
      else if (key === 'r') resetLayout(w);
      else if (key === 't') test();
      else if (key === 'p') w.paused = !w.paused;
      else if (key === 's') {
        if (!w.run) w.run = createRun();
        w.paused = true;
        w.run = stepRun(w.run, path, length);
        if (w.run.outcome) finish();
      } else if (key === 'escape') w.run = undefined;
      else handled = false;
      if (handled) {
        event.preventDefault();
        changed();
      }
    };
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKeyDown);

    let frame = 0;
    const loop = () => {
      if (w.run && !w.run.outcome && !w.paused && !reduced) {
        // Two fixed steps per frame keep the run deterministic.
        w.run = stepRun(stepRun(w.run, path, length), path, length);
        if (w.run.outcome) finish();
      }
      draw(ctx, w, path, reduced);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKeyDown);
    };
  },
};
