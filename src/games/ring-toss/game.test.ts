import { describe, expect, it } from 'vitest';
import {
  FLIGHT_TIME,
  GOLDEN_MULTIPLIER,
  RINGER_RADIUS,
  RINGS_PER_ROUND,
  SHELVES,
  bottleAt,
  createState,
  goldenIndex,
  step,
  takeFinalScore,
  toss,
  type RingTossState,
} from './game';

/** A round with one still bottle, so landings are easy to predict. */
function stillBottle(points = 20, golden = false): RingTossState {
  const state = createState();
  state.bottles = [{ x: 400, y: 200, speed: 0, points, golden }];
  return state;
}

describe('ring toss', () => {
  it('starts with ten rings and no score', () => {
    const state = createState();
    expect(state.ringsLeft).toBe(RINGS_PER_ROUND);
    expect(RINGS_PER_ROUND).toBe(10);
    expect(state.score).toBe(0);
    expect(state.phase).toBe('playing');
  });

  it('uses one ring per toss', () => {
    const state = createState();
    expect(toss(state, 400, 200)).toBe(true);
    expect(state.ringsLeft).toBe(RINGS_PER_ROUND - 1);
    expect(state.rings).toHaveLength(1);
  });

  it('cannot toss once the rings are gone', () => {
    const state = createState();
    state.ringsLeft = 0;
    expect(toss(state, 400, 200)).toBe(false);
    expect(state.rings).toHaveLength(0);
  });

  it('scores a ring that lands on a bottle neck', () => {
    const state = stillBottle(20);
    toss(state, 405, 195);
    step(state, FLIGHT_TIME);
    expect(state.score).toBe(20);
    expect(state.ringers).toBe(1);
    expect(state.landings[0].points).toBe(20);
  });

  it('scores nothing for a ring that misses', () => {
    const state = stillBottle(20);
    toss(state, 400 + RINGER_RADIUS + 1, 200);
    step(state, FLIGHT_TIME);
    expect(state.score).toBe(0);
    expect(state.ringers).toBe(0);
    expect(state.landings[0].points).toBe(0);
  });

  it('does not score a ring until it lands', () => {
    const state = stillBottle(20);
    toss(state, 400, 200);
    step(state, FLIGHT_TIME / 2);
    expect(state.score).toBe(0);
    expect(state.rings).toHaveLength(1);
  });

  it('picks the closest bottle when two zones overlap', () => {
    const near = { x: 100, y: 100, speed: 0, points: 10, golden: false };
    const far = { x: 110, y: 100, speed: 0, points: 30, golden: false };
    expect(bottleAt([far, near], 102, 100)).toBe(near);
    expect(bottleAt([far, near], 300, 100)).toBeUndefined();
  });

  it('moves bottles along their shelves', () => {
    const state = createState();
    const before = state.bottles.map((b) => b.x);
    step(state, 0.1);
    state.bottles.forEach((bottle, i) => {
      expect(bottle.x).not.toBe(before[i]);
    });
  });

  it('gives higher shelves more points', () => {
    const topToBottom = [...SHELVES].sort((a, b) => a.y - b.y);
    for (let i = 1; i < topToBottom.length; i++) {
      expect(topToBottom[i - 1].points).toBeGreaterThan(topToBottom[i].points);
    }
  });

  it('ends the round when the last ring lands', () => {
    const state = stillBottle();
    for (let i = 0; i < RINGS_PER_ROUND; i++) toss(state, 400, 200);
    expect(state.ringsLeft).toBe(0);
    step(state, FLIGHT_TIME / 2);
    expect(state.phase).toBe('playing');
    step(state, FLIGHT_TIME / 2);
    expect(state.phase).toBe('over');
    expect(state.score).toBe(RINGS_PER_ROUND * 20);
    expect(toss(state, 400, 200)).toBe(false);
  });

  it('hands over the final score exactly once per round', () => {
    const state = stillBottle(10);
    expect(takeFinalScore(state)).toBeUndefined();
    toss(state, 400, 200);
    state.ringsLeft = 0;
    step(state, FLIGHT_TIME);
    expect(takeFinalScore(state)).toBe(10);
    expect(takeFinalScore(state)).toBeUndefined();
    step(state, 0.1);
    expect(takeFinalScore(state)).toBeUndefined();
  });

  it('has exactly one golden bottle per shelf, worth double its shelf', () => {
    const state = createState();
    for (const shelf of SHELVES) {
      const onShelf = state.bottles.filter((b) => b.y === shelf.y);
      const golden = onShelf.filter((b) => b.golden);
      expect(golden).toHaveLength(1);
      expect(golden[0].points).toBe(shelf.points * GOLDEN_MULTIPLIER);
      expect(GOLDEN_MULTIPLIER).toBe(2);
      for (const bottle of onShelf.filter((b) => !b.golden)) {
        expect(bottle.points).toBe(shelf.points);
      }
    }
  });

  it('scores a normal ringer at shelf points and a golden ringer at double', () => {
    const normal = stillBottle(20);
    toss(normal, 400, 200);
    step(normal, FLIGHT_TIME);
    expect(normal.score).toBe(20);
    expect(normal.bonusHits).toBe(0);
    expect(normal.landings[0].golden).toBe(false);

    const golden = createState();
    const bottle = golden.bottles.find((b) => b.golden && b.y === SHELVES[1].y)!;
    golden.bottles = [{ ...bottle, x: 400, y: 200, speed: 0 }];
    toss(golden, 400, 200);
    step(golden, FLIGHT_TIME);
    expect(golden.score).toBe(SHELVES[1].points * 2);
    expect(golden.bonusHits).toBe(1);
    expect(golden.landings[0].golden).toBe(true);
  });

  it('counts a golden ringer only once, however long it lies there', () => {
    const state = stillBottle(40, true);
    toss(state, 400, 200);
    step(state, FLIGHT_TIME);
    step(state, 0.1);
    step(state, 0.5);
    expect(state.score).toBe(40);
    expect(state.bonusHits).toBe(1);
    expect(state.ringers).toBe(1);
  });

  it('does not count a miss as a golden hit', () => {
    const state = stillBottle(40, true);
    toss(state, 400, 200 + RINGER_RADIUS + 1);
    step(state, FLIGHT_TIME);
    expect(state.bonusHits).toBe(0);
    expect(state.score).toBe(0);
  });

  it('starts every round with no golden hits and moves the golden bottles', () => {
    const state = stillBottle(40, true);
    toss(state, 400, 200);
    step(state, FLIGHT_TIME);
    expect(state.bonusHits).toBe(1);
    const next = createState(state.round + 1);
    expect(next.bonusHits).toBe(0);
    expect(next.round).toBe(1);
    expect(goldenIndex(0, 0)).not.toBe(goldenIndex(0, 1));
    const goldenXs = (s: RingTossState) => s.bottles.filter((b) => b.golden).map((b) => b.x);
    expect(goldenXs(next)).not.toEqual(goldenXs(createState(0)));
  });
});
