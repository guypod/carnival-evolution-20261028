import { describe, expect, it } from 'vitest';
import { createRegistry, createScoreBoard, type CarnivalGame } from './carnival';
import {
  CIRCUIT_HISTORY_KEY,
  CIRCUIT_KEY,
  HISTORY_SIZE,
  circuitProgress,
  circuitStatus,
  createCircuit,
  createCircuitHistory,
  legText,
  restartCircuit,
  runText,
  savedProgress,
} from './circuit';
import { onEscapeKey } from './escape';

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

function game(id: string, name: string): CarnivalGame {
  return { id, name, description: '', start: () => () => {} };
}

const games = createRegistry([
  game('water-cannon', 'Water Cannon'),
  game('ring-toss', 'Ring Toss'),
  game('balloon-darts', 'Balloon Darts'),
  game('skee-ball', 'Skee Ball'),
]).all();

function setup() {
  let clock = 1000;
  const storage = memoryStorage();
  const now = () => clock;
  const tick = (ms = 1) => (clock += ms);
  const board = createScoreBoard(storage, now);
  return {
    storage,
    board,
    tick,
    circuit: createCircuit(storage, now),
    history: createCircuitHistory(storage),
  };
}

/** Starts a circuit and plays every leg once with the given scores. */
function playCircuit(s: ReturnType<typeof setup>, scores: [number, number, number]) {
  s.tick();
  const startedAt = s.circuit.start();
  s.tick();
  s.board.record('ring-toss', scores[0]);
  s.tick();
  s.board.record('balloon-darts', scores[1]);
  s.tick();
  s.board.record('skee-ball', scores[2]);
  s.tick();
  return circuitProgress(games, startedAt, s.board.top);
}

describe('circuitProgress', () => {
  it('lists the three legs in order and starts at the first', () => {
    const { board, circuit } = setup();
    const startedAt = circuit.start();
    const progress = circuitProgress(games, startedAt, board.top);
    expect(progress.legs.map((leg) => leg.gameId)).toEqual([
      'ring-toss',
      'balloon-darts',
      'skee-ball',
    ]);
    expect(progress.next?.playHref).toBe('#/play/ring-toss');
    expect(circuitStatus(progress)).toBe('Leg 1 of 3: play Ring Toss.');
  });

  it('ignores scores recorded before the circuit began, even a high score', () => {
    const { board, circuit, tick } = setup();
    board.record('ring-toss', 900);
    tick();
    const startedAt = circuit.start();
    const progress = circuitProgress(games, startedAt, board.top);
    expect(progress.legs[0]).toMatchObject({ complete: false, latest: undefined });
    expect(legText(progress.legs[0])).toBe('Not played this circuit');
  });

  it('completes a leg from a new score at that booth only, using the latest run', () => {
    const { board, circuit, tick } = setup();
    const startedAt = circuit.start();
    tick();
    board.record('water-cannon', 50);
    board.record('balloon-darts', 40);
    let progress = circuitProgress(games, startedAt, board.top);
    expect(progress.legs.map((leg) => leg.complete)).toEqual([false, true, false]);
    expect(progress.next?.gameId).toBe('ring-toss');
    expect(circuitStatus(progress)).toBe('Leg 1 of 3: play Ring Toss.');

    board.record('ring-toss', 30);
    tick();
    board.record('ring-toss', 10);
    progress = circuitProgress(games, startedAt, board.top);
    expect(progress.legs[0].latest).toBe(10);
    expect(legText(progress.legs[0])).toBe('Latest score: 10');
    expect(progress.next?.gameId).toBe('skee-ball');
  });

  it('names the next booth by its place in the itinerary when booths are played out of order', () => {
    const { board, circuit, tick } = setup();
    const startedAt = circuit.start();
    tick();
    board.record('balloon-darts', 40);
    board.record('skee-ball', 150);
    let progress = circuitProgress(games, startedAt, board.top);
    expect(circuitStatus(progress)).toBe('Leg 1 of 3: play Ring Toss.');

    board.record('ring-toss', 12);
    progress = circuitProgress(games, startedAt, board.top);
    expect(progress.finished).toBe(true);

    tick();
    const restarted = circuit.start();
    tick();
    board.record('ring-toss', 20);
    board.record('skee-ball', 90);
    progress = circuitProgress(games, restarted, board.top);
    expect(circuitStatus(progress)).toBe('Leg 2 of 3: play Balloon Darts.');
  });

  it('finishes with the total of each leg', () => {
    const { board, circuit, tick } = setup();
    const startedAt = circuit.start();
    tick();
    board.record('ring-toss', 12);
    board.record('balloon-darts', 30);
    board.record('skee-ball', 200);
    const progress = circuitProgress(games, startedAt, board.top);
    expect(progress.finished).toBe(true);
    expect(progress.next).toBeUndefined();
    expect(progress.total).toBe(242);
    expect(circuitStatus(progress)).toBe('Circuit complete! Total: 242.');
  });

  it('restarting starts every leg over without touching scores', () => {
    const { storage, board, circuit, tick } = setup();
    circuit.start();
    tick();
    board.record('ring-toss', 12);
    const scores = storage.map.get('tessl-carnival:scores');
    tick();
    const restarted = circuit.start();
    const progress = circuitProgress(games, restarted, board.top);
    expect(progress.legs.every((leg) => !leg.complete)).toBe(true);
    expect(progress.total).toBe(0);
    expect(storage.map.get('tessl-carnival:scores')).toBe(scores);
  });

  it('shows no legs in progress before a circuit starts', () => {
    const { board } = setup();
    board.record('ring-toss', 12);
    const progress = circuitProgress(games, undefined, board.top);
    expect(progress.legs.some((leg) => leg.complete)).toBe(false);
    expect(progress.next).toBeUndefined();
    expect(circuitStatus(progress)).toBe('Start a circuit to begin at the first booth.');
  });

  it('skips booths that are not registered', () => {
    const progress = circuitProgress([game('skee-ball', 'Skee Ball')], 0, () => []);
    expect(progress.legs.map((leg) => leg.gameId)).toEqual(['skee-ball']);
    expect(circuitStatus(circuitProgress([], 0, () => []))).toBe(
      'The circuit booths are not open yet.',
    );
  });
});

