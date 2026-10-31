import { describe, expect, it } from 'vitest';
import { createScoreBoard, type CarnivalGame } from './carnival';
import { passportStamps, passportSummary, stampText } from './passport';

function game(id: string, name: string): CarnivalGame {
  return { id, name, description: `${name}.`, start: () => () => {} };
}

function emptyBoard() {
  const memory = new Map<string, string>();
  return createScoreBoard({
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => void memory.set(key, value),
  });
}

const cannon = game('water-cannon', 'Water Cannon');

describe('passportStamps', () => {
  it('leaves a game with no scores unplayed', () => {
    const [stamp] = passportStamps([cannon], emptyBoard().best);
    expect(stamp).toEqual({
      gameId: 'water-cannon',
      name: 'Water Cannon',
      played: false,
      best: undefined,
      playHref: '#/play/water-cannon',
    });
    expect(stampText(stamp)).toEqual({ status: 'Not played yet', best: 'No score yet' });
  });

  it('stamps a game whose only finished round scored zero', () => {
    const board = emptyBoard();
    board.record('water-cannon', 0);
    const [stamp] = passportStamps([cannon], board.best);
    expect(stamp.played).toBe(true);
    expect(stamp.best).toBe(0);
    expect(stampText(stamp)).toEqual({ status: 'Stamped', best: 'Best: 0' });
  });

  it('shows the best score once a game is played', () => {
    const board = emptyBoard();
    board.record('water-cannon', 40);
    board.record('water-cannon', 120);
    expect(passportStamps([cannon], board.best)[0].best).toBe(120);
  });

  it('gives a newly registered game its own unplayed stamp, in registry order', () => {
    const board = emptyBoard();
    board.record('water-cannon', 50);
    const stamps = passportStamps([cannon, game('ring-toss', 'Ring Toss')], board.best);
    expect(stamps.map((s) => [s.gameId, s.played, s.playHref])).toEqual([
      ['water-cannon', true, '#/play/water-cannon'],
      ['ring-toss', false, '#/play/ring-toss'],
    ]);
    expect(passportSummary(stamps)).toBe('1 of 2 booths stamped');
  });
});

describe('passportSummary', () => {
  it('counts a single booth in the singular', () => {
    expect(passportSummary(passportStamps([cannon], emptyBoard().best))).toBe(
      '0 of 1 booth stamped',
    );
  });
});
