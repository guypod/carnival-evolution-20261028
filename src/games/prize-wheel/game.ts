import { canvasFont, recordScore, theme, type CarnivalGame } from '../../carnival';

const { width: WIDTH, height: HEIGHT } = theme.canvas;

const TURN = Math.PI * 2;

/** Spins in a round. */
export const SPINS = 5;
/** Points on each segment, clockwise from the one under the pointer at the start. */
export const SEGMENTS = [10, 50, 25, 100, 10, 25, 50, 5] as const;
/** The angle each segment covers, in radians. */
export const SEGMENT_ANGLE = TURN / SEGMENTS.length;
/** How fast the wheel turns before the brake, in radians per second. */
export const SPIN_SPEED = TURN * 0.9;
/** How fast the brake slows the wheel, in radians per second per second. */
export const BRAKE = 4;

/** Theme colours for each segment's fill and its points, in turn around the wheel. */
export const SEGMENT_COLOURS = [
  { fill: 'stripeA', ink: 'text' },
  { fill: 'stripeB', ink: 'background' },
  { fill: 'surface', ink: 'text' },
  { fill: 'accent', ink: 'background' },
] as const;

export interface WheelState {
  phase: 'ready' | 'spinning' | 'braking' | 'result' | 'over';
  /** How far the wheel has turned clockwise, 0 up to one full turn. */
  angle: number;
  /** Radians per second, clockwise. */
  speed: number;
  /** Points for each spin landed so far. */
  spins: number[];
  /** Set once the round's total has been handed to the score board. */
  scoreRecorded: boolean;
}

export function createState(): WheelState {
  return { phase: 'ready', angle: 0, speed: 0, spins: [], scoreRecorded: false };
}

/** `angle` brought into one turn, 0 up to TURN. */
function normalize(angle: number): number {
  return ((angle % TURN) + TURN) % TURN;
}

/** The segment under the pointer at the top when the wheel has turned `angle` clockwise. */
export function segmentAt(angle: number): number {
  const index = Math.floor(normalize(-angle) / SEGMENT_ANGLE);
  return Math.min(index, SEGMENTS.length - 1);
}

/** Where a wheel at `angle` turning at `speed` comes to rest once braked. */
export function restingAngle(angle: number, speed: number): number {
  return normalize(angle + (speed * speed) / (2 * BRAKE));
}

export function total(state: WheelState): number {
  return state.spins.reduce((sum, points) => sum + points, 0);
}

/** Starts the wheel turning for the next spin. Returns false unless one can start. */
export function spin(state: WheelState): boolean {
  if (state.phase !== 'ready' && state.phase !== 'result') return false;
  state.speed = SPIN_SPEED;
  state.phase = 'spinning';
  return true;
}

/** Puts the brake on. Returns false unless the wheel is spinning freely. */
export function brake(state: WheelState): boolean {
  if (state.phase !== 'spinning') return false;
  state.phase = 'braking';
  return true;
}

/** Scores the segment under the pointer and ends the spin. */
function land(state: WheelState): void {
  state.speed = 0;
  state.spins.push(SEGMENTS[segmentAt(state.angle)]);
  state.phase = state.spins.length >= SPINS ? 'over' : 'result';
}

/** Advances the wheel by `dt` seconds. */
export function step(state: WheelState, dt: number): void {
  if (state.phase === 'spinning') {
    state.angle = normalize(state.angle + state.speed * dt);
  } else if (state.phase === 'braking') {
    if (state.speed <= BRAKE * dt) {
      // Stops within this step: rest exactly where the brake would have stopped it.
      state.angle = restingAngle(state.angle, state.speed);
      land(state);
    } else {
      state.angle = normalize(state.angle + (state.speed - (BRAKE * dt) / 2) * dt);
      state.speed -= BRAKE * dt;
    }
  }
}

/**
 * The one action: Start, Brake, Next spin or Play again, depending on the
 * phase. Returns the state now in play: a fresh, spinning one when a new
 * round starts. Does nothing while the wheel is braking.
 */
export function press(state: WheelState): WheelState {
  if (state.phase === 'over') {
    const next = createState();
    spin(next);
    return next;
  }
  if (!spin(state)) brake(state);
  return state;
}

/** What the action does now, or undefined while the wheel is braking. */
export function actionLabel(state: WheelState): string | undefined {
  switch (state.phase) {
    case 'ready':
      return 'Start';
    case 'spinning':
      return 'Brake!';
    case 'result':
      return 'Next spin';
    case 'over':
      return 'Play again';
    default:
      return undefined;
  }
}

/**
 * The total the first time it is asked for after the round ends, and
 * undefined before that and every time after, so the score is saved once.
 */
export function takeFinalScore(state: WheelState): number | undefined {
  if (state.phase !== 'over' || state.scoreRecorded) return undefined;
  state.scoreRecorded = true;
  return total(state);
}

const PAGE_CONTROLS = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY'];

/**
 * Whether a key press works the action: Space or Enter, unless a link or
 * control on the page has focus, so the key still activates that control.
 */
export function isActionKey(code: string, key: string, focusedTag?: string): boolean {
  if (focusedTag !== undefined && PAGE_CONTROLS.includes(focusedTag.toUpperCase())) return false;
  return code === 'Space' || key === 'Enter';
}

/** Adds the game's listeners and returns a function that removes them all. */
export function listen(
  canvas: EventTarget,
  win: EventTarget,
  handlers: {
    pointerdown: (event: PointerEvent) => void;
    keydown: (event: KeyboardEvent) => void;
  },
): () => void {
  const pairs: [EventTarget, string, EventListener][] = [
    [canvas, 'pointerdown', handlers.pointerdown as EventListener],
    [win, 'keydown', handlers.keydown as EventListener],
  ];
  for (const [target, type, fn] of pairs) target.addEventListener(type, fn);
  return () => {
    for (const [target, type, fn] of pairs) target.removeEventListener(type, fn);
  };
}

