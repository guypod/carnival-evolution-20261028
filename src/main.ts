import './style.css';
import { applyTheme, bestScore, onScoreRecorded, type CarnivalGame } from './carnival';
import { registry } from './games';
import { onEscapeKey } from './escape';
import {
  CLOSED_GUIDE,
  escapeGuide,
  guideToggleLabel,
  toggleGuide,
  type GuideState,
} from './visitor-guide';
import { boothScoresText } from './booth-scores';
import { passportStamps, passportSummary, stampText } from './passport';
import {
  CARNIVAL_COLLECTOR,
  PAVILION_TIERS,
  collectorText,
  pavilionCollection,
  shelfText,
} from './prize-pavilion';
import { emptyText, hallOfRecords, overviewText } from './hall-of-records';
import {
  DIRECTORY_STATUSES,
  bestLine,
  countText,
  directoryEntries,
  emptyText as directoryEmptyText,
  favoriteLabel,
  filterDirectory,
  type DirectoryStatus,
} from './booth-directory';
import { favorites } from './favorites';
import {
  circuit,
  circuitHistory,
  circuitProgress,
  circuitStatus,
  legText,
  restartCircuit,
  saveFinishedCircuits,
  savedProgress,
  runText,
} from './circuit';
import { progressText, trailIntro, trailMissions, trailRecommendation } from './trail';
import { startMidway } from './midway/midway';
import {
  discover,
  discoveryClue,
  discoveryProgress,
  discoveryStore,
  trailComplete,
  type Landmark,
} from './midway/discovery';
import {
  motionPreference,
  motionToggleState,
  nextMotionPreference,
  type MotionPreference,
} from './midway/motion';
import { nextScene, scenePreference, sceneToggleState, type Scene } from './midway/scene';
import type { BoothSlot } from './midway/world';

applyTheme();

const app = document.querySelector<HTMLElement>('#app')!;
let stop: (() => void) | undefined;

function bestText(game: CarnivalGame): string {
  const best = bestScore(game.id);
  return best === undefined ? 'No scores yet' : `Best: ${best}`;
}

