import { describe, expect, it, vi } from 'vitest';
import {
  FLIGHT_TIME,
  MARKER_PERIOD,
  SWINGS,
  buttonLabel,
  createState,
  frameClock,
  isActionKey,
  listen,
  markerPosition,
  nextSwing,
  press,
  puckHeight,
  saveFinalScore,
  scoreFor,
  step,
  strike,
  takeFinalScore,
  total,
  type StrikerState,
} from './game';

/** Moves the marker to `time` seconds into the swing and strikes, then lands the puck. */
function swingAt(state: StrikerState, time: number) {
  state.markerTime = time;
  strike(state);
  step(state, FLIGHT_TIME);
}

function aiming(): StrikerState {
  return press(createState(), frameClock(0), 0);
}

describe('high striker', () => {
  it('scores 100 at the centre and 10 at the edge', () => {
    expect(scoreFor(0)).toBe(100);
    expect(scoreFor(0.04)).toBe(100);
    expect(scoreFor(-0.1)).toBe(75);
    expect(scoreFor(0.3)).toBe(50);
    expect(scoreFor(-0.6)).toBe(25);
    expect(scoreFor(1)).toBe(10);
    expect(scoreFor(-1)).toBe(10);
  });

  it('sweeps the marker from the left end through the centre and back', () => {
    expect(markerPosition(0)).toBe(-1);
    expect(markerPosition(MARKER_PERIOD / 4)).toBeCloseTo(0);
    expect(markerPosition(MARKER_PERIOD / 2)).toBeCloseTo(1);
    expect(markerPosition(MARKER_PERIOD)).toBeCloseTo(-1);
  });

  it('waits for Start before the marker moves', () => {
    const state = createState();
    step(state, 5);
    expect(state.phase).toBe('ready');
    expect(strike(state)).toBe(false);
    expect(buttonLabel(state)).toMatch(/Start/);
  });

  it('does not charge idle time before Start', () => {
    const clock = frameClock(0);
    const state = press(createState(), clock, 10_000);
    step(state, clock.tick(10_016));
    expect(state.markerTime).toBeCloseTo(0.016);
  });

  it('does not charge aiming time to the puck flight', () => {
    const clock = frameClock(0);
    const state = press(createState(), clock, 0);
    step(state, clock.tick(100));
    press(state, clock, 900);
    expect(state.phase).toBe('flying');
    step(state, clock.tick(916));
    expect(state.flyTime).toBeCloseTo(0.016);
  });

  it('plays exactly three swings, showing each result until Next swing', () => {
    const state = aiming();
    swingAt(state, MARKER_PERIOD / 4);
    expect(state.phase).toBe('result');
    step(state, 10);
    expect(state.phase).toBe('result');
    expect(buttonLabel(state)).toMatch(/Next swing/);
    expect(nextSwing(state)).toBe(true);
    swingAt(state, 0);
    nextSwing(state);
    swingAt(state, MARKER_PERIOD / 4);
    expect(state.swings).toEqual([100, 10, 100]);
    expect(state.swings).toHaveLength(SWINGS);
    expect(state.phase).toBe('over');
    expect(total(state)).toBe(210);
    expect(nextSwing(state)).toBe(false);
    expect(strike(state)).toBe(false);
  });

  it('ignores repeated strikes while the puck flies', () => {
    const state = aiming();
    expect(strike(state)).toBe(true);
    expect(strike(state)).toBe(false);
    const clock = frameClock(0);
    expect(press(state, clock, 0)).toBe(state);
    expect(state.swings).toHaveLength(1);
    expect(nextSwing(state)).toBe(false);
    expect(buttonLabel(state)).toBeUndefined();
  });

  it('raises the puck to the bell only on a perfect hit', () => {
    const state = aiming();
    state.markerTime = MARKER_PERIOD / 4;
    strike(state);
    expect(puckHeight(state)).toBe(0);
    step(state, FLIGHT_TIME);
    expect(puckHeight(state)).toBe(1);
    nextSwing(state);
    swingAt(state, 0);
    expect(puckHeight(state)).toBeCloseTo(0.1);
  });

  it('saves the total once, and a failed save still allows replay', () => {
    const state = aiming();
    for (let i = 0; i < SWINGS; i++) {
      swingAt(state, MARKER_PERIOD / 4);
      nextSwing(state);
    }
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('quota');
    const record = vi.fn(() => {
      throw error;
    });
    try {
      expect(saveFinalScore(state, record)).toBe(error);
    } finally {
      consoleError.mockRestore();
    }
    expect(saveFinalScore(state, record)).toBeUndefined();
    expect(takeFinalScore(state)).toBeUndefined();
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(300);

    const replay = press(state, frameClock(0), 0);
    expect(replay).not.toBe(state);
    expect(replay.phase).toBe('aiming');
    expect(replay.swings).toEqual([]);
    expect(replay.scoreRecorded).toBe(false);
  });

  it('does not save before the round ends', () => {
    const state = aiming();
    swingAt(state, 0);
    const record = vi.fn();
    saveFinalScore(state, record);
    expect(record).not.toHaveBeenCalled();
  });

  it('leaves Enter and Space to a focused link or control', () => {
    expect(isActionKey('Space', ' ')).toBe(true);
    expect(isActionKey('Enter', 'Enter', 'CANVAS')).toBe(true);
    expect(isActionKey('Enter', 'Enter', 'A')).toBe(false);
    expect(isActionKey('Space', ' ', 'button')).toBe(false);
    expect(isActionKey('Escape', 'Escape')).toBe(false);
  });

  it('pauses the clock across a resume', () => {
    const clock = frameClock(0);
    expect(clock.tick(500)).toBe(0.5);
    clock.resume(60_000);
    expect(clock.tick(60_100)).toBeCloseTo(0.1);
  });

  it('removes every listener it adds', () => {
    const targets = [new EventTarget(), new EventTarget(), new EventTarget()];
    const handlers = { pointerdown: vi.fn(), keydown: vi.fn(), visibilitychange: vi.fn() };
    const stop = listen(targets[0], targets[1], targets[2], handlers);
    targets[0].dispatchEvent(new Event('pointerdown'));
    targets[1].dispatchEvent(new Event('keydown'));
    targets[2].dispatchEvent(new Event('visibilitychange'));
    stop();
    targets[0].dispatchEvent(new Event('pointerdown'));
    targets[1].dispatchEvent(new Event('keydown'));
    targets[2].dispatchEvent(new Event('visibilitychange'));
    expect(handlers.pointerdown).toHaveBeenCalledTimes(1);
    expect(handlers.keydown).toHaveBeenCalledTimes(1);
    expect(handlers.visibilitychange).toHaveBeenCalledTimes(1);
  });
});
