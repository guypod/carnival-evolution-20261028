import { canvasFont, theme } from '../carnival/theme';
import { REDUCED_MOTION_QUERY, isQuiet, motionPreference } from '../midway/motion';
import {
  ENTRANCE,
  FAIR_HEIGHT,
  FAIR_WIDTH,
  PIECES,
  PIECE_COST,
  PIECE_NAME,
  STARTER,
  attractions,
  createFairStore,
  dropCarried,
  key,
  place,
  pushHistory,
  remove,
  settleWalker,
  step,
  summary,
  type Carried,
  type Cell,
  type Layout,
  type Piece,
  type PlaceResult,
} from './fair';
import {
  KIND_NAME,
  advance,
  createSim,
  describeGroup,
  relayout,
  resetSim,
  type Sim,
} from './visitors';

const CELL = 64;

/** The part of an element `bindActions` needs, so tests can pass a fake. */
export interface ActionBar {
  addEventListener(type: 'click', listener: (event: Event) => void): void;
  removeEventListener(type: 'click', listener: (event: Event) => void): void;
}

/**
 * Sends a click on any `[data-act]` button inside any of `bars` to `act`, and
 * returns a function that removes every listener it added.
 */
export function bindActions(bars: Iterable<ActionBar>, act: (name: string) => void): () => void {
  const list = [...bars];
  const onAction = (event: Event) => {
    const name = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-act]')?.dataset
      .act;
    if (name) act(name);
  };
  list.forEach((bar) => bar.addEventListener('click', onAction));
  return () => list.forEach((bar) => bar.removeEventListener('click', onAction));
}

/** Quiet mode, from the guide's saved choice or the system's reduced-motion setting. */
function quietNow(): boolean {
  let systemReduces: boolean;
  try {
    systemReduces = window.matchMedia?.(REDUCED_MOTION_QUERY).matches ?? false;
  } catch {
    systemReduces = false;
  }
  return isQuiet(motionPreference.load(), systemReduces);
}
const ICON: Record<Piece, string> = { path: '', game: '🎯', food: '🍿', bench: '🪑', tree: '🌳' };