export const WHEEL = { x: 260, y: 280, radius: 190 } as const;

function draw(ctx: CanvasRenderingContext2D, state: WheelState) {
  const { colors } = theme;

  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const stripe = WIDTH / 16;
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = i % 2 === 0 ? colors.stripeA : colors.stripeB;
    ctx.fillRect(i * stripe, 0, stripe, 40);
  }

  // The wheel: segment i starts at the top, turned by the wheel's angle.
  ctx.fillStyle = colors.wood;
  ctx.beginPath();
  ctx.arc(WHEEL.x, WHEEL.y, WHEEL.radius + 10, 0, TURN);
  ctx.fill();
  SEGMENTS.forEach((points, i) => {
    const start = -Math.PI / 2 + state.angle + i * SEGMENT_ANGLE;
    const colour = SEGMENT_COLOURS[i % SEGMENT_COLOURS.length];
    ctx.fillStyle = colors[colour.fill];
    ctx.beginPath();
    ctx.moveTo(WHEEL.x, WHEEL.y);
    ctx.arc(WHEEL.x, WHEEL.y, WHEEL.radius, start, start + SEGMENT_ANGLE);
    ctx.closePath();
    ctx.fill();
    ctx.save();
    ctx.translate(WHEEL.x, WHEEL.y);
    ctx.rotate(start + SEGMENT_ANGLE / 2);
    ctx.fillStyle = colors[colour.ink];
    ctx.font = canvasFont('title', 'bold');
    ctx.textAlign = 'right';
    ctx.fillText(String(points), WHEEL.radius - 18, 11);
    ctx.restore();
  });
  ctx.fillStyle = colors.wood;
  ctx.beginPath();
  ctx.arc(WHEEL.x, WHEEL.y, 22, 0, TURN);
  ctx.fill();

  // The pointer at the top, pointing down into the wheel.
  const tipY = WHEEL.y - WHEEL.radius + 16;
  ctx.beginPath();
  ctx.moveTo(WHEEL.x - 16, tipY - 34);
  ctx.lineTo(WHEEL.x + 16, tipY - 34);
  ctx.lineTo(WHEEL.x, tipY);
  ctx.closePath();
  ctx.lineWidth = 4;
  ctx.strokeStyle = colors.background;
  ctx.stroke();
  ctx.fillStyle = colors.text;
  ctx.fill();
  ctx.lineWidth = 1;

  // The panel on the right: spins, total and what to do next.
  const mid = 620;
  ctx.textAlign = 'center';
  ctx.fillStyle = colors.accent;
  ctx.font = canvasFont('title', 'bold');
  ctx.fillText(state.phase === 'over' ? `Total ${total(state)}` : 'Prize Wheel', mid, 100);

  ctx.font = canvasFont('body', 'bold');
  ctx.fillStyle = colors.text;
  const shown = state.spins.map(String);
  while (shown.length < SPINS) shown.push('-');
  ctx.fillText(`Spins ${shown.join(' / ')}`, mid, 150);
  ctx.fillText(`Total ${total(state)}`, mid, 180);

  ctx.font = canvasFont('body');
  ctx.fillStyle = colors.muted;
  const message =
    state.phase === 'ready'
      ? `${SPINS} spins. Brake to land on points.`
      : state.phase === 'spinning'
        ? `Spin ${state.spins.length + 1} of ${SPINS}: brake now!`
        : state.phase === 'braking'
          ? 'Slowing down...'
          : `Landed on ${state.spins[state.spins.length - 1]} points`;
  ctx.fillText(message, mid, 240);

  const label = actionLabel(state);
  if (label) {
    ctx.fillStyle = colors.stripeA;
    ctx.fillRect(mid - 120, 300, 240, 52);
    ctx.fillStyle = colors.text;
    ctx.font = canvasFont('body', 'bold');
    ctx.fillText(`${label} (Space)`, mid, 333);
    ctx.fillStyle = colors.muted;
    ctx.font = canvasFont('small');
    ctx.fillText('or click or tap anywhere', mid, 380);
  }
}

export const prizeWheel: CarnivalGame = {
  id: 'prize-wheel',
  name: 'Prize Wheel',
  description: 'Five spins of the wheel. Brake at the right moment to land on the big numbers.',

  start(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    canvas.setAttribute(
      'aria-label',
      'Prize Wheel. Press Space or Enter, or click or tap, to start, brake the wheel, spin again and play again.',
    );

    let state = createState();
    const stopListening = listen(canvas, window, {
      pointerdown() {
        state = press(state);
      },
      keydown(event) {
        if (event.repeat) return;
        const target = event.target instanceof HTMLElement ? event.target : undefined;
        if (target?.isContentEditable) return;
        if (isActionKey(event.code, event.key, target?.tagName)) {
          event.preventDefault();
          state = press(state);
        }
      },
    });

    let frame = 0;
    let last = performance.now();
    const loop = (time: number) => {
      frame = requestAnimationFrame(loop);
      // Cap the step so a background tab doesn't spin the wheel on its own.
      const dt = Math.min(Math.max((time - last) / 1000, 0), 0.05);
      last = time;
      step(state, dt);
      const finalScore = takeFinalScore(state);
      if (finalScore !== undefined) recordScore(prizeWheel.id, finalScore);
      draw(ctx, state);
    };
    frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      stopListening();
    };
  },
};
