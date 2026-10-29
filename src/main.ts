import './style.css';
import {
  applyTheme,
  beginScopedRound,
  canvasFont,
  theme,
  bestScore,
  onScoreRecorded,
  type CarnivalGame,
} from './carnival';
import { registry } from './games';
import { startFair } from './fair/view';
import { browserFairStorage } from './fair/fair';
import { startParade } from './parade/view';
import { onEscapeKey } from './escape';
import {
  MAZE_H,
  MAZE_W,
  createExpeditionStore,
  edgeKey,
  hint,
  move,
  openPassages,
  resumeExpedition,
  startExpedition,
  turnMirror,
  undoTurn,
  xy,
  type Dir,
  type Expedition,
} from './expedition';
import {
  CLOSED_GUIDE,
  escapeGuide,
  GUIDE_SECTIONS,
  guideContentsLinkId,
  guideSectionHeadingId,
  guideToggleLabel,
  jumpToSection,
  returnToContents,
  toggleGuide,
  type GuideState,
} from './visitor-guide';
import {
  VISIT_MOODS,
  advanceVisit,
  chooseVisit,
  currentStop,
  exitVisit,
  findMood,
  restartVisit,
  visitProgress,
  visitSummary,
  type VisitPlan,
} from './visit-plan';
import {
  CLOSED_HELP,
  HELP_CONTROLS,
  escapeHelp,
  helpToggleLabel,
  toggleHelp,
  type HelpState,
} from './midway-help';
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
import {
  COOPERATIVE_GOAL,
  DEFAULT_NAMES,
  NICKNAME_MAX,
  PARTY_GAME_IDS,
  eraseSavedNicknames,
  forgetNotice,
  guardControlKeys,
  leaveTurn,
  legComparison,
  makePartyId,
  newParty,
  partyStatus,
  partyStore,
  playTurn,
  playerName,
  recordTurn,
  saveWarning,
  startTurn,
  summarize,
  type Party,
  type PartyMode,
  type Turn,
} from './party';
import { progressText, trailIntro, trailMissions, trailRecommendation } from './trail';
import { startMidway } from './midway/midway';
import type { LandmarkDetail } from './midway/render';
import {
  createSoundscape,
  DEFAULT_SOUNDSCAPE_VOLUME,
  soundToggleState,
  type SoundContext,
} from './midway/soundscape';
import { routeMessage, type RouteState } from './midway/route';
import {
  POSTCARD_MESSAGES,
  POSTCARD_NAME_MAX,
  limitNameInput,
  POSTCARD_SCALE,
  POSTCARD_SIZE,
  drawPostcard,
  postcardContent,
  postcardExporter,
} from './postcard';
import {
  discover,
  discoveryClue,
  discoveryProgress,
  discoveryStore,
  landmarkHint,
  mergeDiscoveries,
  nextLandmark,
  trailComplete,
  trailLandmarks,
  type Landmark,
  type LandmarkId,
} from './midway/discovery';
import {
  APPROACHES,
  approachesAt,
  canTheorize,
  ENDINGS,
  LANDMARK_ORDER,
  landmarkDetail,
  landmarkScene,
  misreadHint,
  mysteryStatus,
  mysteryStep,
  mysteryStore,
  npcLine,
  openEndings,
  sameMystery,
  THEORIES,
  type MysteryAction,
  type Theory,
  mysteryPanelSelector,
} from './finale-mystery';
import {
  CLOSED_STORY,
  closeStory,
  escapeStory,
  openStory,
  storyStatus,
  unlockedStory,
  type StoryState,
} from './landmark-stories';
import {
  isQuiet,
  motionPreference,
  motionToggleState,
  watchReducedMotion,
  nextMotionPreference,
  type MotionPreference,
} from './midway/motion';
import { nextScene, scenePreference, sceneToggleState, type Scene } from './midway/scene';
import { canZoomIn, canZoomOut, DEFAULT_VIEW_SCALE, zoomIn, zoomOut } from './midway/view';
import { layoutMidway, type BoothSlot } from './midway/world';
import { boothPrompt } from './booth-prompt';
import {
  BALLOON_COLORS,
  BALLOON_COLOR_NAMES,
  BALLOON_SCENE,
  RELEASE_MS,
  RESTING_POSITION,
  WISH_MAX,
  addKeepsake,
  balloonPosition,
  drawBalloonScene,
  keepsakeStore,
  makeBalloon,
  type WishBalloon,
} from './wish-balloon';
import {
  STARTER_TUNE,
  TUNE_LENGTHS,
  TUNE_TEMPOS,
  TUNE_TRACKS,
  TUNE_TRACK_NAMES,
  clearTune,
  createTunePlayer,
  createTuneVoices,
  describeStep,
  setLength,
  setTempo,
  toggleStep,
  tuneStore,
  type Tune,
  type TuneLength,
  type TuneTempo,
  type TuneTrack,
  type VoiceContext,
} from './carousel-tune';
import {
  PLUSH_BODIES,
  PLUSH_COLORS,
  PLUSH_COLOR_NAMES,
  PLUSH_FACES,
  PLUSH_NAME_MAX,
  PLUSH_SIZE,
  STARTER_PLUSH,
  availableAccessories,
  benchApply,
  benchFor,
  benchReset,
  benchUndo,
  accessoryAt,
  describePlush,
  drawPlush,
  plushStore,
  type PlushAccessory,
  type PlushAction,
} from './plush';
import {
  CLOSED_TOUR,
  TOUR_STEPS,
  isLastStep,
  nextStep,
  previousStep,
  startTour,
  stepLabel,
  tourMemory,
  type TourState,
} from './welcome-tour';

applyTheme();