function renderMidway() {
  document.body.dataset.view = 'midway';
  app.innerHTML = `
    <section class="midway">
      <canvas class="midway-map" tabindex="0" aria-label="The carnival midway. Focus the map, then walk with WASD or the arrow keys, and press E at a booth to play."></canvas>
      <p class="midway-help">
        Welcome to Guy's Carnival!<br />
        <kbd>WASD</kbd> or <kbd>arrows</kbd> to walk, or click where you want to go.
        <kbd>E</kbd> to play.
      </p>
      <p class="midway-credit">
        Built with
        <a href="https://tessl.io/?utm_source=carnival&amp;utm_medium=midway-credit&amp;utm_campaign=tessl-carnival" target="_blank" rel="noopener">Tessl</a>
        at
        <a href="https://tessl.io/devcon?utm_source=carnival&amp;utm_medium=midway-credit&amp;utm_campaign=tessl-carnival" target="_blank" rel="noopener">AI DevCon NYC</a>
      </p>
      <div class="midway-panels">
        <button type="button" class="guide-toggle" aria-expanded="false" aria-controls="visitor-guide">
          🗺️ Guide
        </button>
        <div class="visitor-guide" id="visitor-guide" role="region" aria-label="Visitor guide" hidden>
          <nav class="guide-destinations" aria-label="Destinations">
            <a class="directory-link" href="#/booths">🔎 Booth Directory</a>
            <a class="pavilion-link" href="#/prizes">🏆 Prize Pavilion</a>
            <a class="trail-link" href="#/trail">🧭 Carnival Trail</a>
            <a class="circuit-link" href="#/circuit">🎪 Carnival Circuit</a>
            <a class="records-link" href="#/records">📜 Hall of Records</a>
          </nav>
          <button type="button" class="scene-toggle" aria-pressed="false"></button>
          <button type="button" class="motion-toggle" aria-pressed="false" aria-describedby="motion-note"></button>
          <p class="note" id="motion-note">Off follows your system's reduced-motion setting. On holds the scenery still. Walking and games are never slowed.</p>
          <nav class="midway-guide" aria-label="Booths">
            <h2>Booths</h2>
            <ul></ul>
          </nav>
          <section class="midway-discovery" aria-label="Discovery trail">
            <h2>Discovery trail</h2>
            <p class="discovery-progress" role="status"></p>
            <ul></ul>
            <p class="discovery-clue"></p>
            <p class="note">Optional, and separate from scores and stamps. Kept in this browser only.</p>
          </section>
          <details class="midway-passport">
            <summary><h2>Passport</h2> <span class="summary"></span></summary>
            <ul></ul>
            <p class="note">Stamps are kept in this browser only.</p>
          </details>
        </div>
      </div>
      <p class="discovery-toast" role="status" hidden></p>
      <div class="booth-card" aria-live="polite" hidden>
        <h2></h2>
        <p class="description"></p>
        <p class="best"></p>
        <a class="play">Play</a>
      </div>
    </section>`;

  const guide = app.querySelector('.midway-guide ul')!;
  for (const game of registry.all()) {
    const item = document.createElement('li');
    item.innerHTML = `<a href="#/play/${game.id}"><span class="name"></span> <span class="best"></span></a>`;
    item.querySelector('.name')!.textContent = game.name;
    item.querySelector('.best')!.textContent = bestText(game);
    guide.append(item);
  }

  renderPassport(app.querySelector<HTMLDetailsElement>('.midway-passport')!);

  const card = app.querySelector<HTMLElement>('.booth-card')!;
  const showBooth = (booth: BoothSlot | undefined) => {
    const game = booth?.gameId ? registry.get(booth.gameId) : undefined;
    card.hidden = booth === undefined;
    card.classList.toggle('closed', booth !== undefined && !game);
    card.querySelector('h2')!.textContent = game?.name ?? 'Coming soon';
    card.querySelector('.description')!.textContent =
      game?.description ?? 'This booth is waiting for a game. Build one and it opens here.';
    card.querySelector('.best')!.textContent = game ? boothScoresText(game.id) : '';
    const link = card.querySelector<HTMLAnchorElement>('.play')!;
    link.hidden = !game;
    if (game) link.href = `#/play/${game.id}`;
  };

  const midway = startMidway(app.querySelector('canvas')!, {
    games: registry.all(),
    onPlay: (gameId) => (location.hash = `#/play/${gameId}`),
    onReach: showBooth,
    scene: scenePreference.load(),
    onLandmark: (landmark) => discovery.found(landmark),
    motion: motionPreference.load(),
  });
  const discovery = setUpDiscovery(midway.landmarks);
  setUpSceneToggle(midway.setScene);
  setUpMotionToggle(midway.setMotion);
  const stopGuide = setUpGuide();
  stop = () => {
    discovery.stop();
    stopGuide();
    midway.stop();
  };
}

// The optional discovery trail: a checklist in the guide, and a short note on
// the map when the player finds a landmark. Finds never touch scores or stamps.
function setUpDiscovery(landmarks: Landmark[]) {
  const section = app.querySelector<HTMLElement>('.midway-discovery')!;
  const toast = app.querySelector<HTMLElement>('.discovery-toast')!;
  let found = discoveryStore.load();
  let hideToast: number | undefined;

  const render = () => {
    section.querySelector('.discovery-progress')!.textContent = discoveryProgress(landmarks, found);
    section.querySelector('.discovery-clue')!.textContent = discoveryClue(landmarks, found);
    const list = section.querySelector('ul')!;
    list.replaceChildren();
    for (const landmark of landmarks) {
      const done = found.includes(landmark.id);
      const item = document.createElement('li');
      item.classList.toggle('found', done);
      item.textContent = `${done ? '✓' : '○'} ${landmark.name}${done ? ', found' : ', not found yet'}`;
      list.append(item);
    }
  };
  render();

  return {
    found(landmark: Landmark) {
      if (found.includes(landmark.id)) return;
      found = discover(found, landmark.id);
      discoveryStore.save(found);
      render();
      toast.textContent = trailComplete(landmarks, found)
        ? `You found the ${landmark.name}! ${discoveryClue(landmarks, found)}`
        : `You found the ${landmark.name}! ${discoveryProgress(landmarks, found)}.`;
      toast.hidden = false;
      window.clearTimeout(hideToast);
      hideToast = window.setTimeout(() => (toast.hidden = true), 4000);
    },
    stop() {
      window.clearTimeout(hideToast);
    },
  };
}

