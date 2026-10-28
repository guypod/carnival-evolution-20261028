import { canvasFont, recordScore, theme, type CarnivalGame } from '../../carnival';

const { width: WIDTH, height: HEIGHT } = theme.canvas;

/** Swings in a round. */
export const SWINGS = 3;
/** Seconds for the power marker to sweep from one end of the meter and back. */
export const MARKER_PERIOD = 1.6;
/** Seconds the puck takes to rise to its height and settle. */
export const FLIGHT_TIME = 1.2;

/** Precision zones, by distance from the centre of the meter (0 to 1). */
export const ZONES = [
  { within: 0.05, points: 100, label: 'DING! Bell rung' },
  { within: 0.2, points: 75, label: 'Great swing' },
  { within: 0.45, points: 50, label: 'Good swing' },
  { within: 0.75, points: 25, label: 'Weak swing' },
  { within: 1, points: 10, label: 'Barely moved' },
] as const;

/** How a strike's timing compares with the centre of the meter. */
export type Timing = 'early' | 'perfect' | 'late';

/** Labels for each timing, short enough to sit beside the meter. */
export const TIMING_LABELS: Record<Timing, string> = {
  early: 'Early: wait a beat longer',
  perfect: 'Perfect timing',
  late: 'Late: strike a beat sooner',
};

/** One swing taken: where the marker stopped and what it scored. */
export interface Strike {
  /** Marker position when struck: -1 (left end) to 1 (right end). */
  position: number;
  /**
   * Signed distance from the centre along the marker's travel: negative before
   * the marker reached the centre (early), positive after it passed (late).
   */
  offset: number;
  points: number;
  timing: Timing;
}

export interface StrikerState {
  phase: 'ready' | 'aiming' | 'flying' | 'result' | 'over';
  /** Seconds the marker has been moving this swing. */
  markerTime: number;
  /** Seconds the puck has been flying this swing. */
  flyTime: number;
  /** Points for each swing taken so far. */
  swings: number[];
  /** Every swing taken so far, with its timing. */
  strikes: Strike[];
  /** Set once the round's total has been handed to the score board. */
  scoreRecorded: boolean;
}

export function createState(): StrikerState {
  return {
    phase: 'ready',
    markerTime: 0,
    flyTime: 0,
    swings: [],
    strikes: [],
    scoreRecorded: false,
  };
}

/** The marker's position at `time` seconds: -1 (left end) to 1 (right end), starting at the left. */
export function markerPosition(time: number): number {
  const t = (((time / MARKER_PERIOD) % 1) + 1) % 1;
  return t < 0.5 ? -1 + 4 * t : 3 - 4 * t;
}

/** Which way the marker is moving at `time` seconds: 1 to the right, -1 to the left. */
export function markerDirection(time: number): 1 | -1 {
  const t = (((time / MARKER_PERIOD) % 1) + 1) % 1;
  return t < 0.5 ? 1 : -1;
}

/**
 * The signed distance from the centre at `time` seconds, measured along the
 * marker's travel: negative before it reaches the centre, positive after.
 */
export function signedOffset(time: number): number {
  return markerPosition(time) * markerDirection(time);
}

/** Perfect inside the bell zone, otherwise early or late by the sign of `offset`. */
export function timingFor(offset: number): Timing {
  if (Math.abs(offset) <= ZONES[0].within) return 'perfect';
  return offset < 0 ? 'early' : 'late';
}

/** The zone a marker at `position` lands in. */
export function zoneFor(position: number) {
  const offset = Math.min(Math.abs(position), 1);
  return ZONES.find((z) => offset <= z.within) ?? ZONES[ZONES.length - 1];
}

/** Points, 10 to 100, for a strike with the marker at `position`. */
export function scoreFor(position: number): number {
  return zoneFor(position).points;
}

export function total(state: StrikerState): number {
  return state.swings.reduce((sum, s) => sum + s, 0);
}

/** Locks the marker and swings. Returns false unless the marker is moving. */
export function strike(state: StrikerState): boolean {
  if (state.phase !== 'aiming') return false;
  const position = markerPosition(state.markerTime);
  const offset = signedOffset(state.markerTime);
  const points = scoreFor(position);
  state.swings.push(points);
  state.strikes.push({ position, offset, points, timing: timingFor(offset) });
  state.flyTime = 0;
  state.phase = 'flying';
  return true;
}

