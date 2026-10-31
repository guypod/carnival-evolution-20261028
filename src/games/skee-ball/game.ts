import { canvasFont, recordScore, theme, type CarnivalGame } from '../../carnival';

const { width: WIDTH, height: HEIGHT } = theme.canvas;

export const LANES = 3;
export const BALLS = 10;
/** Where on the ramp (0 at the bottom, 1 at the top) each lane's ring centre sits. */
export const TARGETS = [0.55, 0.75, 0.65] as const;
/** How far from the ring centre a ball may land for each score, inner ring first. */
export const RINGS = [
  { within: 0.04, points: 50 },
  { within: 0.09, points: 20 },
  { within: 0.15, points: 10 },
] as const;
/** Seconds for the power meter to sweep from empty to full. */
export const METER_SWEEP = 1.2;
/** Seconds a ball takes to roll up the ramp. */
export const FLIGHT_TIME = 0.9;
/** The most time one frame may advance, so a stalled tab never skips ahead. */
export const MAX_FRAME = 0.25;

export type Aim = 'under' | 'over' | 'on';

export interface SkeeState {
  phase: 'ready' | 'aiming' | 'rolling' | 'over';
  lane: number;
  /** Seconds the power meter has been running for this ball. */
  meterTime: number;
  /** The power the ball was released with, while it rolls and after. */
  power: number;
  /** 0 when released, 1 when the ball lands. */
  flight: number;
  ballsLeft: number;
  score: number;
  lastRoll: number | undefined;
  /** Whether the last ball had too little power, too much, or reached the centre ring. */
  lastAim: Aim | undefined;
  /** Where the last ball came to rest: its lane, distance up the ramp and the ring it dropped into. */
  lastBall: Landing | undefined;
  scoreRecorded: boolean;
  /** The last save threw. Only an explicit replay or exit tries again. */
  saveFailed: boolean;
}

export function createState(): SkeeState {
  return {
    phase: 'ready',
    lane: 1,
    meterTime: 0,
    power: 0,
    flight: 0,
    ballsLeft: BALLS,
    score: 0,
    lastRoll: undefined,
    lastAim: undefined,
    lastBall: undefined,
    scoreRecorded: false,
    saveFailed: false,
  };
}

/** The meter's power after `seconds`: it rises to 1 and falls back to 0, over and over. */
export function meterPower(seconds: number): number {
  const t = (Math.max(seconds, 0) / METER_SWEEP) % 2;
  return t <= 1 ? t : 2 - t;
}

/** Points for a ball released with `power` at `lane`'s rings. */
export function scoreRoll(lane: number, power: number): number {
  const off = Math.abs(power - TARGETS[clampLane(lane)]);
  for (const ring of RINGS) if (off <= ring.within + 1e-9) return ring.points;
  return 0;
}

/** Whether `power` falls short of, overshoots or lands in `lane`'s centre ring. */
export function aimFor(lane: number, power: number): Aim {
  const off = power - TARGETS[clampLane(lane)];
  if (Math.abs(off) <= RINGS[0].within + 1e-9) return 'on';
  return off < 0 ? 'under' : 'over';
}

export interface Landing {
  lane: number;
  /** How far up the ramp the ball stopped, 0 at the player end. */
  distance: number;
  /** Index into RINGS of the ring it dropped into, or undefined when it missed. */
  ring: number | undefined;
}

/** Where a ball released with `power` at `lane` comes to rest, and the ring it drops into. */
export function landingFor(lane: number, power: number): Landing {
  const l = clampLane(lane);
  const distance = ballDistance(power, 1);
  const off = Math.abs(distance - TARGETS[l]);
  const ring = RINGS.findIndex((r) => off <= r.within + 1e-9);
  return { lane: l, distance, ring: ring === -1 ? undefined : ring };
}

const AIM_TEXT: Record<Aim, string> = {
  under: 'Too little power',
  over: 'Too much power',
  on: 'Right on target',
};

