import { canvasFont, recordScore, theme, type CarnivalGame } from '../../carnival';

const { width: WIDTH, height: HEIGHT } = theme.canvas;

export const COLS = 4;
export const ROWS = 3;
export const PAIRS = 6;
/** Seconds a mismatched pair stays face up before both cards close. */
export const MISMATCH_TIME = 1;
/** The score for a perfect round, where every move finds a pair. */
export const MAX_SCORE = 300;
/** Points lost for each move beyond the perfect six. */
export const MOVE_PENALTY = 10;
/** Seconds a peek shows every unmatched card. */
export const PEEK_TIME = 1.5;
/** Points taken off the final score when the round's one peek was used. */
export const PEEK_PENALTY = 20;

/** The six carnival symbols. Each card shows the symbol's shape, name and number. */
export const SYMBOLS = ['Balloon', 'Star', 'Tent', 'Ticket', 'Heart', 'Lollipop'] as const;

/** A random number in [0, 1). Injected so tests can choose the shuffle. */
export type Rng = () => number;

export interface Card {
  /** Index into SYMBOLS. */
  symbol: number;
  matched: boolean;
}

export interface MemoryState {
  cards: Card[];
  phase: 'ready' | 'playing' | 'over';
  /** Indices of the cards face up but not yet matched: zero, one or two. */
  open: number[];
  /** Seconds left before a mismatched pair closes; 0 when nothing is resolving. */
  resolveIn: number;
  /** Pair attempts this round: every second card flipped is one move. */
  moves: number;
  matches: number;
  /** The keyboard's selected card. */
  cursor: number;
  /** Set once the round's score has been handed to the score board. */
  scoreRecorded: boolean;
  /** The round's one peek: still available, used, or not. */
  peekUsed: boolean;
  /** Seconds left in the peek showing every card; 0 when no peek is showing. */
  peekIn: number;
  /** The last try's outcome and the symbol it found or the first card's symbol, for feedback. */
  lastTry?: { result: 'match' | 'miss'; symbol: number };
  rng: Rng;
}

/** A small seeded generator (mulberry32), so a seed always gives the same deal. */
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

/** Two of each symbol, shuffled with `rng` (Fisher-Yates). */
export function deal(rng: Rng): Card[] {
  const symbols = Array.from({ length: PAIRS * 2 }, (_, i) => i % PAIRS);
  for (let i = symbols.length - 1; i > 0; i--) {
    const j = Math.min(Math.floor(rng() * (i + 1)), i);
    [symbols[i], symbols[j]] = [symbols[j], symbols[i]];
  }
  return symbols.map((symbol) => ({ symbol, matched: false }));
}

export function createState(rng: Rng = Math.random): MemoryState {
  return {
    cards: deal(rng),
    phase: 'ready',
    open: [],
    resolveIn: 0,
    moves: 0,
    matches: 0,
    cursor: 0,
    scoreRecorded: false,
    peekUsed: false,
    peekIn: 0,
    rng,
  };
}

/** Starts the round. Returns false unless the round is waiting to start. */
export function startRound(state: MemoryState): boolean {
  if (state.phase !== 'ready') return false;
  state.phase = 'playing';
  return true;
}

/** The score for finishing in `moves` moves: 300, less 10 for each move beyond 6. */
export function scoreFor(moves: number): number {
  return Math.max(0, MAX_SCORE - MOVE_PENALTY * (moves - PAIRS));
}

/** Whether card `index` is showing its face. */
export function isFaceUp(state: MemoryState, index: number): boolean {
  return state.cards[index]?.matched === true || state.open.includes(index);
}

/**
 * Flips card `index`. The second card of a try counts one move: a pair stays
 * face up, a mismatch stays visible for MISMATCH_TIME and then closes. A card
 * already face up, or any card while a mismatch is showing, is ignored.
 */