describe('createCircuit', () => {
  it('keeps the circuit across a reload', () => {
    const storage = memoryStorage();
    const startedAt = createCircuit(storage, () => 42).start();
    expect(startedAt).toBe(42);
    expect(createCircuit(storage).startedAt()).toBe(42);
  });

  it('reads malformed storage as no circuit', () => {
    for (const raw of ['{oops', '[]', '"x"', '{"startedAt":"1"}', '{"startedAt":null}']) {
      expect(createCircuit(memoryStorage({ [CIRCUIT_KEY]: raw })).startedAt()).toBeUndefined();
    }
  });

  it('tolerates storage that cannot be read or written', () => {
    const broken = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(createCircuit(broken).startedAt()).toBeUndefined();
    expect(createCircuit(broken).start()).toBeUndefined();
    expect(createCircuit(undefined).start()).toBeUndefined();
  });
});

describe('restartCircuit', () => {
  /** Mirrors the circuit page: each render adds an Escape listener and owns its cleanup. */
  function page(start: () => number | undefined) {
    const target = new EventTarget();
    let escapes = 0;
    let renders = 0;
    let stop: (() => void) | undefined;
    const cleanup = () => {
      stop?.();
      stop = undefined;
    };
    const render = () => {
      renders++;
      stop = onEscapeKey(target, () => escapes++);
    };
    const escape = () =>
      target.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Escape' }));
    render();
    return {
      restart: () => restartCircuit(start, cleanup, render),
      leave: cleanup,
      escape,
      escapes: () => escapes,
      renders: () => renders,
    };
  }

  it('leaves no Escape listener behind after repeated starts and leaving the page', () => {
    const view = page(() => 1);
    for (let i = 0; i < 3; i++) expect(view.restart()).toBe(true);
    expect(view.renders()).toBe(4);
    view.escape();
    expect(view.escapes()).toBe(1);
    view.leave();
    view.escape();
    expect(view.escapes()).toBe(1);
  });

  it('keeps the current page when the start cannot be saved', () => {
    const view = page(() => undefined);
    expect(view.restart()).toBe(false);
    expect(view.renders()).toBe(1);
    view.escape();
    expect(view.escapes()).toBe(1);
  });
});

describe('finished circuit', () => {
  it('keeps the legs from when it finished, whatever is played afterwards', () => {
    const s = setup();
    const done = playCircuit(s, [12, 30, 200]);
    expect(done.completedAt).toBeDefined();
    s.board.record('ring-toss', 99);
    s.tick();
    s.board.record('skee-ball', 1);
    const later = circuitProgress(games, done.startedAt, s.board.top);
    expect(later.legs.map((leg) => leg.latest)).toEqual([12, 30, 200]);
    expect(later.total).toBe(242);
    expect(later.completedAt).toBe(done.completedAt);
  });

  it('uses the latest run at a booth played again before the circuit finished', () => {
    const s = setup();
    const startedAt = s.circuit.start();
    s.tick();
    s.board.record('ring-toss', 5);
    s.tick();
    s.board.record('ring-toss', 8);
    s.tick();
    s.board.record('balloon-darts', 20);
    s.tick();
    s.board.record('skee-ball', 100);
    s.tick();
    s.board.record('ring-toss', 50);
    const progress = circuitProgress(games, startedAt, s.board.top);
    expect(progress.legs.map((leg) => leg.latest)).toEqual([8, 20, 100]);
  });
});

