import { afterEach, describe, expect, it, vi } from 'vitest';
import { theme, topScores } from '../../carnival';
import {
  COLS,
  MISMATCH_TIME,
  PAIRS,
  PEEK_PENALTY,
  PEEK_TIME,
  ROWS,
  SYMBOLS,
  arrowFor,
  beginRound,
  cardAt,
  cardRect,
  createState,
  deal,
  finalScore,
  forecastScore,
  lastTryText,
  pairsLeft,
  flip,
  isActionKey,
  isFaceUp,
  isPageControl,
  isPeekKey,
  isShown,
  memoryMenagerie,
  moveCursor,
  onButton,
  onPeekButton,
  peek,
  saveFinalScore,
  scoreFor,
  scoreWithPeek,
  seededRng,
  startRound,
  step,
  takeFinalScore,
  type MemoryState,
} from './game';

/** A started round dealt from `seed`. */
function playing(seed = 1): MemoryState {
  const state = createState(seededRng(seed));
  startRound(state);
  return state;
}

/** The two card indices holding each symbol. */
function pairsOf(state: MemoryState): [number, number][] {
  return Array.from({ length: PAIRS }, (_, s) => {
    const [a, b] = state.cards.flatMap((c, i) => (c.symbol === s ? [i] : []));
    return [a, b];
  });
}

/** A card index whose symbol differs from card `index`'s. */
function otherThan(state: MemoryState, index: number): number {
  return state.cards.findIndex((c) => c.symbol !== state.cards[index].symbol);
}