export function flip(
  state: MemoryState,
  index: number,
): 'flipped' | 'match' | 'mismatch' | 'ignored' {
  const card = state.cards[index];
  if (state.phase !== 'playing' || !card || state.resolveIn > 0 || state.peekIn > 0) {
    return 'ignored';
  }
  if (isFaceUp(state, index)) return 'ignored';
  state.open.push(index);
  if (state.open.length === 1) return 'flipped';

  state.moves += 1;
  const [a, b] = state.open;
  if (state.cards[a].symbol === state.cards[b].symbol) {
    state.cards[a].matched = true;
    state.cards[b].matched = true;
    state.open = [];
    state.matches += 1;
    state.lastTry = { result: 'match', symbol: state.cards[a].symbol };
    if (state.matches === PAIRS) state.phase = 'over';
    return 'match';
  }
  state.resolveIn = MISMATCH_TIME;
  state.lastTry = { result: 'miss', symbol: state.cards[a].symbol };
  return 'mismatch';
}

/** Whether card `index` is drawn face up: face up, or shown by a peek. */
export function isShown(state: MemoryState, index: number): boolean {
  return state.peekIn > 0 || isFaceUp(state, index);
}

/**
 * Uses the round's one peek: every card shows for PEEK_TIME, then the board is
 * exactly as before. Returns false, and changes nothing, unless the round is
 * playing, the peek is unused and no mismatched pair is waiting to close.
 */
export function peek(state: MemoryState): boolean {
  if (state.phase !== 'playing' || state.peekUsed || state.resolveIn > 0) return false;
  state.peekUsed = true;
  state.peekIn = PEEK_TIME;
  return true;
}

/** Whether a key press is the peek key: P. */
export function isPeekKey(key: string): boolean {
  return key === 'p' || key === 'P';
}

/**
 * Advances the round by `dt` seconds, ending a peek or closing a mismatched
 * pair when its time is up.
 */
export function step(state: MemoryState, dt: number): void {
  if (state.phase !== 'playing') return;
  if (state.peekIn > 0) state.peekIn = Math.max(state.peekIn - dt, 0);
  if (state.resolveIn <= 0) return;
  state.resolveIn = Math.max(state.resolveIn - dt, 0);
  if (state.resolveIn === 0) state.open = [];
}

/** The score for `moves` moves, less PEEK_PENALTY if the peek was used, never below 0. */
export function scoreWithPeek(moves: number, peekUsed: boolean): number {
  return Math.max(0, scoreFor(moves) - (peekUsed ? PEEK_PENALTY : 0));
}

/**
 * The forecast final score: what the round would score if every pair still
 * hidden were matched with one move each from here, less the peek if used.
 * Not yet earned: every further miss lowers it by MOVE_PENALTY.
 */
export function forecastScore(moves: number, matches: number, peekUsed: boolean): number {
  return scoreWithPeek(moves + Math.max(PAIRS - matches, 0), peekUsed);
}

/** Pairs still to find. */
export function pairsLeft(state: MemoryState): number {
  return PAIRS - state.matches;
}

/** One short line on the last try, or undefined before the first try. */
export function lastTryText(state: MemoryState): string | undefined {
  const last = state.lastTry;
  if (!last) return undefined;
  const name = SYMBOLS[last.symbol];
  return last.result === 'match'
    ? `Match: ${name} pair found`
    : `Miss: no pair for ${name} (-${MOVE_PENALTY} forecast)`;
}

/** The round's score once it is over, else 0. */
export function finalScore(state: MemoryState): number {
  return state.phase === 'over' ? scoreWithPeek(state.moves, state.peekUsed) : 0;
}

/**
 * The round's final score the first time it is asked for after the round ends,
 * and undefined before that and every time after, so the score is saved once.
 */
export function takeFinalScore(state: MemoryState): number | undefined {
  if (state.phase !== 'over' || state.scoreRecorded) return undefined;
  state.scoreRecorded = true;
  return finalScore(state);
}

/**
 * Hands the final score to `record` once, when the round ends. A failed save is
 * reported and returned instead of thrown, so the results still show and the
 * game can be played again.
 */