describe('createCircuitHistory', () => {
  it('saves a finished circuit once, with each leg, the total and when', () => {
    const s = setup();
    const done = playCircuit(s, [12, 30, 200]);
    expect(s.history.save(done)).toBe('saved');
    expect(s.history.save(done)).toBe('already-saved');
    const { runs, best } = s.history.read()!;
    expect(runs).toEqual([
      {
        startedAt: done.startedAt,
        completedAt: done.completedAt,
        legs: [
          { gameId: 'ring-toss', score: 12 },
          { gameId: 'balloon-darts', score: 30 },
          { gameId: 'skee-ball', score: 200 },
        ],
        total: 242,
      },
    ]);
    expect(best).toBe(242);
    expect(runText(runs[0], games)).toBe(
      'Ring Toss 12 · Balloon Darts 30 · Skee Ball 200 · Total 242',
    );
  });

  it('does not save a circuit that is not finished or not started', () => {
    const s = setup();
    const startedAt = s.circuit.start();
    s.tick();
    s.board.record('ring-toss', 12);
    expect(s.history.save(circuitProgress(games, startedAt, s.board.top))).toBe('not-finished');
    expect(s.history.save(circuitProgress(games, undefined, s.board.top))).toBe('not-finished');
    expect(s.storage.map.has(CIRCUIT_HISTORY_KEY)).toBe(false);
    expect(s.history.read()).toEqual({ runs: [], best: undefined });
  });

  it('saves once across reloads and repeat visits', () => {
    const s = setup();
    const done = playCircuit(s, [1, 2, 3]);
    expect(s.history.save(done)).toBe('saved');
    s.board.record('skee-ball', 500);
    const reloaded = createCircuitHistory(s.storage);
    const revisit = circuitProgress(games, createCircuit(s.storage).startedAt(), s.board.top);
    expect(reloaded.save(revisit)).toBe('already-saved');
    expect(reloaded.read()!.runs).toHaveLength(1);
    expect(reloaded.read()!.runs[0].total).toBe(6);
  });

  it('keeps the history, scores and the finished run when the circuit restarts', () => {
    const s = setup();
    s.history.save(playCircuit(s, [1, 2, 3]));
    const scores = s.storage.map.get('tessl-carnival:scores');
    s.tick();
    const restarted = s.circuit.start();
    expect(s.history.save(circuitProgress(games, restarted, s.board.top))).toBe('not-finished');
    expect(s.history.read()!.runs.map((run) => run.total)).toEqual([6]);
    expect(s.storage.map.get('tessl-carnival:scores')).toBe(scores);
  });

  it('keeps the latest five, newest first, and the best total of all', () => {
    const s = setup();
    const totals = [900, 10, 20, 30, 40, 50, 60];
    for (const total of totals) {
      expect(s.history.save(playCircuit(s, [total, 0, 0]))).toBe('saved');
    }
    const { runs, best } = s.history.read()!;
    expect(runs).toHaveLength(HISTORY_SIZE);
    expect(runs.map((run) => run.total)).toEqual([60, 50, 40, 30, 20]);
    expect(best).toBe(900);
  });

  it('reads malformed history as unreadable and never writes over it', () => {
    for (const raw of [
      '{oops',
      'null',
      '[]',
      '{"runs":"x"}',
      '{"runs":[{"startedAt":1}]}',
      '{"runs":[],"best":"9"}',
      '{"runs":[{"startedAt":1,"completedAt":1e20,"legs":[],"total":0}]}',
      '{"runs":[{"startedAt":5,"completedAt":4,"legs":[],"total":0}]}',
    ]) {
      const s = setup();
      s.storage.map.set(CIRCUIT_HISTORY_KEY, raw);
      expect(s.history.read()).toBeUndefined();
      expect(s.history.save(playCircuit(s, [1, 2, 3]))).toBe('unreadable');
      expect(s.storage.map.get(CIRCUIT_HISTORY_KEY)).toBe(raw);
    }
  });

  it('tolerates storage that is missing, cannot be read or cannot be written', () => {
    const s = setup();
    const done = playCircuit(s, [1, 2, 3]);
    const unreadable = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('should not write');
      },
    };
    expect(createCircuitHistory(unreadable).read()).toBeUndefined();
    expect(createCircuitHistory(unreadable).save(done)).toBe('unreadable');
    expect(createCircuitHistory(undefined).read()).toBeUndefined();
    expect(createCircuitHistory(undefined).save(done)).toBe('unreadable');

    const full = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(createCircuitHistory(full).save(done)).toBe('failed');
  });

  it('shows a saved circuit as saved, even after its scores leave the scoreboard', () => {
    const s = setup();
    for (let i = 0; i < 49; i++) s.board.record('ring-toss', 100);
    const done = playCircuit(s, [1, 2, 3]);
    expect(s.history.save(done)).toBe('saved');
    s.tick();
    s.board.record('ring-toss', 50);
    const later = circuitProgress(games, done.startedAt, s.board.top);
    expect(later.legs[0].latest).toBe(50);
    const shown = savedProgress(later, s.history.read());
    expect(shown.legs.map((leg) => leg.latest)).toEqual([1, 2, 3]);
    expect(shown.total).toBe(6);
    expect(shown.completedAt).toBe(done.completedAt);
    expect(shown.finished).toBe(true);
  });
});
