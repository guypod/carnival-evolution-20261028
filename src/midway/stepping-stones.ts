/**
 * The chime stones: a row of flat stones on the promenade, each marked with a
 * shape. Stand by them and press C, tap a stone or press Play call, and they
 * glow a short call one after another. Answer by stepping on the stones,
 * tapping them or pressing their buttons, in the same order. A wrong stone
 * just starts the answer again: there are no points and no timer, and nothing
 * is kept. With the midway's sound on, each stone also rings its own soft
 * note; with it off, the glow and the words beside the map are the whole
 * chime. In quiet mode nothing fades: the call shows at once as numbers on
 * the stones, and answered stones stay lit.
 */

import type { Point } from './world';

/** Seconds between one stone of the call and the next. */
export const CALL_STEP = 0.7;
/** Seconds a stone glows after it lights. */
export const GLOW_TIME = 0.8;
/** How close, in tiles, the player stands to hear the call. */
export const STONES_REACH = 1.8;
/** How close, in tiles, the player's feet are to a stone's centre to stand on it. */
export const STONE_RADIUS = 0.4;
/** The call the stones play, by stone index. */
export const CALL_PATTERN = [0, 2, 1, 3] as const;
/** Each stone's shape, by index, so a stone never depends on its colour. */
export const STONE_SHAPES = ['circle', 'triangle', 'square', 'diamond'] as const;
export type StoneShape = (typeof STONE_SHAPES)[number];
/** Each stone's name, by index, for the buttons and the words beside the map. */
export const STONE_NAMES = ['Circle', 'Triangle', 'Square', 'Diamond'] as const;
/** Each stone's shape as a character, for the buttons beside the map. */
export const STONE_MARKS = ['●', '▲', '■', '◆'] as const;
/** Each stone's note in hertz, by index: a soft pentatonic run, G A C E. */
export const STONE_TONES = [392, 440, 523.25, 659.25] as const;
/** How bright an answered stone stays until the answer starts again. */
export const ANSWERED_GLOW = 0.35;

export interface ChimeStones {
  stones: Point[];
  /** When the latest call started, on the stones' clock, or undefined before any. */
  calledAt: number | undefined;
  /** How many stones of the call the visitor has answered so far. */
  answered: number;
  /** When each stone was last touched, or undefined. */
  touchedAt: (number | undefined)[];
  /** When the whole call was answered, or undefined. */
  doneAt: number | undefined;
}

/** A zigzag of stones down the promenade from `anchor`, in tile coordinates. */
export function createStones(anchor: Point, count = 4): ChimeStones {
  const stones = Array.from({ length: count }, (_, i) => ({
    x: anchor.x + (i % 2) * 0.9,
    y: anchor.y + i * 0.9,
  }));
  return {
    stones,
    calledAt: undefined,
    answered: 0,
    touchedAt: stones.map(() => undefined),
    doneAt: undefined,
  };
}

/** Plays the call afresh and clears any answer in progress. */
export function playCall(stones: ChimeStones, now: number): ChimeStones {
  return { ...stones, calledAt: now, answered: 0, doneAt: undefined };
}

/** Whether the call is still playing at `now`. In quiet mode it shows at once. */
export function calling(stones: ChimeStones, now: number, quiet = false): boolean {
  if (quiet || stones.calledAt === undefined) return false;
  return now - stones.calledAt < CALL_PATTERN.length * CALL_STEP;
}

/**
 * Touches stone `i`. It always glows. Once the call has been played, the right
 * stone moves the answer on and a wrong one starts the answer again, counting
 * itself if it is the call's first stone.
 */
export function touchStone(
  stones: ChimeStones,
  i: number,
  now: number,
  quiet = false,
): ChimeStones {
  const touchedAt = stones.touchedAt.map((t, j) => (j === i ? now : t));
  if (stones.calledAt === undefined || stones.doneAt !== undefined || calling(stones, now, quiet)) {
    return { ...stones, touchedAt };
  }
  const answered =
    CALL_PATTERN[stones.answered] === i ? stones.answered + 1 : CALL_PATTERN[0] === i ? 1 : 0;
  const doneAt = answered === CALL_PATTERN.length ? now : undefined;
  return { ...stones, touchedAt, answered, doneAt };
}

/**
 * Taps stone `i` with a pointer. Before any call, or once the call has been
 * answered, a tap plays the call; otherwise it touches the stone.
 */
export function tapStone(stones: ChimeStones, i: number, now: number, quiet = false): ChimeStones {
  if (stones.calledAt === undefined || stones.doneAt !== undefined) return playCall(stones, now);
  return touchStone(stones, i, now, quiet);
}

/**
 * Something the visitor did at the stones: play the call (C or the Play call
 * button), step onto a stone, tap one on the map, or press a stone's button.
 */
export type StoneInput = { kind: 'call' } | { kind: 'step' | 'tap' | 'button'; stone: number };