const app = document.querySelector<HTMLElement>('#app')!;
let stop: (() => void) | undefined;
/** True when the midway is being drawn again after Run Your Own Fair. */
let backFromFair = false;

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
        <div class="midway-toggles">
          <button type="button" class="help-toggle" aria-expanded="false" aria-controls="midway-help-panel">
            ❔ Help
          </button>
          <button type="button" class="guide-toggle" aria-expanded="false" aria-controls="visitor-guide">
            🗺️ Guide
          </button>
          <button type="button" class="tour-start" aria-controls="welcome-tour" hidden>👋 Start tour</button>
        </div>
        <div class="midway-view" role="group" aria-label="Map view">
          <button type="button" class="view-out" aria-label="Zoom the map out">−</button>
          <button type="button" class="view-reset" aria-label="Reset the map view">Reset view</button>
          <button type="button" class="view-in" aria-label="Zoom the map in">+</button>
        </div>
        <button type="button" class="discovery-hint" hidden></button>
        <section class="midway-help-panel" id="midway-help-panel" aria-labelledby="midway-help-title" hidden>
          <h2 id="midway-help-title">Controls</h2>
          <dl></dl>
          <button type="button" class="help-tour" aria-controls="welcome-tour">👋 Take the welcome tour</button>
          <button type="button" class="help-to-map">Back to the map</button>
        </section>
        <section class="welcome-tour" id="welcome-tour" aria-labelledby="welcome-tour-title" hidden>
          <p class="step" aria-live="polite"></p>
          <h2 id="welcome-tour-title" tabindex="-1"></h2>
          <p class="text"></p>
          <div class="tour-actions">
            <button type="button" class="tour-back">Back</button>
            <button type="button" class="tour-next">Next</button>
            <button type="button" class="tour-skip">Skip tour</button>
          </div>
        </section>
        <div class="visitor-guide" id="visitor-guide" role="region" aria-label="Visitor guide" hidden>
          <nav class="guide-contents" aria-label="Guide sections"><ul></ul></nav>
          <nav class="guide-destinations" aria-label="Destinations" data-guide-section="destinations">
            <h2 class="guide-section-title" id="guide-destinations-title" tabindex="-1">Destinations</h2>
            <a class="directory-link" href="#/booths">🔎 Booth Directory</a>
            <a class="pavilion-link" href="#/prizes">🏆 Prize Pavilion</a>
            <a class="trail-link" href="#/trail">🧭 Carnival Trail</a>
            <a class="circuit-link" href="#/circuit">🎪 Carnival Circuit</a>
            <a class="circuit-link" href="#/party">🎉 Two-Player Party</a>
            <a class="records-link" href="#/records">📜 Hall of Records</a>
            <a class="postcard-link" href="#/postcard">💌 Souvenir Postcard</a>
            <a class="plush-link" href="#/plush">🧸 Plush Workshop</a>
            <a class="tune-link" href="#/tune">🎠 Carousel Tune Workshop</a>
            <a class="balloon-link" href="#/balloon">🎈 Wish Balloon</a>
            <a class="fair-link" href="#/fair">🛠️ Run Your Own Fair</a>
            <a class="fair-link" href="#/parade">🎉 Parade Composer</a>
            <a class="expedition-link" href="#/expedition">🪞 Mirror Maze Expedition</a>
            <button type="button" class="guide-back" aria-label="Back to the guide contents">↑ Contents</button>
          </nav>
          <section class="midway-visit" aria-label="Choose my visit" data-guide-section="visit">
            <h2 id="guide-visit-title" tabindex="-1">Choose my visit</h2>
            <div class="visit-moods"></div>
            <div class="visit-plan" hidden>
              <p class="visit-progress" role="status"></p>
              <ol></ol>
              <p class="visit-why"></p>
              <div class="visit-summary" hidden>
                <p class="visit-summary-text"></p>
                <a class="visit-postcard" href="#/postcard">💌 Make a Souvenir Postcard</a>
              </div>
              <div class="visit-actions">
                <button type="button" class="visit-walk">Walk to next stop</button>
                <button type="button" class="visit-done">Stop done</button>
                <button type="button" class="visit-restart">Restart</button>
                <button type="button" class="visit-another" hidden>Choose another visit</button>
                <button type="button" class="visit-exit">Exit visit</button>
              </div>
            </div>
            <p class="note">Optional, with no timer. Separate from scores and stamps, and forgotten when you close the tab.</p>
            <button type="button" class="guide-back" aria-label="Back to the guide contents">↑ Contents</button>
          </section>
          <nav class="midway-guide" aria-label="Booths">
            <h2>Booths</h2>
            <ul></ul>
          </nav>
          <section class="midway-discovery" aria-label="Discovery trail" data-guide-section="discovery">
            <h2 id="guide-discovery-title" tabindex="-1">Discovery trail</h2>
            <p class="discovery-progress" role="status"></p>
            <ul></ul>
            <p class="discovery-clue"></p>
            <section class="landmark-story" id="landmark-story" aria-labelledby="landmark-story-title" hidden>
              <span class="badge" aria-hidden="true"></span>
              <h3 id="landmark-story-title" tabindex="-1"></h3>
              <div class="lines"></div>
              <p class="revisit"></p>
              <button type="button" class="story-close">Back to the trail</button>
            </section>
            <section class="finale-mystery" aria-labelledby="finale-mystery-title">
              <h3 id="finale-mystery-title">🎟️ The missing finale ticket</h3>
              <p class="mystery-status" role="status"></p>
              <div class="mystery-body"></div>
              <p class="note">Walk up to the Ticket booth, Carousel and Ferris wheel on the map, or use the buttons here: both count. No timer. Kept in this browser only, apart from scores.</p>
            </section>
            <p class="note">Optional, and separate from scores and stamps. Kept in this browser only.</p>
            <button type="button" class="guide-back" aria-label="Back to the guide contents">↑ Contents</button>
          </section>
          <details class="midway-passport" data-guide-section="passport">
            <summary id="guide-passport-title"><h2>Passport</h2> <span class="summary"></span></summary>
            <ul></ul>
            <p class="note">Stamps are kept in this browser only.</p>
            <button type="button" class="guide-back" aria-label="Back to the guide contents">↑ Contents</button>
          </details>
          <section class="guide-settings" aria-label="Settings" data-guide-section="settings">
            <h2 id="guide-settings-title" tabindex="-1">Settings</h2>
            <button type="button" class="scene-toggle" aria-pressed="false"></button>
            <button type="button" class="motion-toggle" aria-pressed="false" aria-describedby="motion-note"></button>
            <p class="note" id="motion-note">Off follows your system's reduced-motion setting. On holds the scenery still. Walking and games are never slowed.</p>
            <button type="button" class="sound-toggle" aria-pressed="false" aria-describedby="sound-note"></button>
            <label class="sound-volume">Volume <input type="range" min="0" max="1" step="0.05" value="${DEFAULT_SOUNDSCAPE_VOLUME}" /></label>
            <p class="note" id="sound-note">A soft hum made in your browser. Starts off, stops when you leave the midway or hide the page. Nothing on the map depends on it.</p>
  <button type="button" class="guide-back" aria-label="Back to the guide contents">↑ Contents</button>
          </section>
        </div>
      </div>
      <p class="discovery-toast" role="status" hidden></p>
      <div class="midway-route" hidden>
        <p class="message" role="status"></p>
        <button type="button" class="cancel" hidden>Cancel walk</button>
      </div>
      <section class="mystery-card" aria-labelledby="mystery-card-title" hidden>
        <h2 id="mystery-card-title"></h2>
        <div class="mystery-card-body" aria-live="polite"></div>
        <button type="button" class="mystery-card-close">Close</button>
      </section>
      <div class="booth-card" aria-live="polite" hidden>
        <p class="prompt" hidden></p>
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
    const prompt = card.querySelector<HTMLElement>('.prompt')!;
    const promptText = boothPrompt(booth, (id) => registry.get(id)?.name);
    prompt.hidden = promptText === undefined;
    prompt.textContent = promptText ?? '';
    const link = card.querySelector<HTMLAnchorElement>('.play')!;
    link.hidden = !game;
    if (game) link.href = `#/play/${game.id}`;
  };
  // The fair gateway shares the booth card, with its own words and link.
  const showFairGate = (near: boolean) => {
    if (!near) {
      if (card.dataset.gate) {
        delete card.dataset.gate;
        card.hidden = true;
      }
      return;
    }
    card.dataset.gate = 'fair';
    card.hidden = false;
    card.classList.remove('closed');
    card.querySelector('h2')!.textContent = 'Run Your Own Fair';
    card.querySelector('.description')!.textContent =
      'The fairgrounds gateway. Lay out your own plaza, then come back here. Scores are never touched.';
    card.querySelector('.best')!.textContent = '';
    const prompt = card.querySelector<HTMLElement>('.prompt')!;
    prompt.hidden = false;
    prompt.textContent = 'Press E, Enter or Space, or click the gateway, to go in.';
    const link = card.querySelector<HTMLAnchorElement>('.play')!;
    link.hidden = false;
    link.href = '#/fair';
    link.textContent = 'Enter';
  };

  const midway = startMidway(app.querySelector('canvas')!, {
    games: registry.all(),
    onPlay: (gameId) => (location.hash = `#/play/${gameId}`),
    onReach: (booth) => {
      if (booth) delete card.dataset.gate;
      card.querySelector<HTMLAnchorElement>('.play')!.textContent = 'Play';
      showBooth(booth);
    },
    onFairGate: () => (location.hash = '#/fair'),
    onFairGateReach: showFairGate,
    scene: scenePreference.load(),
    onLandmark: (landmark) => {
      discovery.found(landmark);
      mystery.visit(landmark.id);
    },
    motion: motionPreference.load(),
    onRoute: (route) => routeStatus.show(route),
  });
  const routeStatus = setUpRoute(midway.cancelWalk);
  const discovery = setUpDiscovery(midway.landmarks, midway.walkToLandmark);
  const mystery = setUpMystery(midway.landmarks, midway.setLandmarkDetail);
  setUpVisit(midway.walkTo, midway.walkToLandmark);
  setUpSceneToggle(midway.setScene);
  setUpMotionToggle(midway.setMotion);
  setUpViewControls(midway.setViewScale);
  const stopSound = setUpSound();
  // The card's Enter link goes in the same way as E or a click on the gateway,
  // so coming back still puts you beside it.
  card.querySelector('.play')!.addEventListener('click', (event) => {
    if (card.dataset.gate !== 'fair') return;
    event.preventDefault();
    midway.enterFair();
  });
  const stopGuide = setUpGuide();
  const tour = setUpTour();
  const stopHelp = setUpHelp(tour.start);
  if (backFromFair) {
    // Back by the gateway: give the map focus so walking works straight away.
    backFromFair = false;
    app.querySelector<HTMLElement>('.midway-map')!.focus();
  }
  stop = () => {
    stopSound();
    tour.stop();
    routeStatus.stop();
    discovery.stop();
    mystery.stop();
    stopHelp();
    stopGuide();
    midway.stop();
  };
}

// The status line for a walk to a booth or landmark: where it is headed, then
// arrival or cancel. The live region only changes at those moments. The button,
// or walking with the keys, cancels; the arrived and cancelled lines clear after
// a moment.
function setUpRoute(cancelWalk: () => void) {
  const box = app.querySelector<HTMLElement>('.midway-route')!;
  const message = box.querySelector<HTMLElement>('.message')!;
  const cancel = box.querySelector<HTMLButtonElement>('.cancel')!;
  let timer: number | undefined;
  cancel.addEventListener('click', () => {
    // Keep focus on the map, not on a button about to hide.
    app.querySelector<HTMLElement>('.midway-map')?.focus();
    cancelWalk();
  });
  return {
    show(route: RouteState) {
      window.clearTimeout(timer);
      message.textContent = routeMessage(route);
      box.hidden = route.phase === 'idle';
      cancel.hidden = route.phase !== 'walking';
      if (route.phase !== 'idle' && route.phase !== 'walking')
        timer = window.setTimeout(() => (box.hidden = true), 4000);
    },
    stop: () => window.clearTimeout(timer),
  };
}

// The optional discovery trail: a checklist in the guide, and a short note on
// the map when the player finds a landmark. "Walk there" and the hint by the
// guide toggle only walk the player over; the find still waits for arrival.
// Finds never touch scores or stamps.
function setUpDiscovery(landmarks: Landmark[], walkTo: (id: LandmarkId) => boolean) {
  const section = app.querySelector<HTMLElement>('.midway-discovery')!;
  const toast = app.querySelector<HTMLElement>('.discovery-toast')!;
  const hint = app.querySelector<HTMLButtonElement>('.discovery-hint')!;
  const map = app.querySelector<HTMLCanvasElement>('.midway-map')!;
  let found = discoveryStore.load();
  let hideToast: number | undefined;

  const showToast = (text: string) => {
    toast.textContent = text;
    toast.hidden = false;
    window.clearTimeout(hideToast);
    hideToast = window.setTimeout(() => (toast.hidden = true), 4000);
  };

  // Focus moves to the map once the walk starts, so a movement key can still
  // cancel it: the midway ignores keys while a button has focus.
  const guideTo = (landmark: Landmark) => {
    if (walkTo(landmark.id)) {
      map.focus();
    } else {
      showToast(`No open path to the ${landmark.name} from here. Try walking closer yourself.`);
    }
  };

  const onHint = () => {
    const next = nextLandmark(landmarks, found);
    if (next) guideTo(next);
  };
  hint.addEventListener('click', onHint);

  const render = () => {
    const text = landmarkHint(landmarks, found);
    hint.hidden = text === undefined;
    hint.textContent = text ?? '';
    hint.setAttribute('aria-label', text ? `${text}. Walk there.` : '');
    section.querySelector('.discovery-progress')!.textContent = discoveryProgress(landmarks, found);
    section.querySelector('.discovery-clue')!.textContent = discoveryClue(landmarks, found);
    const list = section.querySelector('ul')!;
    list.replaceChildren();
    for (const landmark of landmarks) {
      const done = found.includes(landmark.id);
      const item = document.createElement('li');
      item.classList.toggle('found', done);
      item.textContent = `${done ? '✓' : '○'} ${landmark.name}${done ? ', found' : ', not found yet'} `;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'walk-there';
      button.textContent = 'Walk there';
      button.setAttribute('aria-label', `Walk to the ${landmark.name}`);
      button.addEventListener('click', () => guideTo(landmark));
      item.append(button);
      if (unlockedStory(landmark.id, found)) {
        const read = document.createElement('button');
        read.type = 'button';
        read.className = 'read-story';
        read.dataset.landmark = landmark.id;
        read.textContent = '📖 Story';
        read.setAttribute('aria-label', storyStatus(landmark.name, landmark.id, found));
        read.setAttribute('aria-controls', 'landmark-story');
        read.addEventListener('click', () => showStory(openStory(story, landmark.id, found)));
        item.append(' ', read);
      } else {
        const locked = document.createElement('span');
        locked.className = 'story-locked';
        locked.textContent = storyStatus(landmark.name, landmark.id, found);
        item.append(' ', locked);
      }
      list.append(item);
    }
  };

  // A found landmark's story card, inside the guide. Back to the trail and
  // Escape close it and put focus back on its Story button.
  const card = section.querySelector<HTMLElement>('.landmark-story')!;
  let story: StoryState = CLOSED_STORY;
  const showStory = (next: StoryState) => {
    const opening = next.open !== undefined && next.open !== story.open;
    story = next;
    const open = story.open === undefined ? undefined : unlockedStory(story.open, found);
    card.hidden = !open;
    if (!open) return;
    card.querySelector('.badge')!.textContent = open.badge;
    card.querySelector('h3')!.textContent = open.title;
    const lines = card.querySelector('.lines')!;
    lines.replaceChildren();
    for (const text of open.lines) {
      const p = document.createElement('p');
      p.textContent = text;
      lines.append(p);
    }
    card.querySelector('.revisit')!.textContent = open.revisit;
    if (opening) card.querySelector<HTMLElement>('h3')!.focus();
  };
  const closeCard = () => {
    const id = story.open;
    showStory(closeStory());
    if (id) section.querySelector<HTMLElement>(`.read-story[data-landmark="${id}"]`)?.focus();
  };
  const onClose = () => closeCard();
  card.querySelector('.story-close')!.addEventListener('click', onClose);
  // Keys inside the card stay in the card: no walking or playing from its
  // focused heading. Escape is handled above, on the way down.
  const onCardKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') event.stopPropagation();
  };
  card.addEventListener('keydown', onCardKeyDown);
  const onKeyDown = (event: KeyboardEvent) => {
    // A card left open in a closed guide waits: Escape goes to what is showing.
    if (event.key !== 'Escape' || section.closest<HTMLElement>('.visitor-guide')?.hidden) return;
    // Help sits above the guide, so it keeps the first Escape.
    if (app.querySelector<HTMLElement>('.midway-help-panel')?.hidden === false) return;
    // So does the welcome tour.
    if (app.querySelector<HTMLElement>('.welcome-tour')?.hidden === false) return;
    const result = escapeStory(story, card.contains(document.activeElement));
    if (!result.handled) return;
    // One Escape closes one panel: the guide waits for the next press.
    event.stopImmediatePropagation();
    if (result.restoreFocus) closeCard();
    else showStory(result.state);
  };
  window.addEventListener('keydown', onKeyDown, true);
  render();

  return {
    found(landmark: Landmark) {
      if (found.includes(landmark.id)) return;
      // Read the saved finds again first, so a find made in another tab is kept.
      found = discover(mergeDiscoveries(found, discoveryStore.load()), landmark.id);
      discoveryStore.save(found);
      render();
      showToast(
        trailComplete(landmarks, found)
          ? `You found the ${landmark.name}! ${discoveryClue(landmarks, found)}`
          : `You found the ${landmark.name}! ${discoveryProgress(landmarks, found)}.`,
      );
    },
    stop() {
      window.clearTimeout(hideToast);
      hint.removeEventListener('click', onHint);
      window.removeEventListener('keydown', onKeyDown, true);
      card.removeEventListener('keydown', onCardKeyDown);
    },
  };
}

