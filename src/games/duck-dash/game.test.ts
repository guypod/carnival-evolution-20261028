import { describe, expect, it, vi } from 'vitest';
import {
  LANES,
  MAX_FRAME,
  MAX_STREAK_BONUS,
  REED_PENALTY,
  ROUND_TIME,
  SPAWN_GAP,
  STAR_POINTS,
  STREAK_BONUS,
  TRAVEL_TIME,
  beginRound,
  clampLane,
  createState,
  duckDash,
  frameClock,
  keyAction,
  laneAt,
  laneCentre,
  moveDuck,
  resolveObject,
  saveFinalScore,
  seededRng,
  setLane,
  spawnRow,
  startRound,
  step,
  streakBonus,
  type DuckState,
  type RiverObject,
} from './game';

function playing(seed = 1): DuckState {
  const state = createState(seededRng(seed));
  startRound(state);
  return state;
}

/** A state with one object about to reach the duck, and nothing spawning. */
function withObject(kind: 'star' | 'reed', lane: number): DuckState {
  const state = playing();
  state.spawnIn = 100;
  state.objects = [{ id: 1, lane, kind, progress: 0.99, outcome: 'pending' }];
  return state;
}

describe('duck dash', () => {
  it('has an id matching its folder', () => {
    expect(duckDash.id).toBe('duck-dash');
  });

  it('clamps the duck to the three lanes', () => {
    const state = playing();
    moveDuck(state, -1);
    moveDuck(state, -1);
    expect(state.lane).toBe(0);
    for (let i = 0; i < 5; i++) moveDuck(state, 1);
    expect(state.lane).toBe(LANES - 1);
    setLane(state, 9);
    expect(state.lane).toBe(2);
    expect(clampLane(-3)).toBe(0);
  });

  it('ignores moves before the round starts', () => {
    const state = createState();
    moveDuck(state, 1);
    expect(state.lane).toBe(1);
  });

  it('never spawns a row that blocks every lane', () => {
    const rng = seededRng(7);
    for (let i = 0; i < 2000; i++) {
      const row = spawnRow(rng);
      const lanes = row.map((o) => o.lane);
      expect(new Set(lanes).size).toBe(lanes.length);
      expect(row.filter((o) => o.kind === 'reed').length).toBeLessThan(LANES);
      for (const lane of lanes) expect(lane).toBeGreaterThanOrEqual(0);
      for (const lane of lanes) expect(lane).toBeLessThan(LANES);
    }
  });

  it('spawns objects at the top that take the travel time to reach the duck', () => {
    const state = playing();
    step(state, 0.01);
    expect(state.objects.length).toBeGreaterThan(0);
    expect(state.objects.every((o) => o.progress < 0.01)).toBe(true);
    expect(TRAVEL_TIME).toBeGreaterThan(SPAWN_GAP);
  });

  it('collects a star in the duck lane once', () => {
    const state = withObject('star', 1);
    step(state, 0.05);
    step(state, 0.05);
    expect(state.score).toBe(STAR_POINTS);
    expect(state.collected).toBe(1);
    expect(state.flash?.kind).toBe('star');
  });

  it('subtracts for a reed, never below zero, and counts each reed once', () => {
    const state = withObject('reed', 1);
    state.score = 3;
    step(state, 0.05);
    step(state, 0.05);
    expect(state.score).toBe(0);
    expect(state.hits).toBe(1);

    const more = withObject('reed', 1);
    more.score = 20;
    step(more, 0.1);
    expect(more.score).toBe(20 - REED_PENALTY);
  });

  it('lets objects in other lanes pass', () => {
    const state = withObject('reed', 0);
    step(state, 0.1);
    expect(state.hits).toBe(0);
    expect(state.score).toBe(0);
  });

  it('bounds a long frame so the round never skips ahead', () => {
    const state = playing();
    step(state, 10);
    expect(state.timeLeft).toBeCloseTo(ROUND_TIME - MAX_FRAME);
    expect(state.phase).toBe('playing');
  });

  it('ends after the round time and clears the river', () => {
    const state = playing();
    for (let i = 0; i < ROUND_TIME * 20 + 5; i++) step(state, 0.05);
    expect(state.phase).toBe('over');
    expect(state.timeLeft).toBe(0);
    expect(state.objects).toEqual([]);
    moveDuck(state, -1);
    expect(state.lane).toBe(1);
  });

  it('saves the score once, and before a replay replaces the state', () => {
    const record = vi.fn();
    const state = playing();
    state.score = 40;
    state.phase = 'over';
    const clock = frameClock(0);
    const next = beginRound(state, clock, 1000, record, () => createState(seededRng(2)));
    expect(record).toHaveBeenCalledExactlyOnceWith(40);
    expect(next).not.toBe(state);
    expect(next.phase).toBe('playing');
    expect(next.score).toBe(0);
    saveFinalScore(state, record);
    expect(record).toHaveBeenCalledOnce();
  });

  it('does not save before the round ends, and survives a failed save', () => {
    const record = vi.fn();
    const state = playing();
    saveFinalScore(state, record);
    expect(record).not.toHaveBeenCalled();
    state.phase = 'over';
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = saveFinalScore(state, () => {
      throw new Error('full');
    });
    expect(error).toBeInstanceOf(Error);
    spy.mockRestore();
  });

  it('saves exactly once after a failed save, retrying only on replay or exit', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const state = playing();
    state.score = 30;
    state.phase = 'over';
    let full = true;
    const record = vi.fn((score: number) => {
      if (full) throw new Error(`full ${score}`);
    });
    expect(saveFinalScore(state, record)).toBeInstanceOf(Error);
    expect(state.saveFailed).toBe(true);
    expect(state.scoreRecorded).toBe(false);
    for (let i = 0; i < 5; i++) saveFinalScore(state, record);
    expect(record).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledOnce();
    full = false;
    const next = beginRound(state, frameClock(0), 0, record, () => createState(seededRng(3)));
    expect(record).toHaveBeenCalledTimes(2);
    expect(record).toHaveBeenLastCalledWith(30);
    expect(state.scoreRecorded).toBe(true);
    expect(state.saveFailed).toBe(false);
    expect(next.phase).toBe('playing');
    saveFinalScore(state, record, true);
    expect(record).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it('keeps a resolved object caught or missed when the duck changes lanes', () => {
    const state = withObject('star', 1);
    state.objects.push({
      id: 2,
      lane: 0,
      kind: 'reed',
      progress: 0.99,
      outcome: 'pending',
    });
    step(state, 0.1);
    const [star, reed] = state.objects;
    expect(star.outcome).toBe('caught');
    expect(reed.outcome).toBe('missed');
    setLane(state, 0);
    step(state, 0.05);
    expect(star.outcome).toBe('caught');
    expect(reed.outcome).toBe('missed');
    expect(state.hits).toBe(0);
  });

  it('maps keys, and leaves them alone when a page control has focus', () => {
    expect(keyAction('ArrowLeft', 'ArrowLeft')).toBe('left');
    expect(keyAction('KeyD', 'd')).toBe('right');
    expect(keyAction('KeyA', 'a')).toBe('left');
    expect(keyAction('Space', ' ')).toBe('start');
    expect(keyAction('Enter', 'Enter', 'A')).toBeUndefined();
    expect(keyAction('Space', ' ', 'button')).toBeUndefined();
    expect(keyAction('ArrowLeft', 'ArrowLeft', 'INPUT')).toBeUndefined();
    expect(keyAction('KeyX', 'x')).toBeUndefined();
  });

  it('finds the lane under a pointer', () => {
    for (let lane = 0; lane < LANES; lane++) expect(laneAt(laneCentre(lane))).toBe(lane);
    expect(laneAt(0)).toBeUndefined();
  });
});

describe('star streak', () => {
  let nextId = 100;
  function object(kind: 'star' | 'reed', lane: number): RiverObject {
    return { id: nextId++, lane, kind, progress: 1, outcome: 'pending' };
  }

  it('grows the bonus by STREAK_BONUS per star in a row, up to MAX_STREAK_BONUS', () => {
    expect(streakBonus(0)).toBe(0);
    expect(streakBonus(1)).toBe(STREAK_BONUS);
    expect(streakBonus(2)).toBe(2 * STREAK_BONUS);
    expect(streakBonus(100)).toBe(MAX_STREAK_BONUS);
  });

  it('adds the bonus to caught stars and tracks streak, peak and bonus total', () => {
    const state = playing();
    const n = 8;
    for (let i = 0; i < n; i++) resolveObject(state, object('star', state.lane));
    let bonus = 0;
    for (let i = 0; i < n; i++) bonus += streakBonus(i);
    expect(state.streak).toBe(n);
    expect(state.peakStreak).toBe(n);
    expect(state.collected).toBe(n);
    expect(state.bonus).toBe(bonus);
    expect(state.score).toBe(n * STAR_POINTS + bonus);
    expect(state.flash?.bonus).toBe(MAX_STREAK_BONUS);
  });

  it('resets the streak on a reed hit but keeps the peak', () => {
    const state = playing();
    resolveObject(state, object('star', state.lane));
    resolveObject(state, object('star', state.lane));
    resolveObject(state, object('reed', state.lane));
    expect(state.streak).toBe(0);
    expect(state.peakStreak).toBe(2);
    resolveObject(state, object('star', state.lane));
    expect(state.streak).toBe(1);
    expect(state.score).toBe(STAR_POINTS * 2 + streakBonus(1) - REED_PENALTY + STAR_POINTS);
  });

  it('resets the streak on a missed star', () => {
    const state = playing();
    resolveObject(state, object('star', state.lane));
    resolveObject(state, object('star', state.lane + 1));
    expect(state.streak).toBe(0);
    expect(state.peakStreak).toBe(1);
    expect(state.score).toBe(STAR_POINTS);
  });

  it('keeps the streak when a reed is dodged', () => {
    const state = playing();
    resolveObject(state, object('star', state.lane));
    resolveObject(state, object('reed', state.lane + 1));
    expect(state.streak).toBe(1);
    resolveObject(state, object('star', state.lane));
    expect(state.streak).toBe(2);
    expect(state.bonus).toBe(streakBonus(1));
  });

  it('resolves each object once, as caught or missed', () => {
    const state = playing();
    const star = object('star', state.lane);
    resolveObject(state, star);
    resolveObject(state, star);
    expect(star.outcome).toBe('caught');
    expect(state.collected).toBe(1);
    expect(state.streak).toBe(1);

    const missed = object('star', state.lane + 1);
    resolveObject(state, missed);
    setLane(state, missed.lane);
    resolveObject(state, missed);
    expect(missed.outcome).toBe('missed');
    expect(state.collected).toBe(1);
    expect(state.score).toBe(STAR_POINTS);
  });

  it('keeps the score nonnegative after a streak breaks on a reed', () => {
    const state = playing();
    resolveObject(state, object('reed', state.lane));
    expect(state.score).toBe(0);
    expect(state.streak).toBe(0);
  });

  it('starts a replayed round with no streak', () => {
    const state = playing();
    resolveObject(state, object('star', state.lane));
    state.timeLeft = 0.01;
    step(state, 0.1);
    const next = beginRound(state, frameClock(0), 0, () => {});
    expect(next.streak).toBe(0);
    expect(next.peakStreak).toBe(0);
    expect(next.bonus).toBe(0);
  });
});
