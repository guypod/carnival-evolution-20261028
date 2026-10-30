import { canvasFont, theme } from '../carnival/theme';
import { REDUCED_MOTION_QUERY, isQuiet, motionPreference } from '../midway/motion';
import {
  BENCH,
  GEAR_RADII,
  TOOLS,
  TOYS,
  benchPoint,
  bellPull,
  BELL_AT,
  benchLabel,
  benchPhase,
  benchStops,
  HAMMER_PIVOT,
  hammerAngle,
  inspectionMarks,
  LEVER_REST,
  startTest,
  putDown,
  stepInspection,
  type BenchRun,
  type InspectionMark,
  commit,
  createRepairsStore,
  drawOrder,
  dropSlot,
  faultyToy,
  gearOutline,
  gearRadius,
  gearTurn,
  hitTarget,
  LEVER_PIN,
  leverTurn,
  releaseTarget,
  openBench,
  SHAFT,
  recordRepair,
  resetBench,
  inspectToy,
  inspectionLine,
  targets,
  toyInfo,
  undo,
  useTool,
  type Bench,
  type Repairs,
  type Target,
  type Tool,
  type ToyId,
} from './workshop';
import {
  camOutline,
  frogFigure,
  frogPose,
  frogRig,
  PEBBLE,
  type CamShape,
  type FrogBlob,
} from './cams';

