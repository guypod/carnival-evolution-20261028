import { canvasFont, theme } from '../carnival/theme';
import { REDUCED_MOTION_QUERY, isQuiet, motionPreference } from '../midway/motion';
import {
  GEAR_RADII,
  TOOLS,
  TOYS,
  camLift,
  commit,
  createRepairsStore,
  faultyToy,
  movePart,
  openBench,
  partLabel,
  recordRepair,
  resetBench,
  runToy,
  targets,
  toyInfo,
  undo,
  useTool,
  type Bench,
  type Repairs,
  type Run,
  type Target,
  type Tool,
  type ToyId,
} from './workshop';

const WIDTH = 720;
const HEIGHT = 340;
/** How long a test run animates, in milliseconds. */
const RUN_MS = 2400;
const { colors } = theme;

function quietNow(): boolean {
  let systemReduces: boolean;
  try {
    systemReduces = window.matchMedia?.(REDUCED_MOTION_QUERY).matches ?? false;
  } catch {
    systemReduces = false;
  }
  return isQuiet(motionPreference.load(), systemReduces);
}

/** Mounts the repair workshop into `root`. Returns a cleanup that removes every listener. */
export function startWorkshop(
  root: HTMLElement,
  storage: Parameters<typeof createRepairsStore>[0],
  onExit: () => void,
): () => void {
  root.innerHTML = `
    <div class="workshop-toys" role="group" aria-label="Toy on the bench">
      ${TOYS.map((t) => `<button type="button" data-toy="${t.id}" aria-pressed="false">${t.name}</button>`).join('')}
    </div>
    <p class="workshop-fault"></p>
    <div class="workshop-tools" role="group" aria-label="Tool">
      ${TOOLS.map((t, i) => `<button type="button" data-tool="${t}" aria-pressed="false">${i + 1} ${t[0].toUpperCase()}${t.slice(1)}</button>`).join('')}
    </div>
    <canvas class="workshop-bench" width="${WIDTH}" height="${HEIGHT}" tabindex="0" role="application"
      aria-label="Repair bench. Left and right arrows pick a part or spot, Enter or Space acts on it."></canvas>
    <div class="workshop-actions" role="group" aria-label="Bench controls">
      <button type="button" data-act="test">Test (T)</button>
      <button type="button" data-act="undo">Undo (U)</button>
      <button type="button" data-act="reset">Reset toy (R)</button>
    </div>
    <p class="workshop-status" role="status" aria-live="polite"></p>
    <p class="workshop-repaired"></p>
    <label class="workshop-show"><input type="checkbox" class="workshop-shown"> Show repaired toys beside the midway entrance</label>`;

  const store = createRepairsStore(storage);
  let repairs: Repairs = store.load();
  let bench: Bench = openBench(repairs.toys['music-box'] ?? faultyToy('music-box'));
  let tool: Tool = 'hand';
  /** The ringed bench target, as kind and id, so it stays put when slots fill or empty. */
  let focusKey: string | undefined;
  /** Each toy's bench this visit, so switching toys keeps work and undo. */
  const benches: Partial<Record<ToyId, Bench>> = {};
  /** Read when a test starts: Quiet midway or reduced motion shows one still frame. */
  let quiet = quietNow();
  /** The part picked up with the hand, and where the pointer is dragging it. */
  let held: string | undefined;
  let drag: { x: number; y: number } | undefined;
  let run: { result: Run; startedAt: number } | undefined;
  let frame = 0;

  const canvas = root.querySelector<HTMLCanvasElement>('canvas')!;
  const ctx = canvas.getContext('2d')!;
  const status = root.querySelector<HTMLElement>('.workshop-status')!;
  const fault = root.querySelector<HTMLElement>('.workshop-fault')!;
  const repairedLine = root.querySelector<HTMLElement>('.workshop-repaired')!;
  const shown = root.querySelector<HTMLInputElement>('.workshop-shown')!;
  const say = (text: string) => (status.textContent = text);

  const bits = () => targets(bench.toy);
  /** What the arrow keys step through: every part and fixture, and the empty slots. */
  const navTargets = () => {
    const filled = new Set(Object.values(bench.toy.parts));
    return bits().filter((t) => t.kind !== 'slot' || !filled.has(t.id));
  };
  const keyOf = (t: Target) => `${t.kind}:${t.id}`;
  const focusedTarget = (): Target | undefined => {
    const all = navTargets();
    return all.find((t) => keyOf(t) === focusKey) ?? all[0];
  };
  const stepFocus = (delta: number) => {
    const all = navTargets();
    const at = Math.max(
      0,
      all.findIndex((t) => keyOf(t) === focusKey),
    );
    focusKey = keyOf(all[(at + delta + all.length) % all.length]);
  };

  function refresh() {
    const info = toyInfo(bench.toy.id);
    fault.textContent = repairs.toys[bench.toy.id]
      ? `${info.name}: repaired. ${info.repairedNote}`
      : `${info.name}: ${info.fault}`;
    root.querySelectorAll<HTMLButtonElement>('[data-toy]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.toy === bench.toy.id));
      b.textContent = `${repairs.toys[b.dataset.toy as ToyId] ? '✓ ' : ''}${toyInfo(b.dataset.toy as ToyId).name}`;
    });
    root.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.tool === tool));
    });
    root.querySelector<HTMLButtonElement>('[data-act="undo"]')!.disabled =
      bench.history.length === 0;
    const count = Object.keys(repairs.toys).length;
    repairedLine.textContent = `${count} of ${TOYS.length} toys repaired. Not scored; repairs are kept in this browser only.`;
    shown.checked = repairs.shown;
    draw();
  }

  function apply(result: { toy: Bench['toy']; changed: boolean; message: string }) {
    bench = commit(bench, result);
    run = undefined;
    say(result.message);
    refresh();
  }

  /** Enter, Space or a click on a bench target, with the tool in hand. */
  function act(target: Target) {
    if (tool !== 'hand') return apply(useTool(bench.toy, tool, target.id));
    if (held) {
      const part = held;
      held = drag = undefined;
      const slot = target.kind === 'slot' ? target.id : (bench.toy.parts[target.id] ?? target.id);
      if (slot === bench.toy.parts[part]) {
        say(`Put the ${partLabel(part)} back down.`);
        return refresh();
      }
      // The ring follows the part to where it lands.
      focusKey = `part:${part}`;
      return apply(movePart(bench.toy, part, slot));
    }
    if (target.kind === 'part') {
      held = target.id;
      say(`Holding the ${target.label}. Pick a spot and press Enter, or drop it there.`);
    } else if (target.kind === 'fixture') {
      say(
        `The ${target.label} needs a tool: try the ${target.id === 'pin' ? 'screwdriver' : 'tweezers'}.`,
      );
    } else {
      say(`The ${target.label} is empty. Pick up a part first.`);
    }
    refresh();
  }

  function test() {
    held = drag = undefined;
    const result = runToy(bench.toy);
    run = { result, startedAt: performance.now() };
    quiet = quietNow();
    let message = result.message;
    if (result.working && !repairs.toys[bench.toy.id]) {
      repairs = recordRepair(repairs, bench.toy);
      message += store.save(repairs)
        ? ` Repaired! ${toyInfo(bench.toy.id).repairedNote}`
        : ' Repaired, but this browser would not save it, so the toy only stays fixed until you leave the page.';
    } else if (result.working) {
      repairs = recordRepair(repairs, bench.toy);
      if (!store.save(repairs))
        message +=
          ' This browser still would not save your repairs, so they only stay fixed until you leave the page.';
    }
    say(message);
    refresh();
    if (!quiet) animate();
  }

  function animate() {
    cancelAnimationFrame(frame);
    const step = () => {
      draw();
      if (run && performance.now() - run.startedAt < RUN_MS) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  }

  function selectToy(id: ToyId) {
    held = drag = undefined;
    run = undefined;
    focusKey = undefined;
    benches[bench.toy.id] = bench;
    bench = benches[id] ?? openBench(repairs.toys[id] ?? faultyToy(id));
    say(`${toyInfo(id).name} is on the bench.`);
    refresh();
  }

  // Drawing.

  /** How far through the test run, 0 to 1; in quiet mode a run shows its middle at once. */
  function runPhase(): number {
    if (!run) return 0;
    if (quiet) return 0.25;
    return Math.min(1, (performance.now() - run.startedAt) / RUN_MS);
  }

  function draw() {
    ctx.fillStyle = colors.surface;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = colors.wood;
    ctx.fillRect(0, 250, WIDTH, HEIGHT - 250);
    ctx.font = canvasFont('small');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const phase = runPhase();
    if (bench.toy.id === 'music-box') drawGears(phase);
    else if (bench.toy.id === 'rooster-bell') drawBell(phase);
    else drawFrog(phase);
    const focus = focusedTarget();
    if (focus && document.activeElement === canvas) {
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(focus.x, focus.y, focus.r + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = colors.text;
      ctx.fillText(focus.label, focus.x, focus.y - focus.r - 16);
    }
    if (held) {
      const at = drag ?? focus;
      if (at) drawPart(held, at.x, at.y, 0, true);
    }
  }

  function drawPart(part: string, x: number, y: number, angle: number, lifted = false) {
    ctx.save();
    ctx.globalAlpha = lifted ? 0.75 : 1;
    if (part in GEAR_RADII) gear(x, y, GEAR_RADII[part] * 30 - 3, angle, colors.accent);
    else if (part === 'rod') {
      ctx.fillStyle = colors.muted;
      ctx.fillRect(x - 6, y - 6, 12, 12);
    } else cam(part, x, y, angle);
    ctx.restore();
  }

  function gear(x: number, y: number, r: number, angle: number, fill: string) {
    const teeth = Math.max(8, Math.round(r / 4));
    ctx.fillStyle = fill;
    ctx.beginPath();
    for (let i = 0; i < teeth * 2; i++) {
      const a = angle + (i * Math.PI) / teeth;
      const rr = i % 2 ? r - 4 : r + 2;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = colors.background;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = colors.background;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * (r - 5), y + Math.sin(angle) * (r - 5));
    ctx.stroke();
  }

  function drawGears(phase: number) {
    const spin = run?.result.kind === 'gears' ? run.result.spin : {};
    const turn = phase * Math.PI * 4;
    const jammed = run?.result.kind === 'gears' && run.result.jammed;
    const shake = jammed && phase < 1 ? Math.sin(phase * 80) * 2 : 0;
    for (const t of bits()) {
      if (t.kind !== 'slot') continue;
      ctx.fillStyle = t.id.startsWith('peg') ? colors.muted : colors.background;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.id.startsWith('peg') ? 4 : t.r, 0, Math.PI * 2);
      ctx.fill();
    }
    gear(60, 150, 57, turn * (spin.crank ?? 0) + shake / 10, colors.stripeA);
    gear(360, 150, 57, turn * (spin.bear ?? 0), colors.water);
    // The bear on its gear's axle: it faces the way the gear turns.
    const bearTurn = turn * (spin.bear ?? 0);
    ctx.fillStyle = colors.wood;
    ctx.beginPath();
    ctx.ellipse(360, 60, 14 * Math.max(0.3, Math.abs(Math.cos(bearTurn))), 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(360, 34, 11, 0, Math.PI * 2);
    ctx.fill();
    for (const t of bits()) {
      if (t.kind !== 'part' || t.id === held) continue;
      const onPeg = bench.toy.parts[t.id].startsWith('peg');
      drawPart(t.id, t.x + (onPeg ? shake : 0), t.y, onPeg ? turn * (spin[t.id] ?? 0) : 0);
    }
    ctx.fillStyle = colors.text;
    ctx.fillText('crank', 60, 225);
    ctx.fillText('bear', 360, 225);
  }

  function drawBell(phase: number) {
    const travel = run?.result.kind === 'bell' ? run.result.travel : 0;
    const pull = Math.sin(Math.min(1, phase * 2) * Math.PI);
    // Lever: pivots at the pin, rises from left to right.
    const pin = { x: 120, y: 200 };
    const leverA = -0.46 - pull * 0.25;
    ctx.strokeStyle = colors.wood;
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(pin.x - 50 * Math.cos(leverA), pin.y - 50 * Math.sin(leverA));
    ctx.lineTo(pin.x + 140 * Math.cos(leverA), pin.y + 140 * Math.sin(leverA));
    ctx.stroke();
    for (const t of bits()) {
      if (t.kind !== 'slot') continue;
      ctx.fillStyle = colors.background;
      ctx.beginPath();
      ctx.arc(t.x, t.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = bench.toy.pinTight ? colors.accent : colors.danger;
    ctx.beginPath();
    ctx.arc(pin.x, pin.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colors.text;
    ctx.fillText(bench.toy.pinTight ? 'tight' : 'loose', pin.x, pin.y + 24);
    // Hammer on its own pivot, swung by the rod.
    const hammerPivot = { x: 520, y: 220 };
    const swing = travel * pull;
    // A full swing (middle hole) meets the bell; half again lands on the rubber stop.
    const ha = -Math.PI / 2 - 0.8 + swing * 1.69;
    const head = {
      x: hammerPivot.x + Math.cos(ha) * 130,
      y: hammerPivot.y + Math.sin(ha) * 130,
    };
    const rodAt = bits().find((t) => t.id === 'rod');
    if (rodAt && held !== 'rod') {
      ctx.strokeStyle = colors.muted;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(rodAt.x, rodAt.y);
      ctx.lineTo(hammerPivot.x + Math.cos(ha) * 50, hammerPivot.y + Math.sin(ha) * 50);
      ctx.stroke();
      drawPart('rod', rodAt.x, rodAt.y, 0);
    }
    ctx.strokeStyle = colors.wood;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(hammerPivot.x, hammerPivot.y);
    ctx.lineTo(head.x, head.y);
    ctx.stroke();
    ctx.fillStyle = colors.stripeA;
    ctx.beginPath();
    ctx.arc(head.x, head.y, 12, 0, Math.PI * 2);
    ctx.fill();
    // The bell sits where a full swing lands; the rubber stop just past it.
    ctx.fillStyle = colors.accent;
    ctx.beginPath();
    ctx.arc(650, 120, 26, Math.PI, 0);
    ctx.lineTo(680, 150);
    ctx.lineTo(620, 150);
    ctx.fill();
    ctx.fillStyle = colors.muted;
    ctx.fillRect(633, 253, 30, 12);
    if (run?.result.working && pull > 0.9) {
      ctx.fillStyle = colors.text;
      ctx.font = canvasFont('body', 'bold');
      ctx.fillText('DING!', 650, 70);
    }
    ctx.font = canvasFont('small');
    ctx.fillStyle = colors.text;
    ctx.fillText('lever', 80, 240);
    ctx.fillText('bell', 650, 165);
    ctx.fillText('stop', 655, 215);
  }

  function cam(kind: string, x: number, y: number, angle: number) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle =
      kind === 'snail' ? colors.accent : kind === 'tall' ? colors.stripeA : colors.water;
    ctx.beginPath();
    if (kind === 'round') ctx.arc(0, 0, 22, 0, Math.PI * 2);
    else
      for (let i = 0; i <= 32; i++) {
        const a = (i / 32) * Math.PI * 2;
        const r = kind === 'snail' ? 14 + (i / 32) * 16 : 16 + Math.max(0, Math.cos(a)) * 18;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = colors.background;
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawFrog(phase: number) {
    const result = run?.result.kind === 'cam' ? run.result : undefined;
    const turns = result?.stalled ? Math.min(phase, 0.08) : phase * 2;
    const camOn = result?.cam ?? undefined;
    for (const t of bits()) {
      if (t.kind !== 'slot') continue;
      ctx.fillStyle = colors.background;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.id === 'shaft' ? 5 : t.r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const t of bits()) {
      if (t.kind !== 'part' || t.id === held) continue;
      const onShaft = bench.toy.parts[t.id] === 'shaft';
      drawPart(t.id, t.x, t.y, onShaft ? turns * Math.PI * 2 : 0);
    }
    const lift = run && camOn ? camLift(camOn, turns) : 0;
    const guarded = lift > 1;
    const frogY = 110 - Math.min(lift, 1.2) * 60;
    ctx.strokeStyle = colors.muted;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(200, guarded ? 110 - 60 : frogY + 10);
    ctx.lineTo(200, 166);
    ctx.stroke();
    ctx.fillStyle = colors.water;
    ctx.globalAlpha = 0.6;
    ctx.fillRect(150, 20, 100, 4);
    ctx.globalAlpha = 1;
    ctx.fillStyle = theme.colors.stripeB;
    ctx.fillText('safety guard', 200, 12);
    ctx.fillStyle = colors.accent;
    ctx.beginPath();
    ctx.ellipse(200, frogY, 26, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colors.text;
    ctx.beginPath();
    ctx.arc(188, frogY - 12, 5, 0, Math.PI * 2);
    ctx.arc(212, frogY - 12, 5, 0, Math.PI * 2);
    ctx.fill();
    if (bench.toy.pebble) {
      ctx.fillStyle = colors.muted;
      ctx.beginPath();
      ctx.arc(236, 172, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = colors.text;
    ctx.fillText('frog', 260, frogY);
  }

  // Input.

  const onKey = (event: KeyboardEvent) => {
    const key = event.key;
    if (event.target instanceof HTMLInputElement && key !== 'Escape') return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    // Holding a key down must not test, undo or reset over and over.
    if (event.repeat && 'tTuUrR'.includes(key)) return event.preventDefault();
    if (event.target === canvas && (key === 'ArrowRight' || key === 'ArrowDown')) {
      stepFocus(1);
    } else if (event.target === canvas && (key === 'ArrowLeft' || key === 'ArrowUp')) {
      stepFocus(-1);
    } else if (event.target === canvas && (key === 'Enter' || key === ' ')) {
      const target = focusedTarget();
      if (target) act(target);
    } else if (key === '1' || key === '2' || key === '3') {
      tool = TOOLS[Number(key) - 1];
      held = drag = undefined;
      say(`Using the ${tool}.`);
      refresh();
    } else if (key === 't' || key === 'T') test();
    else if (key === 'u' || key === 'U') undoStep();
    else if (key === 'r' || key === 'R') reset();
    else if (key === 'Escape') {
      if (held) {
        held = drag = undefined;
        say('Put the part back down.');
        refresh();
      } else onExit();
    } else return;
    event.preventDefault();
    const focus = focusedTarget();
    if (focus && event.target === canvas)
      canvas.setAttribute(
        'aria-label',
        `Repair bench, ${focus.label} picked. Enter or Space acts on it with the ${tool}.`,
      );
    draw();
  };

  function undoStep() {
    held = drag = undefined;
    if (bench.history.length === 0) {
      say('Nothing to undo.');
      return refresh();
    }
    bench = undo(bench);
    run = undefined;
    say('Undid the last change.');
    refresh();
  }

  function reset() {
    held = drag = undefined;
    run = undefined;
    bench = resetBench(bench);
    say('The toy is back as it came in, faults and all. Undo brings your work back.');
    refresh();
  }

  const pointAt = (event: PointerEvent) => {
    const box = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - box.left) / box.width) * WIDTH,
      y: ((event.clientY - box.top) / box.height) * HEIGHT,
    };
  };
  /** The target under a point: parts before slots, so a click on a gear picks it up. */
  const hit = (p: { x: number; y: number }) => {
    const near = bits().filter((t) => Math.hypot(t.x - p.x, t.y - p.y) <= t.r);
    // While a part is held, an empty spot under a big gear still takes it.
    const slot = held
      ? near.find((t) => t.kind === 'slot' && !Object.values(bench.toy.parts).includes(t.id))
      : undefined;
    return (
      slot ??
      near.find((t) => t.kind === 'part' && t.id !== held) ??
      near.find((t) => t.kind !== 'part') ??
      near[0]
    );
  };
  let downOn: string | undefined;
  const onDown = (event: PointerEvent) => {
    canvas.focus();
    const target = hit(pointAt(event));
    downOn = target && keyOf(target);
    if (!target) return;
    focusKey = keyOf(target);
    if (tool === 'hand' && !held && target.kind === 'part') {
      canvas.setPointerCapture?.(event.pointerId);
      act(target);
      drag = pointAt(event);
    } else act(target);
  };
  const onMove = (event: PointerEvent) => {
    if (!held || !drag) return;
    drag = pointAt(event);
    draw();
  };
  const onUp = (event: PointerEvent) => {
    if (!held || !drag) return;
    const target = hit(pointAt(event));
    drag = undefined;
    // Released where it was picked up: a click. Keep holding, so the next click places it.
    const home = target?.kind === 'slot' && bench.toy.parts[held] === target.id;
    if (!target || home || keyOf(target) === downOn) return draw();
    act(target);
  };
  // A cancelled drag (a scroll, a lost pointer) puts the part back down.
  const onCancel = () => {
    if (!drag) return;
    held = drag = undefined;
    say('Put the part back down.');
    refresh();
  };

  const onClick = (event: MouseEvent) => {
    const button = (event.target as HTMLElement).closest('button');
    if (!button || !root.contains(button)) return;
    if (button.dataset.toy) selectToy(button.dataset.toy as ToyId);
    else if (button.dataset.tool) {
      tool = button.dataset.tool as Tool;
      held = drag = undefined;
      say(`Using the ${tool}.`);
      refresh();
    } else if (button.dataset.act === 'test') test();
    else if (button.dataset.act === 'undo') undoStep();
    else if (button.dataset.act === 'reset') reset();
  };
  const onShown = () => {
    repairs = { ...repairs, shown: shown.checked };
    say(
      store.save(repairs)
        ? shown.checked
          ? 'Repaired toys will stand beside the midway entrance.'
          : 'Repaired toys are put away. The midway looks as it always did.'
        : 'This browser would not save that choice.',
    );
  };
  const onFocus = () => draw();

  root.addEventListener('click', onClick);
  window.addEventListener('keydown', onKey);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);
  canvas.addEventListener('focus', onFocus);
  canvas.addEventListener('blur', onFocus);
  shown.addEventListener('change', onShown);
  say(`${toyInfo(bench.toy.id).name} is on the bench. Press T to test it.`);
  refresh();

  return () => {
    cancelAnimationFrame(frame);
    root.removeEventListener('click', onClick);
    window.removeEventListener('keydown', onKey);
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onCancel);
    canvas.removeEventListener('focus', onFocus);
    canvas.removeEventListener('blur', onFocus);
    shown.removeEventListener('change', onShown);
  };
}
