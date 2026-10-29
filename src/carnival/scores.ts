export interface ScoreEntry {
  gameId: string;
  score: number;
  /** When the score was recorded, in milliseconds since the epoch. */
  at: number;
}

type ScoreStorage = Pick<Storage, 'getItem' | 'setItem'>;

export type ScoreListener = (entry: ScoreEntry) => void;

/**
 * One round played outside single-player scoring, such as a party turn.
 * Opened by the caller around a round; the game still just calls
 * `recordScore` once when the round ends.
 */
export interface ScopedRound {
  /** Unique for this page load, so a caller can tell rounds apart. */
  readonly id: number;
  readonly gameId: string;
  /** The round's score once it has finished, else undefined. */
  result(): ScoreEntry | undefined;
  /** True until `end` is called or a newer scoped round replaces this one. */
  isOpen(): boolean;
  /** Closes the round. Safe to call more than once. */
  end(): void;
}

export type ScopedRoundListener = (entry: ScoreEntry, round: ScopedRound) => void;

interface Scope {
  round: ScopedRound;
  onComplete?: ScopedRoundListener;
  result?: ScoreEntry;
}

const STORAGE_KEY = 'tessl-carnival:scores';
const MAX_ENTRIES_PER_GAME = 50;

// Shared by every scoreboard, so a round id is unique for the page load.
let nextRoundId = 1;

export function createScoreBoard(storage: ScoreStorage, now: () => number = Date.now) {
  const listeners = new Set<ScoreListener>();
  let active:
    { round: ScopedRound; onComplete?: ScopedRoundListener; result?: ScoreEntry } | undefined;

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
    if (active?.round.gameId === gameId) return completeScoped(active, entry);
    const others = load().filter((e) => e.gameId !== gameId);
    const kept = [...top(gameId, MAX_ENTRIES_PER_GAME - 1), entry];
    storage.setItem(STORAGE_KEY, JSON.stringify([...others, ...kept]));
    notify(entry);
    return entry;
  }

  function notify(entry: ScoreEntry): void {
    // Copy first so a listener that unsubscribes mid-loop can't skip another.
    for (const listener of [...listeners]) {
      try {
        // Each listener gets its own copy, so changing it can't reach the
        // caller's entry or what the next listener hears.
        listener({ ...entry });
      } catch (error) {
        // One broken listener must not undo the record or silence the others.
        console.error('Score listener failed', error);
      }
    }
  }

  /**
   * Calls `listener` after each score is saved; a failed save calls nothing.
   * Returns an unsubscribe function that is safe to call more than once.
   */
  function subscribe(listener: ScoreListener): () => void {
    const wrapped: ScoreListener = (entry) => listener(entry);
    listeners.add(wrapped);
    return () => void listeners.delete(wrapped);
  }

  function completeScoped(scope: Scope, entry: ScoreEntry): ScoreEntry {
    // The round's first score is its result. A later one for the same game,
    // before the caller ends the scope, is a duplicate: it is dropped rather
    // than counted twice or leaked into single-player scores.
    if (scope.result) return { ...entry };
    scope.result = entry;
    try {
      scope.onComplete?.({ ...entry }, scope.round);
    } catch (error) {
      // A broken callback must not lose the result, which `result()` still has.
      console.error('Scoped round listener failed', error);
    }
    return { ...entry };
  }

  /**
   * Sends the next score recorded for `gameId` to `onComplete` instead of
   * saving it: no best score, top scores or `subscribe` listener hears it.
   * Scores for other games are saved as usual.
   *
   * Only one scoped round is open at a time. Opening another ends this one,
   * and an ended round never calls its `onComplete` again. Call `end` when
   * the round is over or abandoned (leaving the game, quitting the party),
   * so the next round of `gameId` counts as single-player again.
   *
   * Intended use for a party turn (#122):
   *
   *   const turn = beginScopedRound(game.id, (entry, round) => saveTurn(round.id, entry));
   *   const stopGame = game.start(canvas); // the game calls recordScore once, as today
   *   // on leaving the turn, finished or not:
   *   stopGame();
   *   turn.end();
   *
   * A turn left before its score arrives has no `result()`; retry it with a
   * fresh `beginScopedRound`.
   */
  function beginScopedRound(gameId: string, onComplete?: ScopedRoundListener): ScopedRound {
    active = undefined;
    const round: ScopedRound = {
      id: nextRoundId++,
      gameId,
      result: () => (scope.result ? { ...scope.result } : undefined),
      isOpen: () => active === scope,
      end: () => {
        if (active === scope) active = undefined;
      },
    };
    const scope: Scope = { round, onComplete };
    active = scope;
    return round;
  }

  function best(gameId: string): number | undefined {
    return top(gameId, 1)[0]?.score;
  }

  return { record, best, top, subscribe, beginScopedRound };
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
/** Hears about every score saved through `recordScore`. */
export const onScoreRecorded = board.subscribe;
/** Plays one round of a game outside single-player scoring, e.g. a party turn. */
export const beginScopedRound = board.beginScopedRound;