/** The swing taken most recently, or undefined before the first. */
export function lastStrike(state: StrikerState): Strike | undefined {
  return state.strikes[state.strikes.length - 1];
}

/** The feedback line for a strike, such as "Great swing: 75 points. Late: strike a beat sooner". */
export function feedback(strike: Strike): string {
  const zone = zoneFor(strike.position);
  return `${zone.label}: ${strike.points} points. ${TIMING_LABELS[strike.timing]}`;
}

/** The highest-scoring swing (the first of any tie), or undefined before the first. */
export function bestSwing(state: StrikerState): { index: number; strike: Strike } | undefined {
  let best: { index: number; strike: Strike } | undefined;
  state.strikes.forEach((s, index) => {
    if (!best || s.points > best.strike.points) best = { index, strike: s };
  });
  return best;
}

/** One line per swing for the end screen, such as "Swing 2: 75 points, Late". */
export function breakdown(state: StrikerState): string[] {
  const best = bestSwing(state);
  return state.strikes.map((s, i) => {
    const timing = s.timing[0].toUpperCase() + s.timing.slice(1);
    const tag = best?.index === i ? ' (best)' : '';
    return `Swing ${i + 1}: ${s.points} points, ${timing}${tag}`;
  });
}

/** Starts the next swing from a result. Returns false anywhere else. */
export function nextSwing(state: StrikerState): boolean {
  if (state.phase !== 'result') return false;
  state.markerTime = 0;
  state.phase = 'aiming';
  return true;
}

/** Advances the round by `dt` seconds. */
export function step(state: StrikerState, dt: number): void {
  if (state.phase === 'aiming') state.markerTime += dt;
  if (state.phase === 'flying') {
    state.flyTime = Math.min(state.flyTime + dt, FLIGHT_TIME);
    if (state.flyTime >= FLIGHT_TIME) {
      state.phase = state.swings.length >= SWINGS ? 'over' : 'result';
    }
  }
}

/** How high the puck is, 0 (base) to 1 (bell), for the swing in flight. */
export function puckHeight(state: StrikerState): number {
  const last = state.swings[state.swings.length - 1];
  if (last === undefined || state.phase === 'ready' || state.phase === 'aiming') return 0;
  const peak = last / 100;
  const t = state.flyTime / FLIGHT_TIME;
  // Up for the first 60% of the flight, then back down a little to rest.
  return t < 0.6 ? peak * Math.sin((t / 0.6) * (Math.PI / 2)) : peak;
}

/**
 * The total the first time it is asked for after the round ends, and
 * undefined before that and every time after, so the score is saved once.
 */
export function takeFinalScore(state: StrikerState): number | undefined {
  if (state.phase !== 'over' || state.scoreRecorded) return undefined;
  state.scoreRecorded = true;
  return total(state);
}

/**
 * Hands the total to `record` once, when the round ends. A failed save is
 * reported and returned instead of thrown, so the result still shows and the
 * game can be played again.
 */
export function saveFinalScore(state: StrikerState, record: (score: number) => void): unknown {
  const score = takeFinalScore(state);
  if (score === undefined) return undefined;
  try {
    record(score);
  } catch (error) {
    console.error('High Striker could not save the score', error);
    return error;
  }
  return undefined;
}

/**
 * Times the animation frames. `tick` gives the whole time since the last frame,
 * and `resume` restarts timing when a hidden tab comes back or a round starts,
 * so idle or hidden time never moves the marker.
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
 * The one action button: Start, Strike, Next swing or Play again, depending on
 * the phase. Returns the state that is now in play: a fresh one when a round
 * starts. The clock restarts whenever the marker or the puck starts moving.
 */
export function press(
  state: StrikerState,
  clock: ReturnType<typeof frameClock>,
  now: number,
): StrikerState {
  if (state.phase === 'ready' || state.phase === 'over') {
    const next = createState();
    next.phase = 'aiming';
    clock.resume(now);
    return next;
  }
  if (strike(state) || nextSwing(state)) clock.resume(now);
  return state;
}

/** The label on the action button, or undefined while the puck is flying. */
export function buttonLabel(state: StrikerState): string | undefined {
  switch (state.phase) {
    case 'ready':
      return 'Start (Space)';
    case 'aiming':
      return 'Strike! (Space)';
    case 'result':
      return 'Next swing (Space)';
    case 'over':
      return 'Play again (Space)';
    default:
      return undefined;
  }
}

