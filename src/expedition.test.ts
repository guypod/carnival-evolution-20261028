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
  type Expedition,
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
  for (let i = 0; i < 2000 && !state.finished; i++) {
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

  it('starts fresh from a broken save', () => {
    const storage = memory();
    storage.setItem('carnival:expedition', '{bad');
    expect(createExpeditionStore(storage).load()).toEqual({ completed: [] });
    expect(createExpeditionStore(undefined).save(startExpedition(1))).toBe(false);
  });
});
