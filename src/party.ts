import type { CarnivalGame } from './carnival';

/**
 * Carnival Party: two people take turns on one device through three booths.
 * Each turn is played as a scoped round (`beginScopedRound`), so party scores
 * never reach single-player bests, records or the Carnival Circuit. The party
 * itself, with its own id, is kept under its own key, so a reload carries on
 * where it left off. A round id only lives for one page load, so it is never
 * stored: a turn is named by its leg and player instead.
 */
type PartyStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const PARTY_KEY = 'tessl-carnival:party';

/** The tour, in order. */
export const PARTY_GAME_IDS = ['ring-toss', 'high-striker', 'skee-ball'] as const;

/** The combined score both players aim for together in a cooperative party. */
export const COOPERATIVE_GOAL = 600;

export const NICKNAME_MAX = 16;
export const DEFAULT_NAMES = ['Player 1', 'Player 2'] as const;

export type PartyMode = 'competitive' | 'cooperative';
export type PlayerIndex = 0 | 1;

export interface Turn {
  leg: number;
  player: PlayerIndex;
}

export interface TurnResult extends Turn {
  score: number;
}

export interface Party {
  /** Made when the party starts. It names the party across reloads. */
  id: string;
  mode: PartyMode;
  /** Local nicknames. An empty one shows as the default name. */
  names: [string, string];
  results: TurnResult[];
  /** The turn on screen when the page last saved, if it has no result yet. */
  playing?: Turn;
}

/** Trims a nickname to one line of at most NICKNAME_MAX characters. */
export function cleanNickname(value: string): string {
  return [...value.replace(/\s+/g, ' ').trim()].slice(0, NICKNAME_MAX).join('');
}

export function playerName(party: Party, player: PlayerIndex): string {
  return party.names[player] || DEFAULT_NAMES[player];
}

export function newParty(
  mode: PartyMode,
  names: readonly [string, string],
  makeId: () => string,
): Party {
  return {
    id: makeId(),
    mode,
    names: [cleanNickname(names[0]), cleanNickname(names[1])],
    results: [],
  };
}

/** The turns in play order: each leg, Player 1 then Player 2. */
export function allTurns(): Turn[] {
  return PARTY_GAME_IDS.flatMap((_, leg) => [
    { leg, player: 0 as const },
    { leg, player: 1 as const },
  ]);
}

export function resultFor(party: Party, turn: Turn): TurnResult | undefined {
  return party.results.find((r) => r.leg === turn.leg && r.player === turn.player);
}

/** The first turn with no result, or undefined when the party is over. */
export function nextTurn(party: Party): Turn | undefined {
  return allTurns().find((turn) => !resultFor(party, turn));
}

export const sameTurn = (a: Turn | undefined, b: Turn | undefined): boolean =>
  a !== undefined && b !== undefined && a.leg === b.leg && a.player === b.player;

/** Marks a turn as on screen, so a reload can say it was interrupted. */
export function startTurn(party: Party, turn: Turn): Party {
  return sameTurn(nextTurn(party), turn) ? { ...party, playing: turn } : party;
}

/** Clears the on-screen turn, when it is left without a score. */
export function leaveTurn(party: Party): Party {
  const rest = { ...party };
  delete rest.playing;
  return rest;
}

/**
 * Saves a turn's score once. A score for another party, for a turn that is
 * not next, or for a turn that already has one, leaves the party unchanged,
 * so a late or repeated score can never count twice or land on the wrong
 * player.
 */
export function recordTurn(party: Party, partyId: string, turn: Turn, score: number): Party {
  if (party.id !== partyId || !sameTurn(nextTurn(party), turn)) return party;
  if (!Number.isFinite(score) || score < 0) return party;
  return {
    ...leaveTurn(party),
    results: [...party.results, { ...turn, score: Math.round(score) }],
  };
}

/** Sets both nicknames back to the defaults. Scores are kept. */
export function eraseNicknames(party: Party): Party {
  return { ...party, names: ['', ''] };
}

export interface PartyLeg {
  gameId: string;
  name: string;
  scores: [number | undefined, number | undefined];
  /** The player with the higher score once both have played, or 'tie'. */
  winner: PlayerIndex | 'tie' | undefined;
}

export interface PartySummary {
  legs: PartyLeg[];
  totals: [number, number];
  combined: number;
  next: Turn | undefined;
  finished: boolean;
  /** Competitive: the higher total once finished, or 'tie'. */
  winner: PlayerIndex | 'tie' | undefined;
  /** Cooperative: true once the combined score reaches the goal. */
  goalReached: boolean;
}

