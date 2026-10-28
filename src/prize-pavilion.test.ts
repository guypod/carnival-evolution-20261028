import { describe, expect, it } from 'vitest';
import { createScoreBoard, type CarnivalGame } from './carnival';
import { PAVILION_TIERS, collectorText, pavilionCollection, shelfText } from './prize-pavilion';

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
const rings = game('ring-toss', 'Ring Toss');

function shelfFor(score: number | undefined) {
  return pavilionCollection([cannon], () => score).shelves[0];
}

describe('PAVILION_TIERS', () => {
  it('has Bronze at 50, Silver at 150 and Gold at 300, each with its own prize', () => {
    expect(PAVILION_TIERS.map((t) => [t.name, t.minScore])).toEqual([
      ['Bronze', 50],
      ['Silver', 150],
      ['Gold', 300],
    ]);
    expect(new Set(PAVILION_TIERS.map((t) => t.prize)).size).toBe(3);
  });
});

describe('pavilionCollection', () => {
  it('unlocks each tier at exactly its threshold, not one point before', () => {
    expect(shelfFor(49).top).toBeUndefined();
    expect(shelfFor(50).top?.id).toBe('bronze');
    expect(shelfFor(149).top?.id).toBe('bronze');
    expect(shelfFor(150).top?.id).toBe('silver');
    expect(shelfFor(299).top?.id).toBe('silver');
    expect(shelfFor(300).top?.id).toBe('gold');
    expect(shelfFor(300).unlocked.map((t) => t.id)).toEqual(['bronze', 'silver', 'gold']);
  });

  it('counts points to the next reward', () => {
    expect(shelfFor(49)).toMatchObject({ pointsToNext: 1, next: { id: 'bronze' } });
    expect(shelfFor(50)).toMatchObject({ pointsToNext: 100, next: { id: 'silver' } });
    expect(shelfFor(299)).toMatchObject({ pointsToNext: 1, next: { id: 'gold' } });
    expect(shelfFor(300)).toMatchObject({ pointsToNext: 0, next: undefined });
    expect(shelfText(shelfFor(299)).next).toBe('1 point to Gold: Golden Ferris Wheel Trophy');
    expect(shelfText(shelfFor(1000)).next).toBe('Every prize won!');
  });

  it('gives an unplayed booth and a zero score no prizes, and keeps them apart', () => {
    const unplayed = shelfFor(undefined);
    const zero = shelfFor(0);
    for (const shelf of [unplayed, zero]) {
      expect(shelf.unlocked).toEqual([]);
      expect(shelf.top).toBeUndefined();
      expect(shelf.pointsToNext).toBe(50);
    }
    expect(shelfText(unplayed).best).toBe('Not played yet');
    expect(shelfText(zero).best).toBe('Best: 0');
  });

  it('reads the best score from the shared scores module', () => {
    const board = emptyBoard();
    board.record('water-cannon', 40);
    board.record('water-cannon', 160);
    board.record('water-cannon', 90);
    const [shelf] = pavilionCollection([cannon], board.best).shelves;
    expect(shelf.best).toBe(160);
    expect(shelf.top?.id).toBe('silver');
  });

  it('adds a newly registered game as an empty shelf, in registry order', () => {
    const board = emptyBoard();
    board.record('water-cannon', 80);
    expect(pavilionCollection([cannon], board.best).collector).toBe(true);

    const grown = pavilionCollection([cannon, rings], board.best);
    expect(grown.shelves.map((s) => [s.gameId, s.top?.id, s.playHref])).toEqual([
      ['water-cannon', 'bronze', '#/play/water-cannon'],
      ['ring-toss', undefined, '#/play/ring-toss'],
    ]);
    expect(grown.collector).toBe(false);
  });

  it('awards the Carnival Collector only when every booth has at least Bronze', () => {
    const scores: Record<string, number> = { 'water-cannon': 300, 'ring-toss': 49 };
    const best = (id: string) => scores[id];
    const almost = pavilionCollection([cannon, rings], best);
    expect(almost).toMatchObject({ collector: false, bronzeBooths: 1 });
    expect(collectorText(almost)).toBe(
      '1 of 2 booths at Bronze or better. Reach Bronze everywhere to become the Carnival Collector.',
    );

    scores['ring-toss'] = 50;
    const done = pavilionCollection([cannon, rings], best);
    expect(done).toMatchObject({ collector: true, bronzeBooths: 2 });
    expect(collectorText(done)).toBe('Carnival Collector unlocked! Every booth has a prize.');
  });

  it('does not award the Carnival Collector with no booths', () => {
    expect(pavilionCollection([], () => 500).collector).toBe(false);
  });
});
