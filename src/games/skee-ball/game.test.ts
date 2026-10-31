import { describe, expect, it, vi } from 'vitest';
import {
  BALLS,
  FLIGHT_TIME,
  METER_SWEEP,
  RINGS,
  TARGETS,
  aimFor,
  ballDistance,
  beginRound,
  createState,
  keyAction,
  laneAt,
  laneCentre,
  laneHighlight,
  launch,
  meterPower,
  moveAim,
  pointerAction,
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

  // The Roll button sits at (600, 418) to (780, 478); Start/Play again at (290, 380) to (510, 432).
  const ROLL = { x: 690, y: 448 };
  const START = { x: 400, y: 406 };

  it('rolls from the Roll button only while aiming', () => {
    const state = createState();
    expect(pointerAction(state, ROLL.x, ROLL.y)).toBeUndefined();
    startRound(state);
    expect(pointerAction(state, ROLL.x, ROLL.y)).toEqual({ kind: 'roll' });
    expect(pointerAction(state, 600, 418)).toEqual({ kind: 'roll' });
    expect(pointerAction(state, 599, 418)).toBeUndefined();
    expect(pointerAction(state, 780, 479)).toBeUndefined();
    launch(state);
    expect(pointerAction(state, ROLL.x, ROLL.y)).toBeUndefined();
    state.phase = 'over';
    expect(pointerAction(state, ROLL.x, ROLL.y)).toBeUndefined();
  });

  it('picks a lane from a tap on the ramp without rolling', () => {
    const state = aiming();
    for (let lane = 0; lane < 3; lane++) {
      expect(pointerAction(state, laneCentre(lane), 300)).toEqual({ kind: 'lane', lane });
    }
    expect(pointerAction(state, laneCentre(1), 460)).toBeUndefined();
    expect(pointerAction(state, 100, 300)).toBeUndefined();
    expect(state.phase).toBe('aiming');
  });

  it('starts and replays from the Start/Play again button only', () => {
    const state = createState();
    expect(pointerAction(state, START.x, START.y)).toEqual({ kind: 'begin' });
    expect(pointerAction(state, laneCentre(1), 300)).toBeUndefined();
    startRound(state);
    expect(pointerAction(state, START.x, START.y)).toEqual({ kind: 'lane', lane: 1 });
    state.phase = 'over';
    expect(pointerAction(state, START.x, START.y)).toEqual({ kind: 'begin' });
  });

  it('plays a whole round by pointer alone, launching once per press', () => {
    let state = createState();
    const record = vi.fn();
    const press = (x: number, y: number) => {
      const action = pointerAction(state, x, y);
      if (action?.kind === 'begin') state = beginRound(state, record);
      else if (action?.kind === 'roll') launch(state);
      else if (action) setLane(state, action.lane);
    };
    press(START.x, START.y);
    press(laneCentre(0), 300);
    expect(state.lane).toBe(0);
    for (let ball = 0; ball < BALLS; ball++) {
      state.meterTime = TARGETS[0] * METER_SWEEP;
      press(ROLL.x, ROLL.y);
      press(ROLL.x, ROLL.y);
      while (state.phase === 'rolling') step(state, 0.2);
    }
    expect(state.phase).toBe('over');
    expect(state.score).toBe(50 * BALLS);
    press(START.x, START.y);
    expect(record).toHaveBeenCalledWith(500);
    expect(state.phase).toBe('aiming');
  });

  it('says whether the last ball was under or over powered', () => {
    const t = TARGETS[1];
    const inner = RINGS[0].within;
    expect(aimFor(1, t)).toBe('on');
    expect(aimFor(1, t + inner)).toBe('on');
    expect(aimFor(1, t - inner - 0.01)).toBe('under');
    expect(aimFor(1, t + inner + 0.01)).toBe('over');

    const state = aiming();
    expect(state.lastAim).toBeUndefined();
    roll(state, 0.1);
    expect(state.lastRoll).toBe(0);
    expect(state.lastAim).toBe('under');
    roll(state, 1);
    expect(state.lastAim).toBe('over');
    roll(state, t);
    expect(state.lastRoll).toBe(50);
    expect(state.lastAim).toBe('on');
  });

  it('clears the last shot feedback on replay', () => {
    let state = aiming();
    for (let i = 0; i < BALLS; i++) roll(state, 0.1);
    expect(state.lastAim).toBe('under');
    state = beginRound(state, vi.fn());
    expect(state.lastRoll).toBeUndefined();
    expect(state.lastAim).toBeUndefined();
    expect(state.ballsLeft).toBe(BALLS);
  });

  it('outlines the chosen lane and points an arrow at it, following Left and Right', () => {
    const state = aiming();
    setLane(state, 0);
    const left = laneHighlight(state)!;
    expect(left.arrowX).toBe(laneCentre(0));
    expect(laneAt(left.x + left.w / 2)).toBe(0);
    moveAim(state, 1);
    const middle = laneHighlight(state)!;
    expect(middle.arrowX).toBe(laneCentre(1));
    expect(laneAt(middle.x + middle.w / 2)).toBe(1);
    expect(middle.arrowTip).toBeLessThan(middle.y);
    moveAim(state, 1);
    expect(laneHighlight(state)!.arrowX).toBe(laneCentre(2));
  });

  it('shows no lane highlight before the round starts or after it ends', () => {
    const state = createState();
    expect(laneHighlight(state)).toBeUndefined();
    state.phase = 'over';
    expect(laneHighlight(state)).toBeUndefined();
  });
});
