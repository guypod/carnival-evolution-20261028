import { describe, expect, it } from 'vitest';
import { createScoreBoard, type CarnivalGame } from './carnival';
import {
  COOPERATIVE_GOAL,
  NICKNAME_MAX,
  PARTY_GAME_IDS,
  PARTY_KEY,
  allTurns,
  cleanNickname,
  createPartyStore,
  eraseNicknames,
  leaveTurn,
  legComparison,
  makePartyId,
  newParty,
  nextTurn,
  partyStatus,
  playTurn,
  playerName,
  recordTurn,
  startTurn,
  summarize,
  type Party,
  type Turn,
} from './party';

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

const games: CarnivalGame[] = [
  { id: 'ring-toss', name: 'Ring Toss', description: '', start: () => () => {} },
  { id: 'high-striker', name: 'High Striker', description: '', start: () => () => {} },
  { id: 'skee-ball', name: 'Skee Ball', description: '', start: () => () => {} },
];

const party = (mode: Party['mode'] = 'competitive', names: [string, string] = ['', '']) =>
  newParty(mode, names, () => 'party-a');

function playAll(start: Party, scores: number[]): Party {
  return allTurns().reduce(
    (p, turn, i) => (i < scores.length ? recordTurn(p, p.id, turn, scores[i]) : p),
    start,
  );
}

describe('party turns', () => {
  it('alternates players through the three booths in order', () => {
    expect(allTurns()).toEqual([
      { leg: 0, player: 0 },
      { leg: 0, player: 1 },
      { leg: 1, player: 0 },
      { leg: 1, player: 1 },
      { leg: 2, player: 0 },
      { leg: 2, player: 1 },
    ]);
    expect(PARTY_GAME_IDS).toEqual(['ring-toss', 'high-striker', 'skee-ball']);
  });

  it('records each turn exactly once, for the next turn only', () => {
    let p = party();
    p = recordTurn(p, p.id, { leg: 0, player: 0 }, 40);
    expect(recordTurn(p, p.id, { leg: 0, player: 0 }, 90)).toBe(p);
    expect(recordTurn(p, p.id, { leg: 1, player: 0 }, 90)).toBe(p);
    expect(nextTurn(p)).toEqual({ leg: 0, player: 1 });
    expect(p.results).toEqual([{ leg: 0, player: 0, score: 40 }]);
  });

  it('ignores a score for another party', () => {
    const p = party();
    expect(recordTurn(p, 'party-b', { leg: 0, player: 0 }, 40)).toBe(p);
  });

  it('ignores a score that is not a count', () => {
    const p = party();
    expect(recordTurn(p, p.id, { leg: 0, player: 0 }, -1)).toBe(p);
    expect(recordTurn(p, p.id, { leg: 0, player: 0 }, Number.NaN)).toBe(p);
  });

  it('marks and clears an interrupted turn without a result', () => {
    let p = startTurn(party(), { leg: 0, player: 0 });
    expect(p.playing).toEqual({ leg: 0, player: 0 });
    expect(startTurn(p, { leg: 1, player: 0 }).playing).toEqual({ leg: 0, player: 0 });
    p = leaveTurn(p);
    expect(p.playing).toBeUndefined();
    expect(p.results).toEqual([]);
    expect(nextTurn(p)).toEqual({ leg: 0, player: 0 });
  });

  it('clears the on-screen turn once it scores', () => {
    let p = startTurn(party(), { leg: 0, player: 0 });
    p = recordTurn(p, p.id, { leg: 0, player: 0 }, 10);
    expect(p.playing).toBeUndefined();
  });
});

describe('nicknames', () => {
  it('shows default names until nicknames are given', () => {
    const p = party('competitive', ['  Ada  ', '']);
    expect(playerName(p, 0)).toBe('Ada');
    expect(playerName(p, 1)).toBe('Player 2');
  });

  it('keeps nicknames short and on one line', () => {
    expect(cleanNickname('a\n  b')).toBe('a b');
    expect([...cleanNickname('x'.repeat(40))]).toHaveLength(NICKNAME_MAX);
  });

  it('erases nicknames but keeps scores', () => {
    let p = playAll(party('competitive', ['Ada', 'Bo']), [10]);
    p = eraseNicknames(p);
    expect(p.names).toEqual(['', '']);
    expect(p.results).toHaveLength(1);
    expect(playerName(p, 0)).toBe('Player 1');
  });
});