// The missing finale ticket: one state machine for walking up to landmarks
// and for the buttons in the guide. Walking up opens a card on the map with
// that landmark's choices; the guide holds every choice as plain text. The
// map's drawn details come from the same state. Every word is set with textContent.
function setUpMystery(landmarks: readonly Landmark[], setDetail: (d: LandmarkDetail) => void) {
  const section = app.querySelector<HTMLElement>('.finale-mystery')!;
  const body = section.querySelector<HTMLElement>('.mystery-body')!;
  const card = app.querySelector<HTMLElement>('.mystery-card')!;
  const cardBody = card.querySelector<HTMLElement>('.mystery-card-body')!;
  const closeCard = card.querySelector<HTMLButtonElement>('.mystery-card-close')!;
  let state = mysteryStore.load();
  let at: LandmarkId | undefined;
  const nameOf = (id: LandmarkId) => landmarks.find((l) => l.id === id)?.name ?? id;

  const para = (into: HTMLElement, text: string, className?: string) => {
    const p = document.createElement('p');
    if (className) p.className = className;
    p.textContent = text;
    into.append(p);
  };
  const button = (into: HTMLElement, text: string, action: MysteryAction) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.addEventListener('click', () => step(action, into));
    into.append(b);
  };

  // What there is to do at one landmark right now.
  const landmarkControls = (into: HTMLElement, id: LandmarkId) => {
    const approach = state.approaches[id];
    if (approach) {
      para(into, `${APPROACHES[approach].title}: ${APPROACHES[approach].text}`);
      if (!state.theory)
        button(into, `Look again at the ${nameOf(id)}`, { type: 'look-again', at: id });
      return;
    }
    if (state.theory) return;
    for (const a of approachesAt(id))
      button(into, APPROACHES[a].label, { type: 'investigate', at: id, approach: a });
  };

  // The theory and the ending, shared by the guide and the card.
  const resolution = (into: HTMLElement) => {
    if (state.ending) {
      const ending = ENDINGS[state.ending];
      para(into, `Ending: ${ending.title}. ${ending.text}`, 'ending');
      button(into, 'Start the mystery again', { type: 'restart' });
      return;
    }
    if (canTheorize(state)) {
      const hint = misreadHint(state);
      if (hint) para(into, hint);
      para(into, 'What do you tell Mara and Otto happened?');
      for (const theory of Object.keys(THEORIES) as Theory[])
        button(into, THEORIES[theory].label, { type: 'theorize', theory });
    }
    const endings = openEndings(state);
    if (endings.length > 0) {
      para(into, 'How should the finale go?');
      for (const ending of endings)
        button(into, ENDINGS[ending].label, { type: 'resolve', ending });
    }
  };

  const npcs = (into: HTMLElement) => {
    para(into, npcLine(state, 'mara'), 'npc');
    if (state.approaches.carousel) para(into, npcLine(state, 'otto'), 'npc');
  };

  const renderCard = () => {
    cardBody.replaceChildren();
    if (!at) {
      card.hidden = true;
      return;
    }
    card.hidden = false;
    card.querySelector('h2')!.textContent = `🎟️ ${nameOf(at)}`;
    para(cardBody, landmarkScene(state)[at]);
    if (!state.started) {
      para(cardBody, npcLine(state, 'mara'), 'npc');
      button(cardBody, 'Offer to help Mara', { type: 'start' });
      return;
    }
    if (at === 'entrance') para(cardBody, npcLine(state, 'mara'), 'npc');
    if (at === 'carousel' && state.approaches.carousel)
      para(cardBody, npcLine(state, 'otto'), 'npc');
    landmarkControls(cardBody, at);
    resolution(cardBody);
  };

  const render = () => {
    setDetail(landmarkDetail(state));
    section.querySelector('.mystery-status')!.textContent = mysteryStatus(state);
    body.replaceChildren();
    npcs(body);
    if (!state.started) {
      button(body, 'Offer to help Mara', { type: 'start' });
    } else {
      for (const id of LANDMARK_ORDER) {
        const group = document.createElement('div');
        group.className = 'mystery-landmark';
        group.dataset.landmark = id;
        para(group, landmarkScene(state)[id], 'scene');
        landmarkControls(group, id);
        body.append(group);
      }
      resolution(body);
    }
    renderCard();
  };

  // Focus stays in the panel that was used, on its first button. render()
  // replaces the panel, so find the newly rendered one by its landmark id.
  const step = (action: MysteryAction, from?: HTMLElement) => {
    const landmark = from?.dataset.landmark;
    // Read the saved progress again first, so another tab's steps are kept.
    const next = mysteryStep(mysteryStore.load(), action);
    if (sameMystery(next, state)) return;
    state = next;
    mysteryStore.save(state);
    render();
    if (!from) return;
    const panel = landmark
      ? (body.querySelector<HTMLElement>(mysteryPanelSelector(landmark)) ?? body)
      : from;
    (
      panel.querySelector<HTMLElement>('button') ?? body.querySelector<HTMLElement>('button')
    )?.focus();
  };

  const onClose = () => {
    at = undefined;
    renderCard();
    app.querySelector<HTMLElement>('.midway-map')?.focus();
  };
  closeCard.addEventListener('click', onClose);

  render();
  return {
    /** Walking up to a landmark on the map opens its card with the same choices. */
    visit(id: LandmarkId) {
      // Pick up another tab's progress before showing the card.
      const saved = mysteryStore.load();
      // Until Mara asks for help, only her booth offers the mystery.
      if (!saved.started && id !== 'entrance') return;
      if (!sameMystery(saved, state)) {
        state = saved;
        at = id;
        render();
        return;
      }
      at = id;
      renderCard();
    },
    stop() {
      closeCard.removeEventListener('click', onClose);
      body.replaceChildren();
      cardBody.replaceChildren();
    },
  };
}

// Choose my visit: pick a mood, then follow its three stops. The plan is kept
// in memory for this tab only, so it survives playing a booth and coming back,
// and it never touches scores, stamps or discovery finds.
let visitPlan: VisitPlan | undefined;

function setUpVisit(walkTo: (gameId: string) => void, walkToLandmark: (id: LandmarkId) => boolean) {
  const section = app.querySelector<HTMLElement>('.midway-visit')!;
  const moods = section.querySelector<HTMLElement>('.visit-moods')!;
  const panel = section.querySelector<HTMLElement>('.visit-plan')!;
  const map = app.querySelector<HTMLCanvasElement>('.midway-map')!;
  const walk = section.querySelector<HTMLButtonElement>('.visit-walk')!;
  const done = section.querySelector<HTMLButtonElement>('.visit-done')!;
  const another = section.querySelector<HTMLButtonElement>('.visit-another')!;
  const summary = section.querySelector<HTMLElement>('.visit-summary')!;

  const render = () => {
    moods.hidden = visitPlan !== undefined;
    panel.hidden = visitPlan === undefined;
    if (!visitPlan) return;
    const mood = findMood(visitPlan.moodId)!;
    const stop = currentStop(visitPlan);
    section.querySelector('.visit-progress')!.textContent = visitProgress(visitPlan);
    section.querySelector('.visit-why')!.textContent = stop
      ? `Why: ${stop.why}`
      : 'Pick another mood, or restart this one.';
    const list = section.querySelector('ol')!;
    list.replaceChildren();
    mood.stops.forEach((item, i) => {
      const li = document.createElement('li');
      const state = i < visitPlan!.index ? 'done' : i === visitPlan!.index ? 'next' : 'later';
      li.className = state;
      li.textContent = `${item.name}${state === 'done' ? ', done' : state === 'next' ? ', next' : ''}`;
      list.append(li);
    });
    walk.hidden = done.hidden = stop === undefined;
    const celebration = visitSummary(visitPlan);
    summary.hidden = another.hidden = celebration === undefined;
    section.querySelector<HTMLElement>('.visit-why')!.hidden = celebration !== undefined;
    section.querySelector('.visit-summary-text')!.textContent = celebration ?? '';
    if (stop) walk.textContent = `Walk to ${stop.name}`;
  };

  for (const mood of VISIT_MOODS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'visit-mood';
    button.textContent = `${mood.name}: ${mood.summary}`;
    button.addEventListener('click', () => {
      visitPlan = chooseVisit(mood.id);
      render();
      walk.focus();
    });
    moods.append(button);
  }

  // Like the discovery trail, focus moves to the map once the walk starts, so
  // a movement key can still cancel it.
  walk.addEventListener('click', () => {
    const stop = visitPlan && currentStop(visitPlan);
    if (!stop) return;
    if (stop.kind === 'booth') walkTo(stop.gameId);
    else if (!walkToLandmark(stop.landmarkId)) return;
    map.focus();
  });
  done.addEventListener('click', () => {
    if (visitPlan) visitPlan = advanceVisit(visitPlan);
    render();
    if (!walk.hidden) walk.focus();
    else section.querySelector<HTMLButtonElement>('.visit-restart')!.focus();
  });
  section.querySelector('.visit-restart')!.addEventListener('click', () => {
    if (visitPlan) visitPlan = restartVisit(visitPlan);
    render();
    walk.focus();
  });
  const leave = () => {
    visitPlan = exitVisit();
    render();
    moods.querySelector<HTMLButtonElement>('button')?.focus();
  };
  section.querySelector('.visit-exit')!.addEventListener('click', leave);
  another.addEventListener('click', leave);
  render();
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

// The opt-in soundscape. It starts off on every visit and only a click starts
// it, so the browser's autoplay rules always hold. Hiding the page or leaving
// the midway stops it; the choice is not remembered.
function setUpSound(): () => void {
  const button = app.querySelector<HTMLButtonElement>('.sound-toggle')!;
  const slider = app.querySelector<HTMLInputElement>('.sound-volume input')!;
  const sound = createSoundscape(
    () => {
      const AudioContextClass =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      return AudioContextClass ? (new AudioContextClass() as unknown as SoundContext) : undefined;
    },
    () => show(),
  );
  const show = () => {
    const { label, pressed } = soundToggleState(sound.isPlaying());
    button.textContent = label;
    button.setAttribute('aria-pressed', String(pressed));
  };
  button.addEventListener('click', () => {
    if (sound.isPlaying()) sound.stop();
    else if (!sound.start()) button.disabled = true;
    show();
  });
  slider.addEventListener('input', () => sound.setVolume(Number(slider.value)));
  const onVisibility = () => {
    if (document.hidden) {
      sound.stop();
      show();
    }
  };
  document.addEventListener('visibilitychange', onVisibility);
  show();
  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    sound.dispose();
  };
}

