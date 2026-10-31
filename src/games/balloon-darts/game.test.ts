import { describe, expect, it, vi } from 'vitest';
import {
  BALLOON_POINTS,
  DARTS_PER_ROUND,
  FLIGHT_TIME,
  HUD_Y,
  RULE_Y,
  STAR_CELL,
  STAR_POINTS,
  STREAK_BONUSES,
  accuracy,
  act,
  begin,
  cardBox,
  cellAt,
  cellCenter,
  cellForKey,
  createState,
  gameOwnsKey,
  listen,
  saveFinalScore,
  step,
  streakBonus,
  throwDart,
  type DartsState,
} from './game';

function playing(): DartsState {
  const state = createState();
  begin(state);
  return state;
}

function throwAndLand(state: DartsState, cell: number) {
  expect(throwDart(state, cell)).toBe(true);
  step(state, FLIGHT_TIME);
}

describe('balloon darts', () => {
  it('waits on a ready screen with nine darts', () => {
    const state = createState();
    expect(state.phase).toBe('ready');
    expect(state.dartsLeft).toBe(DARTS_PER_ROUND);
    expect(DARTS_PER_ROUND).toBe(9);
    expect(throwDart(state, 0)).toBe(false);
    expect(act(state).phase).toBe('playing');
  });

  it('maps keys 1 to 9 onto the rack and clicks onto balloons', () => {
    expect(cellForKey('1')).toBe(0);
    expect(cellForKey('9')).toBe(8);
    expect(cellForKey('0')).toBeUndefined();
    const star = cellCenter(STAR_CELL);
    expect(cellAt(star.x, star.y)).toBe(STAR_CELL);
    expect(cellAt(5, 5)).toBe(-1);
  });

  it('hits a balloon only inside its drawn body', () => {
    const star = cellCenter(STAR_CELL);
    expect(cellAt(star.x + 40, star.y)).toBe(-1);
    expect(cellAt(star.x + 35, star.y - 2)).toBe(STAR_CELL);
    expect(cellAt(star.x, star.y - 43)).toBe(STAR_CELL);
    expect(cellAt(star.x, star.y + 41)).toBe(-1);
  });

  it('scores a balloon only after the dart lands', () => {
    const state = playing();
    throwDart(state, 0);
    step(state, FLIGHT_TIME / 2);
    expect(state.score).toBe(0);
    step(state, FLIGHT_TIME / 2);
    expect(state.score).toBe(BALLOON_POINTS);
    expect(state.popped[0]).toBe(true);
  });

  it('scores the star balloon 50', () => {
    const state = playing();
    throwAndLand(state, STAR_CELL);
    expect(state.score).toBe(STAR_POINTS);
  });

  it('blocks a second throw while a dart is flying', () => {
    const state = playing();
    expect(throwDart(state, 0)).toBe(true);
    expect(throwDart(state, 1)).toBe(false);
    expect(state.dartsLeft).toBe(DARTS_PER_ROUND - 1);
  });

  it('spends a dart on a miss and on a popped balloon, without scoring', () => {
    const state = playing();
    throwAndLand(state, -1);
    throwAndLand(state, 2);
    throwAndLand(state, 2);
    throwAndLand(state, 3);
    expect(state.dartsLeft).toBe(DARTS_PER_ROUND - 4);
    expect(state.score).toBe(2 * BALLOON_POINTS);
    expect(state.hits).toBe(2);
    expect(accuracy(state)).toBe(50);
  });

  it('ends after nine darts with every balloon popped', () => {
    const state = playing();
    for (let cell = 0; cell < 9; cell++) throwAndLand(state, cell);
    expect(state.phase).toBe('over');
    expect(state.score).toBe(8 * BALLOON_POINTS + STAR_POINTS + 0 + 5 + 10 + 6 * 15);
    expect(state.score).toBe(315);
    expect(accuracy(state)).toBe(100);
    expect(throwDart(state, 0)).toBe(false);
  });

  it('records a zero round once', () => {
    const state = playing();
    for (let i = 0; i < DARTS_PER_ROUND; i++) throwAndLand(state, -1);
    const record = vi.fn();
    saveFinalScore(state, record);
    saveFinalScore(state, record);
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(0);
    expect(accuracy(state)).toBe(0);
  });

  it('does not record before the round ends', () => {
    const state = playing();
    throwAndLand(state, 0);
    const record = vi.fn();
    saveFinalScore(state, record);
    expect(record).not.toHaveBeenCalled();
  });

  it('survives a failed save and replays a fresh round', () => {
    const state = playing();
    for (let i = 0; i < DARTS_PER_ROUND; i++) throwAndLand(state, i);
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
    expect(record).toHaveBeenCalledTimes(1);

    const replay = act(state);
    expect(replay).not.toBe(state);
    expect(replay.phase).toBe('playing');
    expect(replay.dartsLeft).toBe(DARTS_PER_ROUND);
    expect(replay.popped.every((p) => !p)).toBe(true);
    expect(replay.scoreRecorded).toBe(false);
  });

  it('adds 0, 5, 10 and then 15 for each pop in a row', () => {
    expect(STREAK_BONUSES).toEqual([0, 5, 10, 15]);
    expect([0, 1, 2, 3, 4, 5, 9].map(streakBonus)).toEqual([0, 0, 5, 10, 15, 15, 15]);

    const state = playing();
    const scores: number[] = [];
    const bonuses: number[] = [];
    for (const cell of [0, 1, 2, 3, 5]) {
      throwAndLand(state, cell);
      scores.push(state.score);
      bonuses.push(state.pops.at(-1)?.bonus ?? -1);
    }
    expect(bonuses).toEqual([0, 5, 10, 15, 15]);
    expect(scores).toEqual([20, 45, 75, 110, 145]);
    expect(state.streak).toBe(5);
    expect(state.bestStreak).toBe(5);
  });

  it('adds the bonus on top of the star', () => {
    const state = playing();
    throwAndLand(state, 0);
    throwAndLand(state, STAR_CELL);
    expect(state.score).toBe(BALLOON_POINTS + STAR_POINTS + 5);
    expect(state.pops.at(-1)?.points).toBe(STAR_POINTS + 5);
  });

  it('starts the streak again after a miss and keeps the best', () => {
    const state = playing();
    throwAndLand(state, 0);
    throwAndLand(state, 1);
    throwAndLand(state, 2);
    throwAndLand(state, -1);
    expect(state.streak).toBe(0);
    expect(state.bestStreak).toBe(3);
    expect(state.pops.at(-1)?.points).toBe(0);
    throwAndLand(state, 3);
    expect(state.streak).toBe(1);
    expect(state.score).toBe(20 + 25 + 30 + 20);
    expect(state.bestStreak).toBe(3);
  });

  it('counts a dart at a popped balloon as a miss that ends the streak', () => {
    const state = playing();
    throwAndLand(state, 0);
    throwAndLand(state, 1);
    throwAndLand(state, 1);
    expect(state.streak).toBe(0);
    expect(state.bestStreak).toBe(2);
    throwAndLand(state, 2);
    expect(state.score).toBe(20 + 25 + 20);
  });

  it('records the bonus score and clears both streaks on replay', () => {
    const state = playing();
    for (let cell = 0; cell < 9; cell++) throwAndLand(state, cell);
    expect(state.bestStreak).toBe(9);
    const record = vi.fn();
    saveFinalScore(state, record);
    expect(record).toHaveBeenCalledWith(315);

    const replay = act(state);
    expect(replay.score).toBe(0);
    expect(replay.streak).toBe(0);
    expect(replay.bestStreak).toBe(0);
  });

  it('leaves keys to a focused link or control', () => {
    expect(gameOwnsKey()).toBe(true);
    expect(gameOwnsKey('CANVAS')).toBe(true);
    expect(gameOwnsKey('A')).toBe(false);
    expect(gameOwnsKey('button')).toBe(false);
  });

  it('removes every listener it adds', () => {
    const canvas = new EventTarget();
    const win = new EventTarget();
    const handlers = { pointerdown: vi.fn(), keydown: vi.fn() };
    const stop = listen(canvas, win, handlers);
    canvas.dispatchEvent(new Event('pointerdown'));
    win.dispatchEvent(new Event('keydown'));
    stop();
    canvas.dispatchEvent(new Event('pointerdown'));
    win.dispatchEvent(new Event('keydown'));
    expect(handlers.pointerdown).toHaveBeenCalledTimes(1);
    expect(handlers.keydown).toHaveBeenCalledTimes(1);
  });

  it('keeps the start and result card clear of the rule line and the bottom row', () => {
    for (const lines of [2, 3]) {
      const box = cardBox(lines);
      expect(box.y).toBeGreaterThan(RULE_Y);
      expect(box.y + box.height).toBeLessThan(HUD_Y - 18);
    }
  });
});
