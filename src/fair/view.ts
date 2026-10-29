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
  type Weather,
} from './visitors';
import {
  GOALS_TEXT,
  OPENING_BUDGET,
  createPennantStore,
  atmosphere,
  debrief,
  finished,
  forecastName,
  measure,
  openGates,
  FORECASTS,
  runToEnd,
  type Cue,
  type Outcome,
} from './opening-day';
import {
  PREVIEW_HEIGHT,
  PREVIEW_WIDTH,
  bindPreviewKeys,
  drawPreview,
  intentCue,
  previewItems,
  toggleView,
  unreachableCount,
  viewState,
  type ViewMode,
} from './preview';
import {
  STOPS,
  chooseStop,
  complete as tourComplete,
  createCampaignStore,
  fitProblem,
  isBlocked,
  layoutProblem,
  NEW_CAMPAIGN,
  pack,
  packedCount,
  placeAtStop,
  recordDay,
  stopById,
  unpack,
  withCapacity,
  type Campaign,
  type Stop,
  type StopId,
} from './campaign';

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
/** How each stop's blocked ground looks on the grid, so the three sites read differently at a glance. */
const GROUND: Record<StopId, { mark: string; word: string }> = {
  riverside: { mark: '≈', word: 'river water' },
  market: { mark: '⛺', word: 'a market stall' },
  hilltop: { mark: '▲', word: 'rock' },
};
const ICON: Record<Piece, string> = { path: '', game: '🎯', food: '🍿', bench: '🪑', tree: '🌳' };
/** The corner mark for each forecast cue on the grid. */
const CUE_MARK: Record<Cue['cue'], string> = { wet: '💧', sheltered: '☂', sun: '☀', shade: '◐' };
/** What each forecast cue means, read out when the cursor is on that square. */
const CUE_TEXT: Record<Cue['cue'], string> = {
  wet: 'wet in the rain, tired visitors will not use it',
  sheltered: 'sheltered by a tree, usable in the rain',
  sun: 'in the sun, visitors here get thirsty twice as fast',
  shade: 'shaded by a tree',
};