// Zoom the map in and out by modest steps, or back to the fitted size. Only
// these buttons zoom: the wheel and pinch are left to the page. The zoom lasts
// while the midway is open and starts fitted each time it opens.
function setUpViewControls(setViewScale: (scale: number) => void) {
  const out = app.querySelector<HTMLButtonElement>('.view-out')!;
  const reset = app.querySelector<HTMLButtonElement>('.view-reset')!;
  const zoomInButton = app.querySelector<HTMLButtonElement>('.view-in')!;
  let scale = DEFAULT_VIEW_SCALE;
  const apply = (next: number) => {
    scale = next;
    setViewScale(scale);
    out.disabled = !canZoomOut(scale);
    zoomInButton.disabled = !canZoomIn(scale);
    reset.disabled = scale === DEFAULT_VIEW_SCALE;
  };
  out.addEventListener('click', () => apply(zoomOut(scale)));
  zoomInButton.addEventListener('click', () => apply(zoomIn(scale)));
  reset.addEventListener('click', () => apply(DEFAULT_VIEW_SCALE));
  apply(DEFAULT_VIEW_SCALE);
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

  // The contents: one link per section. A link scrolls its section into view
  // inside the guide's one scroll area and focuses its heading; each section's
  // "Contents" button brings focus back to the link the player came from.
  const contents = drawer.querySelector('.guide-contents ul')!;
  for (const section of GUIDE_SECTIONS) {
    const item = document.createElement('li');
    const link = document.createElement('button');
    link.type = 'button';
    link.id = guideContentsLinkId(section.id);
    link.textContent = section.label;
    link.setAttribute('aria-controls', guideSectionHeadingId(section.id));
    link.addEventListener('click', () => {
      show(jumpToSection(state, section.id));
      const target = drawer.querySelector<HTMLElement>(`[data-guide-section="${section.id}"]`)!;
      if (target instanceof HTMLDetailsElement) target.open = true;
      document.getElementById(guideSectionHeadingId(section.id))?.focus({ preventScroll: true });
      target.scrollIntoView({ block: 'start' });
    });
    item.append(link);
    contents.append(item);
  }
  for (const back of drawer.querySelectorAll<HTMLButtonElement>('.guide-back')) {
    back.addEventListener('click', () => {
      const result = returnToContents(state);
      show(result.state);
      const link = document.getElementById(result.focusId);
      link?.focus({ preventScroll: true });
      drawer.scrollTo({ top: 0 });
    });
  }
  return onEscapeKey(window, () => {
    const result = escapeGuide(state, drawer.contains(document.activeElement));
    if (!result.handled) return;
    show(result.state);
    if (result.restoreFocus) toggle.focus();
  });
}

// The controls help starts closed. Escape closes it before anything else sees
// the key, and focus goes back to its button when it was inside the panel.
// "Back to the map" closes it and focuses the map, so the keys walk again.
function setUpHelp(onTour: () => void): () => void {
  const toggle = app.querySelector<HTMLButtonElement>('.help-toggle')!;
  const panel = app.querySelector<HTMLElement>('.midway-help-panel')!;
  const map = app.querySelector<HTMLCanvasElement>('.midway-map')!;
  const list = panel.querySelector('dl')!;
  for (const control of HELP_CONTROLS) {
    const keys = document.createElement('dt');
    for (const key of control.keys) {
      const kbd = document.createElement('kbd');
      kbd.textContent = key;
      keys.append(kbd, ' ');
    }
    const action = document.createElement('dd');
    action.textContent = control.action;
    list.append(keys, action);
  }

  let state = CLOSED_HELP;
  const show = (next: HelpState) => {
    state = next;
    panel.hidden = !state.open;
    toggle.setAttribute('aria-expanded', String(state.open));
    toggle.setAttribute('aria-label', helpToggleLabel(state));
  };
  show(state);
  toggle.addEventListener('click', () => show(toggleHelp(state)));
  panel.querySelector('.help-to-map')!.addEventListener('click', () => {
    show(CLOSED_HELP);
    map.focus();
  });
  panel.querySelector('.help-tour')!.addEventListener('click', () => {
    show(CLOSED_HELP);
    onTour();
  });

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    const result = escapeHelp(state, panel.contains(document.activeElement));
    if (!result.handled) return;
    // One Escape closes one panel: the guide waits for the next press.
    event.stopImmediatePropagation();
    show(result.state);
    if (result.restoreFocus) toggle.focus();
  };
  window.addEventListener('keydown', onKeyDown, true);
  return () => window.removeEventListener('keydown', onKeyDown, true);
}

// The welcome tour never opens by itself. The small Start tour button shows
// until the visitor finishes or skips the tour once, and Help can always start
// it again. Opening it focuses the step's heading; Skip, Done or Escape close
// it, remember it, and focus the map so the keys walk again. It never takes
// the walking keys: only Escape, and only while the tour is open.
function setUpTour(): { start: () => void; stop: () => void } {
  const panel = app.querySelector<HTMLElement>('.welcome-tour')!;
  const startButton = app.querySelector<HTMLButtonElement>('.tour-start')!;
  const map = app.querySelector<HTMLCanvasElement>('.midway-map')!;
  const title = panel.querySelector<HTMLElement>('h2')!;
  const back = panel.querySelector<HTMLButtonElement>('.tour-back')!;
  const next = panel.querySelector<HTMLButtonElement>('.tour-next')!;

  let state = CLOSED_TOUR;
  const show = (value: TourState) => {
    state = value;
    panel.hidden = !state.open;
    startButton.hidden = state.open || tourMemory.dismissed();
    startButton.setAttribute('aria-expanded', String(state.open));
    if (!state.open) return;
    const step = TOUR_STEPS[state.step];
    panel.querySelector('.step')!.textContent = stepLabel(state);
    title.textContent = step.title;
    panel.querySelector('.text')!.textContent = step.text;
    back.disabled = state.step === 0;
    next.textContent = isLastStep(state) ? 'Done' : 'Next';
  };
  const finish = () => {
    tourMemory.dismiss();
    show(CLOSED_TOUR);
    map.focus();
  };
  const start = () => {
    show(startTour());
    title.focus();
  };
  show(state);

  startButton.addEventListener('click', start);
  back.addEventListener('click', () => {
    show(previousStep(state));
    title.focus();
  });
  next.addEventListener('click', () => {
    if (isLastStep(state)) return finish();
    show(nextStep(state));
    title.focus();
  });
  panel.querySelector('.tour-skip')!.addEventListener('click', finish);
  // Keys on the tour's buttons stay there: Space or Enter never walks or plays.
  panel.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') event.stopPropagation();
  });

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !state.open) return;
    // One Escape closes one panel: Help and the guide wait for the next press.
    event.stopImmediatePropagation();
    finish();
  };
  window.addEventListener('keydown', onKeyDown, true);
  return { start, stop: () => window.removeEventListener('keydown', onKeyDown, true) };
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