// Day or lantern evening, from the guide. The choice is remembered when the
// browser lets us; when it doesn't, the scene still changes for this visit.
function setUpSceneToggle(setScene: (scene: Scene) => void) {
  const button = app.querySelector<HTMLButtonElement>('.scene-toggle')!;
  let scene = scenePreference.load();
  const show = () => {
    const { label, pressed } = sceneToggleState(scene);
    button.textContent = label;
    button.setAttribute('aria-pressed', String(pressed));
  };
  button.addEventListener('click', () => {
    scene = nextScene(scene);
    scenePreference.save(scene);
    setScene(scene);
    show();
  });
  show();
}

// Follow the system's motion setting, or stay quiet, from the guide. Like the
// scene, the choice is remembered when the browser lets us.
function setUpMotionToggle(setMotion: (preference: MotionPreference) => void) {
  const button = app.querySelector<HTMLButtonElement>('.motion-toggle')!;
  let preference = motionPreference.load();
  const show = () => {
    const { label, pressed } = motionToggleState(preference);
    button.textContent = label;
    button.setAttribute('aria-pressed', String(pressed));
  };
  button.addEventListener('click', () => {
    preference = nextMotionPreference(preference);
    motionPreference.save(preference);
    setMotion(preference);
    show();
  });
  show();
}

// The visitor guide starts closed so the map has the room. Escape closes it,
// and focus goes back to its toggle when it was inside the guide.
function setUpGuide(): () => void {
  const toggle = app.querySelector<HTMLButtonElement>('.guide-toggle')!;
  const drawer = app.querySelector<HTMLElement>('.visitor-guide')!;
  let state = CLOSED_GUIDE;
  const show = (next: GuideState) => {
    state = next;
    drawer.hidden = !state.open;
    toggle.setAttribute('aria-expanded', String(state.open));
    toggle.setAttribute('aria-label', guideToggleLabel(state));
  };
  show(state);
  toggle.addEventListener('click', () => show(toggleGuide(state)));
  return onEscapeKey(window, () => {
    const result = escapeGuide(state, drawer.contains(document.activeElement));
    if (!result.handled) return;
    show(result.state);
    if (result.restoreFocus) toggle.focus();
  });
}

function renderPassport(passport: HTMLDetailsElement) {
  const stamps = passportStamps(registry.all());
  passport.open = window.matchMedia('(min-width: 721px)').matches;
  passport.querySelector('.summary')!.textContent = passportSummary(stamps);
  const list = passport.querySelector('ul')!;
  for (const stamp of stamps) {
    const text = stampText(stamp);
    const item = document.createElement('li');
    item.classList.toggle('stamped', stamp.played);
    item.innerHTML = `
      <span class="stamp" aria-hidden="true">${stamp.played ? '★' : ''}</span>
      <span class="details">
        <span class="name"></span>
        <span class="status"></span>
        <span class="best"></span>
      </span>
      <a class="play-link">Play</a>`;
    item.querySelector('.name')!.textContent = stamp.name;
    item.querySelector('.status')!.textContent = text.status;
    item.querySelector('.best')!.textContent = text.best;
    const link = item.querySelector<HTMLAnchorElement>('.play-link')!;
    link.href = stamp.playHref;
    link.setAttribute('aria-label', `Play ${stamp.name}`);
    list.append(item);
  }
}