function higher(a: number | undefined, b: number | undefined): PlayerIndex | 'tie' | undefined {
  if (a === undefined || b === undefined) return undefined;
  return a === b ? 'tie' : a > b ? 0 : 1;
}

export function summarize(party: Party, games: readonly CarnivalGame[]): PartySummary {
  const legs = PARTY_GAME_IDS.map((gameId, leg): PartyLeg => {
    const scores: [number | undefined, number | undefined] = [
      resultFor(party, { leg, player: 0 })?.score,
      resultFor(party, { leg, player: 1 })?.score,
    ];
    return {
      gameId,
      name: games.find((g) => g.id === gameId)?.name ?? gameId,
      scores,
      winner: higher(...scores),
    };
  });
  const totals: [number, number] = [0, 1].map((p) =>
    legs.reduce((sum, leg) => sum + (leg.scores[p] ?? 0), 0),
  ) as [number, number];
  const next = nextTurn(party);
  const finished = next === undefined;
  const combined = totals[0] + totals[1];
  return {
    legs,
    totals,
    combined,
    next,
    finished,
    winner: finished ? higher(...totals) : undefined,
    goalReached: combined >= COOPERATIVE_GOAL,
  };
}

/** The status line at the top of the party page. */
export function partyStatus(party: Party, summary: PartySummary): string {
  if (summary.finished) {
    if (party.mode === 'cooperative') {
      return summary.goalReached
        ? `Goal reached together! ${summary.combined} of ${COOPERATIVE_GOAL}.`
        : `Party over: ${summary.combined} of ${COOPERATIVE_GOAL} together. So close, try another party!`;
    }
    if (summary.winner === 'tie') return `It's a tie at ${summary.totals[0]} each!`;
    const winner = summary.winner!;
    return `${playerName(party, winner)} wins, ${summary.totals[winner]} to ${summary.totals[winner === 0 ? 1 : 0]}!`;
  }
  const turn = summary.next!;
  const leg = summary.legs[turn.leg];
  return `Leg ${turn.leg + 1} of ${summary.legs.length}, ${leg.name}: pass the device to ${playerName(party, turn.player)}.`;
}

/** One leg's comparison line. */
export function legComparison(party: Party, leg: PartyLeg): string {
  const score = (p: PlayerIndex) =>
    `${playerName(party, p)} ${leg.scores[p] === undefined ? 'to play' : leg.scores[p]}`;
  const line = `${score(0)} · ${score(1)}`;
  if (leg.winner === undefined) return line;
  if (party.mode === 'cooperative') return `${line} · Together ${leg.scores[0]! + leg.scores[1]!}`;
  if (leg.winner === 'tie') return `${line} · Tie`;
  return `${line} · ${playerName(party, leg.winner)} takes it`;
}

const isScore = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

function isTurn(value: unknown): value is Turn {
  if (typeof value !== 'object' || value === null) return false;
  const { leg, player } = value as Record<string, unknown>;
  return (
    Number.isInteger(leg) &&
    (leg as number) >= 0 &&
    (leg as number) < PARTY_GAME_IDS.length &&
    (player === 0 || player === 1)
  );
}

function parseParty(value: unknown): Party | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== 'string' || raw.id === '') return undefined;
  if (raw.mode !== 'competitive' && raw.mode !== 'cooperative') return undefined;
  if (
    !Array.isArray(raw.names) ||
    raw.names.length !== 2 ||
    !raw.names.every((n) => typeof n === 'string')
  ) {
    return undefined;
  }
  if (!Array.isArray(raw.results)) return undefined;
  // Rebuild the results in play order, so a doubled or out-of-order entry
  // can never count.
  let party: Party = {
    id: raw.id,
    mode: raw.mode,
    names: [cleanNickname(raw.names[0]), cleanNickname(raw.names[1])],
    results: [],
  };
  for (const result of raw.results) {
    if (!isTurn(result) || !isScore((result as { score?: unknown }).score)) return undefined;
    const before = party;
    party = recordTurn(party, party.id, result, (result as TurnResult).score);
    if (party === before) return undefined;
  }
  if (raw.playing !== undefined) {
    if (!isTurn(raw.playing)) return undefined;
    party = startTurn(party, raw.playing);
  }
  return party;
}

