import { describe, expect, it } from 'vitest';
import { createScoreBoard, type CarnivalGame, type ScoreEntry } from './carnival';
import {
  RECORDS_PER_BOOTH,
  emptyText,
  hallOfRecords,
  localDateTime,
  overviewText,
} from './hall-of-records';

function game(id: string, name: string): CarnivalGame {
  return { id, name, description: `${name}.`, start: () => () => {} };
}

const cannon = game('water-cannon', 'Water Cannon');
const rings = game('ring-toss', 'Ring Toss');

const iso = (at: number) => new Date(at).toISOString();

function stored(entries: unknown[]) {
  return (gameId: string, count: number) =>
    (entries as ScoreEntry[]).filter((entry) => entry?.gameId === gameId).slice(0, count);
}

function boardWith(rounds: [string, number, number][]) {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
  let clock = 0;
  const board = createScoreBoard(storage, () => clock);
  for (const [gameId, score, at] of rounds) {
    clock = at;
    board.record(gameId, score);
  }
  return { board, storage };
}

describe('hallOfRecords', () => {
  it('shows each booth with no rounds as unplayed, in registry order', () => {
    const hall = hallOfRecords([cannon, rings], stored([]), iso);
    expect(hall.booths.map((b) => b.gameId)).toEqual(['water-cannon', 'ring-toss']);
    expect(hall.booths[0]).toMatchObject({
      rows: [],
      best: undefined,
      playHref: '#/play/water-cannon',
    });
    expect(hall).toMatchObject({ playedBooths: 0, personalBestTotal: 0 });
    expect(overviewText(hall)).toBe('No rounds recorded yet at any of the 2 booths.');
    expect(emptyText(hall.booths[1])).toBe(
      'No rounds recorded at Ring Toss yet. Play a round to set the first record.',
    );
  });

  it('says no booths are open when nothing is registered', () => {
    const hall = hallOfRecords([], stored([]), iso);
    expect(hall).toEqual({ booths: [], playedBooths: 0, personalBestTotal: 0 });
    expect(overviewText(hall)).toBe('No booths are open yet.');
  });

  it('keeps the five best rounds from the shared scores module, best first', () => {
    const rounds: [string, number, number][] = [10, 70, 30, 90, 50, 20, 80].map((score, i) => [
      'water-cannon',
      score,
      i * 1000,
    ]);
    const { board } = boardWith(rounds);
    const hall = hallOfRecords([cannon, rings], board.top, iso);
    const rows = hall.booths[0].rows;
    expect(rows).toHaveLength(RECORDS_PER_BOOTH);
    expect(rows.map((r) => r.score)).toEqual([90, 80, 70, 50, 30]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(rows[0].when).toBe(iso(3000));
    expect(hall.booths[1].rows).toEqual([]);
  });

  it('counts a zero score as played and adds personal bests, not every round', () => {
    const { board } = boardWith([
      ['water-cannon', 0, 1],
      ['ring-toss', 40, 2],
      ['ring-toss', 25, 3],
    ]);
    const hall = hallOfRecords([cannon, rings], board.top, iso);
    expect(hall.booths[0]).toMatchObject({ best: 0, rows: [{ rank: 1, score: 0 }] });
    expect(hall).toMatchObject({ playedBooths: 2, personalBestTotal: 40 });
    expect(overviewText(hall)).toBe('2 of 2 booths played. Personal bests added up: 40.');
  });

  it('gives tied scores the same rank, the earlier round first, and skips the next rank', () => {
    const { board } = boardWith([
      ['water-cannon', 50, 3000],
      ['water-cannon', 80, 2000],
      ['water-cannon', 50, 1000],
      ['water-cannon', 20, 4000],
    ]);
    const rows = hallOfRecords([cannon], board.top, iso).booths[0].rows;
    expect(rows).toEqual([
      { rank: 1, score: 80, when: iso(2000) },
      { rank: 2, score: 50, when: iso(1000) },
      { rank: 2, score: 50, when: iso(3000) },
      { rank: 4, score: 20, when: iso(4000) },
    ]);
  });

  it('skips stored rounds with a score that is not a finite, non-negative number', () => {
    const hall = hallOfRecords(
      [cannon],
      stored([
        { gameId: 'water-cannon', score: Number.NaN, at: 1 },
        { gameId: 'water-cannon', score: Infinity, at: 1 },
        { gameId: 'water-cannon', score: -5, at: 1 },
        { gameId: 'water-cannon', score: '99', at: 1 },
        { gameId: 'water-cannon', score: 12, at: 1 },
      ]),
      iso,
    );
    expect(hall.booths[0].rows).toEqual([{ rank: 1, score: 12, when: iso(1) }]);
    expect(hall.personalBestTotal).toBe(12);
  });

  it('looks past bad entries so they never hide one of the five best rounds', () => {
    const bad = Array.from({ length: 6 }, () => ({ gameId: 'water-cannon', score: -1, at: 1 }));
    const hall = hallOfRecords(
      [cannon],
      stored([...bad, { gameId: 'water-cannon', score: 7, at: 1 }]),
      iso,
    );
    expect(hall.booths[0].best).toBe(7);
  });

  it('shows an unknown date for a missing or unreadable time, after dated ties', () => {
    const hall = hallOfRecords(
      [cannon],
      stored([
        { gameId: 'water-cannon', score: 30, at: 'yesterday' },
        { gameId: 'water-cannon', score: 30, at: 8.64e15 + 1 },
        { gameId: 'water-cannon', score: 30, at: 5 },
        { gameId: 'water-cannon', score: 10 },
      ]),
      iso,
    );
    expect(hall.booths[0].rows).toEqual([
      { rank: 1, score: 30, when: iso(5) },
      { rank: 1, score: 30, when: 'Unknown date' },
      { rank: 1, score: 30, when: 'Unknown date' },
      { rank: 4, score: 10, when: 'Unknown date' },
    ]);
  });

  it('shows no rounds when stored scores cannot be read', () => {
    const hall = hallOfRecords(
      [cannon],
      () => {
        throw new Error('broken');
      },
      iso,
    );
    expect(hall.booths[0].rows).toEqual([]);
  });

  it('shows no rounds when the shared reader fails on a null stored entry', () => {
    const storage = {
      getItem: () => JSON.stringify([null, { gameId: 'water-cannon', score: 12, at: 1 }]),
      setItem: () => {},
    };
    const hall = hallOfRecords([cannon], createScoreBoard(storage).top, iso);
    expect(hall.booths[0].rows).toEqual([]);
  });

  it('never writes to storage', () => {
    const { board, storage } = boardWith([['water-cannon', 10, 1]]);
    const before = storage.getItem('tessl-carnival:scores');
    let writes = 0;
    const setItem = storage.setItem;
    storage.setItem = (key, value) => {
      writes++;
      setItem(key, value);
    };
    hallOfRecords([cannon, rings], board.top, iso);
    expect(writes).toBe(0);
    expect(storage.getItem('tessl-carnival:scores')).toBe(before);
  });

  it('includes a newly registered game automatically', () => {
    const ducks = game('duck-pond', 'Duck Pond');
    const hall = hallOfRecords([cannon, ducks], stored([]), iso);
    expect(hall.booths.map((b) => b.name)).toEqual(['Water Cannon', 'Duck Pond']);
  });

  it('uses a singular booth in the overview for one booth', () => {
    const hall = hallOfRecords(
      [cannon],
      stored([{ gameId: 'water-cannon', score: 3, at: 1 }]),
      iso,
    );
    expect(overviewText(hall)).toBe('1 of 1 booth played. Personal bests added up: 3.');
  });
});

describe('localDateTime', () => {
  it('formats a time as readable text', () => {
    expect(localDateTime(Date.UTC(2026, 9, 28, 17, 0))).toMatch(/2026/);
  });
});
