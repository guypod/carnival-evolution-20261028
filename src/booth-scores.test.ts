import { describe, expect, it } from 'vitest';
import { createScoreBoard } from './carnival';
import { boothScoresText } from './booth-scores';

function boardWith(scores: number[]) {
  const memory = new Map<string, string>();
  let clock = 0;
  const board = createScoreBoard(
    {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => void memory.set(key, value),
    },
    () => clock++,
  );
  for (const score of scores) board.record('water-cannon', score);
  return board;
}

describe('boothScoresText', () => {
  it('says there are no scores yet when the game has none', () => {
    expect(boothScoresText('water-cannon', boardWith([]).top)).toBe('No scores yet');
  });

  it('lists only the scores there are when fewer than five', () => {
    expect(boothScoresText('water-cannon', boardWith([30, 120, 75]).top)).toBe(
      'Top scores: 120, 75, 30',
    );
  });

  it('lists the five highest scores, highest first, when there are more', () => {
    const board = boardWith([10, 90, 40, 70, 20, 60, 50]);
    expect(boothScoresText('water-cannon', board.top)).toBe('Top scores: 90, 70, 60, 50, 40');
  });

  it('only counts scores for the game asked about', () => {
    const board = boardWith([10]);
    board.record('other-game', 999);
    expect(boothScoresText('water-cannon', board.top)).toBe('Top scores: 10');
  });
});
