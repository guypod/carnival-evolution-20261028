import { topScores, type CarnivalGame, type ScoreEntry } from './carnival';

/**
 * Carnival Circuit: a guided run through three booths in order. Only the
 * circuit's start time is stored, under its own key. Each leg is worked out
 * from score entries recorded after that start, so scores from before the
 * circuit never count and score history is never changed. Once every leg
 * is played, the legs are frozen at that moment, and each finished circuit is
 * saved once, by its start time, to a short history under a second key.
 */
type CircuitStorage = Pick<Storage, 'getItem' | 'setItem'>;

export const CIRCUIT_KEY = 'tessl-carnival:circuit';
export const CIRCUIT_HISTORY_KEY = 'tessl-carnival:circuit-history';

/** How many finished circuits the history keeps, newest first. */
export const HISTORY_SIZE = 5;

/** The itinerary, in order. */
export const CIRCUIT_GAME_IDS = ['ring-toss', 'balloon-darts', 'skee-ball'] as const;

/** Enough entries to see every score the scores module keeps for a game. */
const ALL_ENTRIES = 1000;

export interface CircuitLeg {
  gameId: string;
  name: string;
  playHref: string;
  /** The latest score recorded for this booth since the circuit began, or when it finished. */
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
  /** When the last leg was first played, or undefined while legs are left. */
  completedAt: number | undefined;
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
  const fresh = CIRCUIT_GAME_IDS.flatMap((gameId) => {
    const game = games.find((g) => g.id === gameId);
    if (!game) return [];
    const entries =
      startedAt === undefined
        ? []
        : top(gameId, ALL_ENTRIES).filter(
            (entry) => entry.gameId === gameId && entry.at > startedAt,
          );
    return [{ game, entries }];
  });
  // The circuit finishes when its last unplayed leg is first played. Later
  // free play at a booth never changes a finished circuit.
  const finished =
    startedAt !== undefined && fresh.length > 0 && fresh.every((leg) => leg.entries.length > 0);
  const completedAt = finished
    ? Math.max(...fresh.map((leg) => Math.min(...leg.entries.map((entry) => entry.at))))
    : undefined;
  const legs = fresh.map(({ game, entries }) => {
    const latest = entries
      .filter((entry) => completedAt === undefined || entry.at <= completedAt)
      .reduce<ScoreEntry | undefined>(
        (last, entry) => (last === undefined || entry.at >= last.at ? entry : last),
        undefined,
      );
    return {
      gameId: game.id,
      name: game.name,
      playHref: `#/play/${game.id}`,
      latest: latest?.score,
      complete: latest !== undefined,
    };
  });
  return {
    startedAt,
    legs,
    next: startedAt === undefined ? undefined : legs.find((leg) => !leg.complete),
    finished,
    completedAt,
    total: legs.reduce((sum, leg) => sum + (leg.latest ?? 0), 0),
  };
}

/** The status line under the circuit's title. */
export function circuitStatus(progress: CircuitProgress): string {
  if (progress.legs.length === 0) return 'The circuit booths are not open yet.';
  if (progress.startedAt === undefined) return 'Start a circuit to begin at the first booth.';
  if (progress.finished) return `Circuit complete! Total: ${progress.total}.`;
  const leg = progress.legs.indexOf(progress.next!) + 1;
  return `Leg ${leg} of ${progress.legs.length}: play ${progress.next!.name}.`;
}

/**
 * Starts or restarts the circuit and redraws the page. The current page's
 * cleanup runs before the redraw, so its listeners never outlive it. Returns
 * false, without redrawing, when the start could not be saved.
 */
export function restartCircuit(
  start: () => number | undefined,
  cleanup: () => void,
  render: () => void,
): boolean {
  if (start() === undefined) return false;
  cleanup();
  render();
  return true;
}

