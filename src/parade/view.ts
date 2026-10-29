import { canvasFont, theme } from '../carnival/theme';
import { REDUCED_MOTION_QUERY, isQuiet, motionPreference } from '../midway/motion';
import {
  CADENCES,
  MOTIFS,
  READY,
  addFloat,
  createParadeStore,
  duration,
  end,
  fitToUnlocked,
  motif,
  moveFloat,
  pause,
  play,
  positionsAt,
  removeFloat,
  restart,
  storyboard,
  tick,
  unlockedMotifs,
  type Cadence,
  type Composition,
  type EditResult,
  type MotifId,
  type Show,
} from './parade';

const WIDTH = 720;
const HEIGHT = 300;
/** The route: an S-curve from the start gate (left) to the finale stage (right). */
const ROUTE = [
  { x: 60, y: 240 },
  { x: 260, y: 240 },
  { x: 260, y: 80 },
  { x: 460, y: 80 },
  { x: 460, y: 220 },
  { x: 660, y: 220 },
];

function routePoint(progress: number): { x: number; y: number } {
  const lengths = ROUTE.slice(1).map((p, i) => Math.hypot(p.x - ROUTE[i].x, p.y - ROUTE[i].y));
  let d = progress * lengths.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lengths.length; i++) {
    if (d <= lengths[i] || i === lengths.length - 1) {
      const f = lengths[i] === 0 ? 0 : Math.min(1, d / lengths[i]);
      return {
        x: ROUTE[i].x + (ROUTE[i + 1].x - ROUTE[i].x) * f,
        y: ROUTE[i].y + (ROUTE[i + 1].y - ROUTE[i].y) * f,
      };
    }
    d -= lengths[i];
  }
  return ROUTE[ROUTE.length - 1];
}

function quietNow(): boolean {
  let systemReduces: boolean;
  try {
    systemReduces = window.matchMedia?.(REDUCED_MOTION_QUERY).matches ?? false;
  } catch {
    systemReduces = false;
  }
  return isQuiet(motionPreference.load(), systemReduces);
}