export interface StoneOutcome {
  stones: ChimeStones;
  /** The notes to ring, in hertz, one after another. Only heard with sound on. */
  tones: number[];
  /** Seconds between one note and the next. */
  spacing: number;
  /** Whether these notes replace any still ringing: true for a new call. */
  replace: boolean;
  /**
   * Whether a walk in progress stops. Anything deliberate stops it, so the
   * footsteps of a walk the visitor no longer wants can't change their answer.
   * Stepping onto a stone is the walk itself, so it never does.
   */
  cancelWalk: boolean;
}

/** What one input does to the stones, and which notes it rings. */
export function stoneInput(
  stones: ChimeStones,
  input: StoneInput,
  now: number,
  quiet = false,
): StoneOutcome {
  const call = (next: ChimeStones): StoneOutcome => ({
    stones: next,
    tones: CALL_PATTERN.map((i) => STONE_TONES[i]),
    spacing: CALL_STEP,
    replace: true,
    cancelWalk: true,
  });
  if (input.kind === 'call') return call(playCall(stones, now));
  const ring = (next: ChimeStones): StoneOutcome => ({
    stones: next,
    tones: [STONE_TONES[input.stone]],
    spacing: 0,
    replace: false,
    cancelWalk: input.kind !== 'step',
  });
  if (input.kind === 'tap') {
    const next = tapStone(stones, input.stone, now, quiet);
    return next.calledAt !== stones.calledAt ? call(next) : ring(next);
  }
  return ring(touchStone(stones, input.stone, now, quiet));
}

/**
 * How brightly stone `i` glows at `now`, from 0 to 1. It fades, never flashes;
 * in quiet mode it never fades either. Stones already answered stay softly lit.
 */
export function stoneGlow(stones: ChimeStones, i: number, now: number, quiet = false): number {
  const answered = CALL_PATTERN.slice(0, stones.answered).includes(i as 0 | 1 | 2 | 3);
  let glow = answered ? ANSWERED_GLOW : 0;
  // A finished answer leaves every stone softly lit until the next call.
  if (stones.doneAt !== undefined) glow = Math.max(glow, 0.5);
  if (quiet) return glow;
  const fade = (since: number) => (since >= 0 && since < GLOW_TIME ? 1 - since / GLOW_TIME : 0);
  if (stones.calledAt !== undefined) {
    CALL_PATTERN.forEach((stone, step) => {
      if (stone === i) glow = Math.max(glow, fade(now - stones.calledAt! - step * CALL_STEP));
    });
  }
  const touched = stones.touchedAt[i];
  if (touched !== undefined) glow = Math.max(glow, fade(now - touched));
  return glow;
}

/**
 * Where stone `i` comes in the call, from 1, when the stones show it still:
 * in quiet mode, once a call has been played and until it is answered.
 */
export function stoneOrder(stones: ChimeStones, i: number, quiet: boolean): number | undefined {
  if (!quiet || stones.calledAt === undefined || stones.doneAt !== undefined) return undefined;
  const step = CALL_PATTERN.indexOf(i as 0 | 1 | 2 | 3);
  return step < 0 ? undefined : step + 1;
}

/** The stone under the player's feet, or undefined. */
export function stoneUnder(stones: ChimeStones, player: Point): number | undefined {
  const i = stones.stones.findIndex(
    (s) => Math.hypot(s.x - player.x, s.y - player.y) <= STONE_RADIUS,
  );
  return i < 0 ? undefined : i;
}

/** Whether the player is close enough to the stones to hear the call. */
export function stonesInReach(stones: ChimeStones, player: Point, reach = STONES_REACH) {
  return stones.stones.some((s) => Math.hypot(s.x - player.x, s.y - player.y) <= reach);
}

/** What the prompt over the stones says. */
export function stonesPrompt(stones: ChimeStones, now: number, quiet = false): string {
  if (stones.calledAt === undefined) return 'Press C or tap a stone to hear the stones';
  if (calling(stones, now, quiet)) return 'Watch the stones';
  if (stones.doneAt !== undefined) return 'Answered! Press C or tap a stone for the call again';
  return `Step on the stones in order (${stones.answered}/${CALL_PATTERN.length}), C to repeat`;
}

const names = (stones: readonly number[]) => stones.map((i) => STONE_NAMES[i]).join(', ');

/**
 * The words beside the map: the call and the answer so far, by the stones'
 * shapes, so the pattern can be read without seeing a glow. It changes only
 * when the call starts, ends or the answer moves, never on a timer.
 */
export function stonesStatus(stones: ChimeStones, now: number, quiet = false): string {
  const call = names(CALL_PATTERN);
  if (stones.calledAt === undefined) {
    return 'Chime stones. Press Play call, or C, to hear their call, then answer it in order.';
  }
  if (calling(stones, now, quiet)) return `Playing the call: ${call}.`;
  if (stones.doneAt !== undefined)
    return `Answered! The call was ${call}. Play call to hear it again.`;
  const so = stones.answered === 0 ? 'nothing yet' : names(CALL_PATTERN.slice(0, stones.answered));
  return `The call: ${call}. Answered ${stones.answered} of ${CALL_PATTERN.length}: ${so}.`;
}