describe('summarize', () => {
  it('compares each leg and names the winner when finished', () => {
    const p = playAll(party('competitive', ['Ada', '']), [100, 50, 75, 75, 20, 60]);
    const summary = summarize(p, games);
    expect(summary.legs.map((leg) => leg.winner)).toEqual([0, 'tie', 1]);
    expect(summary.totals).toEqual([195, 185]);
    expect(summary.finished).toBe(true);
    expect(summary.winner).toBe(0);
    expect(partyStatus(p, summary)).toBe('Ada wins, 195 to 185!');
    expect(legComparison(p, summary.legs[0])).toBe('Ada 100 · Player 2 50 · Ada takes it');
    expect(legComparison(p, summary.legs[1])).toBe('Ada 75 · Player 2 75 · Tie');
  });

  it('says whose turn is next while the party runs', () => {
    const p = playAll(party(), [100]);
    const summary = summarize(p, games);
    expect(summary.winner).toBeUndefined();
    expect(partyStatus(p, summary)).toBe('Leg 1 of 3, Ring Toss: pass the device to Player 2.');
    expect(legComparison(p, summary.legs[0])).toBe('Player 1 100 · Player 2 to play');
  });

  it('adds both players toward the cooperative goal', () => {
    const half = COOPERATIVE_GOAL / 6;
    const reached = playAll(party('cooperative'), Array(6).fill(half));
    const summary = summarize(reached, games);
    expect(summary.combined).toBe(COOPERATIVE_GOAL);
    expect(summary.goalReached).toBe(true);
    expect(partyStatus(reached, summary)).toContain('Goal reached together!');
    expect(legComparison(reached, summary.legs[0])).toContain(`Together ${half * 2}`);

    const short = playAll(party('cooperative'), [0, 0, 0, 0, 0, 0]);
    expect(partyStatus(short, summarize(short, games))).toContain('So close');
  });

  it('calls a tie on equal totals', () => {
    const p = playAll(party(), [10, 10, 10, 10, 10, 10]);
    expect(partyStatus(p, summarize(p, games))).toBe("It's a tie at 30 each!");
  });
});

describe('createPartyStore', () => {
  it('saves and reads a party, keeping its id across reloads', () => {
    const storage = memoryStorage();
    const p = startTurn(playAll(party('cooperative', ['Ada', 'Bo']), [10, 20]), {
      leg: 1,
      player: 0,
    });
    expect(createPartyStore(storage).save(p)).toBe(true);
    expect(createPartyStore(storage).read()).toEqual(p);
  });

  it('reads missing, broken or malformed storage as no party', () => {
    expect(createPartyStore(undefined).read()).toBeUndefined();
    expect(createPartyStore(memoryStorage()).read()).toBeUndefined();
    expect(createPartyStore(memoryStorage({ [PARTY_KEY]: '{' })).read()).toBeUndefined();
    const doubled = {
      ...party(),
      results: [
        { leg: 0, player: 0, score: 1 },
        { leg: 0, player: 0, score: 2 },
      ],
    };
    expect(
      createPartyStore(memoryStorage({ [PARTY_KEY]: JSON.stringify(doubled) })).read(),
    ).toBeUndefined();
    const skipped = { ...party(), results: [{ leg: 1, player: 0, score: 1 }] };
    expect(
      createPartyStore(memoryStorage({ [PARTY_KEY]: JSON.stringify(skipped) })).read(),
    ).toBeUndefined();
  });

  it('forgets the party on clear', () => {
    const storage = memoryStorage();
    const store = createPartyStore(storage);
    store.save(party());
    expect(store.clear()).toBe(true);
    expect(store.read()).toBeUndefined();
    expect(storage.map.size).toBe(0);
  });

  it('reports a failed save', () => {
    const store = createPartyStore({
      getItem: () => null,
      setItem: () => {
        throw new Error('full');
      },
      removeItem: () => {},
    });
    expect(store.save(party())).toBe(false);
  });
});

