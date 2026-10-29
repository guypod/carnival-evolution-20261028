import { describe, expect, it } from 'vitest';
import {
  MAZE_H,
  MAZE_W,
  createExpeditionStore,
  generateMaze,
  hint,
  move,
  reachable,
  resumeExpedition,
  startExpedition,
  turnMirror,
  undoTurn,
  edgeKey,
  type Expedition,
  type Maze,
} from './expedition';

function memory() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

/** Follows hints, turning the mirror when told, until the expedition ends. */
function playByHints(state: Expedition): Expedition {
  for (let i = 0; i < 1000 && !state.finished; i++) {
    const h = hint(state);
    if (h.type === 'turn') state = turnMirror(state);
    else if (h.type === 'step') state = move(state, h.dir);
  }
  return state;
}

describe('generateMaze', () => {
  it('builds the same maze for the same seed', () => {
    expect(generateMaze(42)).toEqual(generateMaze(42));
    expect(generateMaze(42)).not.toEqual(generateMaze(43));
  });

  it('needs the mirror: the exit is shut with the gate closed and open once it turns', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const maze = generateMaze(seed);
      expect(reachable(maze, false, maze.start, maze.exit)).toBe(false);
      expect(reachable(maze, true, maze.start, maze.exit)).toBe(true);
      expect(new Set(maze.landmarks.map((l) => l.cell)).size).toBe(3);
      for (let c = 0; c < MAZE_W * MAZE_H; c++) {
        expect(reachable(maze, true, maze.start, c)).toBe(true);
        // From anywhere, the mirror can be reached in either state, so nobody is trapped.
        expect(reachable(maze, true, c, maze.mirror)).toBe(true);
      }
    }
  });
});

describe('expedition', () => {
  it('finishes two seeds by following hints, finding all three landmarks', () => {
    for (const seed of [7, 2026]) {
      const done = playByHints(startExpedition(seed));
      expect(done.finished).toBe(true);
      expect(done.found).toHaveLength(3);
      expect(done.flipped).toBe(true);
    }
  });

  it('finishes every seed by hints from any cell the player can stand on, within a bounded walk', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const fresh = startExpedition(seed);
      for (let at = 0; at < MAZE_W * MAZE_H; at++) {
        // Facing east, only the start side can be reached: crossing the gate needs north.
        const states = reachable(fresh.maze, false, fresh.maze.start, at) ? [false, true] : [true];
        for (const flipped of states) {
          // Standing on a landmark means it has been found.
          const found = fresh.maze.landmarks.filter((l) => l.cell === at).map((l) => l.name);
          const done = playByHints({ ...fresh, at, flipped, found });
          expect(done.finished, `seed ${seed} at ${at} flipped ${flipped}`).toBe(true);
        }
      }
    }
    for (let seed = 9; seed <= 200; seed++) {
      expect(playByHints(startExpedition(seed)).finished).toBe(true);
    }
  });

  it('does not bounce between two cells in the serpentine maze from the review', () => {
    // Rows run left to right, then right to left, joined at alternating ends.
    const passages: string[] = [];
    for (let y = 0; y < MAZE_H; y++) {
      for (let x = 0; x < MAZE_W - 1; x++)
        passages.push(edgeKey(y * MAZE_W + x, y * MAZE_W + x + 1));
      if (y < MAZE_H - 1) {
        const x = y % 2 === 0 ? MAZE_W - 1 : 0;
        passages.push(edgeKey(y * MAZE_W + x, (y + 1) * MAZE_W + x));
      }
    }
    const maze: Maze = {
      seed: 0,
      passages,
      gate: edgeKey(31, 32),
      shortcut: edgeKey(17, 26),
      mirror: 19,
      landmarks: [31, 16, 40].map((cell, i) => ({ cell, name: `l${i}` })),
      start: 0,
      exit: MAZE_W * MAZE_H - 1,
    };
    const state: Expedition = { ...startExpedition(1), maze, at: 21, visited: [21] };
    const first = hint(state);
    expect(first.type).toBe('step');
    const stepped = move(state, (first as { dir: 'left' }).dir);
    const second = hint(stepped);
    if (second.type === 'step') expect(move(stepped, second.dir).at).not.toBe(state.at);
    expect(playByHints(state).finished).toBe(true);
  });

  it('only turns the mirror while standing on it, and undo walks back to it', () => {
    let state = startExpedition(7);
    expect(turnMirror(state)).toBe(state);
    while (state.at !== state.maze.mirror) {
      const h = hint({
        ...state,
        found: [],
        maze: { ...state.maze, landmarks: [{ cell: state.maze.mirror, name: 'm' }] },
      });
      if (h.type !== 'step') break;
      state = move(state, h.dir);
    }
    const turned = turnMirror(state);
    expect(turned.flipped).toBe(true);
    const undone = undoTurn({ ...turned, at: turned.maze.start });
    expect(undone.flipped).toBe(false);
    expect(undone.at).toBe(state.maze.mirror);
    expect(undone.history).toHaveLength(0);
  });

  it('does not walk through walls', () => {
    const state = startExpedition(7);
    expect(move(state, 'up')).toBe(state);
    expect(move(state, 'left')).toBe(state);
  });
});

describe('createExpeditionStore', () => {
  it('saves progress, resumes it after reload and records finished seeds', () => {
    const storage = memory();
    const store = createExpeditionStore(storage);
    let state = startExpedition(7);
    const h = hint(state);
    if (h.type === 'step') state = move(state, h.dir);
    store.save(state);
    const resumed = resumeExpedition(createExpeditionStore(storage).load().current!);
    expect(resumed.at).toBe(state.at);
    expect(resumed.visited).toEqual(state.visited);
    store.save(playByHints(resumed));
    expect(store.load()).toEqual({ current: undefined, completed: [7] });
    expect(storage.getItem('carnival:scores')).toBeNull();
  });

  it('drops repeated landmark names from a restored save, so it can still finish', () => {
    const names = generateMaze(7).landmarks.map((l) => l.name);
    const resumed = resumeExpedition({
      seed: 7,
      at: 0,
      flipped: false,
      visited: [0],
      found: [...names, names[0], 'Nowhere'],
    });
    expect(resumed.found).toEqual(names);
    expect(playByHints(resumed).finished).toBe(true);
  });

  it('starts fresh from a broken save', () => {
    const storage = memory();
    storage.setItem('carnival:expedition', '{bad');
    expect(createExpeditionStore(storage).load()).toEqual({ completed: [] });
    expect(createExpeditionStore(undefined).save(startExpedition(1))).toBe(false);
  });
});
