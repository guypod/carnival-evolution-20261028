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

describe('scoped rounds', () => {
  it('saves scores as usual when no round is scoped', () => {
    const board = createScoreBoard(memoryStorage());
    const listener = vi.fn();
    board.subscribe(listener);
    board.record('ring-toss', 9);
    expect(board.best('ring-toss')).toBe(9);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('sends a scoped round to its callback instead of single-player scores', () => {
    const storage = memoryStorage();
    storage.setItem(
      'tessl-carnival:scores',
      JSON.stringify([{ gameId: 'ring-toss', score: 3, at: 1 }]),
    );
    const board = createScoreBoard(storage, () => 7);
    const listener = vi.fn();
    const completed = vi.fn();
    board.subscribe(listener);
    const round = board.beginScopedRound('ring-toss', completed);
    const saved = storage.getItem('tessl-carnival:scores');
    expect(board.record('ring-toss', 41.6)).toEqual({ gameId: 'ring-toss', score: 42, at: 7 });
    expect(completed).toHaveBeenCalledWith({ gameId: 'ring-toss', score: 42, at: 7 }, round);
    expect(round.result()).toEqual({ gameId: 'ring-toss', score: 42, at: 7 });
    expect(listener).not.toHaveBeenCalled();
    expect(storage.getItem('tessl-carnival:scores')).toBe(saved);
    expect(board.top('ring-toss', 5)).toEqual([{ gameId: 'ring-toss', score: 3, at: 1 }]);
  });

  it('counts a repeated completion once and keeps it out of single-player scores', () => {
    const board = createScoreBoard(memoryStorage());
    const completed = vi.fn();
    const round = board.beginScopedRound('ring-toss', completed);
    board.record('ring-toss', 5);
    board.record('ring-toss', 8);
    expect(completed).toHaveBeenCalledTimes(1);
    expect(round.result()?.score).toBe(5);
    expect(board.best('ring-toss')).toBeUndefined();
  });

  it('saves other games as usual while a round is scoped', () => {
    const board = createScoreBoard(memoryStorage());
    const completed = vi.fn();
    board.beginScopedRound('ring-toss', completed);
    board.record('skee-ball', 12);
    expect(board.best('skee-ball')).toBe(12);
    expect(completed).not.toHaveBeenCalled();
  });

  it('does not complete a round with a rejected score', () => {
    const board = createScoreBoard(memoryStorage());
    const completed = vi.fn();
    const round = board.beginScopedRound('ring-toss', completed);
    expect(() => board.record('ring-toss', -1)).toThrow();
    expect(completed).not.toHaveBeenCalled();
    expect(round.result()).toBeUndefined();
  });

  it('goes back to single-player scoring once the round ends, however many times', () => {
    const board = createScoreBoard(memoryStorage());
    const completed = vi.fn();
    const round = board.beginScopedRound('ring-toss', completed);
    round.end();
    round.end();
    expect(round.isOpen()).toBe(false);
    board.record('ring-toss', 6);
    expect(completed).not.toHaveBeenCalled();
    expect(board.best('ring-toss')).toBe(6);
  });

  it('gives rounds on separate scoreboards different ids', () => {
    const one = createScoreBoard(memoryStorage()).beginScopedRound('ring-toss');
    const two = createScoreBoard(memoryStorage()).beginScopedRound('ring-toss');
    expect(two.id).not.toBe(one.id);
  });

  it('closes an interrupted round when a new one starts, and never calls it again', () => {
    const board = createScoreBoard(memoryStorage());
    const first = vi.fn();
    const second = vi.fn();
    const interrupted = board.beginScopedRound('ring-toss', first);
    const next = board.beginScopedRound('skee-ball', second);
    expect(interrupted.isOpen()).toBe(false);
    expect(next.isOpen()).toBe(true);
    expect(next.id).not.toBe(interrupted.id);
    board.record('ring-toss', 4);
    board.record('skee-ball', 7);
    expect(first).not.toHaveBeenCalled();
    expect(interrupted.result()).toBeUndefined();
    expect(second).toHaveBeenCalledTimes(1);
    expect(board.best('ring-toss')).toBe(4);
    expect(board.best('skee-ball')).toBeUndefined();
  });

  it('lets a stale round end without closing the round that replaced it', () => {
    const board = createScoreBoard(memoryStorage());
    const stale = board.beginScopedRound('ring-toss');
    const current = board.beginScopedRound('ring-toss');
    stale.end();
    expect(current.isOpen()).toBe(true);
    board.record('ring-toss', 3);
    expect(current.result()?.score).toBe(3);
    expect(board.best('ring-toss')).toBeUndefined();
  });

  it('completes a scoped round even when storage cannot save', () => {
    const failing = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded');
      },
    };
    const board = createScoreBoard(failing);
    const round = board.beginScopedRound('ring-toss');
    expect(() => board.record('ring-toss', 10)).not.toThrow();
    expect(round.result()?.score).toBe(10);
    round.end();
    expect(() => board.record('ring-toss', 10)).toThrow('quota exceeded');
  });

  it('keeps the result when the callback throws or changes its entry', () => {
    const board = createScoreBoard(memoryStorage(), () => 7);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const round = board.beginScopedRound('ring-toss', (entry) => {
      entry.score = 100;
      throw new Error('broken callback');
    });
    expect(() => board.record('ring-toss', 2)).not.toThrow();
    expect(round.result()).toEqual({ gameId: 'ring-toss', score: 2, at: 7 });
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