/** One leg's line: its latest score this circuit, or what is left to do. */
export function legText(leg: CircuitLeg): string {
  return leg.latest === undefined ? 'Not played this circuit' : `Latest score: ${leg.latest}`;
}

export interface CircuitRun {
  /** When the circuit began. It is the run's identity: one run per start. */
  startedAt: number;
  /** When its last leg was played. */
  completedAt: number;
  legs: { gameId: string; score: number }[];
  total: number;
}

export interface CircuitHistory {
  /** Finished circuits, newest first, at most HISTORY_SIZE. */
  runs: CircuitRun[];
  /** The best total of any finished circuit, including ones no longer listed. */
  best: number | undefined;
}

/** What saving a finished circuit did. */
export type SaveResult = 'saved' | 'already-saved' | 'not-finished' | 'unreadable' | 'failed';

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

function isRun(value: unknown): value is CircuitRun {
  if (typeof value !== 'object' || value === null) return false;
  const run = value as Record<string, unknown>;
  return (
    isCount(run.startedAt) &&
    isCount(run.completedAt) &&
    isCount(run.total) &&
    Array.isArray(run.legs) &&
    run.legs.every(
      (leg: unknown) =>
        typeof leg === 'object' &&
        leg !== null &&
        typeof (leg as { gameId?: unknown }).gameId === 'string' &&
        isCount((leg as { score?: unknown }).score),
    )
  );
}

export function createCircuitHistory(storage: CircuitStorage | undefined) {
  /**
   * The saved history. Nothing saved yet reads as an empty history; storage
   * that is missing, cannot be read or holds something malformed reads as
   * undefined, so a save never writes over history it could not read.
   */
  function read(): CircuitHistory | undefined {
    try {
      if (!storage) return undefined;
      const raw = storage.getItem(CIRCUIT_HISTORY_KEY);
      if (raw === null) return { runs: [], best: undefined };
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) return undefined;
      const { runs, best } = parsed as { runs?: unknown; best?: unknown };
      if (!Array.isArray(runs) || !runs.every(isRun)) return undefined;
      if (best !== undefined && !isCount(best)) return undefined;
      const totals = runs.map((run) => run.total);
      return {
        runs: runs.slice(0, HISTORY_SIZE),
        best: totals.length || best !== undefined ? Math.max(best ?? 0, ...totals) : undefined,
      };
    } catch {
      return undefined;
    }
  }

  /** Saves a finished circuit once. A circuit already saved is left as it was. */
  function save(progress: CircuitProgress): SaveResult {
    if (
      !progress.finished ||
      progress.startedAt === undefined ||
      progress.completedAt === undefined
    ) {
      return 'not-finished';
    }
    const history = read();
    if (!history) return 'unreadable';
    const startedAt = progress.startedAt;
    if (history.runs.some((run) => run.startedAt === startedAt)) return 'already-saved';
    const run: CircuitRun = {
      startedAt,
      completedAt: progress.completedAt,
      legs: progress.legs.map((leg) => ({ gameId: leg.gameId, score: leg.latest ?? 0 })),
      total: progress.total,
    };
    const next: CircuitHistory = {
      runs: [run, ...history.runs].slice(0, HISTORY_SIZE),
      best: Math.max(run.total, history.best ?? 0),
    };
    try {
      storage!.setItem(CIRCUIT_HISTORY_KEY, JSON.stringify(next));
      return 'saved';
    } catch {
      return 'failed';
    }
  }

  return { read, save };
}

/** One past circuit's line: each leg's score and the total. */
export function runText(run: CircuitRun, games: readonly CarnivalGame[]): string {
  const legs = run.legs.map((leg) => {
    const name = games.find((g) => g.id === leg.gameId)?.name ?? leg.gameId;
    return `${name} ${leg.score}`;
  });
  return [...legs, `Total ${run.total}`].join(' · ');
}

function browserStorage(): CircuitStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export const circuit = createCircuit(browserStorage());
export const circuitHistory = createCircuitHistory(browserStorage());