function renderParty() {
  document.body.dataset.view = 'party';
  let party = partyStore.read();
  let saveFailed = false;
  /** A turn's score that is in this page but not yet saved in the browser. */
  let unsaved: { name: string; score: number } | undefined;
  /** Said once on the next party page, e.g. the score a turn just got. */
  let notice = '';

  const saved = () => {
    saveFailed = false;
    unsaved = undefined;
  };
  /** Shows or hides the save warning on the page now, not on the next render. */
  const showWarning = () => {
    const box = app.querySelector<HTMLElement>('.party-save-error');
    if (!box) return;
    box.hidden = !saveFailed;
    box.querySelector('.party-save-text')!.textContent = saveFailed ? saveWarning(unsaved) : '';
  };
  const save = (next: Party) => {
    party = next;
    if (partyStore.save(next)) saved();
    else saveFailed = true;
    showWarning();
  };
  const leave = () => {
    stop?.();
    stop = undefined;
  };

  function shell(body: string) {
    leave();
    app.innerHTML = `
      <section class="circuit party" aria-labelledby="party-title">
        <div class="game-header">
          <a href="#/">← Back to the midway</a>
          <h1 id="party-title" tabindex="-1">Two-Player Party</h1>
        </div>
        ${body}
        <div class="circuit-error party-save-error" hidden>
          <p class="party-save-text" role="alert"></p>
          <div class="circuit-actions"><button type="button" class="circuit-start party-retry">Try saving again</button></div>
        </div>
        <p class="note">Party scores stay with the party: they never change single-player bests, the Hall of Records or the Carnival Circuit. The party and its nicknames are kept in this browser only.</p>
      </section>`;
    showWarning();
    app.querySelector('.party-retry')!.addEventListener('click', () => {
      if (party) save(party);
    });
  }

  function showSetup() {
    shell(`
      <p class="circuit-intro">Two players, one device, three booths: Ring Toss, High Striker, then Skee Ball. Take turns, one full round each, passing the device between turns. There is no timer between turns.</p>
      <form class="party-setup">
        <fieldset>
          <legend>How do you want to play?</legend>
          <label><input type="radio" name="mode" value="competitive" checked /> Head to head: the higher total wins</label>
          <label><input type="radio" name="mode" value="cooperative" /> Together: reach ${COOPERATIVE_GOAL} points combined</label>
        </fieldset>
        <label>Player 1 nickname (optional) <input name="p1" maxlength="${NICKNAME_MAX}" autocomplete="off" placeholder="${DEFAULT_NAMES[0]}" /></label>
        <label>Player 2 nickname (optional) <input name="p2" maxlength="${NICKNAME_MAX}" autocomplete="off" placeholder="${DEFAULT_NAMES[1]}" /></label>
        <div class="circuit-actions"><button type="submit" class="circuit-start">Start party</button></div>
      </form>`);
    const form = app.querySelector<HTMLFormElement>('.party-setup')!;
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const mode: PartyMode = data.get('mode') === 'cooperative' ? 'cooperative' : 'competitive';
      save(
        newParty(mode, [String(data.get('p1') ?? ''), String(data.get('p2') ?? '')], makePartyId),
      );
      showParty();
    });
    app.querySelector<HTMLElement>('h1')!.focus();
    stop = onEscapeKey(window, () => (location.hash = '#/'));
  }

  function showParty() {
    if (!party) return showSetup();
    const current = party;
    const summary = summarize(current, registry.all());
    const interrupted = current.playing;
    shell(`
      <p class="circuit-status" role="status"></p>
      <p class="party-notice" role="status" hidden></p>
      <div class="party-handoff" hidden>
        <p class="party-pass"></p>
        <div class="circuit-actions"><button type="button" class="circuit-start party-play"></button></div>
      </div>
      <ol class="circuit-legs"></ol>
      <p class="party-totals"></p>
      <div class="circuit-actions">
        <button type="button" class="circuit-start party-new" hidden>New party</button>
        <button type="button" class="circuit-start party-erase">Erase nicknames</button>
        <button type="button" class="circuit-start party-quit">Quit party</button>
      </div>
      <div class="party-confirm" role="alertdialog" aria-labelledby="party-confirm-text" hidden>
        <p id="party-confirm-text">Quit this party? Its scores and nicknames are forgotten. Single-player scores are not touched.</p>
        <div class="circuit-actions">
          <button type="button" class="circuit-start party-confirm-yes">Yes, quit</button>
          <button type="button" class="circuit-start party-confirm-no">Keep playing</button>
        </div>
      </div>`);
    app.querySelector('.circuit-status')!.textContent = partyStatus(current, summary);

    const noticeBox = app.querySelector<HTMLElement>('.party-notice')!;
    if (interrupted) {
      // Said once: the turn is then simply the next one to play.
      notice = `${playerName(current, interrupted.player)}'s turn at ${summary.legs[interrupted.leg].name} was interrupted and did not count. Play it again from the start.`;
      save(leaveTurn(current));
    }
    noticeBox.textContent = notice;
    noticeBox.hidden = notice === '';
    notice = '';

    const next = summary.next;
    const handoff = app.querySelector<HTMLElement>('.party-handoff')!;
    const play = app.querySelector<HTMLButtonElement>('.party-play')!;
    if (next) {
      const name = playerName(current, next.player);
      const leg = summary.legs[next.leg];
      handoff.hidden = false;
      app.querySelector('.party-pass')!.textContent =
        `${name}, it's your turn at ${leg.name}. Take the device, then start when you're ready.`;
      play.textContent = `Start ${name}'s turn`;
      play.addEventListener('click', () => {
        play.disabled = true;
        // Start after this key press has finished, so the Enter or Space that
        // pressed the button never reaches the game as its first input.
        setTimeout(() => {
          if (play.isConnected) playParty(next);
        });
      });
    }

    const list = app.querySelector('.circuit-legs')!;
    for (const leg of summary.legs) {
      const item = document.createElement('li');
      const done = leg.winner !== undefined;
      item.classList.toggle('complete', done);
      item.classList.toggle('current', summary.legs[next?.leg ?? -1] === leg);
      item.innerHTML = `
        <span class="badge" aria-hidden="true">${done ? '✓' : ''}</span>
        <div class="details"><h2></h2><p class="score"></p></div>`;
      item.querySelector('h2')!.textContent = leg.name;
      item.querySelector('.score')!.textContent = legComparison(current, leg);
      list.append(item);
    }
    app.querySelector('.party-totals')!.textContent =
      current.mode === 'cooperative'
        ? `Together: ${summary.combined} of ${COOPERATIVE_GOAL}.`
        : `Totals: ${playerName(current, 0)} ${summary.totals[0]} · ${playerName(current, 1)} ${summary.totals[1]}.`;

    const newButton = app.querySelector<HTMLButtonElement>('.party-new')!;
    newButton.hidden = !summary.finished;
    /** Forgets the saved party, or says plainly that it is still saved. */
    const forget = (action: 'quit' | 'new') => {
      if (partyStore.clear()) {
        party = undefined;
        saved();
        showSetup();
      } else {
        notice = forgetNotice(action, false);
        showParty();
      }
    };
    newButton.addEventListener('click', () => forget('new'));
    app.querySelector('.party-erase')!.addEventListener('click', () => {
      const result = eraseSavedNicknames(partyStore, current);
      party = result.party;
      if (result.erased) saved();
      notice = forgetNotice('erase', result.erased);
      showParty();
    });
    const confirm = app.querySelector<HTMLElement>('.party-confirm')!;
    const quit = app.querySelector<HTMLButtonElement>('.party-quit')!;
    quit.hidden = summary.finished;
    quit.addEventListener('click', () => {
      confirm.hidden = false;
      app.querySelector<HTMLButtonElement>('.party-confirm-no')!.focus();
    });
    app.querySelector('.party-confirm-no')!.addEventListener('click', () => {
      confirm.hidden = true;
      quit.focus();
    });
    app.querySelector('.party-confirm-yes')!.addEventListener('click', () => forget('quit'));

    if (next) play.focus();
    else app.querySelector<HTMLElement>('h1')!.focus();
    stop = onEscapeKey(window, () => {
      if (!confirm.hidden) {
        confirm.hidden = true;
        quit.focus();
      } else {
        location.hash = '#/';
      }
    });
  }

  function playParty(turn: Turn) {
    const game = registry.get(PARTY_GAME_IDS[turn.leg]);
    if (!party || !game) return;
    const partyId = party.id;
    save(startTurn(party, turn));
    const name = playerName(party, turn.player);
    shell(`
      <p class="circuit-status party-turn" role="status"></p>
      <div class="circuit-actions">
        <button type="button" class="circuit-start party-done" hidden>Back to the party</button>
        <button type="button" class="circuit-start party-leave">Leave turn (it won't count)</button>
      </div>
      <canvas></canvas>`);
    app.querySelector('h1')!.textContent = `Two-Player Party: ${game.name}`;
    const status = app.querySelector('.party-turn')!;
    status.textContent = `${name}'s turn. Play one full round; the first finished round counts.`;
    const done = app.querySelector<HTMLButtonElement>('.party-done')!;
    const leaveButton = app.querySelector<HTMLButtonElement>('.party-leave')!;
    let scored = false;

    // Space and Enter on Leave turn, Back to the party or Try saving again work
    // those buttons, and never reach a game listening on the window.
    const unguard = guardControlKeys(app);
    const stopTurn = playTurn(game, app.querySelector('canvas')!, beginScopedRound, (score) => {
      if (!party) return;
      unsaved = { name, score };
      save(recordTurn(party, partyId, turn, score));
      scored = true;
      notice = `${name} scored ${score} at ${game.name}.`;
      status.textContent = `${name} scored ${score}! Press Back to the party to pass the device.`;
      done.hidden = false;
      leaveButton.hidden = true;
      done.focus();
    });
    const back = () => {
      // Stop the game, and close its scope, before anything else is drawn.
      stopTurn();
      if (!scored && party) save(leaveTurn(party));
      showParty();
    };
    done.addEventListener('click', back);
    leaveButton.addEventListener('click', back);
    const stopEscape = onEscapeKey(window, back);
    stop = () => {
      stopEscape();
      stopTurn();
      unguard();
    };
  }

  showParty();
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

function renderPostcard() {
  document.body.dataset.view = 'postcard';
  app.innerHTML = `
    <section class="postcard" aria-labelledby="postcard-title">
      <div class="game-header">
        <a href="#/">← Back to the midway</a>
        <h1 id="postcard-title" tabindex="-1">Souvenir Postcard</h1>
      </div>
      <p class="postcard-intro">A card from your visit: the landmarks you found on the discovery trail and the booths stamped in your passport, in the midway's current scene. Add your name if you like, then save it as a picture.</p>
      <div class="postcard-controls">
        <label for="postcard-name">Your name (optional, up to ${POSTCARD_NAME_MAX} characters)</label>
        <input id="postcard-name" type="text" autocomplete="off" />
        <button type="button" class="postcard-download">Download postcard (PNG)</button>
      </div>
      <p class="postcard-status" role="status"></p>
      <canvas class="postcard-preview" aria-hidden="true"></canvas>
      <section class="postcard-text" aria-labelledby="postcard-text-title">
        <h2 id="postcard-text-title">On the card</h2>
        <p class="postcard-heading"></p>
        <p class="postcard-greeting"></p>
        <ul></ul>
        <h3>Stamps and emblems</h3>
        <ul class="postcard-marks"></ul>
      </section>
      <p class="note">The postcard is made in this browser and saved to your device. Nothing is uploaded, and your name is not kept.</p>
    </section>`;

  const landmarks = trailLandmarks(layoutMidway(registry.all().map((game) => game.id)));
  const found = discoveryStore.load();
  const stamps = passportStamps(registry.all());
  const visit = {
    scene: scenePreference.load(),
    landmarksFound: landmarks.filter((landmark) => found.includes(landmark.id)).length,
    landmarksTotal: landmarks.length,
    stampsPlayed: stamps.filter((stamp) => stamp.played).length,
    stampsTotal: stamps.length,
    stamps: stamps.map((stamp) => ({ name: stamp.name, earned: stamp.played })),
    emblems: landmarks.map((landmark) => ({
      name: landmark.name,
      earned: found.includes(landmark.id),
    })),
  };

  const name = app.querySelector<HTMLInputElement>('#postcard-name')!;
  const download = app.querySelector<HTMLButtonElement>('.postcard-download')!;
  const status = app.querySelector<HTMLElement>('.postcard-status')!;
  const canvas = app.querySelector<HTMLCanvasElement>('.postcard-preview')!;
  canvas.width = POSTCARD_SIZE.width * POSTCARD_SCALE;
  canvas.height = POSTCARD_SIZE.height * POSTCARD_SCALE;
  const ctx = canvas.getContext('2d');
  let content = postcardContent(visit);

  // Normalize and bound the field, keeping the caret after the same text.
  // Skipped while an input method is composing, and run when it finishes.
  function limitField() {
    const limited = limitNameInput(name.value);
    if (limited === name.value) return;
    const caret = limitNameInput(
      name.value.slice(0, name.selectionStart ?? name.value.length),
    ).length;
    name.value = limited;
    name.setSelectionRange(Math.min(caret, limited.length), Math.min(caret, limited.length));
  }

  function update(event?: Event) {
    if (!(event instanceof InputEvent && event.isComposing)) limitField();
    content = postcardContent({ ...visit, name: name.value });
    app.querySelector('.postcard-heading')!.textContent = content.heading;
    app.querySelector('.postcard-greeting')!.textContent = content.greeting;
    const list = app.querySelector('.postcard-text ul:not(.postcard-marks)')!;
    list.replaceChildren();
    for (const line of content.lines) {
      const item = document.createElement('li');
      item.textContent = line;
      list.append(item);
    }
    const marks = app.querySelector('.postcard-marks')!;
    marks.replaceChildren();
    for (const mark of content.marks) {
      const item = document.createElement('li');
      item.textContent = mark.label;
      marks.append(item);
    }
    if (ctx) drawPostcard(ctx, content);
  }

  const fail = () => {
    status.textContent = POSTCARD_MESSAGES.failed;
  };
  const exporter = postcardExporter<Blob>({
    encode: (done) => canvas.toBlob(done, 'image/png'),
    createUrl: (blob) => URL.createObjectURL(blob),
    revokeUrl: (url) => URL.revokeObjectURL(url),
    download: (url, filename) => {
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
    },
    report: (message) => {
      status.textContent = message;
    },
  });
  download.addEventListener('click', () => {
    if (!ctx) return fail();
    exporter.export(content.filename);
  });

  name.addEventListener('input', update);
  name.addEventListener('compositionend', () => update());
  update();
  if (!ctx) {
    canvas.hidden = true;
    fail();
  }

  app.querySelector<HTMLElement>('h1')!.focus();
  const stopEscape = onEscapeKey(window, () => (location.hash = '#/'));
  stop = () => {
    stopEscape();
    exporter.dispose();
  };
}

