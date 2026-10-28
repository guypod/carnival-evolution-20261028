import { describe, expect, it } from 'vitest';
import {
  BONK_TIME,
  HOLES,
  MAX_MULTIPLIER,
  MOLE_UP_TIME,
  POINTS_PER_HIT,
  ROUND_TIME,
  SPAWN_GAP,
  createState,
  holeAt,
  holeCentre,
  holeForKey,
  multiplier,
  seededRng,
  startRound,
  step,
  takeFinalScore,
  whack,
  type MoleState,
} from './game';

/** Index of the hole with a mole up, or -1. */
const upHole = (state: MoleState) => state.holes.findIndex((h) => h.up > 0);

/** A started round whose first mole is already up. */
function playing(seed = 1): MoleState {
  const state = createState(seededRng(seed));
  startRound(state);
  step(state, 0.01);
  return state;
}

describe('mole mayhem', () => {
  it('waits for Start before the timer runs', () => {
    const state = createState(seededRng(1));
    step(state, 5);
    expect(state.phase).toBe('ready');
    expect(state.timeLeft).toBe(ROUND_TIME);
    expect(upHole(state)).toBe(-1);
    expect(whack(state, 0)).toBe('ignored');
    expect(startRound(state)).toBe(true);
    expect(startRound(state)).toBe(false);
    step(state, 1);
    expect(state.timeLeft).toBeCloseTo(ROUND_TIME - 1);
  });

  it('pops moles where the injected rng says', () => {
    const first = createState(() => 0);
    startRound(first);
    step(first, 0.01);
    expect(upHole(first)).toBe(0);

    const last = createState(() => 0.99);
    startRound(last);
    step(last, 0.01);
    expect(upHole(last)).toBe(HOLES - 1);
  });

  it('gives the same moles for the same seed', () => {
    const run = () => {
      const state = playing(42);
      const seen: number[] = [];
      for (let t = 0; t < 10; t += 0.05) {
        step(state, 0.05);
        seen.push(upHole(state));
      }
      return seen;
    };
    expect(run()).toEqual(run());
  });

  it('keeps a mole up long enough to react, and never leaves the holes empty for long', () => {
    expect(MOLE_UP_TIME).toBeGreaterThanOrEqual(1);
    const state = playing(7);
    let emptyFor = 0;
    let longestEmpty = 0;
    for (let t = 0; t < ROUND_TIME - 1; t += 0.05) {
      step(state, 0.05);
      emptyFor = upHole(state) === -1 ? emptyFor + 0.05 : 0;
      longestEmpty = Math.max(longestEmpty, emptyFor);
    }
    expect(longestEmpty).toBeLessThanOrEqual(SPAWN_GAP + 0.06);
  });

  it('lets a mole be whacked after almost a second', () => {
    const state = playing();
    const hole = upHole(state);
    step(state, 0.95);
    expect(whack(state, hole)).toBe('hit');
  });

  it('scores 10 for a hit and raises the bonus up to 3x', () => {
    const state = playing();
    const gained: number[] = [];
    for (let i = 0; i < 5; i++) {
      const before = state.score;
      expect(whack(state, upHole(state))).toBe('hit');
      gained.push(state.score - before);
      step(state, SPAWN_GAP + 0.01);
    }
    expect(gained).toEqual([10, 20, 30, 30, 30]);
    expect(multiplier(10)).toBe(MAX_MULTIPLIER);
    expect(state.streak).toBe(5);
    expect(state.hits).toBe(5);
  });

  it('breaks the streak on an empty hole without taking points', () => {
    const state = playing();
    whack(state, upHole(state));
    step(state, SPAWN_GAP + 0.01);
    whack(state, upHole(state));
    expect(state.score).toBe(POINTS_PER_HIT * 3);
    const empty = state.holes.findIndex((h) => h.up === 0 && h.bonk === 0);
    expect(whack(state, empty)).toBe('miss');
    expect(state.streak).toBe(0);
    expect(state.misses).toBe(1);
    expect(state.score).toBe(POINTS_PER_HIT * 3);
    step(state, SPAWN_GAP + 0.01);
    const before = state.score;
    whack(state, upHole(state));
    expect(state.score - before).toBe(POINTS_PER_HIT);
  });

  it('never goes below zero', () => {
    const state = playing();
    const empty = state.holes.findIndex((h) => h.up === 0);
    for (let i = 0; i < 5; i++) whack(state, empty);
    expect(state.score).toBe(0);
  });

  it('cannot hit the same mole twice', () => {
    const state = playing();
    const hole = upHole(state);
    expect(whack(state, hole)).toBe('hit');
    expect(whack(state, hole)).toBe('ignored');
    expect(state.score).toBe(POINTS_PER_HIT);
    expect(state.streak).toBe(1);
    expect(state.misses).toBe(0);
    step(state, BONK_TIME + 0.01);
    expect(state.holes[hole].up).toBe(0);
  });

  it('lets a mole that ducked away be missed', () => {
    const state = playing();
    const hole = upHole(state);
    step(state, MOLE_UP_TIME);
    expect(state.holes[hole].up).toBe(0);
    expect(whack(state, hole)).toBe('miss');
  });

  it('ends exactly once after 30 seconds and hands over the score once', () => {
    const state = playing();
    whack(state, upHole(state));
    for (let t = 0.01; t < ROUND_TIME - 0.5; t += 0.05) step(state, 0.05);
    expect(state.phase).toBe('playing');
    expect(takeFinalScore(state)).toBeUndefined();
    step(state, 1);
    expect(state.phase).toBe('over');
    expect(state.timeLeft).toBe(0);
    expect(upHole(state)).toBe(-1);
    expect(whack(state, 0)).toBe('ignored');
    expect(takeFinalScore(state)).toBe(POINTS_PER_HIT);
    expect(takeFinalScore(state)).toBeUndefined();
    step(state, 5);
    expect(state.phase).toBe('over');
    expect(takeFinalScore(state)).toBeUndefined();
  });

  it('starts a replay fresh', () => {
    const state = playing();
    whack(state, upHole(state));
    step(state, ROUND_TIME);
    takeFinalScore(state);
    const replay = createState(seededRng(2));
    expect(replay.phase).toBe('ready');
    expect(replay.score).toBe(0);
    expect(replay.streak).toBe(0);
    expect(replay.timeLeft).toBe(ROUND_TIME);
    expect(replay.scoreRecorded).toBe(false);
    expect(replay.holes.every((h) => h.up === 0 && h.bonk === 0)).toBe(true);
  });

  it('maps keys 1 to 6 and taps to holes', () => {
    expect(holeForKey('1')).toBe(0);
    expect(holeForKey('6')).toBe(5);
    expect(holeForKey('0')).toBeUndefined();
    expect(holeForKey('7')).toBeUndefined();
    expect(holeForKey('a')).toBeUndefined();
    for (let i = 0; i < HOLES; i++) {
      const { x, y } = holeCentre(i);
      expect(holeAt(x, y)).toBe(i);
    }
    expect(holeAt(0, 0)).toBeUndefined();
  });
});