/** Where the ball is on the ramp, 0 to its landing point, `flight` of the way there. */
export function ballDistance(power: number, flight: number): number {
  const t = Math.min(Math.max(flight, 0), 1);
  return power * (1 - (1 - t) * (1 - t));
}

export function clampLane(lane: number): number {
  return Math.min(Math.max(Math.round(lane), 0), LANES - 1);
}

/** Starts aiming the first ball. Returns false unless the round is waiting to start. */
export function startRound(state: SkeeState): boolean {
  if (state.phase !== 'ready') return false;
  state.phase = 'aiming';
  state.meterTime = 0;
  return true;
}

/** Picks the lane to aim at. Only while aiming, never mid-flight. */
export function setLane(state: SkeeState, lane: number): void {
  if (state.phase !== 'aiming') return;
  state.lane = clampLane(lane);
}

export function moveAim(state: SkeeState, by: -1 | 1): void {
  setLane(state, state.lane + by);
}

/** Releases the ball at the meter's current power. Returns false unless aiming. */
export function launch(state: SkeeState): boolean {
  if (state.phase !== 'aiming') return false;
  state.power = meterPower(state.meterTime);
  state.flight = 0;
  state.phase = 'rolling';
  return true;
}

function land(state: SkeeState): void {
  const points = scoreRoll(state.lane, state.power);
  state.score += points;
  state.lastRoll = points;
  state.lastAim = aimFor(state.lane, state.power);
  state.lastBall = landingFor(state.lane, state.power);
  state.ballsLeft -= 1;
  state.meterTime = 0;
  state.phase = state.ballsLeft === 0 ? 'over' : 'aiming';
}

/** Advances the meter or the rolling ball by `dt` seconds, at most MAX_FRAME. */
export function step(state: SkeeState, dt: number): void {
  const seconds = Math.min(Math.max(dt, 0), MAX_FRAME);
  if (state.phase === 'aiming') {
    state.meterTime += seconds;
  } else if (state.phase === 'rolling') {
    state.flight = Math.min(state.flight + seconds / FLIGHT_TIME, 1);
    if (state.flight >= 1) land(state);
  }
}

/**
 * Hands the final score to `record` once the round is over. The score counts as
 * saved only after `record` returns. A failed save is reported, not thrown, and
 * the frame loop does not try again; pass `retry` from an explicit replay or
 * exit to try once more.
 */
