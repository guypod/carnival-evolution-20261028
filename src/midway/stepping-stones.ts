/**
 * The chime stones: a row of flat stones on the promenade. Stand by them and
 * press C, or tap a stone, and they glow a short call one after another.
 * Answer by stepping on the stones, or tapping them, in the same order. A
 * wrong stone just starts the answer again: there are no points and no timer,
 * and nothing is kept. The stones are silent; the glow is the whole chime.
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

/** Whether the call is still playing at `now`. */
export function calling(stones: ChimeStones, now: number): boolean {
  if (stones.calledAt === undefined) return false;
  return now - stones.calledAt < CALL_PATTERN.length * CALL_STEP;
}

/**
 * Touches stone `i`. It always glows. Once the call has been played, the right
 * stone moves the answer on and a wrong one starts the answer again, counting
 * itself if it is the call's first stone.
 */
export function touchStone(stones: ChimeStones, i: number, now: number): ChimeStones {
  const touchedAt = stones.touchedAt.map((t, j) => (j === i ? now : t));
  if (stones.calledAt === undefined || stones.doneAt !== undefined || calling(stones, now)) {
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
export function tapStone(stones: ChimeStones, i: number, now: number): ChimeStones {
  if (stones.calledAt === undefined || stones.doneAt !== undefined) return playCall(stones, now);
  return touchStone(stones, i, now);
}

/** How brightly stone `i` glows at `now`, from 0 to 1. It fades, never flashes. */
export function stoneGlow(stones: ChimeStones, i: number, now: number): number {
  const fade = (since: number) => (since >= 0 && since < GLOW_TIME ? 1 - since / GLOW_TIME : 0);
  let glow = 0;
  if (stones.calledAt !== undefined) {
    CALL_PATTERN.forEach((stone, step) => {
      if (stone === i) glow = Math.max(glow, fade(now - stones.calledAt! - step * CALL_STEP));
    });
  }
  const touched = stones.touchedAt[i];
  if (touched !== undefined) glow = Math.max(glow, fade(now - touched));
  // A finished answer leaves every stone softly lit until the next call.
  if (stones.doneAt !== undefined) glow = Math.max(glow, 0.5);
  return glow;
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
export function stonesPrompt(stones: ChimeStones, now: number): string {
  if (stones.calledAt === undefined) return 'Press C or tap a stone to hear the stones';
  if (calling(stones, now)) return 'Watch the stones';
  if (stones.doneAt !== undefined) return 'Answered! Press C or tap a stone for the call again';
  return `Step on the stones in order (${stones.answered}/${CALL_PATTERN.length}), C to repeat`;
}
