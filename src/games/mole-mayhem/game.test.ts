import { describe, expect, it } from 'vitest';
import {
  BONK_TIME,
  GOLDEN_EVERY,
  GOLDEN_POINTS,
  HOLES,
  MAX_MULTIPLIER,
  MILESTONE_TIME,
  MOLE_UP_TIME,
  POINTS_PER_HIT,
  ROUND_TIME,
  SPAWN_GAP,
  createState,
  beginRound,
  frameClock,
  holeAt,
  holeCentre,
  holeForKey,
  isGoldenSpawn,
  isStartKey,
  milestoneText,
  multiplier,
  saveFinalScore,
  seededRng,
  squash,
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
    for (let i = 0; i < 3; i++) {
      const before = state.score;
      expect(whack(state, upHole(state))).toBe('hit');
      gained.push(state.score - before);
      step(state, SPAWN_GAP + 0.01);
    }
    expect(gained).toEqual([10, 20, 30]);
    expect(multiplier(10)).toBe(MAX_MULTIPLIER);
    expect(state.streak).toBe(3);
    expect(state.hits).toBe(3);
  });

  it('makes every fourth mole golden, counting from the start of the round', () => {
    expect(GOLDEN_EVERY).toBe(4);
    expect([1, 2, 3, 4, 5, 8, 12].map(isGoldenSpawn)).toEqual([
      false,
      false,
      false,
      true,
      false,
      true,
      true,
    ]);
    const state = playing();
    const golden: boolean[] = [];
    for (let i = 0; i < 8; i++) {
      golden.push(state.holes[upHole(state)].golden);
      // Let each mole duck away unhit: the schedule counts spawns, not hits.
      step(state, MOLE_UP_TIME + SPAWN_GAP);
    }
    expect(golden).toEqual([false, false, false, true, false, false, false, true]);
  });

  it('scores a golden mole 25 before the streak bonus', () => {
    // Five hits in a row: the fourth mole is golden at x3, the fifth is normal at x3.
    const state = playing();
    const gained: number[] = [];
    for (let i = 0; i < 5; i++) {
      const before = state.score;
      expect(whack(state, upHole(state))).toBe('hit');
      gained.push(state.score - before);
      step(state, SPAWN_GAP + 0.01);
    }
    expect(gained).toEqual([10, 20, 30, GOLDEN_POINTS * 3, 30]);
    expect(state.goldenHits).toBe(1);
  });

  it('scores a golden mole at x1 and x2 when the streak is short', () => {
    // Miss the first moles so the golden fourth one is hit with no streak.
    const atX1 = playing();
    for (let i = 0; i < 3; i++) step(atX1, MOLE_UP_TIME + SPAWN_GAP);
    expect(atX1.holes[upHole(atX1)].golden).toBe(true);
    whack(atX1, upHole(atX1));
    expect(atX1.score).toBe(GOLDEN_POINTS);

    // One hit before it: the golden mole is the second in a row.
    const atX2 = playing();
    for (let i = 0; i < 2; i++) step(atX2, MOLE_UP_TIME + SPAWN_GAP);
    whack(atX2, upHole(atX2));
    step(atX2, SPAWN_GAP + 0.01);
    expect(atX2.holes[upHole(atX2)].golden).toBe(true);
    whack(atX2, upHole(atX2));
    expect(atX2.score).toBe(POINTS_PER_HIT + GOLDEN_POINTS * 2);
  });

  it('cannot hit a golden mole twice', () => {
    const state = playing();
    for (let i = 0; i < 3; i++) step(state, MOLE_UP_TIME + SPAWN_GAP);
    const hole = upHole(state);
    expect(state.holes[hole].golden).toBe(true);
    expect(whack(state, hole)).toBe('hit');
    expect(whack(state, hole)).toBe('ignored');
    expect(state.score).toBe(GOLDEN_POINTS);
    expect(state.goldenHits).toBe(1);
    expect(state.misses).toBe(0);
  });

  it('lets a golden mole that ducked away be missed, breaking the streak', () => {
    const state = playing();
    whack(state, upHole(state));
    step(state, SPAWN_GAP + 0.01);
    for (let i = 0; i < 2; i++) step(state, MOLE_UP_TIME + SPAWN_GAP);
    const hole = upHole(state);
    expect(state.holes[hole].golden).toBe(true);
    step(state, MOLE_UP_TIME);
    expect(whack(state, hole)).toBe('miss');
    expect(state.streak).toBe(0);
    expect(state.goldenHits).toBe(0);
    expect(state.bestStreak).toBe(1);
  });

  it('keeps the best streak after a miss', () => {
    const state = playing();
    for (let i = 0; i < 2; i++) {
      whack(state, upHole(state));
      step(state, SPAWN_GAP + 0.01);
    }
    const empty = state.holes.findIndex((h) => h.up === 0 && h.bonk === 0);
    whack(state, empty);
    whack(state, upHole(state));
    expect(state.streak).toBe(1);
    expect(state.bestStreak).toBe(2);
  });

  it('flashes a milestone at streaks of 3 and 5, and clears it after a moment', () => {
    const state = playing();
    const shown: (number | undefined)[] = [];
    for (let i = 0; i < 6; i++) {
      whack(state, upHole(state));
      shown.push(state.milestone?.streak);
      step(state, SPAWN_GAP + 0.01);
    }
    expect(shown).toEqual([undefined, undefined, 3, 3, 5, 5]);
    expect(milestoneText(3)).toBe('3 in a row! x3');
    expect(milestoneText(5)).toBe('5 in a row! x3');
    step(state, MILESTONE_TIME);
    expect(state.milestone).toBeUndefined();
  });

  it('clears the milestone when the round ends', () => {
    const state = playing();
    for (let i = 0; i < 3; i++) {
      whack(state, upHole(state));
      step(state, SPAWN_GAP + 0.01);
    }
    expect(state.milestone?.streak).toBe(3);
    step(state, ROUND_TIME);
    expect(state.phase).toBe('over');
    expect(state.milestone).toBeUndefined();
    expect(state.holes.every((h) => !h.golden)).toBe(true);
  });

  it('restarts the golden schedule and round stats on Play again', () => {
    const clock = frameClock(0);
    const state = beginRound(createState(seededRng(1)), clock, 0);
    step(state, 0.01);
    for (let i = 0; i < 4; i++) {
      whack(state, upHole(state));
      step(state, SPAWN_GAP + 0.01);
    }
    // One more spawn than a multiple of four, so a carried count would show.
    expect(state.spawns).toBe(5);
    expect(state.goldenHits).toBe(1);
    step(state, ROUND_TIME);
    const saved: number[] = [];
    saveFinalScore(state, (score) => saved.push(score));
    saveFinalScore(state, (score) => saved.push(score));
    expect(saved).toEqual([10 + 20 + 30 + GOLDEN_POINTS * 3]);

    const replay = beginRound(state, clock, 40_000, () => createState(seededRng(1)));
    expect(replay).not.toBe(state);
    expect(replay.goldenHits).toBe(0);
    expect(replay.bestStreak).toBe(0);
    expect(replay.milestone).toBeUndefined();
    step(replay, 0.01);
    const golden: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      golden.push(replay.holes[upHole(replay)].golden);
      step(replay, MOLE_UP_TIME + SPAWN_GAP);
    }
    expect(golden).toEqual([false, false, false, true]);
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

  it('counts the whole of a long frame, so a slow frame rate keeps the round at 30 seconds', () => {
    const state = createState(seededRng(1));
    startRound(state);
    // 10 frames a second, timed by the game's frame clock, for 29.9 seconds.
    const clock = frameClock(0);
    for (let i = 1; i <= 299; i++) step(state, clock.tick(i * 100));
    expect(state.phase).toBe('playing');
    expect(state.timeLeft).toBeCloseTo(0.1, 5);
    step(state, clock.tick(30_000));
    expect(state.phase).toBe('over');
  });

  it('starts timing a round when Start is pressed, not at the last idle frame', () => {
    const clock = frameClock(0);
    let state = createState(seededRng(1));
    step(state, clock.tick(16));
    state = beginRound(state, clock, 990);
    step(state, clock.tick(1000));
    expect(state.phase).toBe('playing');
    expect(state.timeLeft).toBeCloseTo(ROUND_TIME - 0.01, 9);
    step(state, clock.tick(1100));
    expect(state.timeLeft).toBeCloseTo(ROUND_TIME - 0.11, 9);
  });

  it('starts timing a replay when Play again is pressed', () => {
    const clock = frameClock(0);
    let state = createState(seededRng(1));
    state = beginRound(state, clock, 0);
    step(state, clock.tick(ROUND_TIME * 1000));
    expect(state.phase).toBe('over');
    step(state, clock.tick(31_000));
    const replay = beginRound(state, clock, 31_990, () => createState(seededRng(2)));
    expect(replay).not.toBe(state);
    step(replay, clock.tick(32_000));
    expect(replay.phase).toBe('playing');
    expect(replay.timeLeft).toBeCloseTo(ROUND_TIME - 0.01, 9);
  });

  it('pauses the frame clock while the tab is hidden', () => {
    const clock = frameClock(0);
    expect(clock.tick(100)).toBeCloseTo(0.1, 9);
    clock.resume(60_000);
    expect(clock.tick(60_050)).toBeCloseTo(0.05, 9);
    expect(clock.tick(60_040)).toBe(0);
  });

  it('keeps a mole up for its full time and no longer at a slow frame rate', () => {
    const state = createState(() => 0);
    startRound(state);
    step(state, 0.1);
    // The mole popped at the start of that frame, so 0.1s of its time is gone.
    expect(state.holes[0].up).toBeCloseTo(MOLE_UP_TIME - 0.1, 5);
    for (let i = 0; i < 10; i++) step(state, 0.1);
    expect(state.holes[0].up).toBeGreaterThan(0.05);
    step(state, 0.1);
    expect(state.holes[0].up).toBeCloseTo(0, 9);
  });

  it('leaves the full gap after a mole when one step spans its leaving', () => {
    const state = createState(() => 0);
    startRound(state);
    step(state, 0.01);
    expect(upHole(state)).toBe(0);
    step(state, MOLE_UP_TIME);
    expect(upHole(state)).toBe(-1);
    step(state, SPAWN_GAP - 0.02);
    expect(upHole(state)).toBe(-1);
    step(state, 0.02);
    expect(upHole(state)).toBe(0);
  });

  it('counts the rest of a long step toward the next mole after a gap', () => {
    const state = createState(() => 0);
    startRound(state);
    step(state, 0.01);
    const left = state.holes[0].up;
    step(state, left + SPAWN_GAP + 0.5);
    expect(state.holes[0].up).toBeCloseTo(MOLE_UP_TIME - 0.5, 5);
  });

  it('starts on Space or Enter, but leaves Enter to a focused link or control', () => {
    expect(isStartKey('Space', ' ')).toBe(true);
    expect(isStartKey('Enter', 'Enter', 'BODY')).toBe(true);
    expect(isStartKey('Enter', 'Enter', 'CANVAS')).toBe(true);
    expect(isStartKey('Enter', 'Enter', 'A')).toBe(false);
    expect(isStartKey('Space', ' ', 'BUTTON')).toBe(false);
    expect(isStartKey('KeyA', 'a')).toBe(false);
  });

  it('keeps the round over and replayable when saving the score throws', () => {
    const state = playing();
    whack(state, upHole(state));
    step(state, ROUND_TIME);
    const failure = new Error('QuotaExceededError');
    const saved: number[] = [];
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => errors.push(args);
    try {
      expect(
        saveFinalScore(state, () => {
          throw failure;
        }),
      ).toBe(failure);
    } finally {
      console.error = original;
    }
    expect(errors).toHaveLength(1);
    expect(state.phase).toBe('over');
    expect(saveFinalScore(state, (score) => saved.push(score))).toBeUndefined();
    expect(saved).toEqual([]);

    const replay = createState(seededRng(2));
    expect(startRound(replay)).toBe(true);
    step(replay, 0.01);
    expect(upHole(replay)).not.toBe(-1);
  });

  it('saves the final score once through saveFinalScore', () => {
    const state = playing();
    whack(state, upHole(state));
    const saved: number[] = [];
    expect(saveFinalScore(state, (score) => saved.push(score))).toBeUndefined();
    step(state, ROUND_TIME);
    saveFinalScore(state, (score) => saved.push(score));
    saveFinalScore(state, (score) => saved.push(score));
    expect(saved).toEqual([POINTS_PER_HIT]);
  });
});

describe('squash', () => {
  it('leaves a mole that is up at full size', () => {
    expect(squash(0)).toEqual({ x: 1, y: 1 });
  });

  it('flattens a mole most at the hit and eases back as the bonk ends', () => {
    const atHit = squash(BONK_TIME);
    const later = squash(BONK_TIME / 3);
    expect(atHit.y).toBeLessThan(later.y);
    expect(later.y).toBeLessThan(1);
    expect(atHit.x).toBeGreaterThan(later.x);
    expect(later.x).toBeGreaterThan(1);
  });

  it('shows the squash on the hole a hit just whacked', () => {
    const state = createState(() => 0);
    startRound(state);
    step(state, 0.01);
    expect(whack(state, 0)).toBe('hit');
    expect(squash(state.holes[0].bonk).y).toBeLessThan(1);
  });
});