function renderPrizes() {
  document.body.dataset.view = 'prizes';
  const collection = pavilionCollection(registry.all());
  app.innerHTML = `
    <section class="pavilion" aria-labelledby="pavilion-title">
      <div class="game-header">
        <a href="#/">← Back to the midway</a>
        <h1 id="pavilion-title" tabindex="-1">Prize Pavilion</h1>
      </div>
      <p class="pavilion-intro"></p>
      <div class="pavilion-collector" role="status">
        <span class="badge collector" aria-hidden="true">👑</span>
        <div>
          <h2></h2>
          <p></p>
        </div>
      </div>
      <ul class="pavilion-shelves"></ul>
      <p class="note">Prizes come from your best scores in this browser. Nothing to buy, and nothing is spent.</p>
    </section>`;

  app.querySelector('.pavilion-intro')!.textContent =
    'Win prizes at every booth with your best score: ' +
    PAVILION_TIERS.map((tier) => `${tier.name} at ${tier.minScore}`).join(', ') +
    '.';
  const collector = app.querySelector<HTMLElement>('.pavilion-collector')!;
  collector.classList.toggle('won', collection.collector);
  collector.querySelector('h2')!.textContent = CARNIVAL_COLLECTOR;
  collector.querySelector('p')!.textContent = collectorText(collection);

  const shelves = app.querySelector('.pavilion-shelves')!;
  for (const shelf of collection.shelves) {
    const text = shelfText(shelf);
    const item = document.createElement('li');
    item.innerHTML = `
      <h2></h2>
      <p class="best"></p>
      <ul class="badges"></ul>
      <p class="next"></p>
      <a class="play-link">Play</a>`;
    item.querySelector('h2')!.textContent = shelf.name;
    item.querySelector('.best')!.textContent = text.best;
    item.querySelector('.next')!.textContent = text.next;
    const badges = item.querySelector('.badges')!;
    for (const tier of PAVILION_TIERS) {
      const won = shelf.unlocked.includes(tier);
      const badge = document.createElement('li');
      badge.className = `prize ${tier.id}`;
      badge.classList.toggle('won', won);
      badge.innerHTML = `<span class="badge" aria-hidden="true">${won ? '★' : '?'}</span><span class="label"><span class="tier"></span><span class="prize-name"></span></span>`;
      badge.querySelector('.tier')!.textContent = `${tier.name} (${tier.minScore})`;
      badge.querySelector('.prize-name')!.textContent = won ? tier.prize : `Locked: ${tier.prize}`;
      badges.append(badge);
    }
    const link = item.querySelector<HTMLAnchorElement>('.play-link')!;
    link.href = shelf.playHref;
    link.setAttribute('aria-label', `Play ${shelf.name}`);
    shelves.append(item);
  }

  app.querySelector<HTMLElement>('h1')!.focus();
  stop = onEscapeKey(window, () => (location.hash = '#/'));
}

function renderTrail() {
  document.body.dataset.view = 'trail';
  const missions = trailMissions(registry.all());
  app.innerHTML = `
    <section class="trail" aria-labelledby="trail-title">
      <div class="game-header">
        <a href="#/">← Back to the midway</a>
        <h1 id="trail-title" tabindex="-1">Carnival Trail</h1>
      </div>
      <p class="trail-intro"></p>
      <p class="trail-next" role="status"></p>
      <ol class="trail-missions"></ol>
      <p class="note">Progress comes from your best scores in this browser only. Nothing to buy, and nothing is spent.</p>
    </section>`;

  app.querySelector('.trail-intro')!.textContent = trailIntro(missions);
  const recommended = trailRecommendation(missions);
  app.querySelector('.trail-next')!.textContent = recommended
    ? `Next up: ${recommended.nextAction}`
    : missions.every((mission) => mission.complete)
      ? 'Every mission complete!'
      : 'No booths are open yet.';

  const list = app.querySelector('.trail-missions')!;
  for (const mission of missions) {
    const item = document.createElement('li');
    item.classList.toggle('complete', mission.complete);
    item.innerHTML = `
      <span class="badge" aria-hidden="true">${mission.complete ? '✓' : ''}</span>
      <div class="details">
        <h2></h2>
        <p class="goal"></p>
        <p class="progress"></p>
        <p class="action"></p>
      </div>`;
    item.querySelector('h2')!.textContent = mission.complete
      ? `${mission.name} (earned)`
      : mission.name;
    item.querySelector('.goal')!.textContent = mission.goal;
    item.querySelector('.progress')!.textContent = progressText(mission);
    item.querySelector('.action')!.textContent = mission.nextAction;
    if (mission.next) {
      const link = document.createElement('a');
      link.className = 'play-link';
      link.href = mission.next.playHref;
      link.textContent = 'Play';
      link.setAttribute('aria-label', `Play ${mission.next.name} for ${mission.name}`);
      item.querySelector('.details')!.append(link);
    }
    list.append(item);
  }

  app.querySelector<HTMLElement>('h1')!.focus();
  stop = onEscapeKey(window, () => (location.hash = '#/'));
}

