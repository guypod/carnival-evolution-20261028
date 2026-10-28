import { describe, expect, it } from 'vitest';
import { createRegistry, createScoreBoard, type CarnivalGame } from './carnival';
import { CIRCUIT_KEY, circuitProgress, circuitStatus, createCircuit, legText } from './circuit';

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
  return { storage, board, tick, circuit: createCircuit(storage, now) };
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

    board.record('ring-toss', 30);
    tick();
    board.record('ring-toss', 10);
    progress = circuitProgress(games, startedAt, board.top);
    expect(progress.legs[0].latest).toBe(10);
    expect(legText(progress.legs[0])).toBe('Latest score: 10');
    expect(progress.next?.gameId).toBe('skee-ball');
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