export function saveFinalScore(state: MemoryState, record: (score: number) => void): unknown {
  const score = takeFinalScore(state);
  if (score === undefined) return undefined;
  try {
    record(score);
  } catch (error) {
    console.error('Memory Menagerie could not save the score', error);
    return error;
  }
  return undefined;
}

/**
 * Starts a round from the ready or results screen. Returns the state that is
 * now playing: a fresh, newly shuffled one after a finished round.
 */
export function beginRound(
  state: MemoryState,
  fresh: () => MemoryState = () => createState(state.rng),
): MemoryState {
  const next = state.phase === 'over' ? fresh() : state;
  startRound(next);
  return next;
}

/** Moves the keyboard cursor one card in a direction, stopping at the grid's edge. */
export function moveCursor(state: MemoryState, dx: number, dy: number): void {
  const col = Math.min(Math.max((state.cursor % COLS) + dx, 0), COLS - 1);
  const row = Math.min(Math.max(Math.floor(state.cursor / COLS) + dy, 0), ROWS - 1);
  state.cursor = row * COLS + col;
}

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/** The cursor direction for an arrow key, if it is one. */
export function arrowFor(key: string): [number, number] | undefined {
  return ARROWS[key];
}

const PAGE_CONTROLS = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY'];

/** Whether the focused element is a link or control that should keep its keys. */
export function isPageControl(focusedTag?: string): boolean {
  return focusedTag !== undefined && PAGE_CONTROLS.includes(focusedTag.toUpperCase());
}

/** Whether a key press is the action key: Space or Enter. */
export function isActionKey(code: string, key: string): boolean {
  return code === 'Space' || key === 'Enter';
}

const CARD_W = 140;
const CARD_H = 100;
const GAP = 14;
const GRID_X = (WIDTH - (COLS * CARD_W + (COLS - 1) * GAP)) / 2;
const GRID_Y = 84;
const BUTTON = { x: WIDTH / 2 - 110, y: HEIGHT - 82, w: 220, h: 52 } as const;
const PEEK_BUTTON = { x: WIDTH / 2 - 120, y: 46, w: 240, h: 32 } as const;

/** Where card `index` is drawn on the canvas. */
export function cardRect(index: number): { x: number; y: number; w: number; h: number } {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  return {
    x: GRID_X + col * (CARD_W + GAP),
    y: GRID_Y + row * (CARD_H + GAP),
    w: CARD_W,
    h: CARD_H,
  };
}

/** The card under canvas point (x, y), if any. */
export function cardAt(x: number, y: number): number | undefined {
  for (let i = 0; i < COLS * ROWS; i++) {
    const r = cardRect(i);
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
  }
  return undefined;
}

/** Whether canvas point (x, y) is on the Peek button. */
export function onPeekButton(x: number, y: number): boolean {
  const b = PEEK_BUTTON;
  return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
}

/** Whether canvas point (x, y) is on the Start or Play again button. */
export function onButton(x: number, y: number): boolean {
  return x >= BUTTON.x && x <= BUTTON.x + BUTTON.w && y >= BUTTON.y && y <= BUTTON.y + BUTTON.h;
}