const PAGE_CONTROLS = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY'];

/**
 * Whether a key press works the action button: Space or Enter, unless a link
 * or control on the page has focus, so the key still activates that control.
 */
export function isActionKey(code: string, key: string, focusedTag?: string): boolean {
  if (focusedTag !== undefined && PAGE_CONTROLS.includes(focusedTag.toUpperCase())) return false;
  return code === 'Space' || key === 'Enter';
}

/** Adds the game's listeners and returns a function that removes them all. */
export function listen(
  canvas: EventTarget,
  win: EventTarget,
  doc: EventTarget,
  handlers: {
    pointerdown: (event: PointerEvent) => void;
    keydown: (event: KeyboardEvent) => void;
    visibilitychange: () => void;
  },
): () => void {
  const pairs: [EventTarget, string, EventListener][] = [
    [canvas, 'pointerdown', handlers.pointerdown as EventListener],
    [win, 'keydown', handlers.keydown as EventListener],
    [doc, 'visibilitychange', handlers.visibilitychange as EventListener],
  ];
  for (const [target, type, fn] of pairs) target.addEventListener(type, fn);
  return () => {
    for (const [target, type, fn] of pairs) target.removeEventListener(type, fn);
  };
}

const BUTTON = { x: WIDTH - 280, y: HEIGHT - 90, w: 240, h: 52 } as const;
const TOWER = { x: 140, top: 90, bottom: HEIGHT - 60, w: 40 } as const;
const METER = { x: 300, y: 300, w: 440, h: 36 } as const;

function onButton(x: number, y: number) {
  return x >= BUTTON.x && x <= BUTTON.x + BUTTON.w && y >= BUTTON.y && y <= BUTTON.y + BUTTON.h;
}

