import { describe, expect, it, vi } from 'vitest';
import {
  BRAKE,
  SEGMENTS,
  SEGMENT_ANGLE,
  SPINS,
  SPIN_SPEED,
  actionLabel,
  brake,
  createState,
  isActionKey,
  listen,
  press,
  restingAngle,
  segmentAt,
  spin,
  step,
  takeFinalScore,
  total,
  type WheelState,
} from './game';

/** Runs the wheel in small steps until it stops braking. */
function settle(state: WheelState) {
  for (let i = 0; i < 1000 && state.phase === 'braking'; i++) step(state, 1 / 60);
}

/** The angle a braked wheel must be at, at full speed, to come to rest in the middle of `segment`. */
function brakeAngleFor(segment: number): number {
  const rest = -(segment + 0.5) * SEGMENT_ANGLE;
  return rest - (SPIN_SPEED * SPIN_SPEED) / (2 * BRAKE);
}

/** Starts a spin if needed, brakes at the angle that lands on `segment`, and lets it stop. */
function spinOnto(state: WheelState, segment: number) {
  if (state.phase !== 'spinning') press(state);
  state.angle = brakeAngleFor(segment);
  press(state);
  settle(state);
}

describe('prize wheel', () => {
  it('waits for Start before the wheel turns', () => {
    const state = createState();
    step(state, 5);
    expect(state.phase).toBe('ready');
    expect(state.angle).toBe(0);
    expect(brake(state)).toBe(false);
    expect(actionLabel(state)).toBe('Start');
  });

  it('reads the segment under the pointer from how far the wheel has turned', () => {
    expect(segmentAt(0)).toBe(0);
    // Turning clockwise brings the last segment round under the pointer first.
    expect(segmentAt(SEGMENT_ANGLE / 2)).toBe(SEGMENTS.length - 1);
    expect(segmentAt(-SEGMENT_ANGLE * 1.5)).toBe(1);
    expect(segmentAt(Math.PI * 2 - SEGMENT_ANGLE * 3.5)).toBe(3);
    expect(segmentAt(Math.PI * 2 * 5)).toBe(0);
  });

  it('turns at a steady speed until the brake goes on', () => {
    const state = createState();
    press(state);
    expect(state.phase).toBe('spinning');
    step(state, 0.1);
    expect(state.angle).toBeCloseTo(SPIN_SPEED * 0.1);
    expect(actionLabel(state)).toBe('Brake!');
  });

  it('slows to rest where the brake sends it, and scores that segment', () => {
    const state = createState();
    press(state);
    state.angle = 1;
    press(state);
    expect(state.phase).toBe('braking');
    expect(actionLabel(state)).toBeUndefined();
    const rest = restingAngle(1, SPIN_SPEED);
    settle(state);
    expect(state.phase).toBe('result');
    expect(state.speed).toBe(0);
    expect(state.angle).toBeCloseTo(rest, 2);
    expect(state.spins).toEqual([SEGMENTS[segmentAt(rest)]]);
  });

  it('scores each segment it lands on', () => {
    SEGMENTS.forEach((points, segment) => {
      const state = createState();
      spinOnto(state, segment);
      expect(state.spins).toEqual([points]);
    });
  });

  it('ignores presses while the wheel is braking', () => {
    const state = createState();
    press(state);
    press(state);
    const speed = state.speed;
    expect(press(state)).toBe(state);
    expect(state.phase).toBe('braking');
    expect(state.speed).toBe(speed);
    expect(spin(state)).toBe(false);
  });

  it(`ends the round after ${SPINS} spins and adds up the points`, () => {
    const state = createState();
    const landed = [3, 1, 0, 3, 7];
    for (const segment of landed) {
      expect(state.phase).not.toBe('over');
      spinOnto(state, segment);
    }
    expect(state.phase).toBe('over');
    expect(state.spins).toEqual(landed.map((s) => SEGMENTS[s]));
    expect(total(state)).toBe(100 + 50 + 10 + 100 + 5);
    expect(actionLabel(state)).toBe('Play again');
  });

  it('hands out the final score once, and only when the round is over', () => {
    const state = createState();
    for (let i = 0; i < SPINS - 1; i++) spinOnto(state, 3);
    expect(takeFinalScore(state)).toBeUndefined();
    spinOnto(state, 3);
    expect(takeFinalScore(state)).toBe(SPINS * 100);
    expect(takeFinalScore(state)).toBeUndefined();
  });

  it('starts a fresh spinning round on Play again', () => {
    const state = createState();
    for (let i = 0; i < SPINS; i++) spinOnto(state, 1);
    takeFinalScore(state);
    const next = press(state);
    expect(next).not.toBe(state);
    expect(next.phase).toBe('spinning');
    expect(next.spins).toEqual([]);
    expect(next.scoreRecorded).toBe(false);
  });

  it('works the action with Space or Enter, unless a page control has focus', () => {
    expect(isActionKey('Space', ' ')).toBe(true);
    expect(isActionKey('Enter', 'Enter')).toBe(true);
    expect(isActionKey('KeyA', 'a')).toBe(false);
    expect(isActionKey('Enter', 'Enter', 'A')).toBe(false);
    expect(isActionKey('Space', ' ', 'button')).toBe(false);
    expect(isActionKey('Space', ' ', 'CANVAS')).toBe(true);
  });

  it('removes every listener it adds', () => {
    const canvas = new EventTarget();
    const win = new EventTarget();
    const pointerdown = vi.fn();
    const keydown = vi.fn();
    const stop = listen(canvas, win, { pointerdown, keydown });
    canvas.dispatchEvent(new Event('pointerdown'));
    win.dispatchEvent(new Event('keydown'));
    expect(pointerdown).toHaveBeenCalledTimes(1);
    expect(keydown).toHaveBeenCalledTimes(1);
    stop();
    canvas.dispatchEvent(new Event('pointerdown'));
    win.dispatchEvent(new Event('keydown'));
    expect(pointerdown).toHaveBeenCalledTimes(1);
    expect(keydown).toHaveBeenCalledTimes(1);
  });
});
