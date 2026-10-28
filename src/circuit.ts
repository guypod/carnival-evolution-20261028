import { topScores, type CarnivalGame, type ScoreEntry } from './carnival';

/**
 * Carnival Circuit: a guided run through three booths in order. Only the
 * circuit's start time is stored, under its own key. Each leg is worked out
 * from score entries recorded after that start, so scores from before the
 * circuit never count and score history is never changed.
 */
type CircuitStorage = Pick<Storage, 'getItem' | 'setItem'>;

export const CIRCUIT_KEY = 'tessl-carnival:circuit';

/** The itinerary, in order. */
export const CIRCUIT_GAME_IDS = ['ring-toss', 'balloon-darts', 'skee-ball'] as const;

/** Enough entries to see every score the scores module keeps for a game. */
const ALL_ENTRIES = 1000;

export interface CircuitLeg {
  gameId: string;
  name: string;
  playHref: string;
  /** The latest score recorded for this booth since the circuit began. */
  latest: number | undefined;
  complete: boolean;
}

export interface CircuitProgress {
  /** When the circuit began, or undefined when none is in progress. */
  startedAt: number | undefined;
  legs: CircuitLeg[];
  /** The first leg still to play, or undefined when finished or not started. */
  next: CircuitLeg | undefined;
  finished: boolean;
  /** Sum of every leg's latest score. */
  total: number;
}

type Top = (gameId: string, count: number) => ScoreEntry[];

export function createCircuit(storage: CircuitStorage | undefined, now: () => number = Date.now) {
  /** The saved start time. Missing, unreadable or malformed storage reads as no circuit. */
  function startedAt(): number | undefined {
    try {
      const parsed: unknown = JSON.parse(storage?.getItem(CIRCUIT_KEY) ?? 'null');
      if (typeof parsed !== 'object' || parsed === null) return undefined;
      const value = (parsed as { startedAt?: unknown }).startedAt;
      return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
    } catch {
      return undefined;
    }
  }

  /** Starts a new circuit, or restarts one. Returns the start time, or undefined when it could not be saved. */
  function start(): number | undefined {
    const at = now();
    try {
      if (!storage) return undefined;
      storage.setItem(CIRCUIT_KEY, JSON.stringify({ startedAt: at }));
      return at;
    } catch {
      return undefined;
    }
  }

  return { startedAt, start };
}

/** Works out each leg from the scores recorded after the circuit began. */
export function circuitProgress(
  games: readonly CarnivalGame[],
  startedAt: number | undefined,
  top: Top = topScores,
): CircuitProgress {
  const legs = CIRCUIT_GAME_IDS.flatMap((gameId) => {
    const game = games.find((g) => g.id === gameId);
    if (!game) return [];
    const fresh =
      startedAt === undefined
        ? []
        : top(gameId, ALL_ENTRIES).filter(
            (entry) => entry.gameId === gameId && entry.at > startedAt,
          );
    const latest = fresh.reduce<ScoreEntry | undefined>(
      (last, entry) => (last === undefined || entry.at >= last.at ? entry : last),
      undefined,
    );
    return [
      {
        gameId,
        name: game.name,
        playHref: `#/play/${gameId}`,
        latest: latest?.score,
        complete: latest !== undefined,
      },
    ];
  });
  const finished = startedAt !== undefined && legs.length > 0 && legs.every((leg) => leg.complete);
  return {
    startedAt,
    legs,
    next: startedAt === undefined ? undefined : legs.find((leg) => !leg.complete),
    finished,
    total: legs.reduce((sum, leg) => sum + (leg.latest ?? 0), 0),
  };
}

/** The status line under the circuit's title. */
export function circuitStatus(progress: CircuitProgress): string {
  if (progress.legs.length === 0) return 'The circuit booths are not open yet.';
  if (progress.startedAt === undefined) return 'Start a circuit to begin at the first booth.';
  if (progress.finished) return `Circuit complete! Total: ${progress.total}.`;
  const done = progress.legs.filter((leg) => leg.complete).length;
  return `Leg ${done + 1} of ${progress.legs.length}: play ${progress.next!.name}.`;
}

/** One leg's line: its latest score this circuit, or what is left to do. */
export function legText(leg: CircuitLeg): string {
  return leg.latest === undefined ? 'Not played this circuit' : `Latest score: ${leg.latest}`;
}

function browserStorage(): CircuitStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export const circuit = createCircuit(browserStorage());
