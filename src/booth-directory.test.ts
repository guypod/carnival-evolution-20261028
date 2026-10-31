import { describe, expect, it } from 'vitest';
import type { CarnivalGame } from './carnival';
import {
  bestLine,
  countText,
  directoryEntries,
  emptyText,
  favoriteLabel,
  filterDirectory,
} from './booth-directory';

function game(id: string, name: string, description: string): CarnivalGame {
  return { id, name, description, start: () => () => {} };
}

const games = [
  game('water-cannon', 'Water Cannon', 'Squirt the targets before time runs out.'),
  game('ring-toss', 'Ring Toss', 'Land rings on the bottles.'),
  game('balloon-darts', 'Balloon Darts', 'Pop balloons with darts.'),
];

function scores(map: Record<string, number>) {
  return (gameId: string) => map[gameId];
}

describe('directoryEntries', () => {
  it('keeps registry order and counts a best of zero as played', () => {
    const entries = directoryEntries(games, scores({ 'ring-toss': 0, 'balloon-darts': 12 }));
    expect(entries.map((e) => e.gameId)).toEqual(['water-cannon', 'ring-toss', 'balloon-darts']);
    expect(entries.map((e) => e.played)).toEqual([false, true, true]);
    expect(entries[1]).toMatchObject({ best: 0, playHref: '#/play/ring-toss' });
    expect(bestLine(entries[0])).toBe('Unplayed');
    expect(bestLine(entries[1])).toBe('Personal best: 0');
  });

  it('is empty with no booths registered', () => {
    expect(directoryEntries([], scores({}))).toEqual([]);
  });
});

describe('filterDirectory', () => {
  const entries = directoryEntries(games, scores({ 'ring-toss': 0, 'balloon-darts': 12 }));
  const ids = (list: { gameId: string }[]) => list.map((e) => e.gameId);

  it('shows everything for an empty or blank query', () => {
    expect(ids(filterDirectory(entries, '', 'all'))).toHaveLength(3);
    expect(ids(filterDirectory(entries, '   ', 'all'))).toHaveLength(3);
  });

  it('matches name or description, ignoring case and surrounding whitespace', () => {
    expect(ids(filterDirectory(entries, '  RING ', 'all'))).toEqual(['ring-toss']);
    expect(ids(filterDirectory(entries, 'pop', 'all'))).toEqual(['balloon-darts']);
    expect(ids(filterDirectory(entries, 'the', 'all'))).toEqual(['water-cannon', 'ring-toss']);
  });

  it('filters by status', () => {
    expect(ids(filterDirectory(entries, '', 'played'))).toEqual(['ring-toss', 'balloon-darts']);
    expect(ids(filterDirectory(entries, '', 'unplayed'))).toEqual(['water-cannon']);
  });

  it('combines query and status', () => {
    expect(ids(filterDirectory(entries, 'the', 'played'))).toEqual(['ring-toss']);
    expect(ids(filterDirectory(entries, 'the', 'unplayed'))).toEqual(['water-cannon']);
    expect(ids(filterDirectory(entries, 'darts', 'unplayed'))).toEqual([]);
  });

  it('returns nothing when nothing matches, and nothing from an empty registry', () => {
    expect(filterDirectory(entries, 'zzz', 'all')).toEqual([]);
    expect(filterDirectory([], 'ring', 'all')).toEqual([]);
  });
});

describe('countText and emptyText', () => {
  it('counts shown against total', () => {
    expect(countText(3, 3)).toBe('Showing all 3 booths');
    expect(countText(1, 3)).toBe('Showing 1 of 3 booths');
    expect(countText(1, 1)).toBe('Showing all 1 booth');
    expect(countText(0, 0)).toBe('No booths are open yet.');
  });

  it('explains why nothing is shown', () => {
    expect(emptyText(2, 3, 'x', 'all')).toBeUndefined();
    expect(emptyText(0, 0, '', 'all')).toMatch(/No booths are open yet/);
    expect(emptyText(0, 3, '  zzz ', 'all')).toBe('No booths match "zzz".');
    expect(emptyText(0, 3, 'zzz', 'played')).toBe('No played booths match "zzz".');
    expect(emptyText(0, 3, '', 'unplayed')).toBe('No unplayed booths right now.');
  });
});

describe('favorites in the directory', () => {
  const entries = directoryEntries(games, scores({ 'ring-toss': 3 }), [
    'ring-toss',
    'balloon-darts',
    'not-a-booth',
  ]);

  it('marks registered favorites and ignores unknown ids', () => {
    expect(entries.map((e) => e.favorite)).toEqual([false, true, true]);
    expect(entries.map((e) => e.gameId)).not.toContain('not-a-booth');
    expect(favoriteLabel(entries[0])).toBe('Add Water Cannon to favorites');
    expect(favoriteLabel(entries[1])).toBe('Remove Ring Toss from favorites');
  });

  it('combines the favorites filter with search and status', () => {
    expect(filterDirectory(entries, '', 'all', true).map((e) => e.gameId)).toEqual([
      'ring-toss',
      'balloon-darts',
    ]);
    expect(filterDirectory(entries, '', 'unplayed', true).map((e) => e.gameId)).toEqual([
      'balloon-darts',
    ]);
    expect(filterDirectory(entries, 'ring', 'all', true).map((e) => e.gameId)).toEqual([
      'ring-toss',
    ]);
    expect(filterDirectory(entries, 'water', 'all', true)).toEqual([]);
    expect(filterDirectory(entries, '', 'all')).toHaveLength(3);
  });

  it('explains an empty favorites view', () => {
    expect(emptyText(0, 3, '', 'all', true, 0)).toMatch(/^No favorites yet/);
    expect(emptyText(0, 3, 'water', 'played', true, 2)).toBe(
      'No played favorite booths match "water".',
    );
    expect(emptyText(0, 3, '', 'all', false, 2)).toBe('No booths right now.');
  });
});
