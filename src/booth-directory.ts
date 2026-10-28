import { bestScore, type CarnivalGame } from './carnival';

/** Which booths the directory shows, by whether they have a score. */
export type DirectoryStatus = 'all' | 'unplayed' | 'played';

export const DIRECTORY_STATUSES: { id: DirectoryStatus; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unplayed', label: 'Unplayed' },
  { id: 'played', label: 'Played' },
];

/** One booth card in the directory, worked out from best scores. Nothing is stored. */
export interface DirectoryEntry {
  gameId: string;
  name: string;
  description: string;
  /** The personal best, or undefined when the booth has no score. A best of 0 is played. */
  best: number | undefined;
  played: boolean;
  /** On the visitor's shortlist. Only registered booths can be favorites. */
  favorite: boolean;
  playHref: string;
}

type Best = (gameId: string) => number | undefined;

/**
 * Every registered booth, in registry order. Favorite ids that match no
 * registered booth are ignored, so they never show up as cards.
 */
export function directoryEntries(
  games: readonly CarnivalGame[],
  best: Best = bestScore,
  favoriteIds: readonly string[] = [],
): DirectoryEntry[] {
  return games.map((game) => {
    const score = best(game.id);
    return {
      gameId: game.id,
      name: game.name,
      description: game.description,
      best: score,
      played: score !== undefined,
      favorite: favoriteIds.includes(game.id),
      playHref: `#/play/${game.id}`,
    };
  });
}

/**
 * The entries that match the search, the status and, when asked, the
 * favorites, in their original order. The search ignores case and surrounding
 * whitespace, and matches the name or the description.
 */
export function filterDirectory(
  entries: readonly DirectoryEntry[],
  query: string,
  status: DirectoryStatus,
  favoritesOnly = false,
): DirectoryEntry[] {
  const needle = query.trim().toLowerCase();
  return entries.filter((entry) => {
    if (favoritesOnly && !entry.favorite) return false;
    if (status === 'played' && !entry.played) return false;
    if (status === 'unplayed' && entry.played) return false;
    if (needle === '') return true;
    return (
      entry.name.toLowerCase().includes(needle) || entry.description.toLowerCase().includes(needle)
    );
  });
}

/** The best line on a booth card. */
export function bestLine(entry: DirectoryEntry): string {
  return entry.best === undefined ? 'Unplayed' : `Personal best: ${entry.best}`;
}

/** The text and accessible label of a booth card's favorite toggle. */
export function favoriteLabel(entry: DirectoryEntry): string {
  return entry.favorite ? `Remove ${entry.name} from favorites` : `Add ${entry.name} to favorites`;
}

/** The count line above the cards. */
export function countText(shown: number, total: number): string {
  if (total === 0) return 'No booths are open yet.';
  const noun = total === 1 ? 'booth' : 'booths';
  return shown === total ? `Showing all ${total} ${noun}` : `Showing ${shown} of ${total} ${noun}`;
}

/** The message when nothing is shown, or undefined when something is. */
export function emptyText(
  shown: number,
  total: number,
  query: string,
  status: DirectoryStatus,
  favoritesOnly = false,
  favoriteCount = 0,
): string | undefined {
  if (shown > 0) return undefined;
  if (total === 0) return 'No booths are open yet. When a game registers, its booth appears here.';
  const trimmed = query.trim();
  if (favoritesOnly && favoriteCount === 0) {
    return 'No favorites yet. Press the star on a booth card to add it to your shortlist.';
  }
  const statusWord = status === 'all' ? '' : `${status} `;
  const favoriteWord = favoritesOnly ? 'favorite ' : '';
  return trimmed === ''
    ? `No ${statusWord}${favoriteWord}booths right now.`
    : `No ${statusWord}${favoriteWord}booths match "${trimmed}".`;
}