function renderCircuit() {
  document.body.dataset.view = 'circuit';
  app.innerHTML = `
    <section class="circuit" aria-labelledby="circuit-title">
      <div class="game-header">
        <a href="#/">← Back to the midway</a>
        <h1 id="circuit-title" tabindex="-1">Carnival Circuit</h1>
      </div>
      <p class="circuit-intro">Three booths in order: Ring Toss, Balloon Darts, then Skee Ball. A leg counts once you finish a new round at its booth after the circuit starts. Scores from before the circuit never count.</p>
      <p class="circuit-status" role="status"></p>
      <div class="circuit-actions">
        <a class="circuit-next play-link" hidden>Play next booth</a>
        <button type="button" class="circuit-start"></button>
      </div>
      <p class="circuit-error" role="alert" hidden>The circuit could not be saved in this browser.</p>
      <ol class="circuit-legs"></ol>
      <section class="circuit-history" aria-labelledby="circuit-history-title">
        <h2 id="circuit-history-title">Past circuits</h2>
        <p class="circuit-best"></p>
        <ol class="circuit-runs"></ol>
      </section>
      <p class="note">The circuit and its history are kept in this browser only. Free play, scores and records are unchanged.</p>
    </section>`;

  const worked = circuitProgress(registry.all(), circuit.startedAt());
  const saved = circuitHistory.save(worked);
  const history = circuitHistory.read();
  const progress = savedProgress(worked, history);
  app.querySelector('.circuit-status')!.textContent = circuitStatus(progress);
  const next = app.querySelector<HTMLAnchorElement>('.circuit-next')!;
  next.hidden = !progress.next;
  if (progress.next) {
    next.href = progress.next.playHref;
    next.textContent = `Play ${progress.next.name}`;
  }
  const startButton = app.querySelector<HTMLButtonElement>('.circuit-start')!;
  startButton.hidden = progress.legs.length === 0;
  startButton.textContent = progress.startedAt === undefined ? 'Start circuit' : 'Restart circuit';
  startButton.addEventListener('click', () => {
    const cleanup = () => {
      stop?.();
      stop = undefined;
    };
    if (!restartCircuit(circuit.start, cleanup, renderCircuit)) {
      app.querySelector<HTMLElement>('.circuit-error')!.hidden = false;
    }
  });

  const list = app.querySelector('.circuit-legs')!;
  for (const leg of progress.legs) {
    const item = document.createElement('li');
    item.classList.toggle('complete', leg.complete);
    item.classList.toggle('current', leg === progress.next);
    item.innerHTML = `
      <span class="badge" aria-hidden="true">${leg.complete ? '✓' : ''}</span>
      <div class="details">
        <h2></h2>
        <p class="score"></p>
      </div>`;
    item.querySelector('h2')!.textContent = leg.name;
    item.querySelector('.score')!.textContent = legText(leg);
    list.append(item);
  }
  if (progress.finished) {
    const total = document.createElement('li');
    total.className = 'circuit-total';
    total.textContent = `Total: ${progress.total}`;
    list.append(total);
  }

  const best = app.querySelector('.circuit-best')!;
  const runs = app.querySelector('.circuit-runs')!;
  if (!history) {
    best.textContent = 'Past circuits could not be read in this browser.';
  } else {
    best.textContent =
      history.best === undefined
        ? 'Finish a circuit to set your best total.'
        : `Best circuit total: ${history.best}`;
    for (const run of history.runs) {
      const item = document.createElement('li');
      const when = document.createElement('time');
      when.dateTime = new Date(run.completedAt).toISOString();
      when.textContent = new Date(run.completedAt).toLocaleString();
      item.append(when, `: ${runText(run, registry.all())}`);
      runs.append(item);
    }
  }
  if (saved === 'failed') {
    best.textContent += ' This circuit could not be saved to your history.';
  }

  app.querySelector<HTMLElement>('h1')!.focus();
  stop = onEscapeKey(window, () => (location.hash = '#/'));
}