/** Mounts the parade composer into `root`. Returns a cleanup that removes every listener. */
export function startParade(
  root: HTMLElement,
  storage: Parameters<typeof createParadeStore>[0],
  stamped: ReadonlySet<string>,
): () => void {
  const quiet = quietNow();
  root.innerHTML = `
    <p class="parade-intro">Pick 3 to 5 floats, put them in order and choose a cadence, then stage the parade from the gate on the left to the finale stage on the right. Stamping a booth on the midway unlocks an extra float.</p>
    <div class="parade-add" role="group" aria-label="Add a float"></div>
    <ol class="parade-order" aria-label="Parade order"></ol>
    <div class="parade-actions" role="group" aria-label="Cadence"></div>
    <div class="parade-actions" role="group" aria-label="Show controls">
      <button type="button" data-act="play">Play</button>
      <button type="button" data-act="pause">Pause</button>
      <button type="button" data-act="restart">Restart</button>
      <button type="button" data-act="end">End</button>
      <button type="button" data-act="save">Save parade</button>
    </div>
    <div class="parade-actions" role="group" aria-label="Storyboard"${quiet ? '' : ' hidden'}>
      <button type="button" data-act="prev-step">Previous step</button>
      <button type="button" data-act="next-step">Next step</button>
    </div>
    <canvas class="parade-route" width="${WIDTH}" height="${HEIGHT}" role="img"></canvas>
    <p class="parade-timeline"></p>
    <p class="parade-status" role="status" aria-live="polite"></p>`;

  const store = createParadeStore(storage);
  const unlocked = unlockedMotifs(stamped);
  const loaded = store.load();
  let composition: Composition = fitToUnlocked(loaded.composition, unlocked);
  let show: Show = READY;
  let step = 0;

  const addBar = root.querySelector<HTMLElement>('.parade-add')!;
  const order = root.querySelector<HTMLOListElement>('.parade-order')!;
  const cadenceBar = root.querySelector<HTMLElement>('[aria-label="Cadence"]')!;
  const canvas = root.querySelector<HTMLCanvasElement>('canvas')!;
  const ctx = canvas.getContext('2d')!;
  const status = root.querySelector<HTMLElement>('.parade-status')!;
  const timeline = root.querySelector<HTMLElement>('.parade-timeline')!;
  const say = (text: string) => (status.textContent = text);

  addBar.innerHTML = MOTIFS.map((m) => {
    const open = unlocked.includes(m.id);
    const label = open ? `Add ${m.name}` : `${m.name}: stamp ${m.unlockedBy} to unlock`;
    return `<button type="button" data-add="${m.id}" aria-label="${label}"${open ? '' : ' disabled'}>${m.icon} ${open ? m.name : 'Locked'}</button>`;
  }).join('');
  cadenceBar.innerHTML = CADENCES.map(
    (c) =>
      `<button type="button" data-cadence="${c}" aria-pressed="false">${c[0].toUpperCase()}${c.slice(1)}</button>`,
  ).join('');

  function renderOrder(focusIndex?: number, focusAct?: string) {
    order.innerHTML = composition.floats
      .map((id, i) => {
        const m = motif(id);
        return `<li>${m.icon} ${m.name}
          <button type="button" data-move="${i}" data-delta="-1" aria-label="Move ${m.name} earlier">↑</button>
          <button type="button" data-move="${i}" data-delta="1" aria-label="Move ${m.name} later">↓</button>
          <button type="button" data-remove="${i}" aria-label="Remove ${m.name}">✕</button></li>`;
      })
      .join('');
    cadenceBar.querySelectorAll<HTMLButtonElement>('[data-cadence]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.cadence === composition.cadence));
    });
    const seconds = (duration(composition) / 1000).toFixed(1);
    timeline.textContent = `Timeline: ${composition.floats.map((id) => motif(id).name).join(' → ')}, at a ${composition.cadence}, ${seconds} seconds from gate to finale.`;
    if (focusIndex !== undefined && focusAct) {
      order.querySelectorAll<HTMLElement>(`[${focusAct}="${focusIndex}"]`)[0]?.focus();
    }
  }

  function apply(result: EditResult, message: string) {
    if (!result.ok) return say(result.reason);
    composition = result.composition;
    show = READY;
    step = 0;
    say(message);
  }

  function frameTime(): number {
    if (!quiet) return show.t;
    const steps = storyboard(composition);
    return steps[Math.min(step, steps.length - 1)].t;
  }

  function draw() {
    ctx.fillStyle = theme.colors.background;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.strokeStyle = theme.colors.wood;
    ctx.lineWidth = 28;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ROUTE.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
    ctx.fillStyle = theme.colors.stripeA;
    ctx.fillRect(ROUTE[0].x - 30, ROUTE[0].y - 40, 12, 60);
    ctx.fillStyle = theme.colors.accent;
    const fin = ROUTE[ROUTE.length - 1];
    ctx.fillRect(fin.x + 10, fin.y - 40, 40, 70);
    ctx.font = canvasFont('small', 'bold');
    ctx.fillStyle = theme.colors.text;
    ctx.textAlign = 'center';
    ctx.fillText('Start', ROUTE[0].x - 24, ROUTE[0].y + 40);
    ctx.fillText('Finale', fin.x + 30, fin.y + 50);

    const t = frameTime();
    const positions = positionsAt(composition, t);
    ctx.font = canvasFont('title');
    ctx.textBaseline = 'middle';
    let queued = 0;
    for (const p of positions) {
      if (p.phase === 'waiting') {
        ctx.globalAlpha = 0.5;
        ctx.fillText(motif(p.id).icon, ROUTE[0].x - 20 + queued * 36, ROUTE[0].y - 70);
        ctx.globalAlpha = 1;
        queued++;
        continue;
      }
      const at = routePoint(p.progress);
      const lift = p.phase === 'marching' ? p.sway * 6 : 0;
      ctx.fillText(motif(p.id).icon, at.x, at.y - 18 + lift);
    }
    const finale = t >= duration(composition);
    if (finale) {
      ctx.font = canvasFont('body', 'bold');
      ctx.fillStyle = theme.colors.accent;
      ctx.fillText('★ Grand finale! ★', WIDTH / 2, 30);
    }
    const marching = positions.filter((p) => p.phase === 'marching').map((p) => motif(p.id).name);
    const where = quiet
      ? storyboard(composition)[Math.min(step, storyboard(composition).length - 1)].title
      : show.phase;
    canvas.setAttribute(
      'aria-label',
      `Parade route, ${where}. ${finale ? 'All floats have reached the finale.' : marching.length ? `On the route: ${marching.join(', ')}.` : 'Floats are waiting at the gate.'}`,
    );
  }

  function act(name: string) {
    if (name === 'play') show = play(show);
    else if (name === 'pause') show = pause(show);
    else if (name === 'restart') {
      show = restart();
      step = 0;
    } else if (name === 'end') {
      show = end(composition);
      step = storyboard(composition).length - 1;
    } else if (name === 'next-step') step = Math.min(step + 1, storyboard(composition).length - 1);
    else if (name === 'prev-step') step = Math.max(step - 1, 0);
    else if (name === 'save') {
      return say(
        store.save(composition)
          ? 'Parade saved in this browser.'
          : 'Saving failed in this browser. Your parade is still here until you leave.',
      );
    }
    if (quiet && (name === 'play' || name === 'restart')) {
      say('Quiet mode is on, so the parade is a storyboard: use Next step and Previous step.');
    } else if (name !== 'next-step' && name !== 'prev-step') say(`Parade ${show.phase}.`);
    else say(storyboard(composition)[step].title);
    draw();
  }

  const onClick = (event: Event) => {
    const el = (event.target as HTMLElement | null)?.closest<HTMLElement>('button');
    if (!el) return;
    const d = el.dataset;
    if (d.act) return act(d.act);
    if (d.add) {
      apply(
        addFloat(composition, d.add as MotifId, unlocked),
        `Added ${motif(d.add as MotifId).name}.`,
      );
      renderOrder();
    } else if (d.move) {
      const index = Number(d.move);
      const delta = Number(d.delta);
      const result = moveFloat(composition, index, delta);
      apply(
        result,
        `Moved ${motif(composition.floats[index]).name} ${delta < 0 ? 'earlier' : 'later'}.`,
      );
      renderOrder(result.ok ? index + delta : index, 'data-move');
    } else if (d.remove) {
      const index = Number(d.remove);
      apply(removeFloat(composition, index), `Removed ${motif(composition.floats[index]).name}.`);
      renderOrder(Math.min(index, composition.floats.length - 1), 'data-remove');
    } else if (d.cadence) {
      composition = { ...composition, cadence: d.cadence as Cadence };
      show = READY;
      step = 0;
      say(`Cadence: ${d.cadence}.`);
      renderOrder();
    }
    draw();
  };

  root.addEventListener('click', onClick);
  renderOrder();
  say(
    loaded.note ??
      (quiet
        ? 'Quiet mode is on, so the parade plays as a storyboard you step through.'
        : 'Your parade is ready. Press Play to stage it.'),
  );
  draw();

  let frame = 0;
  let last = performance.now();
  const loop = (now: number) => {
    const before = show;
    if (!quiet) show = tick(show, composition, now - last);
    last = now;
    if (show !== before) {
      if (show.phase === 'ended' && before.phase === 'playing') say('Grand finale! Parade ended.');
      draw();
    }
    frame = requestAnimationFrame(loop);
  };
  frame = requestAnimationFrame(loop);

  return () => {
    cancelAnimationFrame(frame);
    root.removeEventListener('click', onClick);
  };
}
