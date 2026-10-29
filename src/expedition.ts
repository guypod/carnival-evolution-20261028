/**
 * The Mirror Maze Expedition: an untimed walk through a seeded maze. Find the
 * three landmarks, then the exit. A rotating mirror swaps which of two gates
 * is open. Progress is kept apart from the arcade scores.
 */

export const MAZE_W = 9;
export const MAZE_H = 7;

export type Dir = 'up' | 'down' | 'left' | 'right';
const STEP: Record<Dir, [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

export interface Maze {
  seed: number;
  /** Open passages in the base maze, as edge keys like '3,2|4,2'. */
  passages: string[];
  /** Closed while the mirror faces east, open while it faces north. */
  gate: string;
  /** Open while the mirror faces east, closed while it faces north; '' when the maze has none. */
  shortcut: string;
  mirror: number;
  landmarks: { cell: number; name: string }[];
  start: number;
  exit: number;
}

export const LANDMARK_NAMES = ['Funhouse Clown', 'Crystal Fountain', 'Brass Telescope'];

export function cellOf(x: number, y: number): number {
  return y * MAZE_W + x;
}
export function xy(cell: number): [number, number] {
  return [cell % MAZE_W, Math.floor(cell / MAZE_W)];
}
export function edgeKey(a: number, b: number): string {
  const [p, q] = a < b ? [a, b] : [b, a];
  return `${p}|${q}`;
}

/** A small seeded random generator, so a seed always builds the same maze. */
export function seededRandom(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function neighbours(cell: number): number[] {
  const [x, y] = xy(cell);
  return Object.values(STEP)
    .map(([dx, dy]) => [x + dx, y + dy])
    .filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < MAZE_W && ny < MAZE_H)
    .map(([nx, ny]) => cellOf(nx, ny));
}

function distances(open: Set<string>, from: number): number[] {
  const dist = Array<number>(MAZE_W * MAZE_H).fill(-1);
  dist[from] = 0;
  const queue = [from];
  while (queue.length) {
    const c = queue.shift()!;
    for (const n of neighbours(c)) {
      if (dist[n] < 0 && open.has(edgeKey(c, n))) {
        dist[n] = dist[c] + 1;
        queue.push(n);
      }
    }
  }
  return dist;
}

/** Builds the maze for `seed`. Every maze it builds can be finished. */
export function generateMaze(seed: number): Maze {
  const rand = seededRandom(seed);
  const pick = <T>(items: T[]): T => items[Math.floor(rand() * items.length)];
  const tree = new Set<string>();
  const seen = new Set([0]);
  const stack = [0];
  while (stack.length) {
    const c = stack[stack.length - 1];
    const fresh = neighbours(c).filter((n) => !seen.has(n));
    if (!fresh.length) {
      stack.pop();
      continue;
    }
    const n = pick(fresh);
    tree.add(edgeKey(c, n));
    seen.add(n);
    stack.push(n);
  }
  const start = 0;
  const exit = cellOf(MAZE_W - 1, MAZE_H - 1);
  // The gate sits on the way to the exit, about halfway along it.
  const path = pathBetween(tree, start, exit);
  const gi = Math.floor(path.length / 2);
  const gate = edgeKey(path[gi - 1], path[gi]);
  const withoutGate = new Set([...tree].filter((e) => e !== gate));
  const near = distances(withoutGate, start);
  const nearSide = near.map((d, c) => (d >= 0 ? c : -1)).filter((c) => c >= 0);
  const farSide = near.map((d, c) => (d < 0 ? c : -1)).filter((c) => c >= 0);
  // The shortcut is a new wall opening that is not part of the base maze.
  const candidates: string[] = [];
  for (let c = 0; c < MAZE_W * MAZE_H; c++) {
    for (const n of neighbours(c)) {
      // Both ends on the start side, so the shortcut never bypasses the gate.
      if (c < n && !tree.has(edgeKey(c, n)) && near[c] >= 0 && near[n] >= 0)
        candidates.push(edgeKey(c, n));
    }
  }
  const shortcut = candidates.length ? pick(candidates) : '';
  const mirror = pick(nearSide.filter((c) => c !== start));
  const pool = farSide.filter((c) => c !== exit);
  const far = pick(pool);
  const others = [...nearSide, ...pool].filter(
    (c) => c !== start && c !== exit && c !== mirror && c !== far,
  );
  const second = pick(others);
  const third = pick(others.filter((c) => c !== second));
  const landmarks = [far, second, third].map((cell, i) => ({ cell, name: LANDMARK_NAMES[i] }));
  return { seed, passages: [...tree], gate, shortcut, mirror, landmarks, start, exit };
}

function pathBetween(open: Set<string>, from: number, to: number): number[] {
  const dist = distances(open, to);
  if (dist[from] < 0) return [];
  const path = [from];
  let c = from;
  while (c !== to) {
    c = neighbours(c).find((n) => open.has(edgeKey(c, n)) && dist[n] === dist[c] - 1)!;
    path.push(c);
  }
  return path;
}

/** The passages open with the mirror facing north (`flipped`) or east. */
export function openPassages(maze: Maze, flipped: boolean): Set<string> {
  const open = new Set(maze.passages);
  if (flipped) {
    open.add(maze.gate);
    open.delete(maze.shortcut);
  } else {
    open.delete(maze.gate);
    if (maze.shortcut) open.add(maze.shortcut);
  }
  return open;
}

export interface Expedition {
  maze: Maze;
  at: number;
  flipped: boolean;
  visited: number[];
  found: string[];
  /** Where the player stood and how the mirror faced before each turn. */
  history: { at: number; flipped: boolean }[];
  finished: boolean;
}

export function startExpedition(seed: number): Expedition {
  const maze = generateMaze(seed);
  return {
    maze,
    at: maze.start,
    flipped: false,
    visited: [maze.start],
    found: [],
    history: [],
    finished: false,
  };
}

/** Steps one cell if a passage is open that way. Returns the same state otherwise. */
export function move(state: Expedition, dir: Dir): Expedition {
  if (state.finished) return state;
  const [x, y] = xy(state.at);
  const [dx, dy] = STEP[dir];
  const nx = x + dx;
  const ny = y + dy;
  if (nx < 0 || ny < 0 || nx >= MAZE_W || ny >= MAZE_H) return state;
  const to = cellOf(nx, ny);
  if (!openPassages(state.maze, state.flipped).has(edgeKey(state.at, to))) return state;
  const found = [...state.found];
  for (const l of state.maze.landmarks)
    if (l.cell === to && !found.includes(l.name)) found.push(l.name);
  const visited = state.visited.includes(to) ? state.visited : [...state.visited, to];
  const finished = to === state.maze.exit && found.length === state.maze.landmarks.length;
  return { ...state, at: to, visited, found, finished };
}

/** Turns the mirror. Only works while standing on the mirror. */
export function turnMirror(state: Expedition): Expedition {
  if (state.finished || state.at !== state.maze.mirror) return state;
  return {
    ...state,
    flipped: !state.flipped,
    history: [...state.history, { at: state.at, flipped: state.flipped }],
  };
}

/** Undoes the last mirror turn and walks the player back to the mirror. */
export function undoTurn(state: Expedition): Expedition {
  const last = state.history[state.history.length - 1];
  if (!last || state.finished) return state;
  return { ...state, at: last.at, flipped: last.flipped, history: state.history.slice(0, -1) };
}

/** What the player is heading for next: a landmark not yet found, else the exit. */
export function nextGoal(state: Expedition): number {
  const left = state.maze.landmarks.filter((l) => !state.found.includes(l.name));
  if (!left.length) return state.maze.exit;
  const dist = distances(openPassages(state.maze, true), state.at);
  return left.reduce((a, b) => (dist[b.cell] < dist[a.cell] ? b : a)).cell;
}

export type Hint = { type: 'step'; dir: Dir } | { type: 'turn' } | { type: 'done' };

/**
 * One step toward the next goal. When the mirror blocks the way, the hint
 * leads to the mirror, which is always reachable, so a hint never traps.
 */
export function hint(state: Expedition): Hint {
  if (state.finished) return { type: 'done' };
  const goal = nextGoal(state);
  const open = openPassages(state.maze, state.flipped);
  let path = pathBetween(open, state.at, goal);
  if (!path.length) {
    if (state.at === state.maze.mirror) return { type: 'turn' };
    path = pathBetween(open, state.at, state.maze.mirror);
  }
  if (path.length < 2) return { type: 'turn' };
  const [x, y] = xy(path[0]);
  const [nx, ny] = xy(path[1]);
  const dir = (Object.keys(STEP) as Dir[]).find(
    (d) => STEP[d][0] === nx - x && STEP[d][1] === ny - y,
  )!;
  return { type: 'step', dir };
}

/** True when every cell, landmark and the exit can be reached from `from` in this mirror state. */
export function reachable(maze: Maze, flipped: boolean, from: number, to: number): boolean {
  return distances(openPassages(maze, flipped), from)[to] >= 0;
}

export const EXPEDITION_KEY = 'carnival:expedition';

export interface ExpeditionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ExpeditionProgress {
  /** The expedition in progress, if any. */
  current?: { seed: number; at: number; flipped: boolean; visited: number[]; found: string[] };
  /** Seeds finished in this browser. */
  completed: number[];
}

/** Keeps expedition progress in this browser, apart from the arcade scores. */
export function createExpeditionStore(storage: ExpeditionStorage | undefined) {
  return {
    load(): ExpeditionProgress {
      try {
        const raw = JSON.parse(storage?.getItem(EXPEDITION_KEY) ?? 'null');
        const completed = Array.isArray(raw?.completed)
          ? raw.completed.filter(Number.isInteger)
          : [];
        const c = raw?.current;
        const current =
          c &&
          Number.isInteger(c.seed) &&
          Number.isInteger(c.at) &&
          Array.isArray(c.visited) &&
          Array.isArray(c.found)
            ? { seed: c.seed, at: c.at, flipped: !!c.flipped, visited: c.visited, found: c.found }
            : undefined;
        return { current, completed };
      } catch {
        return { completed: [] };
      }
    },
    save(state: Expedition): boolean {
      try {
        if (!storage) return false;
        const old = this.load();
        const completed =
          state.finished && !old.completed.includes(state.maze.seed)
            ? [...old.completed, state.maze.seed]
            : old.completed;
        const { at, flipped, visited, found } = state;
        const current = state.finished
          ? undefined
          : { seed: state.maze.seed, at, flipped, visited, found };
        storage.setItem(EXPEDITION_KEY, JSON.stringify({ current, completed }));
        return true;
      } catch {
        return false;
      }
    },
  };
}

/** Rebuilds a saved expedition, or a fresh one when the save does not fit its maze. */
export function resumeExpedition(saved: NonNullable<ExpeditionProgress['current']>): Expedition {
  const fresh = startExpedition(saved.seed);
  const cells = MAZE_W * MAZE_H;
  if (saved.at < 0 || saved.at >= cells) return fresh;
  const names = fresh.maze.landmarks.map((l) => l.name);
  return {
    ...fresh,
    at: saved.at,
    flipped: saved.flipped,
    visited: saved.visited.filter((c) => Number.isInteger(c) && c >= 0 && c < cells),
    found: saved.found.filter((n) => names.includes(n)),
  };
}