function draw(ctx: CanvasRenderingContext2D, state: StrikerState) {
  const { colors } = theme;

  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const stripe = WIDTH / 16;
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = i % 2 === 0 ? colors.stripeA : colors.stripeB;
    ctx.fillRect(i * stripe, 0, stripe, 40);
  }

  // Tower, bell and puck.
  ctx.fillStyle = colors.wood;
  ctx.fillRect(TOWER.x, TOWER.top, TOWER.w, TOWER.bottom - TOWER.top);
  const rang = state.phase !== 'aiming' && state.swings[state.swings.length - 1] === 100;
  const height = puckHeight(state);
  ctx.fillStyle = rang && height >= 0.99 ? colors.accent : colors.muted;
  ctx.beginPath();
  ctx.arc(TOWER.x + TOWER.w / 2, TOWER.top - 10, 28, Math.PI, 0);
  ctx.fill();
  const puckY = TOWER.bottom - 20 - height * (TOWER.bottom - TOWER.top - 30);
  ctx.fillStyle = colors.danger;
  ctx.fillRect(TOWER.x - 10, puckY, TOWER.w + 20, 18);
  ctx.fillStyle = colors.surface;
  ctx.fillRect(TOWER.x - 40, TOWER.bottom, TOWER.w + 80, 20);

  ctx.fillStyle = colors.text;
  ctx.font = canvasFont('body', 'bold');
  ctx.textAlign = 'left';
  const shown = state.swings.map((s) => String(s));
  while (shown.length < SWINGS) shown.push('-');
  ctx.fillText(`Swings ${shown.join(' / ')}`, 300, 80);
  ctx.textAlign = 'right';
  ctx.fillText(`Total ${total(state)} / ${SWINGS * 100}`, WIDTH - 40, 80);

  // Power meter: zones drawn from the edges in, so the centre ends up brightest.
  const zoneColours = [
    colors.accent,
    colors.stripeA,
    colors.wood,
    colors.surface,
    colors.background,
  ];
  for (let i = ZONES.length - 1; i >= 0; i--) {
    const half = (ZONES[i].within * METER.w) / 2;
    ctx.fillStyle = zoneColours[i];
    ctx.fillRect(METER.x + METER.w / 2 - half, METER.y, half * 2, METER.h);
  }
  ctx.strokeStyle = colors.text;
  ctx.strokeRect(METER.x, METER.y, METER.w, METER.h);
  const struck = lastStrike(state);
  if (struck && state.phase !== 'aiming' && state.phase !== 'ready') {
    // Where the last strike landed stays on the meter while its puck flies.
    const sx = METER.x + ((struck.position + 1) / 2) * METER.w;
    ctx.fillStyle = colors.danger;
    ctx.fillRect(sx - 4, METER.y - 16, 8, METER.h + 32);
    ctx.strokeStyle = colors.text;
    ctx.strokeRect(sx - 4, METER.y - 16, 8, METER.h + 32);
  }
  if (state.phase === 'aiming') {
    const mx = METER.x + ((markerPosition(state.markerTime) + 1) / 2) * METER.w;
    ctx.fillStyle = colors.text;
    ctx.fillRect(mx - 3, METER.y - 12, 6, METER.h + 24);
  }

  ctx.textAlign = 'center';
  const mid = METER.x + METER.w / 2;
  ctx.font = canvasFont('small');
  ctx.fillStyle = colors.muted;
  ctx.fillText('Zones: centre 100 (bell), 75, 50, 25, edge 10', mid, METER.y + METER.h + 26);

  ctx.font = canvasFont('body');
  ctx.fillStyle = colors.text;
  let message = '';
  if (state.phase === 'ready') {
    ctx.fillStyle = colors.accent;
    ctx.font = canvasFont('title', 'bold');
    ctx.fillText('High Striker', mid, 160);
    ctx.font = canvasFont('body');
    ctx.fillStyle = colors.text;
    message = `${SWINGS} swings. Strike when the marker is in the centre to ring the bell.`;
  } else if (state.phase === 'aiming') {
    message = `Swing ${state.swings.length + 1} of ${SWINGS}: press Space or Enter, click or tap Strike.`;
  } else if (struck) {
    message = feedback(struck);
    if (state.phase === 'over') {
      ctx.fillStyle = colors.accent;
      ctx.font = canvasFont('title', 'bold');
      ctx.fillText(`Total ${total(state)} of ${SWINGS * 100}`, mid, 160);
      ctx.font = canvasFont('body');
      ctx.fillStyle = colors.text;
    }
  }
  ctx.fillText(message, mid, 230);

  if (state.phase === 'over') {
    ctx.font = canvasFont('body');
    breakdown(state).forEach((line, i) => {
      ctx.fillStyle = line.endsWith('(best)') ? colors.accent : colors.text;
      ctx.fillText(line, mid, METER.y + METER.h + 70 + i * 30);
    });
  }

  const label = buttonLabel(state);
  if (label) {
    ctx.fillStyle = colors.stripeA;
    ctx.fillRect(BUTTON.x, BUTTON.y, BUTTON.w, BUTTON.h);
    ctx.fillStyle = colors.text;
    ctx.font = canvasFont('body', 'bold');
    ctx.fillText(label, BUTTON.x + BUTTON.w / 2, BUTTON.y + 33);
  }
}

export const highStriker: CarnivalGame = {
  id: 'high-striker',
  name: 'High Striker',
  description: 'Three swings of the mallet. Strike on the centre of the meter to ring the bell.',

  start(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    canvas.setAttribute(
      'aria-label',
      'High Striker. Press Space or Enter, or click the button, to start, strike, take the next swing and play again.',
    );

    let state = createState();
    const clock = frameClock(performance.now());
    const act = () => {
      state = press(state, clock, performance.now());
    };

    const stopListening = listen(canvas, window, document, {
      pointerdown(event) {
        const rect = canvas.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * WIDTH;
        const y = ((event.clientY - rect.top) / rect.height) * HEIGHT;
        if (onButton(x, y)) act();
      },
      keydown(event) {
        if (event.repeat) return;
        const target = event.target instanceof HTMLElement ? event.target : undefined;
        if (target?.isContentEditable) return;
        if (isActionKey(event.code, event.key, target?.tagName)) {
          event.preventDefault();
          act();
        }
      },
      visibilitychange() {
        if (!document.hidden) clock.resume(performance.now());
      },
    });

    let frame = 0;
    const loop = (time: number) => {
      frame = requestAnimationFrame(loop);
      step(state, clock.tick(time));
      saveFinalScore(state, (score) => recordScore(highStriker.id, score));
      draw(ctx, state);
    };
    frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      stopListening();
    };
  },
};