function renderRecords() {
  document.body.dataset.view = 'records';
  const hall = hallOfRecords(registry.all());
  app.innerHTML = `
    <section class="records" aria-labelledby="records-title">
      <div class="game-header">
        <a href="#/">← Back to the midway</a>
        <h1 id="records-title" tabindex="-1">Hall of Records</h1>
      </div>
      <p class="records-intro">The five best rounds at every booth, highest score first. These are your top scores, not your most recent rounds.</p>
      <p class="records-overview" role="status"></p>
      <ul class="records-booths"></ul>
      <p class="note">Records are kept in this browser only, so another browser or device has its own. Personal bests added up is the sum of each booth's single best round, not every point you have scored.</p>
    </section>`;

  app.querySelector('.records-overview')!.textContent = overviewText(hall);
  const booths = app.querySelector('.records-booths')!;
  for (const booth of hall.booths) {
    const item = document.createElement('li');
    item.innerHTML = `
      <h2></h2>
      <a class="play-link">Play</a>`;
    item.querySelector('h2')!.textContent = booth.name;
    const link = item.querySelector<HTMLAnchorElement>('.play-link')!;
    link.href = booth.playHref;
    link.setAttribute('aria-label', `Play ${booth.name}`);
    if (booth.rows.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = emptyText(booth);
      link.before(empty);
    } else {
      const table = document.createElement('table');
      table.innerHTML = `
        <caption></caption>
        <thead><tr><th scope="col">Rank</th><th scope="col">Score</th><th scope="col">Recorded</th></tr></thead>
        <tbody></tbody>`;
      table.querySelector('caption')!.textContent = `Top scores at ${booth.name}`;
      const body = table.querySelector('tbody')!;
      for (const row of booth.rows) {
        const tr = document.createElement('tr');
        for (const text of [`#${row.rank}`, String(row.score), row.when]) {
          const cell = document.createElement('td');
          cell.textContent = text;
          tr.append(cell);
        }
        body.append(tr);
      }
      link.before(table);
    }
    booths.append(item);
  }

  app.querySelector<HTMLElement>('h1')!.focus();
  stop = onEscapeKey(window, () => (location.hash = '#/'));
}

function renderBooths() {
  document.body.dataset.view = 'booths';
  let entries = directoryEntries(registry.all(), bestScore, favorites.load());
  app.innerHTML = `
    <section class="directory" aria-labelledby="directory-title">
      <div class="game-header">
        <a href="#/">← Back to the midway</a>
        <h1 id="directory-title" tabindex="-1">Booth Directory</h1>
      </div>
      <p class="directory-intro">Every booth on the midway. Search by name or description, show only the booths you have or have not played, or star booths for your shortlist.</p>
      <div class="directory-controls">
        <label for="directory-search">Search booths</label>
        <input id="directory-search" type="search" autocomplete="off" />
        <div class="directory-filters" role="group" aria-label="Show booths"></div>
        <button type="button" class="directory-favorites-only" aria-pressed="false">★ Favorites</button>
      </div>
      <p class="directory-count" role="status" aria-live="polite"></p>
      <div class="directory-empty" hidden>
        <p></p>
        <button type="button" class="directory-reset">Show all booths</button>
      </div>
      <ul class="directory-booths"></ul>
      <p class="note">Personal bests and favorites are kept in this browser only.</p>
    </section>`;

  const search = app.querySelector<HTMLInputElement>('#directory-search')!;
  const filters = app.querySelector<HTMLElement>('.directory-filters')!;
  const count = app.querySelector<HTMLElement>('.directory-count')!;
  const empty = app.querySelector<HTMLElement>('.directory-empty')!;
  const reset = app.querySelector<HTMLButtonElement>('.directory-reset')!;
  const list = app.querySelector<HTMLElement>('.directory-booths')!;
  const favoritesOnlyButton = app.querySelector<HTMLButtonElement>('.directory-favorites-only')!;
  let status: DirectoryStatus = 'all';
  let favoritesOnly = false;

  favoritesOnlyButton.addEventListener('click', () => {
    favoritesOnly = !favoritesOnly;
    update();
  });

  function toggleFavorite(gameId: string) {
    const entry = entries.find((e) => e.gameId === gameId);
    if (!entry) return;
    // Only change the card when the shortlist was saved.
    if (favorites.set(gameId, !entry.favorite) === undefined) return;
    entries = directoryEntries(registry.all(), bestScore, favorites.load());
    update();
    list.querySelector<HTMLButtonElement>(`[data-favorite="${gameId}"]`)?.focus();
    if (document.activeElement === document.body) favoritesOnlyButton.focus();
  }

  const buttons = DIRECTORY_STATUSES.map(({ id, label }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => {
      status = id;
      update();
    });
    filters.append(button);
    return { id, button };
  });

  function update() {
    for (const { id, button } of buttons)
      button.setAttribute('aria-pressed', String(id === status));
    favoritesOnlyButton.setAttribute('aria-pressed', String(favoritesOnly));
    const shown = filterDirectory(entries, search.value, status, favoritesOnly);
    count.textContent = countText(shown.length, entries.length);
    const message = directoryEmptyText(
      shown.length,
      entries.length,
      search.value,
      status,
      favoritesOnly,
      entries.filter((e) => e.favorite).length,
    );
    empty.hidden = message === undefined;
    empty.querySelector('p')!.textContent = message ?? '';
    reset.hidden = entries.length === 0;
    list.replaceChildren();
    for (const entry of shown) {
      const item = document.createElement('li');
      item.classList.toggle('played', entry.played);
      item.classList.toggle('favorite', entry.favorite);
      item.innerHTML = `
        <button type="button" class="favorite-toggle"></button>
        <h2></h2>
        <p class="description"></p>
        <p class="best"></p>
        <a class="play-link">Play</a>`;
      item.querySelector('h2')!.textContent = entry.name;
      item.querySelector('.description')!.textContent = entry.description;
      item.querySelector('.best')!.textContent = bestLine(entry);
      const link = item.querySelector<HTMLAnchorElement>('.play-link')!;
      link.href = entry.playHref;
      link.setAttribute('aria-label', `Play ${entry.name}`);
      const toggle = item.querySelector<HTMLButtonElement>('.favorite-toggle')!;
      toggle.dataset.favorite = entry.gameId;
      toggle.textContent = entry.favorite ? '★' : '☆';
      toggle.setAttribute('aria-pressed', String(entry.favorite));
      toggle.setAttribute('aria-label', favoriteLabel(entry));
      toggle.title = favoriteLabel(entry);
      toggle.addEventListener('click', () => toggleFavorite(entry.gameId));
      list.append(item);
    }
  }

  search.addEventListener('input', update);
  reset.addEventListener('click', () => {
    search.value = '';
    status = 'all';
    favoritesOnly = false;
    update();
    search.focus();
  });
  update();

  app.querySelector<HTMLElement>('h1')!.focus();
  // Escape in a search with text clears it first; otherwise it goes back.
  stop = onEscapeKey(window, () => {
    if (document.activeElement === search && search.value !== '') {
      search.value = '';
      update();
    } else {
      location.hash = '#/';
    }
  });
}