const { width: WIDTH, height: HEIGHT } = BENCH;
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
      ${TOYS.map(
        (t) => `<button type="button" data-toy="${t.id}" aria-pressed="false">
          <span class="workshop-toy-name">${t.name}</span>
          <span class="workshop-toy-repair"></span>
          <span class="workshop-toy-bench" aria-hidden="true">▶ On the bench</span>
        </button>`,
      ).join('')}
    </div>
    <p class="workshop-fault"></p>
    <div class="workshop-tools" role="group" aria-label="Tool">
      ${TOOLS.map((t, i) => `<button type="button" data-tool="${t}" aria-pressed="false">${i + 1} ${t[0].toUpperCase()}${t.slice(1)}</button>`).join('')}
    </div>
    <canvas class="workshop-bench" width="${WIDTH}" height="${HEIGHT}" tabindex="0" role="application"
      aria-label="Repair bench. Left and right arrows pick a part or spot, Enter or Space acts on it."></canvas>
    <div class="workshop-actions" role="group" aria-label="Bench controls">
      <button type="button" data-act="test">Test (T)</button>
      <button type="button" data-act="inspect">Inspect step (I)</button>
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
  /** Where the pointer pressed to pick up the held part, so a release can tell a click from a drag. */
  let downAt: { x: number; y: number } | undefined;
  /** A test animating, or an inspection held at a step: one run of the toy's model either way. */
  let run: BenchRun | undefined;
  let frame = 0;

  const canvas = root.querySelector<HTMLCanvasElement>('canvas')!;
  const ctx = canvas.getContext('2d')!;
  const status = root.querySelector<HTMLElement>('.workshop-status')!;
  const fault = root.querySelector<HTMLElement>('.workshop-fault')!;
  const repairedLine = root.querySelector<HTMLElement>('.workshop-repaired')!;
  const shown = root.querySelector<HTMLInputElement>('.workshop-shown')!;
  const say = (text: string) => (status.textContent = text);

  // Drawing, the pointer and the focus ring all use the pose the bench shows now.
  const bits = () => targets(bench.toy, runPhase(), run?.result);
  /** What the arrow keys step through: every part and fixture, and the empty slots. */
  const navTargets = () => benchStops(bench.toy, runPhase(), run?.result);
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
      // Repair state is its own line of words, so it never reads as the selection.
      b.querySelector('.workshop-toy-repair')!.textContent = repairs.toys[b.dataset.toy as ToyId]
        ? '✓ Repaired'
        : 'Not repaired yet';
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
      const slot = dropSlot(bench.toy, target);
      const placed = putDown(bench, part, slot);
      // The ring follows the part to where it lands.
      if (placed.moved) focusKey = `part:${part}`;
      ({ bench, run } = placed);
      say(placed.message);
      return refresh();
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

  /**
   * One press of Inspect step: the toy's run held still at the next step, so the
   * parts stand where a test would carry them. It stops any test animating, and
   * any edit, undo, reset or toy switch clears it, so it starts over.
   */
  function inspect() {
    held = drag = undefined;
    cancelAnimationFrame(frame);
    run = stepInspection(run, bench.toy);
    if (run.mode === 'inspect')
      say(inspectionLine(inspectToy(bench.toy, run.result, runPhase()), run.step));
    refresh();
  }

  /** The rig's labelled arrows, while an inspection is held. */
  const marks = (): InspectionMark[] | undefined =>
    run?.mode === 'inspect' ? inspectionMarks(bench.toy, run.result, runPhase()) : undefined;

  function test() {
    held = drag = undefined;
    run = startTest(bench.toy, performance.now());
    const { result } = run;
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
      if (run?.mode === 'test' && performance.now() - run.startedAt < RUN_MS)
        frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  }

  function selectToy(id: ToyId) {
    held = drag = undefined;
    cancelAnimationFrame(frame);
    run = undefined;
    focusKey = undefined;
    benches[bench.toy.id] = bench;
    bench = benches[id] ?? openBench(repairs.toys[id] ?? faultyToy(id));
    say(`${toyInfo(id).name} is on the bench.`);
    refresh();
  }

  // Drawing.

  /**
   * How far through the run, 0 to 1. In quiet mode a test shows one still frame
   * at once: for the frog, the frame that shows why it did what it did. An
   * inspection shows its step's frame, quiet or not.
   */
  const runPhase = () => benchPhase(run, performance.now(), quiet, RUN_MS);

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
    const shownMarks = marks();
    if (shownMarks) drawMarks(shownMarks);
    const focus = focusedTarget();
    const label = benchLabel(focus, tool, shownMarks);
    if (canvas.getAttribute('aria-label') !== label) canvas.setAttribute('aria-label', label);
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

  /**
   * The rig's arrows: a labelled arrow onto each part the motion reaches, turning
   * the way the part turns, and a bar across the part where it stops. The words
   * say moves, stops or still, so nothing rests on colour alone.
   */
  function drawMarks(list: InspectionMark[]) {
    ctx.save();
    ctx.font = canvasFont('small', 'bold');
    ctx.lineWidth = 3;
    list.forEach((m, i) => {
      const color = m.state === 'moves' ? colors.text : colors.danger;
      ctx.strokeStyle = ctx.fillStyle = color;
      // Labels alternate above and below their parts, a row further out each pair, so neighbours do not overlap.
      const up = i % 2 === 0;
      const reach = 44 + Math.floor(i / 2) * 22;
      const tip = { x: m.x, y: m.y + (up ? -22 : 22) };
      const tail = { x: m.x, y: m.y + (up ? -reach : reach) };
      if (m.state === 'stops') {
        ctx.beginPath();
        ctx.moveTo(m.x - 14, m.y - 14);
        ctx.lineTo(m.x + 14, m.y + 14);
        ctx.moveTo(m.x + 14, m.y - 14);
        ctx.lineTo(m.x - 14, m.y + 14);
        ctx.stroke();
      }
      if (m.state !== 'still') {
        ctx.beginPath();
        ctx.moveTo(tail.x, tail.y);
        ctx.lineTo(tip.x, tip.y);
        ctx.stroke();
        const dir = up ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(tip.x, tip.y);
        ctx.lineTo(tip.x - 6, tip.y - 8 * dir);
        ctx.lineTo(tip.x + 6, tip.y - 8 * dir);
        ctx.fill();
      }
      if (m.turn) {
        // A curved arrow round the gear, clockwise with the crank or back against it.
        const r = 20;
        const from = -Math.PI / 2;
        const to = from + (Math.PI / 1.5) * m.turn;
        ctx.beginPath();
        ctx.arc(m.x, m.y, r, from, to, m.turn < 0);
        ctx.stroke();
        const end = { x: m.x + Math.cos(to) * r, y: m.y + Math.sin(to) * r };
        const along = to + (Math.PI / 2) * m.turn;
        ctx.beginPath();
        ctx.moveTo(end.x + Math.cos(along) * 6, end.y + Math.sin(along) * 6);
        ctx.lineTo(end.x + Math.cos(to) * 5, end.y + Math.sin(to) * 5);
        ctx.lineTo(end.x - Math.cos(to) * 5, end.y - Math.sin(to) * 5);
        ctx.fill();
      }
      const ty = tail.y + (up ? -10 : 10);
      const width = ctx.measureText(m.label).width;
      const x = Math.min(WIDTH - width / 2 - 4, Math.max(width / 2 + 4, m.x));
      ctx.fillStyle = colors.background;
      ctx.fillRect(x - width / 2 - 3, ty - 9, width + 6, 18);
      ctx.fillStyle = color;
      ctx.fillText(m.label, x, ty);
    });
    ctx.restore();
  }

  function drawPart(part: string, x: number, y: number, angle: number, lifted = false) {
    ctx.save();
    ctx.globalAlpha = lifted ? 0.75 : 1;
    if (part in GEAR_RADII) gear(x, y, gearRadius(part), angle, colors.accent);
    else if (part === 'rod') {
      ctx.fillStyle = colors.muted;
      ctx.fillRect(x - 6, y - 6, 12, 12);
    } else cam(part, x, y, angle / (Math.PI * 2));
    ctx.restore();
  }

  function gear(x: number, y: number, r: number, angle: number, fill: string) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    for (const p of gearOutline(r, angle)) ctx.lineTo(x + p.x, y + p.y);
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
    const turn = gearTurn(phase);
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
    // Drawn in the same order, place and turn the pointer picks them by, so the gear on top is the one clicked.
    for (const t of drawOrder(bits())) {
      if (t.id === held) continue;
      drawPart(t.id, t.x, t.y, t.angle ?? 0);
    }
    ctx.fillStyle = colors.text;
    ctx.fillText('crank', 60, 225);
    ctx.fillText('bear', 360, 225);
  }

  function drawBell(phase: number) {
    const travel = run?.result.kind === 'bell' ? run.result.travel : 0;
    const pull = bellPull(phase);
    // Lever: pivots at the pin, rises from left to right, and turns as it is pulled.
    const pin = LEVER_PIN;
    const leverA = LEVER_REST + leverTurn(phase);
    ctx.strokeStyle = colors.wood;
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(pin.x - 50 * Math.cos(leverA), pin.y - 50 * Math.sin(leverA));
    ctx.lineTo(pin.x + 140 * Math.cos(leverA), pin.y + 140 * Math.sin(leverA));
    ctx.stroke();
    // The holes ride on the lever: `targets` turns them with it, so they are drawn where they are clicked.
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
    const hammerPivot = HAMMER_PIVOT;
    // A full swing (middle hole) meets the bell; half again lands on the rubber stop.
    const ha = hammerAngle(travel, phase);
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
    ctx.arc(BELL_AT.x, BELL_AT.y, 26, Math.PI, 0);
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

  function cam(kind: string, x: number, y: number, turns: number) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle =
      kind === 'snail' ? colors.accent : kind === 'tall' ? colors.stripeA : colors.water;
    ctx.beginPath();
    for (const p of camOutline(kind as CamShape, turns)) ctx.lineTo(p.x, p.y);
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
    const camOn = result?.cam ?? undefined;
    // The same pose drives the cam's turn, the follower's foot on it and the frog.
    const pose = run
      ? frogPose(camOn, phase, result?.stalled ?? false)
      : { turns: 0, lift: 0, frogLift: 0, caught: false };
    const rig = frogRig(pose);
    for (const t of bits()) {
      if (t.kind !== 'slot') continue;
      ctx.fillStyle = colors.background;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.id === 'shaft' ? 5 : t.r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const t of drawOrder(bits())) {
      if (t.id === held) continue;
      drawPart(t.id, t.x, t.y, t.angle ?? 0);
    }
    const { x, y } = SHAFT;
    // The fixed guide the follower slides up and down in, and the safety guard above it.
    ctx.fillStyle = colors.muted;
    ctx.fillRect(x - 12, y - 60, 6, 22);
    ctx.fillRect(x + 6, y - 60, 6, 22);
    ctx.fillStyle = colors.water;
    ctx.globalAlpha = 0.6;
    ctx.fillRect(x - 50, y + rig.guard - 4, 100, 4);
    ctx.globalAlpha = 1;
    ctx.fillStyle = theme.colors.stripeB;
    ctx.fillText('safety guard', x + 95, y + rig.guard - 2);
    // The follower: its foot stands on the cam, wherever the cam's outline crosses above the shaft.
    ctx.strokeStyle = colors.text;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x, y + rig.foot);
    ctx.lineTo(x, y + rig.rodTop);
    ctx.stroke();
    ctx.fillStyle = colors.text;
    ctx.beginPath();
    ctx.moveTo(x - 5, y + rig.foot - 6);
    ctx.lineTo(x + 5, y + rig.foot - 6);
    ctx.lineTo(x, y + rig.foot);
    ctx.fill();
    const frogY = y + rig.frog;
    // A crafted frog: folded legs, a riveted body with a socket the rod fits into, and big eyes.
    const fig = frogFigure(frogY);
    const blobs = (list: readonly FrogBlob[], fill: string) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      for (const b of list) {
        ctx.moveTo(x + b.x + b.rx, b.y);
        ctx.ellipse(x + b.x, b.y, b.rx, b.ry, 0, 0, Math.PI * 2);
      }
      ctx.fill();
    };
    blobs(fig.haunches, colors.accent);
    ctx.strokeStyle = colors.wood;
    ctx.lineWidth = 2;
    ctx.stroke();
    blobs(fig.feet, colors.wood);
    blobs([fig.body], colors.accent);
    ctx.beginPath();
    ctx.moveTo(x - 24, fig.seam);
    ctx.lineTo(x + 24, fig.seam);
    ctx.stroke();
    blobs(fig.rivets, colors.wood);
    ctx.fillStyle = colors.muted;
    ctx.fillRect(x + fig.mount.x, fig.mount.y, fig.mount.width, fig.mount.height);
    ctx.fillStyle = colors.background;
    ctx.fillRect(x + fig.mount.x + 3, fig.mount.y + 3, fig.mount.width - 6, fig.mount.height - 3);
    // The rod's tip shows inside the socket while it meets the seat; once it drops away below a caught frog, the socket is empty.
    if (rig.seated) {
      ctx.fillStyle = colors.text;
      ctx.fillRect(x - 2, fig.mount.y + 3, 4, fig.mount.height - 3);
    }
    blobs(fig.eyes, colors.text);
    blobs(fig.pupils, colors.background);
    ctx.strokeStyle = colors.background;
    ctx.beginPath();
    ctx.arc(x, fig.mouth.y - fig.mouth.r, fig.mouth.r, Math.PI * 0.25, Math.PI * 0.75);
    ctx.stroke();
    if (bench.toy.pebble) {
      ctx.fillStyle = colors.muted;
      ctx.beginPath();
      ctx.arc(x + PEBBLE.dx, y + PEBBLE.dy, PEBBLE.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = colors.text;
    ctx.fillText('frog', x + 60, frogY);
  }

  // Input.

  const onKey = (event: KeyboardEvent) => {
    const key = event.key;
    if (event.target instanceof HTMLInputElement && key !== 'Escape') return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    // Holding a key down must not test, undo or reset over and over.
    if (event.repeat && 'tTiIuUrR'.includes(key)) return event.preventDefault();
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
    else if (key === 'i' || key === 'I') inspect();
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
    draw();
  };

  function undoStep() {
    held = drag = undefined;
    run = undefined;
    if (bench.history.length === 0) {
      say('Nothing to undo.');
      return refresh();
    }
    bench = undo(bench);
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

  // The canvas may be shown smaller than the bench; pointers map back onto bench pixels.
  const pointAt = (event: PointerEvent) =>
    benchPoint({ x: event.clientX, y: event.clientY }, canvas.getBoundingClientRect());
  const hit = (p: { x: number; y: number }) =>
    hitTarget(bench.toy, p, held, runPhase(), run?.result);
  const onDown = (event: PointerEvent) => {
    canvas.focus();
    const target = hit(pointAt(event));
    if (!target) return;
    focusKey = keyOf(target);
    if (tool === 'hand' && !held && target.kind === 'part') {
      canvas.setPointerCapture?.(event.pointerId);
      act(target);
      drag = downAt = pointAt(event);
    } else act(target);
  };
  const onMove = (event: PointerEvent) => {
    if (!held || !drag) return;
    drag = pointAt(event);
    draw();
  };
  const onUp = (event: PointerEvent) => {
    if (!held || !drag || !downAt) return;
    const target = releaseTarget(bench.toy, held, downAt, pointAt(event), runPhase(), run?.result);
    drag = downAt = undefined;
    // A click, or a drag back home: keep holding, so the next click places it.
    if (!target) return draw();
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
    else if (button.dataset.act === 'inspect') inspect();
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