function drawSymbol(ctx: CanvasRenderingContext2D, symbol: number, x: number, y: number) {
  const { colors } = theme;
  ctx.beginPath();
  switch (SYMBOLS[symbol]) {
    case 'Balloon':
      ctx.fillStyle = colors.danger;
      ctx.ellipse(x, y - 4, 14, 18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = colors.text;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y + 14);
      ctx.lineTo(x, y + 26);
      ctx.stroke();
      break;
    case 'Star':
      ctx.fillStyle = colors.accent;
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 20 : 8;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      break;
    case 'Tent':
      ctx.fillStyle = colors.stripeA;
      ctx.moveTo(x, y - 20);
      ctx.lineTo(x + 22, y + 18);
      ctx.lineTo(x - 22, y + 18);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = colors.stripeB;
      ctx.fillRect(x - 4, y + 4, 8, 14);
      break;
    case 'Ticket':
      ctx.fillStyle = colors.wood;
      ctx.fillRect(x - 22, y - 12, 44, 24);
      ctx.fillStyle = colors.surface;
      ctx.arc(x - 22, y, 6, 0, Math.PI * 2);
      ctx.arc(x + 22, y, 6, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'Heart':
      ctx.fillStyle = colors.danger;
      ctx.moveTo(x, y + 18);
      ctx.bezierCurveTo(x - 30, y - 4, x - 12, y - 24, x, y - 8);
      ctx.bezierCurveTo(x + 12, y - 24, x + 30, y - 4, x, y + 18);
      ctx.fill();
      break;
    case 'Lollipop':
      ctx.strokeStyle = colors.text;
      ctx.lineWidth = 3;
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 26);
      ctx.stroke();
      ctx.beginPath();
      ctx.fillStyle = colors.water;
      ctx.arc(x, y - 6, 14, 0, Math.PI * 2);
      ctx.fill();
      break;
  }
}