function renderGame(game: CarnivalGame) {
  document.body.dataset.view = 'game';
  app.innerHTML = `
    <section class="game">
      <div class="game-header">
        <a href="#/">← Back to the midway</a>
        <h1></h1>
      </div>
      <canvas></canvas>
    </section>`;
  app.querySelector('h1')!.textContent = game.name;
  const stopGame = game.start(app.querySelector('canvas')!);
  const stopEscape = onEscapeKey(window, () => (location.hash = '#/'));
  stop = () => {
    stopEscape();
    stopGame();
  };
}

function route() {
  stop?.();
  stop = undefined;
  // Save a finished circuit on every route, so its scores are kept before
  // later play can push them off the scoreboard.
  circuitHistory.save(circuitProgress(registry.all(), circuit.startedAt()));

  const match = location.hash.match(/^#\/play\/([\w-]+)$/);
  const game = match ? registry.get(match[1]) : undefined;
  if (game) renderGame(game);
  else if (location.hash === '#/prizes') renderPrizes();
  else if (location.hash === '#/trail') renderTrail();
  else if (location.hash === '#/circuit') renderCircuit();
  else if (location.hash === '#/records') renderRecords();
  else if (location.hash === '#/booths') renderBooths();
  else renderMidway();
}

// One subscription for the page's lifetime: a finished circuit is saved the
// moment its last score is recorded, before more play can evict that score.
const stopSavingCircuits = saveFinishedCircuits(
  onScoreRecorded,
  registry.all(),
  circuit.startedAt,
  circuitHistory,
);

window.addEventListener('hashchange', route);
route();

// Hot reloads run this module again: drop the old subscription and listener.
import.meta.hot?.dispose(() => {
  stopSavingCircuits();
  window.removeEventListener('hashchange', route);
  stop?.();
});