export function saveFinalScore(
  state: SkeeState,
  record: (score: number) => void,
  retry = false,
): unknown {
  if (state.phase !== 'over' || state.scoreRecorded) return undefined;
  if (state.saveFailed && !retry) return undefined;
  try {
    record(state.score);
  } catch (error) {
    if (!state.saveFailed) console.error('Skee Ball could not save the score', error);
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
export function beginRound(state: SkeeState, record: (score: number) => void): SkeeState {
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

/** What a key press does, or undefined when the game should leave it alone. */
export function keyAction(
  code: string,
  key: string,
  focusedTag?: string,
): 'go' | 'left' | 'right' | undefined {
  if (isPageControl(focusedTag)) return undefined;
  if (code === 'Space' || key === 'Enter') return 'go';
  if (key === 'ArrowLeft') return 'left';
  if (key === 'ArrowRight') return 'right';
  return undefined;
}

const RAMP = { x: 220, y: 70, w: 360, h: 380 } as const;
const LANE_W = RAMP.w / LANES;
const METER = { x: 640, y: 120, w: 36, h: 280 } as const;
const BUTTON = { x: WIDTH / 2 - 110, y: 380, w: 220, h: 52 } as const;
/** The Roll button for pointer and touch players, clear of the ramp so a lane tap never rolls. */
const ROLL_BUTTON = { x: 600, y: 418, w: 180, h: 60 } as const;

export function laneCentre(lane: number): number {
  return RAMP.x + LANE_W * (lane + 0.5);
}

/** The lane under canvas x, or undefined outside the ramp. */
export function laneAt(x: number): number | undefined {
  if (x < RAMP.x || x >= RAMP.x + RAMP.w) return undefined;
  return clampLane(Math.floor((x - RAMP.x) / LANE_W));
}

/** Canvas y for a distance up the ramp. */
function rampY(distance: number): number {
  return RAMP.y + RAMP.h - distance * RAMP.h;
}

/** How much narrower the far end of the alley is drawn than the player end. */
const FAR_SCALE = 0.55;

/** The drawing scale at a distance up the alley: 1 at the player, FAR_SCALE at the top. */
function depthScale(distance: number): number {
  return 1 - (1 - FAR_SCALE) * Math.min(Math.max(distance, 0), 1);
}

/** Canvas x for a point `offset` lanes from the alley's middle, `distance` up it. */
function alleyX(offset: number, distance: number): number {
  return WIDTH / 2 + offset * LANE_W * depthScale(distance);
}

/** Where the ball is drawn at `distance` up `lane`, and how big. */
export function ballPosition(lane: number, distance: number): { x: number; y: number; r: number } {
  const d = Math.min(Math.max(distance, 0), 1);
  return { x: alleyX(clampLane(lane) - (LANES - 1) / 2, d), y: rampY(d), r: 12 * depthScale(d) };
}

/** The ellipse drawn for `lane`'s ring `ring` (an index into RINGS). */
export function ringEllipse(
  lane: number,
  ring: number,
): { x: number; y: number; rx: number; ry: number } {
  const l = clampLane(lane);
  const centre = TARGETS[l];
  const s = depthScale(centre);
  return {
    x: alleyX(l - (LANES - 1) / 2, centre),
    y: rampY(centre),
    rx: ((LANE_W / 2) * s - 6) * ((ring + 1) / RINGS.length),
    ry: RINGS[ring].within * RAMP.h,
  };
}

/** Whether a canvas point lies inside an ellipse. */
export function inEllipse(
  e: { x: number; y: number; rx: number; ry: number },
  x: number,
  y: number,
) {
  return ((x - e.x) / e.rx) ** 2 + ((y - e.y) / e.ry) ** 2 <= 1 + 1e-6;
}

function inside(box: { x: number; y: number; w: number; h: number }, x: number, y: number) {
  return x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;
}

export type PointerAction = { kind: 'begin' } | { kind: 'roll' } | { kind: 'lane'; lane: number };

/**
 * What a press at canvas (x, y) does: start or replay from the Start/Play again
 * button, roll from the Roll button while aiming, or pick the lane under it.
 * Undefined when the press lands on nothing, or the Roll button is pressed
 * while a ball is still rolling.
 */
export function pointerAction(state: SkeeState, x: number, y: number): PointerAction | undefined {
  if (state.phase === 'ready' || state.phase === 'over') {
    return inside(BUTTON, x, y) ? { kind: 'begin' } : undefined;
  }
  if (inside(ROLL_BUTTON, x, y)) return state.phase === 'aiming' ? { kind: 'roll' } : undefined;
  const lane = laneAt(x);
  if (lane !== undefined && y >= RAMP.y && y <= RAMP.y + RAMP.h) return { kind: 'lane', lane };
  return undefined;
}

function draw(ctx: CanvasRenderingContext2D, state: SkeeState) {
  const { colors } = theme;
  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const stripe = WIDTH / 16;
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = i % 2 === 0 ? colors.stripeA : colors.stripeB;
    ctx.fillRect(i * stripe, 0, stripe, 30);
  }

  ctx.fillStyle = colors.text;
  ctx.font = canvasFont('body', 'bold');
  ctx.textAlign = 'left';
  ctx.fillText(`Balls ${state.ballsLeft}`, 16, 60);
  ctx.fillText(`Total ${state.score}`, 16, 90);
  ctx.fillText(`Last roll ${state.lastRoll ?? '-'}`, 16, 120);
  if (state.lastAim) {
    ctx.fillStyle = state.lastAim === 'on' ? colors.accent : colors.muted;
    ctx.font = canvasFont('small', 'bold');
    ctx.fillText(AIM_TEXT[state.lastAim], 16, 145);
  }

  // The alley, drawn in perspective: wide at the player end, narrow at the top.
  const corner = (offset: number, distance: number) =>
    [alleyX(offset, distance), rampY(distance)] as const;
  const half = LANES / 2;
  const quad = (a: number, b: number) => {
    ctx.beginPath();
    ctx.moveTo(...corner(a, 0));
    ctx.lineTo(...corner(b, 0));
    ctx.lineTo(...corner(b, 1));
    ctx.lineTo(...corner(a, 1));
    ctx.closePath();
  };
  ctx.fillStyle = colors.surface;
  quad(-half - 0.15, half + 0.15);
  ctx.fill();
  ctx.fillStyle = colors.wood;
  quad(-half, half);
  ctx.fill();
  // Boards across the alley, closer together towards the top.
  ctx.strokeStyle = colors.background;
  ctx.globalAlpha = 0.25;
  ctx.lineWidth = 1;
  for (let i = 1; i < 10; i++) {
    const d = 1 - (1 - i / 10) ** 1.4;
    ctx.beginPath();
    ctx.moveTo(...corner(-half, d));
    ctx.lineTo(...corner(half, d));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (let lane = 0; lane < LANES; lane++) {
    const offset = lane - half;
    if (lane === state.lane && state.phase !== 'ready') {
      ctx.fillStyle = colors.text;
      ctx.globalAlpha = 0.15;
      quad(offset, offset + 1);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (lane > 0) {
      ctx.strokeStyle = colors.background;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(...corner(offset, 0));
      ctx.lineTo(...corner(offset, 1));
      ctx.stroke();
    }
    // Rings, outer first, as concentric holes at the lane's target.
    const ringColors = [colors.accent, colors.water, colors.muted];
    for (let ring = RINGS.length - 1; ring >= 0; ring--) {
      const e = ringEllipse(lane, ring);
      ctx.fillStyle = colors.background;
      ctx.beginPath();
      ctx.ellipse(e.x, e.y, e.rx, e.ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = ringColors[ring];
      ctx.lineWidth = 4;
      ctx.stroke();
    }
    const inner = ringEllipse(lane, 0);
    ctx.fillStyle = colors.accent;
    ctx.font = canvasFont('small', 'bold');
    ctx.textAlign = 'center';
    ctx.fillText('50', inner.x, inner.y + 5);
  }

  // The last ball, resting in the ring it scored, or short of the rings.
  if (state.lastBall && state.phase !== 'rolling') {
    const { lane, distance, ring } = state.lastBall;
    if (ring !== undefined) {
      const e = ringEllipse(lane, ring);
      ctx.strokeStyle = colors.text;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(e.x, e.y, e.rx + 3, e.ry + 3, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    const ball = ballPosition(lane, distance);
    ctx.fillStyle = colors.text;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = ring !== undefined ? colors.accent : colors.muted;
    ctx.font = canvasFont('body', 'bold');
    ctx.textAlign = 'left';
    ctx.fillText(`${state.lastRoll ?? 0}`, ball.x + ball.r + 6, ball.y + 6);
  }

  // The power meter, with each lane's 50 band marked for the chosen lane.
  ctx.fillStyle = colors.surface;
  ctx.fillRect(METER.x, METER.y, METER.w, METER.h);
  const target = TARGETS[state.lane];
  const inner = RINGS[0].within;
  ctx.fillStyle = colors.accent;
  ctx.globalAlpha = 0.5;
  ctx.fillRect(METER.x, METER.y + METER.h * (1 - target - inner), METER.w, METER.h * inner * 2);
  ctx.globalAlpha = 1;
  const power = state.phase === 'aiming' ? meterPower(state.meterTime) : state.power;
  ctx.fillStyle = colors.stripeA;
  ctx.fillRect(METER.x - 6, METER.y + METER.h * (1 - power) - 3, METER.w + 12, 6);
  ctx.fillStyle = colors.text;
  ctx.font = canvasFont('small');
  ctx.textAlign = 'center';
  ctx.fillText('Power', METER.x + METER.w / 2, METER.y - 10);

  if (state.phase === 'rolling') {
    const ball = ballPosition(state.lane, ballDistance(state.power, state.flight));
    ctx.fillStyle = colors.background;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.ellipse(ball.x, ball.y + ball.r * 0.7, ball.r, ball.r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = colors.text;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fill();
  }

  if (state.phase === 'aiming' || state.phase === 'rolling') {
    ctx.fillStyle = colors.muted;
    ctx.font = canvasFont('small');
    ctx.textAlign = 'left';
    ctx.fillText('Left/Right or tap', 16, 420);
    ctx.fillText('a lane to aim.', 16, 440);
    ctx.fillText('Space/Enter or Roll.', 16, 460);

    const ready = state.phase === 'aiming';
    ctx.fillStyle = ready ? colors.stripeA : colors.surface;
    ctx.fillRect(ROLL_BUTTON.x, ROLL_BUTTON.y, ROLL_BUTTON.w, ROLL_BUTTON.h);
    ctx.fillStyle = ready ? colors.text : colors.muted;
    ctx.font = canvasFont('title', 'bold');
    ctx.textAlign = 'center';
    ctx.fillText('Roll', ROLL_BUTTON.x + ROLL_BUTTON.w / 2, ROLL_BUTTON.y + 41);
  } else {
    ctx.fillStyle = colors.background;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(0, 30, WIDTH, HEIGHT - 30);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.fillStyle = colors.accent;
    ctx.font = canvasFont('title', 'bold');
    const title = state.phase === 'ready' ? 'Skee Ball' : `Round over! You scored ${state.score}`;
    ctx.fillText(title, WIDTH / 2, 150);
    ctx.fillStyle = colors.text;
    ctx.font = canvasFont('body');
    if (state.phase === 'ready') {
      ctx.fillText(`Roll ${BALLS} balls. Pick a lane, then stop the power meter.`, WIDTH / 2, 210);
      ctx.fillText(
        'Land in the rings: 50 centre, 20 middle, 10 outer, 0 for a miss.',
        WIDTH / 2,
        250,
      );
      ctx.fillText(
        'Tap a lane or use Left/Right to aim. Press Roll, Space or Enter to roll.',
        WIDTH / 2,
        290,
      );
    } else if (state.saveFailed) {
      ctx.fillStyle = colors.danger;
      ctx.fillText('Your score could not be saved.', WIDTH / 2, 230);
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

export const skeeBall: CarnivalGame = {
  id: 'skee-ball',
  name: 'Skee Ball',
  description: 'Pick a lane and stop the power meter to roll ten balls into the scoring rings.',

  start(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;

    const record = (score: number) => recordScore(skeeBall.id, score);
    let state = createState();
    let last = performance.now();
    const begin = () => {
      state = beginRound(state, record);
      last = performance.now();
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
      else if (action.kind === 'roll') launch(state);
      else setLane(state, action.lane);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const target = event.target instanceof HTMLElement ? event.target : undefined;
      if (target?.isContentEditable) return;
      const action = keyAction(event.code, event.key, target?.tagName);
      if (!action) return;
      event.preventDefault();
      if (action === 'go') {
        if (state.phase === 'ready' || state.phase === 'over') begin();
        else launch(state);
      } else {
        moveAim(state, action === 'left' ? -1 : 1);
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
