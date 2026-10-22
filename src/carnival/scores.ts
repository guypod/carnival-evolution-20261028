export interface ScoreEntry {
  gameId: string;
  score: number;
  /** When the score was recorded, in milliseconds since the epoch. */
  at: number;
}

type ScoreStorage = Pick<Storage, 'getItem' | 'setItem'>;

const STORAGE_KEY = 'tessl-carnival:scores';
const MAX_ENTRIES_PER_GAME = 50;

export function createScoreBoard(storage: ScoreStorage, now: () => number = Date.now) {
  function load(): ScoreEntry[] {
    try {
      const parsed: unknown = JSON.parse(storage.getItem(STORAGE_KEY) ?? '[]');
      return Array.isArray(parsed) ? (parsed as ScoreEntry[]) : [];
    } catch {
      return [];
    }
  }

  function top(gameId: string, count: number): ScoreEntry[] {
    return load()
      .filter((entry) => entry.gameId === gameId)
      .sort((a, b) => b.score - a.score || a.at - b.at)
      .slice(0, count);
  }

  function record(gameId: string, score: number): ScoreEntry {
    if (!Number.isFinite(score) || score < 0) {
      throw new Error(`Score must be a non-negative number, got ${score}`);
    }
    const entry: ScoreEntry = { gameId, score: Math.round(score), at: now() };
    const others = load().filter((e) => e.gameId !== gameId);
    const kept = [...top(gameId, MAX_ENTRIES_PER_GAME - 1), entry];
    storage.setItem(STORAGE_KEY, JSON.stringify([...others, ...kept]));
    return entry;
  }

  function best(gameId: string): number | undefined {
    return top(gameId, 1)[0]?.score;
  }

  return { record, best, top };
}

function browserStorage(): ScoreStorage {
  try {
    return window.localStorage;
  } catch {
    // Private windows and test runs: keep scores for this page load only.
    const memory = new Map<string, string>();
    return {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => void memory.set(key, value),
    };
  }
}

const board = createScoreBoard(browserStorage());

/** Every game reports its final score through here. */
export const recordScore = board.record;
export const bestScore = board.best;
export const topScores = board.top;
