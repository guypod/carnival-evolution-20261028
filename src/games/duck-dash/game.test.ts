import { describe, expect, it, vi } from 'vitest';
import {
  LANES,
  MAX_FRAME,
  REED_PENALTY,
  ROUND_TIME,
  SPAWN_GAP,
  STAR_POINTS,
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
  saveFinalScore,
  seededRng,
  setLane,
  spawnRow,
  startRound,
  step,
  type DuckState,
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
  state.objects = [{ id: 1, lane, kind, progress: 0.99, resolved: false }];
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