function draw(ctx: CanvasRenderingContext2D, state: MemoryState) {
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
  ctx.fillText(`Moves ${state.moves}`, 16, 70);
  ctx.textAlign = 'right';
  ctx.fillText(`Pairs ${state.matches} / ${PAIRS}, ${pairsLeft(state)} left`, WIDTH - 16, 70);

  if (state.phase === 'playing') {
    const b = PEEK_BUTTON;
    const ready = !state.peekUsed && state.resolveIn === 0;
    ctx.fillStyle = ready ? colors.stripeA : colors.surface;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = ready ? colors.text : colors.muted;
    ctx.font = canvasFont('small', 'bold');
    ctx.textAlign = 'center';
    const label =
      state.peekIn > 0
        ? 'Peeking...'
        : state.peekUsed
          ? `Peek used (-${PEEK_PENALTY})`
          : `Peek (P): 1 left, -${PEEK_PENALTY}`;
    ctx.fillText(label, b.x + b.w / 2, b.y + 22);
  }

  for (let i = 0; i < state.cards.length; i++) {
    const r = cardRect(i);
    const card = state.cards[i];
    if (isShown(state, i)) {
      ctx.fillStyle = card.matched ? colors.surface : colors.muted;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      drawSymbol(ctx, card.symbol, r.x + r.w / 2, r.y + 38);
      ctx.fillStyle = card.matched ? colors.text : colors.background;
      ctx.font = canvasFont('small', 'bold');
      ctx.textAlign = 'center';
      ctx.fillText(`${card.symbol + 1} ${SYMBOLS[card.symbol]}`, r.x + r.w / 2, r.y + r.h - 12);
      if (card.matched) {
        ctx.fillStyle = colors.accent;
        ctx.textAlign = 'right';
        ctx.fillText('PAIR', r.x + r.w - 8, r.y + 18);
      }
    } else {
      ctx.fillStyle = colors.stripeA;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = colors.stripeB;
      ctx.font = canvasFont('title', 'bold');
      ctx.textAlign = 'center';
      ctx.fillText('?', r.x + r.w / 2, r.y + r.h / 2 + 11);
    }
    if (state.phase === 'playing' && i === state.cursor) {
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 5;
      ctx.strokeRect(r.x - 5, r.y - 5, r.w + 10, r.h + 10);
    }
  }

  if (state.phase === 'playing') {
    ctx.font = canvasFont('small', 'bold');
    ctx.textAlign = 'left';
    ctx.fillStyle = colors.accent;
    ctx.fillText(
      `Forecast ${forecastScore(state.moves, state.matches, state.peekUsed)} (not earned yet): if each pair left matches first try`,
      GRID_X,
      440,
    );
    const feedback = lastTryText(state);
    if (feedback) {
      ctx.fillStyle = state.lastTry?.result === 'match' ? colors.text : colors.danger;
      ctx.fillText(feedback, GRID_X, 458);
    }
  }

  ctx.fillStyle = colors.muted;
  ctx.font = canvasFont('small');
  ctx.textAlign = 'center';
  if (state.phase === 'playing') {
    ctx.fillText(
      state.peekIn > 0
        ? 'Peeking: remember the cards. They turn back over in a moment.'
        : state.resolveIn > 0
          ? 'No match. The cards close in a moment.'
          : state.peekUsed
            ? 'Click or tap a card, or move with the arrow keys and press Space or Enter'
            : `Flip a card, or press P to peek at every card once for ${PEEK_TIME}s (costs ${PEEK_PENALTY})`,
      WIDTH / 2,
      HEIGHT - 24,
    );
  }

  if (state.phase !== 'playing') {
    ctx.fillStyle = colors.background;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(0, 80, WIDTH, HEIGHT - 80);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.fillStyle = colors.accent;
    ctx.font = canvasFont('title', 'bold');
    const title =
      state.phase === 'ready'
        ? 'Memory Menagerie'
        : `All pairs found! You scored ${finalScore(state)}`;
    ctx.fillText(title, WIDTH / 2, 190);
    ctx.fillStyle = colors.text;
    ctx.font = canvasFont('body');
    ctx.fillText(
      state.phase === 'ready'
        ? `Flip two cards at a time to find the ${PAIRS} matching pairs.`
        : `${state.moves} moves, ${state.matches} of ${PAIRS} pairs matched. ` +
            (state.peekUsed ? `Peek used: -${PEEK_PENALTY}.` : 'No peek used.'),
      WIDTH / 2,
      240,
    );
    ctx.fillText(
      `Each try is a move. ${PAIRS} moves scores ${MAX_SCORE}, each extra move costs ${MOVE_PENALTY}.`,
      WIDTH / 2,
      274,
    );
    ctx.fillText('Click a card, or use the arrow keys and Space or Enter.', WIDTH / 2, 308);
    ctx.fillText(
      `One optional peek (P) shows every card for ${PEEK_TIME}s and costs ${PEEK_PENALTY} points.`,
      WIDTH / 2,
      342,
    );

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

export const memoryMenagerie: CarnivalGame = {
  id: 'memory-menagerie',
  name: 'Memory Menagerie',
  description:
    'Flip cards two at a time to find six pairs of carnival symbols in as few moves as you can.',

  start(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;

    let state = createState();
    let last = performance.now();
    // Saved as soon as the last pair is found, so a quick replay or leaving the
    // booth before the next frame cannot drop the score.
    const save = () => saveFinalScore(state, (score) => recordScore(memoryMenagerie.id, score));

    const onDown = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * WIDTH;
      const y = ((event.clientY - rect.top) / rect.height) * HEIGHT;
      if (state.phase !== 'playing') {
        if (onButton(x, y)) state = beginRound(state);
        return;
      }
      if (onPeekButton(x, y)) {
        peek(state);
        return;
      }
      const card = cardAt(x, y);
      if (card !== undefined) {
        state.cursor = card;
        flip(state, card);
        save();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const target = event.target instanceof HTMLElement ? event.target : undefined;
      if (target?.isContentEditable || isPageControl(target?.tagName)) return;
      if (isActionKey(event.code, event.key)) {
        event.preventDefault();
        if (state.phase === 'playing') {
          flip(state, state.cursor);
          save();
        } else state = beginRound(state);
        return;
      }
      if (isPeekKey(event.key) && state.phase === 'playing') {
        event.preventDefault();
        peek(state);
        return;
      }
      const arrow = arrowFor(event.key);
      if (arrow && state.phase === 'playing') {
        event.preventDefault();
        moveCursor(state, arrow[0], arrow[1]);
      }
    };
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKeyDown);

    let frame = 0;
    const loop = (time: number) => {
      frame = requestAnimationFrame(loop);
      step(state, Math.max((time - last) / 1000, 0));
      last = time;
      draw(ctx, state);
    };
    frame = requestAnimationFrame(loop);

    return () => {
      save();
      cancelAnimationFrame(frame);
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  },
};