/** Mounts the plaza editor into `root`. Returns a cleanup that removes every listener. */
export function startFair(
  root: HTMLElement,
  storage: Parameters<typeof createFairStore>[0],
): () => void {
  root.innerHTML = `
    <p class="fair-intro">Lay paths from the entrance (the gate on the left), then place stalls and benches beside them. Visitors only reach a piece that touches a path connected to the entrance.</p>
    <div class="fair-tools" role="group" aria-label="Piece to place"></div>
    <canvas class="fair-grid" tabindex="0" role="application" aria-label="Fair plaza grid. Arrow keys move the cursor."></canvas>
    <p class="fair-help">Keys: arrows move, 1 to 5 pick a piece, Enter places, Delete removes, M picks up and drops a piece, U undoes, W walks your plaza, G selects a visitor group, P pauses visitors.</p>
    <div class="fair-actions">
      <button type="button" data-act="undo">Undo</button>
      <button type="button" data-act="walk" aria-pressed="false">Walk my plaza</button>
      <button type="button" data-act="save">Save layout</button>
      <button type="button" data-act="reload">Reload saved layout</button>
      <button type="button" data-act="reset">Reset this plaza</button>
    </div>
    <div class="fair-actions" role="group" aria-label="Visitors">
      <button type="button" data-act="pause" aria-pressed="false">Pause visitors</button>
      <button type="button" data-act="next-group">Select next group (G)</button>
      <button type="button" data-act="reset-visitors">Restart visitors</button>
    </div>
    <p class="fair-visitor" aria-live="polite"></p>
    <p class="fair-status" role="status" aria-live="polite"></p>
    <p class="fair-summary"></p>`;

  const store = createFairStore(storage);
  const loaded = store.load();
  let layout: Layout = loaded.layout;
  let history: Layout[] = [];
  let cursor: Cell = { x: 1, y: 3 };
  let piece: Piece = 'path';
  let carrying: Carried | undefined;
  let walker: Cell | undefined;
  const quiet = quietNow();
  let sim: Sim = createSim(layout, 1, quiet);
  let selected: number | undefined;

  const canvas = root.querySelector<HTMLCanvasElement>('canvas')!;
  canvas.width = FAIR_WIDTH * CELL;
  canvas.height = FAIR_HEIGHT * CELL;
  const ctx = canvas.getContext('2d');
  const status = root.querySelector('.fair-status')!;
  const summaryLine = root.querySelector('.fair-summary')!;
  const visitorCard = root.querySelector('.fair-visitor')!;
  const pauseButton = root.querySelector<HTMLButtonElement>('[data-act="pause"]')!;
  const walkButton = root.querySelector<HTMLButtonElement>('[data-act="walk"]')!;
  const tools = root.querySelector('.fair-tools')!;
  const toolButtons = PIECES.map((p, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = `${i + 1}. ${PIECE_NAME[p]} (${PIECE_COST[p]})`;
    b.addEventListener('click', () => pick(p));
    tools.append(b);
    return b;
  });

  function say(text: string) {
    status.textContent = text;
  }

  function describe(cell: Cell): string {
    const here = layout[key(cell)];
    const where = `Column ${cell.x + 1}, row ${cell.y + 1}`;
    if (cell.x === ENTRANCE.x && cell.y === ENTRANCE.y) return `${where}: the entrance.`;
    if (!here) return `${where}: empty.`;
    const info = attractions(layout).find((a) => a.x === cell.x && a.y === cell.y);
    return `${where}: ${PIECE_NAME[here]}${info && !info.connected ? ', not connected to the entrance' : ''}.`;
  }

  /** Every layout change goes through here, so a pickup or a walker never outlives the layout it was made on. */
  function setLayout(next: Layout) {
    layout = next;
    carrying = undefined;
    walker = settleWalker(layout, walker);
    sim = relayout(sim, layout);
  }

  function apply(result: PlaceResult, done: string) {
    if (!result.ok) return say(result.reason);
    history = pushHistory(history, layout);
    setLayout(result.layout);
    say(done);
    draw();
  }

  function setPauseButton() {
    pauseButton.setAttribute('aria-pressed', String(sim.paused));
    pauseButton.textContent = sim.paused ? 'Resume visitors' : 'Pause visitors';
  }

  function pick(p: Piece) {
    piece = p;
    say(`Placing: ${PIECE_NAME[p]}, costs ${PIECE_COST[p]}.`);
    draw();
  }

  function act(name: string) {
    if (name === 'undo') {
      const last = history.at(-1);
      if (!last) return say('Nothing to undo.');
      history = history.slice(0, -1);
      setLayout(last);
      say('Undid the last edit.');
    } else if (name === 'walk') {
      walker = walker ? undefined : { ...ENTRANCE };
      walkButton.setAttribute('aria-pressed', String(Boolean(walker)));
      say(
        walker
          ? 'Walking from the entrance. Arrow keys walk along paths. Press W to go back to building.'
          : 'Back to building.',
      );
      canvas.focus();
    } else if (name === 'pause') {
      sim = { ...sim, paused: !sim.paused, carry: 0 };
      setPauseButton();
    } else if (name === 'next-group') {
      const ids = sim.groups.map((g) => g.id);
      if (!ids.length) return say('No visitor groups on the plaza right now.');
      const at = selected === undefined ? -1 : ids.indexOf(selected);
      selected = ids[(at + 1) % ids.length];
    } else if (name === 'reset-visitors') {
      sim = resetSim(sim);
      selected = undefined;
      say('Visitors restarted from the same seed. Your layout is unchanged.');
    } else if (name === 'save') {
      say(
        store.save(layout)
          ? 'Layout saved in this browser.'
          : 'Could not save: storage is unavailable or full. Your plaza is still here.',
      );
    } else if (name === 'reload') {
      const result = store.load();
      history = pushHistory(history, layout);
      setLayout(result.layout);
      say(result.note ?? 'Reloaded your saved layout.');
    } else if (name === 'reset') {
      if (
        !window.confirm(
          'Reset this plaza to the starter layout? Scores and other progress are not touched.',
        )
      )
        return;
      history = pushHistory(history, layout);
      setLayout(STARTER);
      say(
        store.reset()
          ? 'Plaza reset to the starter layout. Undo brings your layout back.'
          : 'Plaza reset here, but the saved copy could not be cleared.',
      );
    }
    draw();
  }

  function onKey(event: KeyboardEvent) {
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const delta = moves[event.key];
    if (delta) {
      event.preventDefault();
      if (walker) {
        const next = step(layout, walker, ...delta);
        if (next === walker) say('No path that way.');
        else {
          walker = next;
          const near = attractions(layout).filter(
            (a) => Math.abs(a.x - next.x) + Math.abs(a.y - next.y) === 1 && a.piece !== 'tree',
          );
          say(
            near.length
              ? `Next to: ${near.map((a) => PIECE_NAME[a.piece]).join(', ')}.`
              : `On the path at column ${next.x + 1}, row ${next.y + 1}.`,
          );
        }
      } else {
        cursor = {
          x: Math.min(FAIR_WIDTH - 1, Math.max(0, cursor.x + delta[0])),
          y: Math.min(FAIR_HEIGHT - 1, Math.max(0, cursor.y + delta[1])),
        };
        say(describe(cursor));
      }
      draw();
      return;
    }
    const digit = Number(event.key);
    if (digit >= 1 && digit <= PIECES.length) return pick(PIECES[digit - 1]);
    const k = event.key.toLowerCase();
    if (k === 'w') return act('walk');
    if (k === 'g') return act('next-group');
    if (k === 'p') return act('pause');
    if (k === 'u' || (k === 'z' && (event.ctrlKey || event.metaKey))) return act('undo');
    if (walker) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      apply(place(layout, cursor, piece), `Placed a ${PIECE_NAME[piece].toLowerCase()}.`);
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      apply(remove(layout, cursor), 'Removed.');
    } else if (k === 'm') {
      if (!carrying) {
        if (!layout[key(cursor)]) return say('Nothing to pick up here.');
        carrying = { from: cursor, layout };
        say(
          `Picked up the ${PIECE_NAME[layout[key(cursor)]].toLowerCase()}. Move the cursor and press M to drop it.`,
        );
      } else {
        const carried = carrying;
        carrying = undefined;
        apply(dropCarried(layout, carried, cursor), 'Moved.');
      }
      draw();
    }
  }

  function onClick(event: MouseEvent) {
    if (walker) return;
    const rect = canvas.getBoundingClientRect();
    cursor = {
      x: Math.floor(((event.clientX - rect.left) / rect.width) * FAIR_WIDTH),
      y: Math.floor(((event.clientY - rect.top) / rect.height) * FAIR_HEIGHT),
    };
    apply(place(layout, cursor, piece), `Placed a ${PIECE_NAME[piece].toLowerCase()}.`);
  }

  function describeVisitors(): string {
    const g = sim.groups.find((x) => x.id === selected);
    const kinds = sim.groups.map((x) => KIND_NAME[x.kind]).join(', ');
    const head = `${sim.paused ? 'Paused. ' : ''}Visitors: ${kinds || 'none right now'}.`;
    return g
      ? `${head} Selected: ${describeGroup(g)}`
      : `${head} Press G to select a group and read its plan.`;
  }

  function draw() {
    summaryLine.textContent = summary(layout);
    const card = describeVisitors();
    if (visitorCard.textContent !== card) visitorCard.textContent = card;
    toolButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(PIECES[i] === piece)));
    if (!ctx) return;
    const c = theme.colors;
    const cut = new Set(
      attractions(layout)
        .filter((a) => !a.connected && a.piece !== 'tree')
        .map(key),
    );
    ctx.fillStyle = c.surface;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let y = 0; y < FAIR_HEIGHT; y++) {
      for (let x = 0; x < FAIR_WIDTH; x++) {
        const px = x * CELL;
        const py = y * CELL;
        const here = layout[`${x},${y}`];
        ctx.strokeStyle = c.muted;
        ctx.globalAlpha = 0.3;
        ctx.strokeRect(px + 0.5, py + 0.5, CELL - 1, CELL - 1);
        ctx.globalAlpha = 1;
        if (x === ENTRANCE.x && y === ENTRANCE.y) {
          ctx.fillStyle = c.stripeA;
          ctx.fillRect(px + 4, py + 4, CELL - 8, CELL - 8);
          ctx.fillStyle = c.text;
          ctx.font = canvasFont('small', 'bold');
          ctx.fillText('GATE', px + CELL / 2, py + CELL / 2);
        } else if (here === 'path') {
          ctx.fillStyle = c.wood;
          ctx.fillRect(px + 2, py + 2, CELL - 4, CELL - 4);
        } else if (here) {
          ctx.font = canvasFont('title');
          ctx.fillText(ICON[here], px + CELL / 2, py + CELL / 2);
          if (cut.has(`${x},${y}`)) {
            ctx.strokeStyle = c.danger;
            ctx.lineWidth = 3;
            ctx.setLineDash([6, 4]);
            ctx.strokeRect(px + 4, py + 4, CELL - 8, CELL - 8);
            ctx.setLineDash([]);
            ctx.lineWidth = 1;
          }
        }
      }
    }
    sim.groups.forEach((g, i) => {
      const gx = g.at.x * CELL + CELL / 2 + ((i % 2) * 2 - 1) * 8;
      const gy = g.at.y * CELL + CELL / 2 + (i < 2 ? -8 : 8);
      ctx.fillStyle = g.kind === 'thrill' ? c.danger : c.water;
      ctx.beginPath();
      ctx.arc(gx, gy, CELL / 7, 0, Math.PI * 2);
      ctx.fill();
      if (g.id === selected) {
        ctx.strokeStyle = c.text;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.font = canvasFont('small');
        ctx.fillStyle = c.text;
        const bubble =
          g.phase === 'leaving'
            ? '👋'
            : g.target?.need === 'thirst'
              ? '🥤'
              : g.target?.need === 'rest'
                ? '💤'
                : '🎯';
        ctx.fillText(bubble, gx, gy - CELL / 4);
      }
    });
    if (walker) {
      ctx.fillStyle = c.accent;
      ctx.beginPath();
      ctx.arc(walker.x * CELL + CELL / 2, walker.y * CELL + CELL / 2, CELL / 4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = carrying ? c.water : c.accent;
      ctx.lineWidth = 3;
      ctx.strokeRect(cursor.x * CELL + 2, cursor.y * CELL + 2, CELL - 4, CELL - 4);
      ctx.lineWidth = 1;
    }
  }

  const stopActions = bindActions(root.querySelectorAll('.fair-actions'), act);
  canvas.addEventListener('keydown', onKey);
  canvas.addEventListener('click', onClick);
  setPauseButton();
  say(
    loaded.note ??
      (quiet
        ? 'Your plaza is ready. Quiet mode is on, so visitors start paused: press P or Resume visitors to let them walk.'
        : 'Your plaza is ready. Focus the grid and use the arrow keys, or click a square to place.'),
  );
  draw();

  let frame = 0;
  let last = performance.now();
  let lastTick = sim.tick;
  const loop = (now: number) => {
    sim = advance(sim, now - last);
    last = now;
    if (selected !== undefined && !sim.groups.some((g) => g.id === selected)) selected = undefined;
    if (sim.tick !== lastTick) {
      lastTick = sim.tick;
      draw();
    }
    frame = requestAnimationFrame(loop);
  };
  frame = requestAnimationFrame(loop);

  return () => {
    cancelAnimationFrame(frame);
    stopActions();
    canvas.removeEventListener('keydown', onKey);
    canvas.removeEventListener('click', onClick);
  };
}