function solve(state: MemoryState) {
  for (const [a, b] of pairsOf(state)) {
    flip(state, a);
    flip(state, b);
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('memory menagerie', () => {
  it('deals two of each of six symbols on a 4 by 3 grid', () => {
    expect(SYMBOLS).toHaveLength(PAIRS);
    const cards = deal(seededRng(3));
    expect(cards).toHaveLength(COLS * ROWS);
    for (let s = 0; s < PAIRS; s++) {
      expect(cards.filter((c) => c.symbol === s)).toHaveLength(2);
    }
    expect(cards.every((c) => !c.matched)).toBe(true);
  });

  it('shuffles with the injected rng', () => {
    const order = (seed: number) => deal(seededRng(seed)).map((c) => c.symbol);
    expect(order(7)).toEqual(order(7));
    expect(order(7)).not.toEqual(order(8));
    // An rng that always picks the last card leaves the deal in order.
    expect(deal(() => 0.999).map((c) => c.symbol)).toEqual([0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5]);
  });

  it('waits for Start before any card flips', () => {
    const state = createState(seededRng(1));
    expect(state.phase).toBe('ready');
    expect(flip(state, 0)).toBe('ignored');
    expect(isFaceUp(state, 0)).toBe(false);
    expect(startRound(state)).toBe(true);
    expect(startRound(state)).toBe(false);
    expect(flip(state, 0)).toBe('flipped');
  });

  it('keeps a matched pair face up and counts one move', () => {
    const state = playing();
    const [a, b] = pairsOf(state)[0];
    expect(flip(state, a)).toBe('flipped');
    expect(state.moves).toBe(0);
    expect(flip(state, b)).toBe('match');
    expect(state.moves).toBe(1);
    expect(state.matches).toBe(1);
    step(state, 5);
    expect(isFaceUp(state, a)).toBe(true);
    expect(isFaceUp(state, b)).toBe(true);
    expect(flip(state, a)).toBe('ignored');
  });

  it('shows a mismatch for about a second, then closes it', () => {
    const state = playing();
    const a = 0;
    const b = otherThan(state, a);
    flip(state, a);
    expect(flip(state, b)).toBe('mismatch');
    expect(state.moves).toBe(1);
    step(state, MISMATCH_TIME - 0.1);
    expect(isFaceUp(state, a)).toBe(true);
    expect(isFaceUp(state, b)).toBe(true);
    step(state, 0.1);
    expect(isFaceUp(state, a)).toBe(false);
    expect(isFaceUp(state, b)).toBe(false);
    expect(flip(state, a)).toBe('flipped');
  });

  it('blocks a third flip while a mismatch is showing', () => {
    const state = playing();
    const a = 0;
    const b = otherThan(state, a);
    flip(state, a);
    flip(state, b);
    const third = state.cards.findIndex((_, i) => i !== a && i !== b);
    expect(flip(state, third)).toBe('ignored');
    expect(isFaceUp(state, third)).toBe(false);
    expect(state.moves).toBe(1);
  });

  it('rejects the same card twice and matched cards', () => {
    const state = playing();
    expect(flip(state, 0)).toBe('flipped');
    expect(flip(state, 0)).toBe('ignored');
    expect(state.open).toEqual([0]);
    expect(state.moves).toBe(0);
    expect(flip(state, 99)).toBe('ignored');
  });

  it('counts a repeated mismatch as a new move each time', () => {
    const state = playing();
    const b = otherThan(state, 0);
    for (let i = 0; i < 3; i++) {
      flip(state, 0);
      flip(state, b);
      step(state, MISMATCH_TIME);
    }
    expect(state.moves).toBe(3);
    expect(state.matches).toBe(0);
  });

  it('scores 300 less 10 for each move beyond six, never below 0', () => {
    expect(scoreFor(6)).toBe(300);
    expect(scoreFor(7)).toBe(290);
    expect(scoreFor(20)).toBe(160);
    expect(scoreFor(36)).toBe(0);
    expect(scoreFor(50)).toBe(0);
  });

  it('completes after six matches and saves the score once', () => {
    const state = playing();
    const b = otherThan(state, 0);
    flip(state, 0);
    flip(state, b);
    step(state, MISMATCH_TIME);
    expect(takeFinalScore(state)).toBeUndefined();
    solve(state);
    expect(state.phase).toBe('over');
    expect(state.matches).toBe(PAIRS);
    expect(state.moves).toBe(7);
    expect(finalScore(state)).toBe(290);
    expect(flip(state, 0)).toBe('ignored');

    const record = vi.fn();
    expect(saveFinalScore(state, record)).toBeUndefined();
    expect(saveFinalScore(state, record)).toBeUndefined();
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(290);
  });

  it('reports a failed save without throwing, and can still replay', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const state = playing();
    solve(state);
    const boom = new Error('quota');
    expect(
      saveFinalScore(state, () => {
        throw boom;
      }),
    ).toBe(boom);
    expect(console.error).toHaveBeenCalled();
    const next = beginRound(state);
    expect(next.phase).toBe('playing');
  });

  it('replays with a fresh shuffle and a clean board', () => {
    const state = playing(5);
    const before = state.cards.map((c) => c.symbol);
    solve(state);
    const next = beginRound(state);
    expect(next).not.toBe(state);
    expect(next.phase).toBe('playing');
    expect(next.moves).toBe(0);
    expect(next.matches).toBe(0);
    expect(next.cards.every((c) => !c.matched)).toBe(true);
    expect(next.scoreRecorded).toBe(false);
    expect(next.cards.map((c) => c.symbol)).not.toEqual(before);
  });

  it('starts from ready without flipping a card', () => {
    const state = createState(seededRng(1));
    const next = beginRound(state);
    expect(next).toBe(state);
    expect(next.phase).toBe('playing');
    expect(next.open).toEqual([]);
    // Pressing the action again while playing does not restart the round.
    flip(next, 0);
    expect(beginRound(next)).toBe(next);
    expect(next.open).toEqual([0]);
  });

  it('moves the cursor with arrows and stops at the edges', () => {
    const state = playing();
    expect(arrowFor('ArrowRight')).toEqual([1, 0]);
    expect(arrowFor('a')).toBeUndefined();
    moveCursor(state, -1, -1);
    expect(state.cursor).toBe(0);
    moveCursor(state, 1, 0);
    moveCursor(state, 0, 1);
    expect(state.cursor).toBe(COLS + 1);
    for (let i = 0; i < 5; i++) moveCursor(state, 1, 1);
    expect(state.cursor).toBe(COLS * ROWS - 1);
  });

  it('leaves Space and Enter to a focused link or control', () => {
    expect(isActionKey('Space', ' ')).toBe(true);
    expect(isActionKey('Enter', 'Enter')).toBe(true);
    expect(isActionKey('KeyA', 'a')).toBe(false);
    expect(isPageControl('A')).toBe(true);
    expect(isPageControl('input')).toBe(true);
    expect(isPageControl('BODY')).toBe(false);
    expect(isPageControl(undefined)).toBe(false);
  });

  it('finds the card under a point, apart from the button', () => {
    for (let i = 0; i < COLS * ROWS; i++) {
      const r = cardRect(i);
      expect(cardAt(r.x + r.w / 2, r.y + r.h / 2)).toBe(i);
      expect(onButton(r.x + r.w / 2, r.y + r.h)).toBe(false);
    }
    expect(cardAt(0, 0)).toBeUndefined();
    expect(onButton(400, 440)).toBe(true);
  });

  it('cleans up its frame and listeners when stopped', () => {
    const added: string[] = [];
    const removed: string[] = [];
    const target = (where: string) => ({
      addEventListener: (type: string) => added.push(`${where}:${type}`),
      removeEventListener: (type: string) => removed.push(`${where}:${type}`),
    });
    const cancel = vi.fn();
    vi.stubGlobal('window', target('window'));
    vi.stubGlobal('performance', { now: () => 0 });
    vi.stubGlobal('requestAnimationFrame', () => 7);
    vi.stubGlobal('cancelAnimationFrame', cancel);
    const canvas = {
      ...target('canvas'),
      getContext: () => ({}),
      width: 0,
      height: 0,
    } as unknown as HTMLCanvasElement;

    const stop = memoryMenagerie.start(canvas);
    expect(added.length).toBeGreaterThan(0);
    stop();
    expect(cancel).toHaveBeenCalledWith(7);
    expect(removed.sort()).toEqual(added.sort());
  });

  it('saves a finished round when it ends, before any frame, even if replayed at once', () => {
    const listeners: Record<string, (event: unknown) => void> = {};
    const target = {
      addEventListener: (type: string, fn: (event: unknown) => void) => (listeners[type] = fn),
      removeEventListener: () => {},
    };
    vi.stubGlobal('window', target);
    vi.stubGlobal('HTMLElement', class {});
    vi.stubGlobal('performance', { now: () => 0 });
    vi.stubGlobal('requestAnimationFrame', () => 7);
    vi.stubGlobal('cancelAnimationFrame', () => {});
    vi.spyOn(Math, 'random').mockReturnValue(0.3);
    const { width, height } = theme.canvas;
    const canvas = {
      ...target,
      getContext: () => ({}),
      getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
      width: 0,
      height: 0,
    } as unknown as HTMLCanvasElement;
    const before = topScores('memory-menagerie', 50).length;

    const stop = memoryMenagerie.start(canvas);
    const click = (x: number, y: number) =>
      listeners.pointerdown({ clientX: x, clientY: y } as PointerEvent);
    const space = () =>
      listeners.keydown({ code: 'Space', key: ' ', repeat: false, preventDefault: () => {} });
    space();
    for (const pair of pairsOf({ cards: deal(() => 0.3) } as MemoryState)) {
      for (const i of pair) {
        const r = cardRect(i);
        click(r.x + r.w / 2, r.y + r.h / 2);
      }
    }
    space();
    stop();

    const saved = topScores('memory-menagerie', 50);
    expect(saved.length).toBe(before + 1);
    expect(saved.some((e) => e.score === scoreFor(PAIRS))).toBe(true);
  });
});

describe('peek', () => {
  it('shows every card for PEEK_TIME, then restores the board exactly', () => {
    const state = playing();
    const [[a, b], [c]] = pairsOf(state);
    flip(state, a);
    flip(state, b);
    flip(state, c);
    const before = structuredClone({
      cards: state.cards,
      open: state.open,
      moves: state.moves,
      matches: state.matches,
    });
    expect(peek(state)).toBe(true);
    for (let i = 0; i < state.cards.length; i++) expect(isShown(state, i)).toBe(true);
    step(state, PEEK_TIME - 0.01);
    expect(isShown(state, 0) && state.peekIn > 0).toBe(true);
    step(state, 0.02);
    expect(state.peekIn).toBe(0);
    expect({
      cards: state.cards,
      open: state.open,
      moves: state.moves,
      matches: state.matches,
    }).toEqual(before);
    const hidden = state.cards.findIndex((_, i) => !isFaceUp(state, i));
    expect(isShown(state, hidden)).toBe(false);
  });

  it('can be used once per round', () => {
    const state = playing();
    expect(peek(state)).toBe(true);
    step(state, PEEK_TIME);
    expect(peek(state)).toBe(false);
    expect(state.peekIn).toBe(0);
    expect(state.peekUsed).toBe(true);
  });

  it('blocks flipping while it shows, and the open card resumes after', () => {
    const state = playing();
    const [[a, b]] = pairsOf(state);
    flip(state, a);
    peek(state);
    expect(flip(state, b)).toBe('ignored');
    expect(state.open).toEqual([a]);
    step(state, PEEK_TIME);
    expect(flip(state, b)).toBe('match');
    expect(state.moves).toBe(1);
  });

  it('is refused while a mismatch is resolving, before the start and after the end', () => {
    const ready = createState(seededRng(1));
    expect(peek(ready)).toBe(false);

    const state = playing();
    const pairs = pairsOf(state);
    flip(state, pairs[0][0]);
    flip(state, pairs[1][0]);
    expect(state.resolveIn).toBeGreaterThan(0);
    expect(peek(state)).toBe(false);
    expect(state.peekUsed).toBe(false);

    step(state, MISMATCH_TIME);
    for (const [x, y] of pairs) {
      flip(state, x);
      flip(state, y);
    }
    expect(state.phase).toBe('over');
    expect(peek(state)).toBe(false);
    expect(state.peekUsed).toBe(false);
  });

  it('takes PEEK_PENALTY off the final score, never below 0', () => {
    expect(scoreWithPeek(PAIRS, false)).toBe(300);
    expect(scoreWithPeek(PAIRS, true)).toBe(300 - PEEK_PENALTY);
    expect(scoreWithPeek(34, true)).toBe(0);
    expect(scoreWithPeek(100, true)).toBe(0);

    const state = playing();
    peek(state);
    step(state, PEEK_TIME);
    for (const [x, y] of pairsOf(state)) {
      flip(state, x);
      flip(state, y);
    }
    expect(finalScore(state)).toBe(300 - PEEK_PENALTY);
    expect(takeFinalScore(state)).toBe(300 - PEEK_PENALTY);
  });

  it('is available again after Play again', () => {
    const state = playing();
    peek(state);
    step(state, PEEK_TIME);
    for (const [x, y] of pairsOf(state)) {
      flip(state, x);
      flip(state, y);
    }
    const next = beginRound(state);
    expect(next.phase).toBe('playing');
    expect(next.peekUsed).toBe(false);
    expect(next.peekIn).toBe(0);
    expect(peek(next)).toBe(true);
  });

  it('answers to P and its button', () => {
    expect(isPeekKey('p')).toBe(true);
    expect(isPeekKey('P')).toBe(true);
    expect(isPeekKey('o')).toBe(false);
    expect(onPeekButton(theme.canvas.width / 2, 60)).toBe(true);
    expect(onPeekButton(10, 60)).toBe(false);
    expect(cardAt(theme.canvas.width / 2, 60)).toBeUndefined();
  });
});

describe('forecast', () => {
  it('starts at the perfect score and holds while every try matches', () => {
    const state = playing();
    expect(forecastScore(state.moves, state.matches, state.peekUsed)).toBe(300);
    const [a, b] = pairsOf(state)[0];
    flip(state, a);
    flip(state, b);
    expect(forecastScore(state.moves, state.matches, state.peekUsed)).toBe(300);
    expect(pairsLeft(state)).toBe(PAIRS - 1);
  });

  it('drops by one move penalty for each miss', () => {
    const state = playing();
    flip(state, 0);
    flip(state, otherThan(state, 0));
    expect(forecastScore(state.moves, state.matches, state.peekUsed)).toBe(290);
    step(state, MISMATCH_TIME);
    flip(state, 0);
    flip(state, otherThan(state, 0));
    expect(forecastScore(state.moves, state.matches, state.peekUsed)).toBe(280);
  });

  it('takes off the peek cost once the peek is used', () => {
    const state = playing();
    peek(state);
    expect(forecastScore(state.moves, state.matches, state.peekUsed)).toBe(300 - PEEK_PENALTY);
  });

  it('never goes below 0', () => {
    expect(forecastScore(40, 0, true)).toBe(0);
    expect(forecastScore(30, 0, true)).toBe(0);
  });

  it('equals the final score when the round ends', () => {
    const state = playing();
    flip(state, 0);
    flip(state, otherThan(state, 0));
    step(state, MISMATCH_TIME);
    peek(state);
    step(state, PEEK_TIME);
    solve(state);
    expect(state.phase).toBe('over');
    expect(forecastScore(state.moves, state.matches, state.peekUsed)).toBe(finalScore(state));
    expect(pairsLeft(state)).toBe(0);
  });

  it('reports the last match or miss, and resets on replay', () => {
    const state = playing();
    expect(lastTryText(state)).toBeUndefined();
    flip(state, 0);
    flip(state, otherThan(state, 0));
    expect(lastTryText(state)).toBe(
      `Miss: no pair for ${SYMBOLS[state.cards[0].symbol]} (-10 forecast)`,
    );
    step(state, MISMATCH_TIME);
    const [a, b] = pairsOf(state)[2];
    flip(state, a);
    flip(state, b);
    expect(lastTryText(state)).toBe(`Match: ${SYMBOLS[2]} pair found`);
    solve(state);
    const next = beginRound(state);
    expect(lastTryText(next)).toBeUndefined();
  });
});