function renderPlush() {
  document.body.dataset.view = 'plush';
  const hasScore = registry.all().some((game) => bestScore(game.id) !== undefined);
  const accessories = availableAccessories(hasScore);
  const label = (value: string) => value.replace('-', ' ');
  const radios = (group: string, values: readonly string[], names?: Record<string, string>) =>
    values
      .map(
        (value) =>
          `<label><input type="radio" name="plush-${group}" value="${value}" /> ${names?.[value] ?? label(value)}</label>`,
      )
      .join('');
  app.innerHTML = `
    <section class="plush" aria-labelledby="plush-title">
      <div class="game-header">
        <a href="#/">← Back to the midway</a>
        <h1 id="plush-title" tabindex="-1">Plush Workshop</h1>
      </div>
      <p class="plush-intro">Stitch your own carnival plush. Pick a body, a face and a colour, then drag parts from the tray onto the plush, or use their buttons. Drag a part off the plush, from the plush itself or from its button, or press its button again, to take the part away.</p>
      <div class="plush-bench">
        <canvas class="plush-preview" aria-hidden="true"></canvas>
        <div class="plush-controls">
          <fieldset><legend>Body</legend>${radios('body', PLUSH_BODIES)}</fieldset>
          <fieldset><legend>Face</legend>${radios('face', PLUSH_FACES)}</fieldset>
          <fieldset><legend>Colour</legend>${radios('color', PLUSH_COLORS, PLUSH_COLOR_NAMES)}</fieldset>
          <fieldset><legend>Parts tray</legend>
            ${accessories
              .map(
                (item) =>
                  `<button type="button" class="plush-part" data-part="${item}" aria-pressed="false">${label(item)}</button>`,
              )
              .join('')}
            ${hasScore ? '' : '<p class="note">Play any booth to unlock a crown.</p>'}
          </fieldset>
          <label for="plush-name">Name (optional, up to ${PLUSH_NAME_MAX} characters)</label>
          <input id="plush-name" type="text" autocomplete="off" />
          <div class="plush-actions">
            <button type="button" class="plush-undo">Undo</button>
            <button type="button" class="plush-reset">Start over</button>
            <button type="button" class="plush-save">Save my plush</button>
          </div>
        </div>
      </div>
      <p class="plush-description" role="status" aria-live="polite"></p>
      <p class="plush-status" role="status"></p>
      <p class="note">Your plush is kept in this browser only, one at a time. Nothing is uploaded or shared.</p>
    </section>
  `;

  let bench = benchFor(plushStore.load() ?? STARTER_PLUSH);
  const canvas = app.querySelector<HTMLCanvasElement>('.plush-preview')!;
  canvas.width = PLUSH_SIZE.width;
  canvas.height = PLUSH_SIZE.height;
  const ctx = canvas.getContext('2d');
  const name = app.querySelector<HTMLInputElement>('#plush-name')!;
  const status = app.querySelector<HTMLElement>('.plush-status')!;
  const undo = app.querySelector<HTMLButtonElement>('.plush-undo')!;
  const reset = app.querySelector<HTMLButtonElement>('.plush-reset')!;
  let confirmReset = false;

  function update() {
    const plush = bench.current;
    for (const [group, value] of [
      ['body', plush.body],
      ['face', plush.face],
      ['color', plush.color],
    ]) {
      for (const input of app.querySelectorAll<HTMLInputElement>(`input[name="plush-${group}"]`)) {
        input.checked = input.value === value;
      }
    }
    for (const part of app.querySelectorAll<HTMLButtonElement>('.plush-part')) {
      const on = plush.accessories.includes(part.dataset.part as PlushAccessory);
      part.setAttribute('aria-pressed', String(on));
      part.textContent = `${on ? 'Remove' : 'Attach'} ${label(part.dataset.part!)}`;
    }
    if (document.activeElement !== name) name.value = plush.name;
    undo.disabled = bench.history.length === 0;
    app.querySelector('.plush-description')!.textContent = describePlush(plush);
    if (ctx) drawPlush(ctx, plush);
  }

  function act(action: PlushAction) {
    bench = benchApply(bench, action);
    confirmReset = false;
    reset.textContent = 'Start over';
    status.textContent = '';
    update();
  }

  for (const group of ['body', 'face', 'color'] as const) {
    for (const input of app.querySelectorAll<HTMLInputElement>(`input[name="plush-${group}"]`)) {
      input.addEventListener('change', () =>
        act({ type: group, [group]: input.value } as PlushAction),
      );
    }
  }

  // A part is attached with its button, or by dragging it onto the plush,
  // where it snaps into place. Dragging a part, from the tray or from the plush itself,
  // and dropping it off the plush removes it.
  let dragging:
    { part: PlushAccessory; startX: number; startY: number; moved: boolean } | undefined;
  const overCanvas = (x: number, y: number) => {
    const box = canvas.getBoundingClientRect();
    return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
  };
  const canvasPoint = (event: PointerEvent) => {
    const box = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - box.left) / box.width) * PLUSH_SIZE.width,
      y: ((event.clientY - box.top) / box.height) * PLUSH_SIZE.height,
    };
  };
  let lifting: { part: PlushAccessory; startX: number; startY: number } | undefined;
  canvas.addEventListener('pointerdown', (event) => {
    const point = canvasPoint(event);
    const item = accessoryAt(bench.current, point.x, point.y);
    if (!item) return;
    lifting = { part: item, startX: event.clientX, startY: event.clientY };
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('plush-drop');
  });
  canvas.addEventListener('pointerup', (event) => {
    const lift = lifting;
    lifting = undefined;
    canvas.classList.remove('plush-drop');
    if (!lift || overCanvas(event.clientX, event.clientY)) return;
    act({ type: 'remove', accessory: lift.part });
  });
  canvas.addEventListener('pointercancel', () => {
    lifting = undefined;
    canvas.classList.remove('plush-drop');
  });
  for (const part of app.querySelectorAll<HTMLButtonElement>('.plush-part')) {
    const item = part.dataset.part as PlushAccessory;
    part.addEventListener('pointerdown', (event) => {
      dragging = { part: item, startX: event.clientX, startY: event.clientY, moved: false };
      part.setPointerCapture(event.pointerId);
    });
    part.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      if (Math.hypot(event.clientX - dragging.startX, event.clientY - dragging.startY) > 8) {
        dragging.moved = true;
        canvas.classList.toggle('plush-drop', overCanvas(event.clientX, event.clientY));
      }
    });
    part.addEventListener('pointerup', (event) => {
      const drag = dragging;
      dragging = undefined;
      canvas.classList.remove('plush-drop');
      if (!drag?.moved) return;
      part.dataset.dragged = 'true';
      act({
        type: overCanvas(event.clientX, event.clientY) ? 'attach' : 'remove',
        accessory: item,
      });
    });
    part.addEventListener('pointercancel', () => {
      dragging = undefined;
      canvas.classList.remove('plush-drop');
    });
    part.addEventListener('click', () => {
      if (part.dataset.dragged) {
        delete part.dataset.dragged;
        return;
      }
      const on = bench.current.accessories.includes(item);
      act({ type: on ? 'remove' : 'attach', accessory: item });
    });
  }

  // The limit counts characters as cleanPlushName does, not the UTF-16 units maxlength counts.
  name.addEventListener('input', () => {
    const chars = Array.from(name.value);
    if (chars.length > PLUSH_NAME_MAX) name.value = chars.slice(0, PLUSH_NAME_MAX).join('');
    act({ type: 'name', name: name.value });
  });
  name.addEventListener('blur', update);
  undo.addEventListener('click', () => {
    bench = benchUndo(bench);
    status.textContent = '';
    update();
  });
  // Starting over asks once more, so a stray press does not lose the plush.
  reset.addEventListener('click', () => {
    if (!confirmReset) {
      confirmReset = true;
      reset.textContent = 'Press again to start over';
      return;
    }
    confirmReset = false;
    reset.textContent = 'Start over';
    bench = benchReset(bench);
    status.textContent = 'Started over. Undo brings your plush back.';
    update();
  });
  app.querySelector('.plush-save')!.addEventListener('click', () => {
    status.textContent = plushStore.save(bench.current)
      ? 'Saved in this browser. It replaces any plush you saved before.'
      : 'This browser would not save your plush.';
  });

  update();
  if (!ctx) canvas.hidden = true;
  app.querySelector<HTMLElement>('h1')!.focus();
  const stopEscape = onEscapeKey(window, () => (location.hash = '#/'));
  stop = () => {
    stopEscape();
  };
}