export function createPartyStore(storage: PartyStorage | undefined) {
  /** The saved party. Missing, unreadable or malformed storage reads as none. */
  function read(): Party | undefined {
    try {
      const raw = storage?.getItem(PARTY_KEY);
      return raw ? parseParty(JSON.parse(raw)) : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Returns true only when the party reads back as saved, so a browser that
   * throws or quietly drops the write is reported as a failed save.
   */
  function save(party: Party): boolean {
    try {
      if (!storage) return false;
      const value = JSON.stringify(party);
      storage.setItem(PARTY_KEY, value);
      return storage.getItem(PARTY_KEY) === value;
    } catch {
      return false;
    }
  }

  /**
   * Forgets the party, nicknames included. Returns true only when nothing is
   * left under the key afterwards. With no storage nothing was ever kept.
   */
  function clear(): boolean {
    try {
      if (!storage) return true;
      storage.removeItem(PARTY_KEY);
      return storage.getItem(PARTY_KEY) === null;
    } catch {
      return false;
    }
  }

  return { read, save, clear };
}

export type PartyStore = ReturnType<typeof createPartyStore>;

/**
 * Erases both nicknames from the saved party. When the browser will not save
 * the change the party comes back unchanged, so the page never shows the
 * names as gone while they are still saved.
 */
export function eraseSavedNicknames(
  store: Pick<PartyStore, 'save'>,
  party: Party,
): { party: Party; erased: boolean } {
  const next = eraseNicknames(party);
  return store.save(next) ? { party: next, erased: true } : { party, erased: false };
}

/** What the page says after erasing nicknames, quitting or starting over. */
export function forgetNotice(action: 'erase' | 'quit' | 'new', done: boolean): string {
  if (action === 'erase') {
    return done
      ? 'Nicknames erased. Scores are kept.'
      : "The nicknames could not be erased: this browser would not save the change, so any nicknames already saved here are still saved. Try again, or clear this site's data in your browser.";
  }
  if (done) return '';
  const what =
    action === 'quit' ? 'The party could not be quit' : 'A new party could not be started';
  return `${what}: this browser would not delete the saved party, so its scores and nicknames are still saved here. Try again, or clear this site's data in your browser.`;
}

/**
 * The warning shown as soon as a save fails. A scored turn says which score is
 * not saved yet, because leaving or reloading would mean playing it again.
 */
export function saveWarning(unsaved?: { name: string; score: number }): string {
  if (unsaved) {
    return `${unsaved.name}'s score of ${unsaved.score} could not be saved in this browser. Try saving again before you leave or reload, or this turn will have to be played again.`;
  }
  return 'The party could not be saved in this browser. You can keep playing on this page, but a reload goes back to the party as it was last saved.';
}

const CONTROL_TAGS = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY'];

/**
 * Whether a key press belongs to a focused page control rather than the game:
 * Space or Enter on a button, link or field.
 */
export function isControlKey(code: string, key: string, focusedTag: string | undefined): boolean {
  if (focusedTag === undefined || !CONTROL_TAGS.includes(focusedTag.toUpperCase())) return false;
  return code === 'Space' || key === ' ' || key === 'Enter';
}

/**
 * Keeps Space and Enter on the party's own buttons away from the game while a
 * turn runs. Added on an element inside the page, it stops those presses
 * before they bubble to the window listeners games use, so the game cannot
 * cancel the button's native activation. Returns the cleanup.
 */
export function guardControlKeys(root: EventTarget): () => void {
  const onKeyDown = (event: Event) => {
    const { code, key, target } = event as KeyboardEvent;
    const tag = (target as { tagName?: unknown } | null)?.tagName;
    if (isControlKey(code, key, typeof tag === 'string' ? tag : undefined)) {
      event.stopPropagation();
    }
  };
  root.addEventListener('keydown', onKeyDown);
  return () => root.removeEventListener('keydown', onKeyDown);
}

interface ScopedTurn {
  result(): { score: number } | undefined;
  end(): void;
}

/**
 * Plays one party turn: opens a scoped round, then starts the game. `onScore`
 * hears the round's score once. The returned stop function stops the game
 * before it closes the scope, so a score the game sends while stopping still
 * belongs to this turn and nothing later can. Safe to call more than once.
 */
export function playTurn(
  game: Pick<CarnivalGame, 'id' | 'start'>,
  canvas: HTMLCanvasElement,
  begin: (gameId: string, onComplete: (entry: { score: number }) => void) => ScopedTurn,
  onScore: (score: number) => void,
): () => void {
  let stopped = false;
  const scope = begin(game.id, (entry) => {
    if (!stopped) onScore(entry.score);
  });
  let stopGame: () => void;
  try {
    stopGame = game.start(canvas);
  } catch (error) {
    scope.end();
    throw error;
  }
  return () => {
    if (stopped) return;
    stopGame();
    stopped = true;
    scope.end();
  };
}

/** A party id unique enough for one browser: start time plus a random part. */
export function makePartyId(now: () => number = Date.now, random: () => number = Math.random) {
  return `party-${now().toString(36)}-${Math.floor(random() * 36 ** 6).toString(36)}`;
}

function browserStorage(): PartyStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export const partyStore = createPartyStore(browserStorage());