describe('playTurn', () => {
  const canvas = {} as HTMLCanvasElement;

  function fakeGame(id: string) {
    const calls = { started: 0, stopped: 0 };
    let onStop: (() => void) | undefined;
    return {
      calls,
      onStop: (fn: () => void) => (onStop = fn),
      game: {
        id,
        start: () => {
          calls.started++;
          return () => {
            calls.stopped++;
            onStop?.();
          };
        },
      },
    };
  }

  it('keeps the turn out of single-player scores and hears it once', () => {
    const storage = memoryStorage();
    const board = createScoreBoard(storage, () => 1);
    const heard: number[] = [];
    const { game } = fakeGame('ring-toss');
    const stop = playTurn(game, canvas, board.beginScopedRound, (s) => heard.push(s));
    board.record('ring-toss', 120);
    board.record('ring-toss', 200);
    expect(heard).toEqual([120]);
    expect(board.best('ring-toss')).toBeUndefined();
    stop();
    board.record('ring-toss', 30);
    expect(board.best('ring-toss')).toBe(30);
    expect(heard).toEqual([120]);
  });

  it('stops the game before closing its scope, so a stopping score stays with the turn', () => {
    const board = createScoreBoard(memoryStorage(), () => 1);
    const fake = fakeGame('skee-ball');
    const heard: number[] = [];
    fake.onStop(() => board.record('skee-ball', 70));
    const stop = playTurn(fake.game, canvas, board.beginScopedRound, (s) => heard.push(s));
    stop();
    stop();
    expect(fake.calls.stopped).toBe(1);
    // A round the game finishes while stopping still counts for this turn.
    expect(heard).toEqual([70]);
    expect(board.best('skee-ball')).toBeUndefined();
  });

  it('gives a retried turn a fresh round, with no stale result', () => {
    const board = createScoreBoard(memoryStorage(), () => 1);
    const { game } = fakeGame('high-striker');
    const heard: number[] = [];
    playTurn(game, canvas, board.beginScopedRound, (s) => heard.push(s))();
    const stop = playTurn(game, canvas, board.beginScopedRound, (s) => heard.push(s));
    board.record('high-striker', 175);
    stop();
    expect(heard).toEqual([175]);
  });

  it('never lets a single-player booth or another game land in the party', () => {
    const board = createScoreBoard(memoryStorage(), () => 1);
    const { game } = fakeGame('ring-toss');
    const heard: number[] = [];
    const stop = playTurn(game, canvas, board.beginScopedRound, (s) => heard.push(s));
    board.record('balloon-darts', 55);
    stop();
    expect(heard).toEqual([]);
    expect(board.best('balloon-darts')).toBe(55);
  });

  it('closes the scope when the game fails to start', () => {
    const board = createScoreBoard(memoryStorage(), () => 1);
    const broken = {
      id: 'ring-toss',
      start: () => {
        throw new Error('no canvas');
      },
    };
    expect(() => playTurn(broken, canvas, board.beginScopedRound, () => {})).toThrow('no canvas');
    board.record('ring-toss', 10);
    expect(board.best('ring-toss')).toBe(10);
  });
});

describe('a whole party', () => {
  it('runs six turns through scoped rounds into one saved result per turn', () => {
    const scores = memoryStorage();
    const board = createScoreBoard(scores, () => 1);
    const store = createPartyStore(memoryStorage());
    let p = party('competitive', ['Ada', 'Bo']);
    store.save(p);
    const canvas = {} as HTMLCanvasElement;
    allTurns().forEach((turn: Turn, i) => {
      // A reload between turns: only the stored party carries over.
      p = store.read()!;
      const game = games.find((g) => g.id === PARTY_GAME_IDS[turn.leg])!;
      p = startTurn(p, turn);
      const stop = playTurn(game, canvas, board.beginScopedRound, (score) => {
        p = recordTurn(p, 'party-a', turn, score);
      });
      board.record(game.id, (i + 1) * 10);
      stop();
      store.save(p);
    });
    const done = store.read()!;
    expect(done.results.map((r) => r.score)).toEqual([10, 20, 30, 40, 50, 60]);
    expect(summarize(done, games).winner).toBe(1);
    expect(scores.map.get('tessl-carnival:scores')).toBeUndefined();
  });
});

describe('makePartyId', () => {
  it('makes an id from the time and a random part', () => {
    expect(
      makePartyId(
        () => 36,
        () => 0,
      ),
    ).toBe('party-10-0');
  });
});
