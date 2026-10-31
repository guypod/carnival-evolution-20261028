import { describe, expect, it } from 'vitest';
import {
  BALLS,
  FLIGHT_TIME,
  SWING,
  SWING_PERIOD,
  WOBBLE_TIME,
  aimX,
  coconutAt,
  createState,
  isRoundOver,
  press,
  scoreForPost,
  step,
  takeFinalScore,
  throwBall,
} from './game';

/** Steps until `seconds` have passed, in small steps. */
function run(state: ReturnType<typeof createState>, seconds: number) {
  for (let t = 0; t < seconds; t += 0.01) step(state, 0.01);
}

describe('coconut shy', () => {
  it('scores higher posts more', () => {
    expect(scoreForPost(80)).toBe(20);
    expect(scoreForPost(200)).toBe(50);
    const state = createState();
    const tallest = state.coconuts.reduce((a, b) => (b.y < a.y ? b : a));
    expect(tallest.points).toBe(Math.max(...state.coconuts.map((c) => c.points)));
  });

  it('swings the aim marker between its ends and back', () => {
    expect(aimX(0)).toBe(SWING.left);
    expect(aimX(SWING_PERIOD / 2)).toBeCloseTo(SWING.right);
    expect(aimX(SWING_PERIOD)).toBeCloseTo(SWING.left);
  });

  it('hits the coconut under the marker, which wobbles and then falls', () => {
    const state = createState();
    const first = state.coconuts[0];
    expect(coconutAt(state, first.x)).toBe(first);
    expect(throwBall(state)).toBe(true);
    run(state, FLIGHT_TIME + 0.02);
    expect(first.state).toBe('wobbling');
    expect(state.score).toBe(first.points);
    run(state, WOBBLE_TIME);
    expect(first.state).toBe('fallen');
  });

  it('misses when the marker is between coconuts', () => {
    const state = createState();
    const gap = (state.coconuts[0].x + state.coconuts[1].x) / 2;
    expect(coconutAt(state, gap)).toBeUndefined();
  });

  it('does not score a fallen coconut twice', () => {
    const state = createState();
    throwBall(state);
    throwBall(state);
    run(state, FLIGHT_TIME + 0.02);
    expect(state.score).toBe(state.coconuts[0].points);
  });

  it('ends the round when the balls run out and records the score once', () => {
    const state = createState();
    for (let i = 0; i < BALLS; i++) expect(throwBall(state)).toBe(true);
    expect(throwBall(state)).toBe(false);
    expect(isRoundOver(state)).toBe(false);
    run(state, FLIGHT_TIME + WOBBLE_TIME + 0.1);
    expect(state.phase).toBe('over');
    expect(takeFinalScore(state)).toBe(state.score);
    expect(takeFinalScore(state)).toBeNull();
  });

  it('starts a new round on a press after the round ends', () => {
    const state = createState();
    state.phase = 'over';
    const next = press(state);
    expect(next.phase).toBe('playing');
    expect(next.ballsLeft).toBe(BALLS);
  });
});
