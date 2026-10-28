import { describe, expect, it, vi } from 'vitest';
import {
  BALLS,
  FLIGHT_TIME,
  METER_SWEEP,
  TARGETS,
  ballDistance,
  beginRound,
  createState,
  keyAction,
  laneAt,
  laneCentre,
  launch,
  meterPower,
  moveAim,
  saveFinalScore,
  scoreRoll,
  setLane,
  skeeBall,
  startRound,
  step,
  type SkeeState,
} from './game';

function aiming(): SkeeState {
  const state = createState();
  startRound(state);
  return state;
}

/** Rolls one ball at `power` and lets it land. */
function roll(state: SkeeState, power: number): void {
  state.meterTime = power * METER_SWEEP;
  launch(state);
  for (let i = 0; i < 10 && state.phase === 'rolling'; i++) step(state, 0.2);
}

describe('skee ball', () => {
  it('has an id matching its folder', () => {
    expect(skeeBall.id).toBe('skee-ball');
  });

  it('sweeps the meter up and back down', () => {
    expect(meterPower(0)).toBe(0);
    expect(meterPower(METER_SWEEP / 2)).toBeCloseTo(0.5);
    expect(meterPower(METER_SWEEP)).toBeCloseTo(1);
    expect(meterPower(METER_SWEEP * 1.5)).toBeCloseTo(0.5);
    expect(meterPower(METER_SWEEP * 2)).toBeCloseTo(0);
  });

  it('scores 50, 20, 10 or 0 by distance from the ring centre, inclusive at each edge', () => {
    const t = TARGETS[1];
    expect(scoreRoll(1, t)).toBe(50);
    expect(scoreRoll(1, t + 0.04)).toBe(50);
    expect(scoreRoll(1, t - 0.041)).toBe(20);
    expect(scoreRoll(1, t + 0.09)).toBe(20);
    expect(scoreRoll(1, t + 0.1)).toBe(10);
    expect(scoreRoll(1, t - 0.15)).toBe(10);
    expect(scoreRoll(1, t - 0.16)).toBe(0);
    expect(scoreRoll(1, 0)).toBe(0);
  });

  it('scores against the chosen lane, so the same power differs by lane', () => {
    expect(scoreRoll(0, TARGETS[0])).toBe(50);
    expect(scoreRoll(1, TARGETS[0])).toBe(0);
  });

  it('rolls the ball up to its landing point', () => {
    expect(ballDistance(0.6, 0)).toBe(0);
    expect(ballDistance(0.6, 1)).toBeCloseTo(0.6);
    expect(ballDistance(0.6, 0.5)).toBeGreaterThan(0.3);
  });

  it('aims with Left/Right, clamped, and maps lanes to the ramp', () => {
    const state = aiming();
    moveAim(state, -1);
    moveAim(state, -1);
    expect(state.lane).toBe(0);
    moveAim(state, 1);
    moveAim(state, 1);
    moveAim(state, 1);
    expect(state.lane).toBe(2);
    expect(laneAt(laneCentre(1))).toBe(1);
    expect(laneAt(0)).toBeUndefined();
  });

  it('gates aiming and launching during flight', () => {
    const state = aiming();
    setLane(state, 0);
    state.meterTime = TARGETS[0] * METER_SWEEP;
    expect(launch(state)).toBe(true);
    expect(launch(state)).toBe(false);
    setLane(state, 2);
    expect(state.lane).toBe(0);
    step(state, FLIGHT_TIME / 2);
    expect(state.phase).toBe('rolling');
    expect(state.ballsLeft).toBe(BALLS);
    for (let i = 0; i < 5; i++) step(state, FLIGHT_TIME / 4);
    expect(state.phase).toBe('aiming');
    expect(state.lastRoll).toBe(50);
    expect(state.ballsLeft).toBe(BALLS - 1);
  });

  it('ignores launch and aim before the round starts', () => {
    const state = createState();
    expect(launch(state)).toBe(false);
    setLane(state, 0);
    expect(state.lane).toBe(1);
  });

  it('ends after ten balls, and a miss scores 0', () => {
    const state = aiming();
    roll(state, 0);
    expect(state.lastRoll).toBe(0);
    for (let i = 1; i < BALLS; i++) roll(state, TARGETS[1]);
    expect(state.phase).toBe('over');
    expect(state.ballsLeft).toBe(0);
    expect(state.score).toBe(50 * (BALLS - 1));
    expect(launch(state)).toBe(false);
  });

  it('saves the score exactly once, and only after a successful write', () => {
    const state = aiming();
    for (let i = 0; i < BALLS; i++) roll(state, TARGETS[1]);
    const record = vi.fn();
    record.mockImplementationOnce(() => {
      throw new Error('full');
    });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    saveFinalScore(state, record);
    expect(state.scoreRecorded).toBe(false);
    saveFinalScore(state, record);
    expect(record).toHaveBeenCalledTimes(1);
    saveFinalScore(state, record, true);
    expect(state.scoreRecorded).toBe(true);
    saveFinalScore(state, record, true);
    expect(record).toHaveBeenCalledTimes(2);
    expect(record).toHaveBeenLastCalledWith(500);
    errors.mockRestore();
  });

  it('replays with a fresh round after saving the last one', () => {
    let state = aiming();
    for (let i = 0; i < BALLS; i++) roll(state, TARGETS[1]);
    const record = vi.fn();
    state = beginRound(state, record);
    expect(record).toHaveBeenCalledWith(500);
    expect(state.phase).toBe('aiming');
    expect(state.ballsLeft).toBe(BALLS);
    expect(state.score).toBe(0);
    expect(state.lastRoll).toBeUndefined();
  });

  it('leaves keys alone while a link or control has focus', () => {
    expect(keyAction('Space', ' ', 'A')).toBeUndefined();
    expect(keyAction('Enter', 'Enter', 'button')).toBeUndefined();
    expect(keyAction('ArrowLeft', 'ArrowLeft', 'A')).toBeUndefined();
    expect(keyAction('Space', ' ', 'CANVAS')).toBe('go');
    expect(keyAction('Enter', 'Enter')).toBe('go');
    expect(keyAction('ArrowRight', 'ArrowRight', 'BODY')).toBe('right');
    expect(keyAction('KeyX', 'x')).toBeUndefined();
  });
});
