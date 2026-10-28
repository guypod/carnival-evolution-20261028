/**
 * Favorite booths: a personal shortlist kept in this browser only, under its
 * own key so it never touches score history.
 */
type FavoriteStorage = Pick<Storage, 'getItem' | 'setItem'>;

export const FAVORITES_KEY = 'tessl-carnival:favorites';

export function createFavorites(storage: FavoriteStorage | undefined) {
  /** The saved ids. Missing, unreadable or malformed storage reads as none. */
  function load(): string[] {
    try {
      const parsed: unknown = JSON.parse(storage?.getItem(FAVORITES_KEY) ?? '[]');
      if (!Array.isArray(parsed)) return [];
      return [...new Set(parsed.filter((id): id is string => typeof id === 'string'))];
    } catch {
      return [];
    }
  }

  function has(gameId: string): boolean {
    return load().includes(gameId);
  }

  /** Adds or removes a booth. Returns whether it is a favorite now, or undefined when the write failed. */
  function set(gameId: string, favorite: boolean): boolean | undefined {
    const others = load().filter((id) => id !== gameId);
    const next = favorite ? [...others, gameId] : others;
    try {
      if (!storage) return undefined;
      storage.setItem(FAVORITES_KEY, JSON.stringify(next));
      return favorite;
    } catch {
      return undefined;
    }
  }

  return { load, has, set };
}

function browserStorage(): FavoriteStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export const favorites = createFavorites(browserStorage());