function renderTune() {
  document.body.dataset.view = 'tune';
  app.innerHTML = `
    <section class="tune" aria-labelledby="tune-title">
      <div class="game-header">
        <a href="#/">← Back to the midway</a>
        <h1 id="tune-title" tabindex="-1">Carousel Tune Workshop</h1>
      </div>
      <p class="tune-intro">Compose a carousel tune. Each row is an instrument and each square a step: press a square, or Tab to it and press Space, to turn it on. Play loops your tune from the first step. Sound is off until you turn it on, and the lit column shows the beat either way.</p>
      <div class="tune-controls">
        <button type="button" class="tune-play" aria-pressed="false">▶ Play</button>
        <button type="button" class="tune-sound" aria-pressed="false">🔇 Tune sound: off</button>
        <label>Steps <select class="tune-length">${TUNE_LENGTHS.map((n) => `<option value="${n}">${n}</option>`).join('')}</select></label>
        <label>Tempo <select class="tune-tempo">${TUNE_TEMPOS.map((n) => `<option value="${n}">${n} bpm</option>`).join('')}</select></label>
        <button type="button" class="tune-starter">Starter tune</button>
        <button type="button" class="tune-clear">Clear</button>
        <button type="button" class="tune-save">Save my tune</button>
      </div>
      <div class="tune-grid" role="group" aria-label="Steps"></div>
      <p class="tune-now" aria-live="off"></p>
      <p class="tune-status" role="status"></p>
      <p class="note">Every sound is made in your browser. The midway's own sound setting is left as it is. Your tune is kept in this browser only, one at a time.</p>
    </section>
  `;

  let tune: Tune = tuneStore.load() ?? STARTER_TUNE;
  let playhead: number | undefined;
  let quiet = false;
  const grid = app.querySelector<HTMLElement>('.tune-grid')!;
  const now = app.querySelector<HTMLElement>('.tune-now')!;
  const status = app.querySelector<HTMLElement>('.tune-status')!;
  const playButton = app.querySelector<HTMLButtonElement>('.tune-play')!;
  const soundButton = app.querySelector<HTMLButtonElement>('.tune-sound')!;
  const lengthSelect = app.querySelector<HTMLSelectElement>('.tune-length')!;
  const tempoSelect = app.querySelector<HTMLSelectElement>('.tune-tempo')!;

  const voices = createTuneVoices(() => {
    const AudioContextClass =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    return AudioContextClass ? (new AudioContextClass() as unknown as VoiceContext) : undefined;
  });
  const player = createTunePlayer(
    () => tune,
    (step, tracks) => {
      playhead = step;
      voices.sound(tracks);
      drawPlayhead();
    },
    {
      setInterval: (cb, ms) => window.setInterval(cb, ms),
      clearInterval: (id) => window.clearInterval(id),
    },
  );

  function buildGrid() {
    grid.style.setProperty('--tune-steps', String(tune.length));
    grid.innerHTML = TUNE_TRACKS.map(
      (track) => `
        <span class="tune-track tune-${track}">${TUNE_TRACK_NAMES[track]}</span>
        ${tune.steps[track]
          .map(
            (_, i) =>
              `<button type="button" class="tune-step tune-${track}${i % 4 === 0 ? ' tune-downbeat' : ''}" data-track="${track}" data-step="${i}" aria-label="${TUNE_TRACK_NAMES[track].split(' ')[1]} step ${i + 1}" aria-pressed="false"></button>`,
          )
          .join('')}`,
    ).join('');
    update();
  }

  function update() {
    for (const cell of grid.querySelectorAll<HTMLButtonElement>('.tune-step')) {
      const on = tune.steps[cell.dataset.track as TuneTrack][Number(cell.dataset.step)];
      cell.setAttribute('aria-pressed', String(on));
    }
    lengthSelect.value = String(tune.length);
    tempoSelect.value = String(tune.tempo);
    drawPlayhead();
  }

  // Quiet mode keeps a lit column, but turns off its glow transition.
  function drawPlayhead() {
    grid.classList.toggle('tune-quiet', quiet);
    for (const cell of grid.querySelectorAll<HTMLButtonElement>('.tune-step')) {
      cell.classList.toggle('tune-current', Number(cell.dataset.step) === playhead);
    }
    now.textContent = playhead === undefined ? 'Stopped.' : describeStep(tune, playhead);
  }

  function edit(next: Tune) {
    const rebuild = next.length !== tune.length;
    tune = next;
    status.textContent = '';
    if (playhead !== undefined && playhead >= tune.length) playhead = undefined;
    if (rebuild) buildGrid();
    else update();
  }

  function stopPlaying() {
    player.stop();
    playhead = undefined;
    playButton.textContent = '▶ Play';
    playButton.setAttribute('aria-pressed', 'false');
    drawPlayhead();
  }

  function soundOff() {
    voices.silence();
    soundButton.textContent = '🔇 Tune sound: off';
    soundButton.setAttribute('aria-pressed', 'false');
  }

  grid.addEventListener('click', (event) => {
    const cell = (event.target as HTMLElement).closest<HTMLButtonElement>('.tune-step');
    if (!cell) return;
    edit(toggleStep(tune, cell.dataset.track as TuneTrack, Number(cell.dataset.step)));
  });
  playButton.addEventListener('click', () => {
    if (player.isPlaying()) {
      stopPlaying();
      return;
    }
    player.play();
    playButton.textContent = '⏸ Pause';
    playButton.setAttribute('aria-pressed', 'true');
  });
  soundButton.addEventListener('click', () => {
    if (voices.enabled()) {
      soundOff();
      return;
    }
    if (!voices.enable(soundOff)) {
      soundButton.disabled = true;
      soundButton.textContent = 'Sound is not available in this browser';
      return;
    }
    soundButton.textContent = '🔊 Tune sound: on';
    soundButton.setAttribute('aria-pressed', 'true');
  });
  lengthSelect.addEventListener('change', () =>
    edit(setLength(tune, Number(lengthSelect.value) as TuneLength)),
  );
  tempoSelect.addEventListener('change', () =>
    edit(setTempo(tune, Number(tempoSelect.value) as TuneTempo)),
  );
  app.querySelector('.tune-starter')!.addEventListener('click', () => edit(STARTER_TUNE));
  app.querySelector('.tune-clear')!.addEventListener('click', () => {
    edit(clearTune(tune));
    status.textContent = 'Cleared. Starter tune brings back a pattern.';
  });
  app.querySelector('.tune-save')!.addEventListener('click', () => {
    status.textContent = tuneStore.save(tune)
      ? 'Saved in this browser. It replaces any tune you saved before.'
      : 'This browser would not save your tune.';
  });

  // Hiding the page stops the music and the sound; both wait for a click to return.
  const onVisibility = () => {
    if (document.hidden) {
      stopPlaying();
      soundOff();
    }
  };
  document.addEventListener('visibilitychange', onVisibility);
  const stopWatching = watchReducedMotion(window, (systemReduces) => {
    quiet = isQuiet(motionPreference.load(), systemReduces);
    drawPlayhead();
  });

  buildGrid();
  app.querySelector<HTMLElement>('h1')!.focus();
  const stopEscape = onEscapeKey(window, () => (location.hash = '#/'));
  stop = () => {
    stopEscape();
    stopWatching();
    document.removeEventListener('visibilitychange', onVisibility);
    player.stop();
    voices.dispose();
  };
}

