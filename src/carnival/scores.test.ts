import { describe, expect, it, vi } from 'vitest';
import { createScoreBoard } from './scores';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

describe('score board', () => {
  it('has no best score for a game nobody has played', () => {
    const board = createScoreBoard(memoryStorage());
    expect(board.best('water-cannon')).toBeUndefined();
  });

  it('keeps the best score per game', () => {
    const board = createScoreBoard(memoryStorage());
    board.record('water-cannon', 120);
    board.record('water-cannon', 340);
    board.record('ring-toss', 900);
    board.record('water-cannon', 80);
    expect(board.best('water-cannon')).toBe(340);
    expect(board.best('ring-toss')).toBe(900);
  });

  it('lists top scores highest first, earliest first on a tie', () => {
    let clock = 0;
    const board = createScoreBoard(memoryStorage(), () => ++clock);
    board.record('water-cannon', 50);
    board.record('water-cannon', 200);
    board.record('water-cannon', 200);
    board.record('water-cannon', 10);
    expect(board.top('water-cannon', 3).map((e) => [e.score, e.at])).toEqual([
      [200, 2],
      [200, 3],
      [50, 1],
    ]);
  });

  it('survives corrupt storage', () => {
    const storage = memoryStorage();
    storage.setItem('tessl-carnival:scores', '{not json');
    const board = createScoreBoard(storage);
    expect(board.best('water-cannon')).toBeUndefined();
    board.record('water-cannon', 5);
    expect(board.best('water-cannon')).toBe(5);
  });

  it('rejects negative and non-numeric scores', () => {
    const board = createScoreBoard(memoryStorage());
    expect(() => board.record('water-cannon', -1)).toThrow();
    expect(() => board.record('water-cannon', Number.NaN)).toThrow();
  });
});

describe('score subscriptions', () => {
  it('tells a listener about each saved score', () => {
    const board = createScoreBoard(memoryStorage(), () => 7);
    const heard: unknown[] = [];
    board.subscribe((entry) => heard.push(entry));
    const entry = board.record('circuit', 41.6);
    expect(heard).toEqual([{ gameId: 'circuit', score: 42, at: 7 }]);
    expect(heard[0]).toEqual(entry);
    expect(board.best('circuit')).toBe(42);
  });

  it('tells nobody when the score is rejected or cannot be saved', () => {
    const failing = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded');
      },
    };
    const board = createScoreBoard(failing);
    const listener = vi.fn();
    board.subscribe(listener);
    expect(() => board.record('circuit', 10)).toThrow('quota exceeded');
    expect(() => board.record('circuit', -1)).toThrow();
    expect(listener).not.toHaveBeenCalled();
  });

  it('stops telling a listener once it unsubscribes, however many times', () => {
    const board = createScoreBoard(memoryStorage());
    const kept = vi.fn();
    const dropped = vi.fn();
    board.subscribe(kept);
    const unsubscribe = board.subscribe(dropped);
    board.record('circuit', 1);
    unsubscribe();
    unsubscribe();
    board.record('circuit', 2);
    expect(dropped).toHaveBeenCalledTimes(1);
    expect(kept).toHaveBeenCalledTimes(2);
  });

  it('tells every listener, in the order they subscribed', () => {
    const board = createScoreBoard(memoryStorage());
    const order: string[] = [];
    board.subscribe(() => order.push('first'));
    board.subscribe(() => order.push('second'));
    board.record('circuit', 5);
    expect(order).toEqual(['first', 'second']);
  });

  it('keeps scoring and the other listeners going when one listener throws', () => {
    const board = createScoreBoard(memoryStorage());
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const after = vi.fn();
    board.subscribe(() => {
      throw new Error('broken listener');
    });
    board.subscribe(after);
    expect(() => board.record('circuit', 30)).not.toThrow();
    expect(after).toHaveBeenCalledTimes(1);
    expect(board.best('circuit')).toBe(30);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('keeps a listener that changes its entry from reaching anyone else', () => {
    const board = createScoreBoard(memoryStorage(), () => 7);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const heard: unknown[] = [];
    board.subscribe((entry) => {
      entry.score = 100;
      entry.gameId = 'other';
      throw new Error('mutating listener');
    });
    board.subscribe((entry) => heard.push({ ...entry }));
    const entry = board.record('circuit', 42);
    expect(heard).toEqual([{ gameId: 'circuit', score: 42, at: 7 }]);
    expect(entry).toEqual({ gameId: 'circuit', score: 42, at: 7 });
    expect(board.best('circuit')).toBe(42);
    expect(board.top('circuit', 5)).toEqual([{ gameId: 'circuit', score: 42, at: 7 }]);
    error.mockRestore();
  });
});