/** Mounts the plaza editor into `root`. Returns a cleanup that removes every listener. */
export function startFair(
  root: HTMLElement,
  storage: Parameters<typeof createFairStore>[0] & Parameters<typeof createPennantStore>[0],
): () => void {
  root.innerHTML = `
    <p class="fair-intro">Lay paths from the entrance (the gate on the left), then place stalls and benches beside them. Visitors only reach a piece that touches a path connected to the entrance.</p>
    <div class="fair-tools" role="group" aria-label="Piece to place"></div>
    <canvas class="fair-grid" tabindex="0" role="application" aria-label="Fair plaza grid. Arrow keys move the cursor."></canvas>
    <canvas class="fair-grid fair-preview" tabindex="0" role="img" hidden></canvas>
    <p class="fair-preview-note" aria-live="polite" hidden></p>
    <p class="fair-help">Keys: arrows move, 1 to 5 pick a piece, Enter places, Delete removes, M picks up and drops a piece, U undoes, W walks your plaza, V switches between the grid and the visitor-eye preview, G selects a visitor group, P pauses visitors. The Opening Day buttons below the grid start an optional challenge, and Travelling fair campaign takes a fair on an optional three-stop tour while your plaza waits untouched.</p>
    <div class="fair-actions">
      <button type="button" data-act="view" aria-pressed="false">Visitor-eye preview (V)</button>
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
    <div class="fair-actions" role="group" aria-label="Opening Day challenge">
      <button type="button" data-act="day" aria-pressed="false">Opening Day challenge</button>
      <button type="button" data-act="day-forecast" hidden>Forecast: clear skies</button>
      <button type="button" data-act="day-open" hidden>Open the gates</button>
      <button type="button" data-act="day-finish" hidden>Finish the day now</button>
      <button type="button" data-act="day-end" hidden>End early</button>
    </div>
    <div class="fair-actions" role="group" aria-label="Travelling fair campaign">
      <button type="button" data-act="tour" aria-pressed="false">Travelling fair campaign</button>
      <button type="button" data-act="tour-reset" hidden>Reset campaign</button>
    </div>
    <section class="fair-tour" aria-label="Travelling fair" hidden>
      <p class="fair-tour-status"></p>
      <div class="fair-actions" role="group" aria-label="Choose the next stop">${STOPS.map(
        (s) => `<button type="button" data-act="go-${s.id}">Travel to ${s.name}</button>`,
      ).join('')}</div>
      <div class="fair-actions" role="group" aria-label="Pack the wagons">${PIECES.map(
        (p) =>
          `<button type="button" data-act="pack-${p}">Pack ${PIECE_NAME[p].toLowerCase()}</button><button type="button" data-act="unpack-${p}">Leave one at home</button>`,
      ).join('')}</div>
    </section>
    <section class="fair-day" aria-label="Opening Day" aria-live="polite" hidden></section>
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
  let view: ViewMode = 'grid';
  const pennants = createPennantStore(storage);
  /** The Opening Day challenge: off, building between tries, or open with the free-build visitors set aside. */
  let day:
    | { phase: 'build'; last?: Outcome; ran?: Layout; previous?: Outcome; note?: string }
    | { phase: 'open'; freeSim: Sim; last?: Outcome }
    | undefined;
  /** The forecast the player opted into for Opening Day, if any. */
  let forecast: Weather | undefined;
  const tourStore = createCampaignStore(storage);
  /** The travelling fair campaign while it is being played; undefined in the sandbox. */
  let tour: Campaign | undefined;
  /** The sandbox plaza set aside while the campaign is played, restored as it was on return. */
  let sandbox: { layout: Layout; history: Layout[]; day: typeof day } | undefined;

  const canvas = root.querySelector<HTMLCanvasElement>('canvas')!;
  canvas.width = FAIR_WIDTH * CELL;
  canvas.height = FAIR_HEIGHT * CELL;
  const ctx = canvas.getContext('2d');
  const previewCanvas = root.querySelector<HTMLCanvasElement>('.fair-preview')!;
  previewCanvas.width = PREVIEW_WIDTH;
  previewCanvas.height = PREVIEW_HEIGHT;
  const previewCtx = previewCanvas.getContext('2d');
  const previewNote = root.querySelector<HTMLElement>('.fair-preview-note')!;
  const viewButton = root.querySelector<HTMLButtonElement>('[data-act="view"]')!;
  const status = root.querySelector('.fair-status')!;
  const summaryLine = root.querySelector('.fair-summary')!;
  const visitorCard = root.querySelector('.fair-visitor')!;
  const pauseButton = root.querySelector<HTMLButtonElement>('[data-act="pause"]')!;
  const walkButton = root.querySelector<HTMLButtonElement>('[data-act="walk"]')!;
  const dayPanel = root.querySelector<HTMLElement>('.fair-day')!;
  const dayButton = root.querySelector<HTMLButtonElement>('[data-act="day"]')!;
  const dayOnly = (act: string) => root.querySelector<HTMLButtonElement>(`[data-act="${act}"]`)!;
  const tourPanel = root.querySelector<HTMLElement>('.fair-tour')!;
  const tourStatus = root.querySelector<HTMLElement>('.fair-tour-status')!;
  const [goGroup, packGroup] = tourPanel.querySelectorAll<HTMLElement>('.fair-actions');
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
    const stop = tourStop();
    if (stop && isBlocked(stop, cell))
      return `${where}: ${GROUND[stop.id].word}, nothing can be built here.`;
    if (!here) return `${where}: empty.`;
    const info = attractions(layout).find((a) => a.x === cell.x && a.y === cell.y);
    const cue = atmosphere(layout, shownForecast()).find((a) => a.x === cell.x && a.y === cell.y);
    return `${where}: ${PIECE_NAME[here]}${info && !info.connected ? ', not connected to the entrance' : ''}${cue ? `, ${CUE_TEXT[cue.cue]}` : ''}.`;
  }

  /** Every layout change goes through here, so a pickup or a walker never outlives the layout it was made on. */
  function setLayout(next: Layout) {
    layout = next;
    carrying = undefined;
    walker = settleWalker(layout, walker);
    sim = relayout(sim, layout);
    if (tour && tour.layout !== next) saveTour({ ...tour, layout: next });
  }

  /** The stop being played, with reputation's extra wagon capacity, or undefined in the sandbox or between stops. */
  function tourStop(): Stop | undefined {
    return tour?.at ? withCapacity(stopById(tour.at), tour) : undefined;
  }

  function saveTour(next: Campaign) {
    tour = next;
    if (!tourStore.save(next)) say('This browser could not save the campaign. It is still here.');
  }

  /** Placing on the grid: the sandbox's budget rules, or the stop's ground and packed wagons. */
  function placeHere(cell: Cell): PlaceResult {
    if (!tour) return place(layout, cell, piece);
    const stop = tourStop();
    if (!stop) return { ok: false, reason: 'Choose the next stop before building.' };
    const r = placeAtStop(stop, tour.packing, layout, cell, piece);
    return r.ok ? { ok: true, layout: r.value } : r;
  }

  /** Refuses a layout the stop cannot hold, so undo and moves keep to the ground and the wagons. */
  function fits(result: PlaceResult): PlaceResult {
    const stop = tourStop();
    if (!result.ok || !tour || !stop) return result;
    const problem = fitProblem(stop, tour.packing, result.layout);
    return problem ? { ok: false, reason: problem } : result;
  }

  function apply(result: PlaceResult, done: string) {
    if (gatesOpen()) return say(GATES_OPEN);
    result = fits(result);
    if (!result.ok) return say(result.reason);
    history = pushHistory(history, layout);
    setLayout(result.layout);
    say(done);
    draw();
  }

  const GATES_OPEN =
    'The gates are open, so the plaza is locked. Finish or end the day to change it.';
  const gatesOpen = () => day?.phase === 'open';

  /** Ends a day, measured from what the visitors did, and returns to building with the debrief. */
  function closeDay(complete: boolean) {
    if (day?.phase !== 'open') return;
    const outcome = measure(sim, complete);
    if (tour) return closeTourDay(day.freeSim, outcome);
    const award = pennants.award(outcome);
    const note = award.earned
      ? award.saved
        ? 'You earned the Opening Day pennant. It is kept in this browser.'
        : 'You earned the Opening Day pennant, but this browser could not save it.'
      : outcome.success
        ? 'You already hold the Opening Day pennant.'
        : undefined;
    sim = day.freeSim;
    selected = undefined;
    day = { phase: 'build', last: outcome, ran: layout, previous: day.last, note };
    setPauseButton();
    say(
      `${debrief(layout, outcome).headline} Change your plaza and open the gates again to retry.`,
    );
  }

  /** Ends a campaign day: a win travels on with reputation and a keepsake, anything else stays for a retry. */
  function closeTourDay(freeSim: Sim, outcome: Outcome) {
    if (!tour) return;
    const stop = tourStop()!;
    const ran = layout;
    const before = tour;
    saveTour(recordDay(tour, outcome));
    const earned = tour.reputation - before.reputation;
    sim = freeSim;
    selected = undefined;
    const note = earned
      ? `${stop.name} loved it: reputation +${earned}, and a ${stop.name} keepsake. ${
          tourComplete(tour)
            ? 'The tour is complete!'
            : 'Choose the next stop. Reputation lets the wagons carry more.'
        }`
      : `${stop.name} is not won yet. Your packing and layout are kept: change them and retry.`;
    day = { phase: 'build', last: outcome, ran, previous: earned ? undefined : day?.last, note };
    if (earned) {
      history = [];
      setLayout(tour.layout);
    }
    setPauseButton();
    say(`${debrief(ran, outcome).headline} ${note}`);
  }

  function renderTour() {
    dayOnly('tour').setAttribute('aria-pressed', String(Boolean(tour)));
    dayOnly('tour').textContent = tour ? 'Back to my plaza' : 'Travelling fair campaign';
    dayOnly('tour-reset').hidden = !tour;
    tourPanel.hidden = !tour;
    if (!tour) return;
    const stop = tourStop();
    const kept = tour.keepsakes.map((id) => stopById(id).name).join(', ') || 'none yet';
    const text = tourComplete(tour)
      ? `Tour complete! All three stops played. Reputation ${tour.reputation}. Keepsakes: ${kept}. Reset the campaign to tour again, or go back to your plaza.`
      : stop
        ? `Stop ${tour.stop + 1} of ${STOPS.length}: ${stop.name}. ${stop.priority} Wagons: ${packedCount(tour.packing)} of ${stop.capacity} packed. Reputation ${tour.reputation}. Keepsakes: ${kept}. Pack, arrange on the open ground, then open the gates. Each stop spends at most ${OPENING_BUDGET}.`
        : `Stop ${tour.stop + 1} of ${STOPS.length}: choose where the fair travels next. Reputation ${tour.reputation}. Keepsakes: ${kept}.`;
    if (tourStatus.textContent !== text) tourStatus.textContent = text;
    goGroup.hidden = Boolean(stop) || tourComplete(tour);
    packGroup.hidden = !stop;
    for (const s of STOPS) {
      const b = dayOnly(`go-${s.id}`);
      b.disabled = tour.keepsakes.includes(s.id);
      b.textContent = `${b.disabled ? '✓ ' : ''}Travel to ${s.name} (wagons carry ${withCapacity(s, tour).capacity})`;
    }
    for (const p of PIECES) {
      dayOnly(`pack-${p}`).textContent = `Pack ${PIECE_NAME[p].toLowerCase()} (${tour.packing[p]})`;
      dayOnly(`unpack-${p}`).disabled = tour.packing[p] === 0;
    }
  }

  function enterTour() {
    if (gatesOpen()) closeDay(false);
    sandbox = { layout, history, day };
    const loaded = tourStore.load();
    tour = loaded;
    history = [];
    day = tour.at ? { phase: 'build' } : undefined;
    setLayout(tour.layout);
    say(
      tourComplete(tour)
        ? 'Your travelling fair has played all three stops.'
        : tour.at
          ? `Resuming the tour at ${stopById(tour.at).name}.`
          : 'The travelling fair is ready to roll. Choose the first stop: each site has different ground and visitors.',
    );
  }

  function leaveTour() {
    if (gatesOpen()) closeDay(false);
    const back = sandbox!;
    tour = undefined;
    sandbox = undefined;
    history = back.history;
    day = back.day;
    setLayout(back.layout);
    say('Back to your plaza, exactly as you left it. The campaign is saved.');
  }

  function tourAct(name: string): boolean {
    if (name === 'tour') {
      if (tour) leaveTour();
      else enterTour();
      return true;
    }
    if (!tour) return false;
    if (name === 'tour-reset') {
      if (
        !window.confirm(
          'Reset the travelling fair campaign? Your plaza and scores are not touched.',
        )
      )
        return true;
      if (gatesOpen()) closeDay(false);
      tourStore.reset();
      tour = NEW_CAMPAIGN;
      history = [];
      day = undefined;
      setLayout(tour.layout);
      say('Campaign reset. Choose the first stop. Your plaza and scores are untouched.');
      return true;
    }
    if (gatesOpen()) {
      say(GATES_OPEN);
      return true;
    }
    const go = STOPS.find((s) => name === `go-${s.id}`);
    if (go) {
      const r = chooseStop(tour, go.id);
      if (!r.ok) {
        say(r.reason);
        return true;
      }
      saveTour(r.value);
      history = [];
      day = { phase: 'build' };
      setLayout(tour.layout);
      // The travel buttons hide once a stop is chosen, so focus moves to the site.
      canvas.focus();
      say(
        `The wagons roll to ${go.name}. ${go.priority} Pack up to ${tourStop()!.capacity} pieces.`,
      );
      return true;
    }
    const stop = tourStop();
    const packed = PIECES.find((p) => name === `pack-${p}`);
    const left = PIECES.find((p) => name === `unpack-${p}`);
    if (stop && (packed || left)) {
      const r = packed ? pack(stop, tour.packing, packed) : unpack(tour.packing, left!, layout);
      if (!r.ok) {
        say(r.reason);
        return true;
      }
      saveTour({ ...tour, packing: r.value });
      say(
        `${packed ? 'Packed' : 'Left at home'}: ${PIECE_NAME[(packed ?? left)!].toLowerCase()}. Wagons ${packedCount(tour.packing)} of ${stop.capacity}.`,
      );
      return true;
    }
    return false;
  }

  function renderDay() {
    renderTour();
    dayButton.hidden = Boolean(tour);
    dayButton.setAttribute('aria-pressed', String(Boolean(day)));
    dayButton.textContent = day ? 'Back to free build' : 'Opening Day challenge';
    dayOnly('day-open').hidden = day?.phase !== 'build' || (Boolean(tour) && !tourStop());
    dayOnly('day-open').textContent =
      day?.phase === 'build' && day.last ? 'Retry: open the gates again' : 'Open the gates';
    // Forecasts belong to the sandbox challenge: the campaign is about sites and wagons.
    dayOnly('day-forecast').hidden = day?.phase !== 'build' || Boolean(tour);
    dayOnly('day-forecast').textContent = `Forecast: ${forecastName(forecast)}`;
    dayOnly('day-finish').hidden = !gatesOpen();
    dayOnly('day-end').hidden = !gatesOpen();
    dayPanel.hidden = !day;
    if (!day) return;
    const parts: string[] = [];
    const held = pennants.load() ? ' 🚩 You hold the Opening Day pennant.' : '';
    if (day.phase === 'open') {
      parts.push(
        `<p>Gates open: ${sim.spawned} of ${sim.spawns} groups have arrived, ${sim.left.length} have left. Pause with P, or finish or end the day below.</p>`,
      );
    } else {
      parts.push(`<p>${GOALS_TEXT}${tour ? '' : held}</p>`);
      if (forecast && !tour)
        parts.push(`<p><strong>Forecast.</strong> ${FORECASTS[forecast].rule}</p>`);
      if (day.last) {
        // The debrief belongs to the layout the day ran on, not to edits made since.
        const d = debrief(day.ran ?? layout, day.last, day.previous);
        parts.push(
          `<h2>${d.headline}</h2>`,
          day.note ? `<p><strong>${day.note}</strong></p>` : '',
          `<ul>${d.lines.map((l) => `<li>${l}</li>`).join('')}</ul>`,
        );
      }
    }
    const html = parts.join('');
    if (dayPanel.innerHTML !== html) dayPanel.innerHTML = html;
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
    const locked = ['undo', 'reload', 'reset', 'reset-visitors'];
    if (tourAct(name)) {
      // Handled by the campaign.
    } else if (tour && ['save', 'reload', 'reset'].includes(name)) {
      say(
        'These buttons are for your own plaza. The campaign saves itself; Reset campaign starts the tour again.',
      );
    } else if (gatesOpen() && locked.includes(name)) {
      say(GATES_OPEN);
    } else if (name === 'day') {
      if (gatesOpen()) closeDay(false);
      day = day ? undefined : { phase: 'build' };
      say(day ? GOALS_TEXT : 'Back to free build. Your plaza is unchanged.');
    } else if (name === 'day-forecast' && day?.phase === 'build') {
      forecast = forecast === undefined ? 'heat' : forecast === 'heat' ? 'rain' : undefined;
      say(
        forecast
          ? FORECASTS[forecast].rule
          : 'Forecast: clear skies. The day runs with no weather rules.',
      );
    } else if (name === 'day-open' && day?.phase === 'build') {
      const stop = tourStop();
      const problem = tour && (stop ? layoutProblem(stop, tour.packing, layout) : 'Choose a stop.');
      if (problem) return (say(`The gates cannot open yet: ${problem}`), draw());
      // The campaign keeps its own save, so opening its gates never writes the sandbox plaza.
      const saved = tour ? tourStore.save(tour) : store.save(layout);
      day = { phase: 'open', freeSim: sim, last: day.last };
      carrying = undefined;
      sim = { ...openGates(layout, forecast), paused: quiet };
      selected = undefined;
      setPauseButton();
      say(
        `Gates open on ${saved ? 'your saved layout' : 'this layout (it could not be saved)'}.${quiet ? ' Quiet mode is on, so the day starts paused: press P to let visitors walk, or Finish the day now to see the result.' : ''}`,
      );
    } else if (name === 'day-finish' && gatesOpen()) {
      sim = runToEnd(sim);
      closeDay(true);
    } else if (name === 'day-end' && gatesOpen()) {
      closeDay(false);
    } else if (name === 'undo') {
      const last = history.at(-1);
      if (!last) return say('Nothing to undo.');
      const undone = fits({ ok: true, layout: last });
      if (!undone.ok) return (say(`Cannot undo: ${undone.reason}`), draw());
      history = history.slice(0, -1);
      setLayout(last);
      say('Undid the last edit.');
    } else if (name === 'view') {
      view = toggleView(view);
      // Only what is shown changes: the layout, budget, visitors and saved copy stay as they are.
      const shown = viewState(view);
      canvas.hidden = shown.gridHidden;
      previewCanvas.hidden = previewNote.hidden = shown.previewHidden;
      viewButton.setAttribute('aria-pressed', String(shown.pressed));
      viewButton.textContent = shown.label;
      say(
        view === 'preview'
          ? 'Visitor-eye preview. It is read-only and follows your edits. Press V to go back to the grid.'
          : `Back to the grid. ${describe(cursor)}`,
      );
      (shown.focus === 'preview' ? previewCanvas : canvas).focus();
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
    if (k === 'v') return act('view');
    if (k === 'w') return act('walk');
    if (k === 'g') return act('next-group');
    if (k === 'p') return act('pause');
    if (k === 'u' || (k === 'z' && (event.ctrlKey || event.metaKey))) return act('undo');
    if (walker) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      apply(placeHere(cursor), `Placed a ${PIECE_NAME[piece].toLowerCase()}.`);
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
        const stop = tourStop();
        apply(
          stop && isBlocked(stop, cursor)
            ? { ok: false, reason: `Nothing can be built there at ${stop.name}.` }
            : dropCarried(layout, carried, cursor),
          'Moved.',
        );
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
    apply(placeHere(cursor), `Placed a ${PIECE_NAME[piece].toLowerCase()}.`);
  }

  function describeVisitors(): string {
    const g = sim.groups.find((x) => x.id === selected);
    const kinds = sim.groups.map((x) => KIND_NAME[x.kind]).join(', ');
    const head = `${sim.paused ? 'Paused. ' : ''}Visitors: ${kinds || 'none right now'}.`;
    return g
      ? `${head} Selected: ${describeGroup(g)}`
      : `${head} Press G to select a group and read its plan.`;
  }

  function drawPreviewView() {
    const items = previewItems(layout, sim);
    const cut = unreachableCount(items);
    const note = `${summary(layout)} ${
      cut
        ? `${cut} ${cut === 1 ? 'piece has' : 'pieces have'} no path from the gate, marked "No path".`
        : 'Every stall and bench is reachable from the gate.'
    } ${sim.groups.length} visitor ${sim.groups.length === 1 ? 'group is' : 'groups are'} on the plaza.`;
    if (previewNote.textContent !== note) previewNote.textContent = note;
    previewCanvas.setAttribute('aria-label', `Visitor-eye preview of your plaza. ${note}`);
    if (previewCtx) drawPreview(previewCtx, items, selected);
  }

  /** The forecast the grid shows: the one the gates opened under, or the one picked for the next try. */
  function shownForecast(): Weather | undefined {
    if (!day) return undefined;
    return day.phase === 'open' ? sim.weather : forecast;
  }

  /**
   * Marks the squares the forecast changes, from the same rules the visitors
   * follow. The marks never animate, so Quiet mode shows the same picture.
   */
  function drawAtmosphere(ctx: CanvasRenderingContext2D) {
    const c = theme.colors;
    ctx.font = canvasFont('small', 'bold');
    for (const { x, y, cue } of atmosphere(layout, shownForecast())) {
      const px = x * CELL;
      const py = y * CELL;
      if (cue === 'wet' || cue === 'sun') {
        ctx.strokeStyle = cue === 'wet' ? c.water : c.accent;
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 3, py + 3, CELL - 6, CELL - 6);
        ctx.lineWidth = 1;
      }
      ctx.fillStyle = cue === 'wet' ? c.water : cue === 'sun' ? c.accent : c.text;
      ctx.fillText(CUE_MARK[cue], px + CELL - 9, py + 9);
    }
  }

  function draw() {
    summaryLine.textContent = summary(layout);
    if (view === 'preview') drawPreviewView();
    renderDay();
    const card = describeVisitors();
    if (visitorCard.textContent !== card) visitorCard.textContent = card;
    toolButtons.forEach((b, i) => {
      const p = PIECES[i];
      b.setAttribute('aria-pressed', String(p === piece));
      const used = Object.values(layout).filter((x) => x === p).length;
      b.textContent = tour
        ? `${i + 1}. ${PIECE_NAME[p]} (${used} of ${tour.packing[p]} placed, costs ${PIECE_COST[p]})`
        : `${i + 1}. ${PIECE_NAME[p]} (${PIECE_COST[p]})`;
    });
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
        const stop = tourStop();
        if (stop && isBlocked(stop, { x, y })) {
          ctx.fillStyle =
            stop.id === 'riverside' ? c.water : stop.id === 'market' ? c.stripeA : c.muted;
          ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
          ctx.fillStyle = stop.id === 'market' ? c.stripeB : c.background;
          ctx.font = canvasFont('title', 'bold');
          ctx.fillText(GROUND[stop.id].mark, px + CELL / 2, py + CELL / 2);
        } else if (x === ENTRANCE.x && y === ENTRANCE.y) {
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
    drawAtmosphere(ctx);
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
        ctx.fillText(intentCue(g), gx, gy - CELL / 4);
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
  const stopPreviewKeys = bindPreviewKeys(previewCanvas, act);
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
    if (gatesOpen() && finished(sim)) {
      closeDay(true);
      draw();
    }
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
    stopPreviewKeys();
  };
}