function renderBalloon() {
  document.body.dataset.view = 'balloon';
  app.innerHTML = `
    <section class="balloon" aria-labelledby="balloon-title">
      <div class="game-header">
        <a href="#/">← Back to the midway</a>
        <h1 id="balloon-title" tabindex="-1">Wish Balloon</h1>
      </div>
      <p>Pick a colour, write a short wish and let the balloon go.</p>
      <form class="balloon-form">
        <fieldset><legend>Colour</legend>${BALLOON_COLORS.map(
          (color, i) =>
            `<label><input type="radio" name="balloon-color" value="${color}" ${i === 0 ? 'checked' : ''} /> ${BALLOON_COLOR_NAMES[color]}</label>`,
        ).join('')}</fieldset>
        <label for="balloon-wish">Your wish (up to ${WISH_MAX} characters)</label>
        <input id="balloon-wish" type="text" autocomplete="off" />
        <button type="submit">Release the balloon</button>
      </form>
      <canvas class="balloon-scene" aria-hidden="true"></canvas>
      <p class="balloon-status" role="status" aria-live="polite"></p>
      <h2>Keepsakes</h2>
      <ul class="balloon-keepsakes"></ul>
      <p class="note">Your wishes stay in this browser only. Nothing is uploaded, shared or counted. Escape leaves without releasing.</p>
    </section>
  `;

  const form = app.querySelector<HTMLFormElement>('.balloon-form')!;
  const wish = app.querySelector<HTMLInputElement>('#balloon-wish')!;
  const status = app.querySelector<HTMLElement>('.balloon-status')!;
  const keepsakesList = app.querySelector<HTMLUListElement>('.balloon-keepsakes')!;
  const canvas = app.querySelector<HTMLCanvasElement>('.balloon-scene')!;
  canvas.width = BALLOON_SCENE.width;
  canvas.height = BALLOON_SCENE.height;
  const ctx = canvas.getContext('2d');
  let keepsakes = keepsakeStore.load();
  let frame = 0;
  let quiet = false;

  // Keepsakes are added with textContent, so a wish is never read as HTML.
  function showKeepsakes() {
    keepsakesList.replaceChildren(
      ...keepsakes.map((balloon) => {
        const item = document.createElement('li');
        item.textContent = `${BALLOON_COLOR_NAMES[balloon.color]}: ${balloon.wish}`;
        return item;
      }),
    );
    if (keepsakes.length === 0) {
      const item = document.createElement('li');
      item.textContent = 'No balloons yet.';
      keepsakesList.append(item);
    }
  }

  function release(balloon: WishBalloon) {
    cancelAnimationFrame(frame);
    if (!ctx) return;
    if (quiet) {
      drawBalloonScene(ctx, balloon, RESTING_POSITION);
      return;
    }
    const started = performance.now();
    const step = (now: number) => {
      const t = (now - started) / RELEASE_MS;
      drawBalloonScene(ctx, balloon, balloonPosition(t));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  }

  wish.addEventListener('input', () => {
    const chars = Array.from(wish.value);
    if (chars.length > WISH_MAX) wish.value = chars.slice(0, WISH_MAX).join('');
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const color = form.querySelector<HTMLInputElement>(
      'input[name="balloon-color"]:checked',
    )?.value;
    const balloon = makeBalloon(color ?? '', wish.value);
    if (!balloon) {
      status.textContent = 'Write a wish first.';
      return;
    }
    keepsakes = addKeepsake(keepsakes, balloon);
    const saved = keepsakeStore.save(keepsakes);
    wish.value = '';
    showKeepsakes();
    release(balloon);
    status.textContent = `${quiet ? 'Your balloon rests above the stall' : 'Your balloon floats away'}: ${balloon.wish}.${saved ? '' : ' This browser would not keep it.'}`;
  });

  const stopWatching = watchReducedMotion(window, (systemReduces) => {
    quiet = isQuiet(motionPreference.load(), systemReduces);
  });
  if (ctx) drawBalloonScene(ctx, undefined, RESTING_POSITION);
  else canvas.hidden = true;
  showKeepsakes();
  app.querySelector<HTMLElement>('h1')!.focus();
  const stopEscape = onEscapeKey(window, () => (location.hash = '#/'));
  stop = () => {
    stopEscape();
    stopWatching();
    cancelAnimationFrame(frame);
  };
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

function renderFair() {
  document.body.dataset.view = 'fair';
  app.innerHTML = `
    <section class="fair" aria-labelledby="fair-title">
      <div class="game-header">
        <a href="#/">← Back to the midway</a>
        <h1 id="fair-title" tabindex="-1">Run Your Own Fair</h1>
      </div>
      <div class="fair-body"></div>
      <p class="note">Your plaza is kept in this browser only. Resetting it never touches scores or other progress.</p>
    </section>`;
  const stopFair = startFair(app.querySelector<HTMLElement>('.fair-body')!, browserFairStorage());
  backFromFair = true;
  app.querySelector<HTMLElement>('h1')!.focus();
  const stopEscape = onEscapeKey(window, () => (location.hash = '#/'));
  stop = () => {
    stopEscape();
    stopFair();
  };
}

function renderParade() {
  document.body.dataset.view = 'parade';
  app.innerHTML = `
    <section class="fair" aria-labelledby="parade-title">
      <div class="game-header">
        <a href="#/">← Back to the midway</a>
        <h1 id="parade-title" tabindex="-1">Parade Composer</h1>
      </div>
      <div class="fair-body"></div>
      <p class="note">Your parade is kept in this browser only. It never changes scores or other progress.</p>
    </section>`;
  const stamped = new Set(
    registry
      .all()
      .filter((game) => bestScore(game.id) !== undefined)
      .map((game) => game.id),
  );
  const stopParade = startParade(
    app.querySelector<HTMLElement>('.fair-body')!,
    browserFairStorage(),
    stamped,
  );
  app.querySelector<HTMLElement>('h1')!.focus();
  const stopEscape = onEscapeKey(window, () => (location.hash = '#/'));
  stop = () => {
    stopEscape();
    stopParade();
  };
}

const expeditionStore = createExpeditionStore(
  (() => {
    try {
      return window.localStorage;
    } catch {
      return undefined;
    }
  })(),
);

const CELL = 52;

function drawExpedition(ctx: CanvasRenderingContext2D, state: Expedition, showMap: boolean) {
  const { colors } = theme;
  const { maze } = state;
  const open = openPassages(maze, state.flipped);
  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, MAZE_W * CELL, MAZE_H * CELL);
  const seen = (c: number) => showMap || c === state.at || state.visited.includes(c);
  ctx.font = canvasFont('body');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let c = 0; c < MAZE_W * MAZE_H; c++) {
    if (!seen(c)) continue;
    const [x, y] = xy(c);
    ctx.fillStyle = colors.surface;
    ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
    const landmark = maze.landmarks.find((l) => l.cell === c);
    const label =
      c === maze.exit
        ? '🚪'
        : c === maze.mirror
          ? state.flipped
            ? '⬆️'
            : '➡️'
          : landmark
            ? ['🤡', '⛲', '🔭'][maze.landmarks.indexOf(landmark)]
            : '';
    if (label) ctx.fillText(label, x * CELL + CELL / 2, y * CELL + CELL / 2);
  }
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  for (let c = 0; c < MAZE_W * MAZE_H; c++) {
    if (!seen(c)) continue;
    const [x, y] = xy(c);
    const walls: [number | undefined, number, number, number, number][] = [
      [y > 0 ? c - MAZE_W : undefined, x, y, x + 1, y],
      [y < MAZE_H - 1 ? c + MAZE_W : undefined, x, y + 1, x + 1, y + 1],
      [x > 0 ? c - 1 : undefined, x, y, x, y + 1],
      [x < MAZE_W - 1 ? c + 1 : undefined, x + 1, y, x + 1, y + 1],
    ];
    for (const [n, x1, y1, x2, y2] of walls) {
      const key = n === undefined ? '' : edgeKey(c, n);
      if (n !== undefined && open.has(key)) continue;
      const switchable = key !== '' && (key === maze.gate || key === maze.shortcut);
      ctx.strokeStyle = switchable ? colors.accent : colors.water;
      ctx.beginPath();
      ctx.moveTo(x1 * CELL, y1 * CELL);
      ctx.lineTo(x2 * CELL, y2 * CELL);
      ctx.stroke();
    }
  }
  const [px, py] = xy(state.at);
  ctx.fillStyle = colors.accent;
  ctx.beginPath();
  ctx.arc(px * CELL + CELL / 2, py * CELL + CELL / 2, CELL / 5, 0, Math.PI * 2);
  ctx.fill();
}

function renderExpedition() {
  document.body.dataset.view = 'expedition';
  app.innerHTML = `
    <section class="expedition" aria-labelledby="expedition-title">
      <a class="back" href="#/">← Back to the midway</a>
      <h1 id="expedition-title" tabindex="-1">Mirror Maze Expedition</h1>
      <p>An untimed walk through a mirror maze. Find the clown 🤡, the fountain ⛲ and the telescope 🔭, then reach the exit 🚪. Stand on the mirror (an arrow) and turn it to swap which gold wall is open. Arrow keys or WASD walk, M turns the mirror, U undoes the last turn, H gives a hint.</p>
      <canvas class="expedition-maze" role="img" aria-label="The mirror maze"></canvas>
      <div class="expedition-pad">
        <button type="button" data-dir="up" aria-label="Walk up">↑</button>
        <button type="button" data-dir="left" aria-label="Walk left">←</button>
        <button type="button" data-dir="down" aria-label="Walk down">↓</button>
        <button type="button" data-dir="right" aria-label="Walk right">→</button>
      </div>
      <div class="expedition-actions">
        <button type="button" class="expedition-turn">Turn mirror</button>
        <button type="button" class="expedition-undo">Undo last turn</button>
        <button type="button" class="expedition-hint">Hint</button>
        <label><input type="checkbox" class="expedition-map" /> Show whole map</label>
        <button type="button" class="expedition-restart">Restart this seed</button>
        <button type="button" class="expedition-new">New expedition</button>
      </div>
      <p class="expedition-status" role="status" aria-live="polite"></p>
      <p class="note">Expedition progress is kept in this browser only, apart from the arcade scores.</p>
    </section>
  `;
  const saved = expeditionStore.load();
  let state = saved.current
    ? resumeExpedition(saved.current)
    : startExpedition(Date.now() % 100000);
  let message = '';
  const finishedHere = new Set<number>();
  const canvas = app.querySelector<HTMLCanvasElement>('.expedition-maze')!;
  canvas.width = MAZE_W * CELL;
  canvas.height = MAZE_H * CELL;
  const ctx = canvas.getContext('2d');
  const mapBox = app.querySelector<HTMLInputElement>('.expedition-map')!;
  const status = app.querySelector<HTMLElement>('.expedition-status')!;
  const undo = app.querySelector<HTMLButtonElement>('.expedition-undo')!;
  const turn = app.querySelector<HTMLButtonElement>('.expedition-turn')!;

  const update = (next: Expedition, note = '') => {
    const wasFinished = state.finished;
    state = next;
    message = note;
    if (state.finished) finishedHere.add(state.maze.seed);
    const kept = expeditionStore.save(state, finishedHere);
    if (state.finished && !wasFinished)
      message = `Expedition ${state.maze.seed} complete! All three landmarks found.`;
    if (!kept)
      message += ` Progress could not be saved in this browser, so it lasts only until you leave this page. It will try again on your next move.`;
    if (ctx) drawExpedition(ctx, state, mapBox.checked);
    turn.disabled = state.at !== state.maze.mirror || state.finished;
    undo.disabled = state.history.length === 0 || state.finished;
    const done = new Set([...expeditionStore.load().completed, ...finishedHere]).size;
    status.textContent = `Seed ${state.maze.seed}. Landmarks ${state.found.length} of 3${state.found.length ? `: ${state.found.join(', ')}` : ''}. Mirror faces ${state.flipped ? 'north' : 'east'}. Expeditions finished here: ${done}. ${message}`;
  };
  const walk = (dir: Dir) => {
    const next = move(state, dir);
    update(next, next === state ? 'A mirror wall blocks that way.' : '');
  };
  const doTurn = () => {
    const next = turnMirror(state);
    update(
      next,
      next === state
        ? 'Stand on the mirror to turn it.'
        : 'The mirror turns: a gold wall opens and another closes.',
    );
  };
  const doUndo = () =>
    update(undoTurn(state), 'Back at the mirror, as it was before the last turn.');
  const doHint = () => {
    const h = hint(state);
    update(
      state,
      h.type === 'step'
        ? `Hint: go ${h.dir}.`
        : h.type === 'turn'
          ? 'Hint: turn the mirror.'
          : 'You are done!',
    );
  };
  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-dir]')) {
    button.addEventListener('click', () => walk(button.dataset.dir as Dir));
  }
  turn.addEventListener('click', doTurn);
  undo.addEventListener('click', doUndo);
  app.querySelector('.expedition-hint')!.addEventListener('click', doHint);
  mapBox.addEventListener('change', () => update(state, message));
  app
    .querySelector('.expedition-restart')!
    .addEventListener('click', () => update(startExpedition(state.maze.seed), 'Restarted.'));
  app
    .querySelector('.expedition-new')!
    .addEventListener('click', () => update(startExpedition(Date.now() % 100000), 'A new maze.'));
  const keys: Record<string, Dir> = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
    w: 'up',
    s: 'down',
    a: 'left',
    d: 'right',
  };
  const onKey = (event: KeyboardEvent) => {
    if (
      event.target instanceof HTMLInputElement ||
      (event.target instanceof HTMLButtonElement && event.key === ' ')
    )
      return;
    const dir = keys[event.key];
    if (dir) {
      event.preventDefault();
      walk(dir);
    } else if (event.key === 'm') doTurn();
    else if (event.key === 'u') doUndo();
    else if (event.key === 'h') doHint();
  };
  window.addEventListener('keydown', onKey);
  update(state);
  app.querySelector<HTMLElement>('h1')!.focus();
  const stopEscape = onEscapeKey(window, () => (location.hash = '#/'));
  stop = () => {
    stopEscape();
    window.removeEventListener('keydown', onKey);
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
  else if (location.hash === '#/party') renderParty();
  else if (location.hash === '#/records') renderRecords();
  else if (location.hash === '#/booths') renderBooths();
  else if (location.hash === '#/postcard') renderPostcard();
  else if (location.hash === '#/plush') renderPlush();
  else if (location.hash === '#/tune') renderTune();
  else if (location.hash === '#/balloon') renderBalloon();
  else if (location.hash === '#/fair') renderFair();
  else if (location.hash === '#/parade') renderParade();
  else if (location.hash === '#/expedition') renderExpedition();
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
