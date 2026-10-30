import './style.css';
import {
  applyTheme,
  browserSaveStorage,
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
import { startWorkshop } from './workshop/view';
import { createRepairsStore, midwayToys } from './workshop/workshop';
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
import { CARNIVAL_COLLECTOR, collectorText, pavilionCollection, shelfText } from './prize-pavilion';
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
  dealPocket,
  dismissPocket,
  findDestination,
  markPocketVisit,
  pocketStatus,
  swapPocket,
  type PocketCard,
} from './pocket-itinerary';
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
import {
  connectLanterns,
  createLightGarden,
  describeDesign,
  editAt,
  lightGardenStore,
  resetGarden,
  saveNote,
  undo as undoGarden,
  type LanternColor,
  type LightGardenDesign,
} from './midway/light-garden';
import type { FerryRequest } from './midway/ferry';
import { startMidway } from './midway/midway';
import type { LandmarkDetail } from './midway/render';
import {
  createSoundscape,
  DEFAULT_SOUNDSCAPE_VOLUME,
  soundToggleState,
  type SoundContext,
} from './midway/soundscape';
import { STONE_MARKS, STONE_NAMES } from './midway/stepping-stones';
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
import { watchLocateEscape } from './midway/locate';
import { layoutMidway, type BoothSlot } from './midway/world';
import { boothPrompt } from './booth-prompt';
import { KEYS_HELP, coasterStore, startCoasterWorkshop } from './coaster-workshop';
import {
  EMBLEMS,
  NAME_MAX,
  PALETTES,
  defaultPlacard,
  draftPlacard,
  paletteFor,
  placardStatus,
  placardStore,
} from './coaster-placard';
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
  BASES,
  CHOICE_NAMES,
  PRESENTATIONS,
  SNACK_SCENE,
  TOPPINGS,
  VISITORS,
  drawSnackScene,
  nextVisitor,
  pickChoice,
  react,
  type Snack,
} from './snack-stand';
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
  BACKDROPS,
  BACKDROP_NAMES,
  EMPTY_ROOM,
  ROOM_SIZE,
  ROOM_SLOTS,
  describeLook,
  describeRoom,
  describeSlot,
  drawRoom,
  editorApply,
  editorFor,
  editorReset,
  editorUndo,
  neighbourSlot,
  placementOf,
  reconcileRoom,
  roomObjects,
  roomStore,
  slotAt,
  type Direction,
  type RoomAction,
} from './prize-room';
import {
  DESK_SCENE,
  MAX_WINDS,
  RESTING_TOY,
  applyToy,
  describeToy,
  drawDesk,
  pickToy,
  toyPosition,
  walkDuration,
  type ToyAction,
} from './desk-toy';
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
import { watersideMaxHeight, watersideOverflows } from './waterside-layout';
import { PHOTO_FRAMES, createCaptureGuard, frameRect, photoFilename } from './photo-mode';

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
      <div class="photo-frame-outline" aria-hidden="true" hidden></div>
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
          <button type="button" class="photo-toggle" aria-expanded="false" aria-controls="photo-mode">📷 Photo</button>
        </div>
        <div class="midway-view" role="group" aria-label="Map view">
          <button type="button" class="view-out" aria-label="Zoom the map out">−</button>
          <button type="button" class="view-reset" aria-label="Reset the map view">Reset view</button>
          <button type="button" class="view-in" aria-label="Zoom the map in">+</button>
          <button type="button" class="view-locate" aria-keyshortcuts="L">Find me (L)</button>
        </div>
        <p class="locate-status" role="status" aria-live="polite"></p>
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
        <section class="photo-mode" id="photo-mode" aria-labelledby="photo-mode-title" hidden>
          <h2 id="photo-mode-title">Photo mode</h2>
          <p>Frame the midway as it looks right now. Walk or zoom to compose, then take the photo. It stays in this browser.</p>
          <fieldset class="photo-frames">
            <legend>Frame</legend>
            ${PHOTO_FRAMES.map(
              (frame, i) =>
                `<label><input type="radio" name="photo-frame" value="${frame.id}"${i === 0 ? ' checked' : ''} /> ${frame.label}</label>`,
            ).join('')}
          </fieldset>
          <div class="photo-actions">
            <button type="button" class="photo-take">Take photo (P)</button>
            <button type="button" class="photo-download" disabled>Download PNG</button>
            <button type="button" class="photo-exit">Exit photo mode (Esc)</button>
          </div>
          <p class="photo-status" role="status"></p>
          <img class="photo-preview" alt="" hidden />
        </section>
        <div class="light-garden-editing" role="status" hidden>
          <span>Editing the light garden. Click a cell on the patch by the entrance.</span>
          <button type="button" class="light-garden-done">Done editing</button>
        </div>
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
            <a class="snack-link" href="#/snack">🍦 Snack Stand</a>
            <a class="coaster-link" href="#/coaster">🎢 Coaster Workshop</a>
            <a class="fair-link" href="#/fair">🛠️ Run Your Own Fair</a>
            <a class="fair-link" href="#/parade">🎉 Parade Composer</a>
            <a class="expedition-link" href="#/expedition">🪞 Mirror Maze Expedition</a>
            <a class="workshop-link" href="#/workshop">🔧 Backstage Repair Workshop</a>
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
            <div class="pocket-card" aria-labelledby="pocket-title">
              <h3 id="pocket-title">🃏 Surprise my visit</h3>
              <button type="button" class="pocket-deal">Deal a pocket card</button>
              <div class="pocket-body" hidden>
                <p>One booth and one place to wander, whenever you like:</p>
                <ul>
                  <li><a class="pocket-booth" href="#/"></a></li>
                  <li><a class="pocket-destination" href="#/"></a></li>
                </ul>
                <p class="pocket-status" role="status"></p>
                <button type="button" class="pocket-swap">Swap suggestion</button>
                <button type="button" class="pocket-dismiss">Dismiss card</button>
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
            <details class="light-garden">
              <summary>🏮 Light garden</summary>
              <p class="note">Hang up to 8 lanterns and 6 garlands on the patch just inside the entrance, right of the path. They light the map in lantern evening.</p>
              <button type="button" class="light-garden-edit" aria-pressed="false">Edit on the map</button>
              <p class="note">While editing, a click on the patch hangs a lantern on an empty cell or picks a lantern. Picking a second lantern strings a garland to it. Clicks on the map never walk or open anything until you press Done or Escape.</p>
              <form class="light-garden-place">
                <label>Column (1 to 4) <input name="col" type="number" min="1" max="4" value="1" required /></label>
                <label>Row (1 to 3) <input name="row" type="number" min="1" max="3" value="1" required /></label>
                <label>Colour <select name="color"><option value="warm">Warm</option><option value="cool">Cool</option></select></label>
                <button type="submit">Pick this cell</button>
              </form>
              <form class="light-garden-connect">
                <label>From lantern <input name="a" type="number" min="1" value="1" required /></label>
                <label>to lantern <input name="b" type="number" min="1" value="2" required /></label>
                <button type="submit">String garland</button>
              </form>
              <button type="button" class="light-garden-undo">Undo</button>
              <button type="button" class="light-garden-reset">Reset to starter</button>
              <p class="light-garden-summary" aria-live="polite"></p>
            </details>
            <button type="button" class="motion-toggle" aria-pressed="false" aria-describedby="motion-note"></button>
            <p class="note" id="motion-note">Off follows your system's reduced-motion setting. On holds the scenery still. Walking and games are never slowed.</p>
            <button type="button" class="sound-toggle" aria-pressed="false" aria-describedby="sound-note"></button>
            <label class="sound-volume">Volume <input type="range" min="0" max="1" step="0.05" value="${DEFAULT_SOUNDSCAPE_VOLUME}" /></label>
            <p class="note" id="sound-note">A soft hum made in your browser, and soft notes from the chime stones by the water. Starts off, stops when you leave the midway or hide the page. Nothing on the map depends on it.</p>
  <button type="button" class="guide-back" aria-label="Back to the guide contents">↑ Contents</button>
          </section>
        </div>
      </div>
      <p class="discovery-toast" role="status" hidden></p>
      <div class="midway-bottom">
        <div class="midway-route" hidden>
          <p class="message" role="status"></p>
          <button type="button" class="cancel" hidden>Cancel walk</button>
        </div>
        <div class="midway-waterside">
          <div class="midway-homeward" role="group" aria-label="Way back" hidden>
            <p class="message" role="status" aria-live="polite"></p>
            <button type="button" class="return">Return to midway</button>
          </div>
          <div class="midway-stones" role="group" aria-label="Chime stones" hidden>
            <p class="message" role="status" aria-live="polite"></p>
            <div class="actions">
              <button type="button" class="stones-call">Play call</button>
            </div>
            <p class="note">Notes ring only with Midway sound on in Settings.</p>
          </div>
          <div class="midway-ferry" role="group" aria-label="Ferry" hidden>
            <p class="message" role="status" aria-live="polite"></p>
            <div class="actions"></div>
          </div>
        </div>
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

  const sound = setUpSound();
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
    onLocate: (message) => (locateStatus.textContent = message ?? ''),
    onFerry: (message, requests) => ferryPanel.show(message, requests),
    onHomeward: (message) => homewardPanel.show(message),
    onStones: (status) => stonesPanel.show(status),
    onChime: (tones, spacing, replace) => sound.chime(tones, spacing, replace),
    repairedToys: midwayToys(createRepairsStore(browserSaveStorage()).load()),
  });
  const ferryPanel = setUpFerry((request) => midway.ferry(request));
  const homewardPanel = setUpHomeward(() => midway.returnToMidway());
  const stonesPanel = setUpStones(midway.stones);
  const locateStatus = app.querySelector<HTMLElement>('.locate-status')!;
  // Escape hides the locate ring first, while it shows; then panels get the key.
  // Capture listeners on window run in the order they were added, so this one
  // goes before the story card, light garden and photo mode add theirs.
  const stopLocateEscape = watchLocateEscape(window, midway.hideLocate);
  const routeStatus = setUpRoute(midway.cancelWalk);
  const discovery = setUpDiscovery(midway.landmarks, midway.walkToLandmark);
  const mystery = setUpMystery(midway.landmarks, midway.setLandmarkDetail);
  setUpVisit(midway.walkTo, midway.walkToLandmark);
  setUpPocket();
  setUpSceneToggle(midway.setScene);
  const stopLightGarden = setUpLightGarden(midway.setLightGarden, midway.editLightGarden);
  const stopPhoto = setUpPhotoMode();
  const stopWatersideFit = setUpWatersideFit();
  setUpMotionToggle(midway.setMotion);
  setUpViewControls(midway.setViewScale);
  app.querySelector('.view-locate')!.addEventListener('click', midway.locate);
  const stopSound = sound.stop;
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
    stopLocateEscape();
    stopSound();
    tour.stop();
    routeStatus.stop();
    discovery.stop();
    mystery.stop();
    stopHelp();
    stopGuide();
    stopLightGarden();
    stopPhoto();
    stopWatersideFit();
    midway.stop();
  };
}

// Photo mode: hides the midway's panels on purpose, outlines a frame on the
// live map and copies that part of the canvas into a preview. Walking and
// zooming still work, so the photo is the real scene. Nothing is uploaded, no
// camera is asked for, and scores and saves are untouched. Esc or Exit brings
// the panels back and focus returns to the map.
function setUpPhotoMode() {
  const map = app.querySelector<HTMLCanvasElement>('.midway-map')!;
  const toggle = app.querySelector<HTMLButtonElement>('.photo-toggle')!;
  const panel = app.querySelector<HTMLElement>('.photo-mode')!;
  const outline = app.querySelector<HTMLElement>('.photo-frame-outline')!;
  const take = panel.querySelector<HTMLButtonElement>('.photo-take')!;
  const download = panel.querySelector<HTMLButtonElement>('.photo-download')!;
  const status = panel.querySelector<HTMLElement>('.photo-status')!;
  const preview = panel.querySelector<HTMLImageElement>('.photo-preview')!;
  let open = false;
  let session = 0;
  const capture = createCaptureGuard();
  let photoUrl: string | undefined;
  let photoName = '';

  const frameId = () =>
    panel.querySelector<HTMLInputElement>('input[name="photo-frame"]:checked')?.value ?? 'full';
  const placeOutline = () => {
    const rect = frameRect(frameId(), map.clientWidth, map.clientHeight);
    outline.style.left = `${map.offsetLeft + rect.x}px`;
    outline.style.top = `${map.offsetTop + rect.y}px`;
    outline.style.width = `${rect.width}px`;
    outline.style.height = `${rect.height}px`;
  };
  const clearPhoto = () => {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoUrl = undefined;
    preview.hidden = true;
    preview.removeAttribute('src');
    download.disabled = true;
  };
  const setOpen = (next: boolean) => {
    open = next;
    session += 1;
    // An encode from an earlier session still counts as pending, so exiting
    // and reopening cannot start a second one alongside it.
    take.disabled = capture.pending;
    toggle.setAttribute('aria-expanded', String(open));
    panel.hidden = !open;
    outline.hidden = !open;
    if (open) {
      // Finish any light garden editing first, so hidden editing cannot
      // change the saved garden or catch the Esc meant for photo mode.
      const gardenBanner = app.querySelector<HTMLElement>('.light-garden-editing');
      if (gardenBanner && !gardenBanner.hidden) {
        gardenBanner.querySelector<HTMLButtonElement>('.light-garden-done')?.click();
      }
      document.body.dataset.photo = 'on';
      placeOutline();
      status.textContent = 'Photo mode is on. The other panels are hidden until you exit.';
      take.focus();
    } else {
      delete document.body.dataset.photo;
      status.textContent = '';
      clearPhoto();
      map.focus();
    }
  };
  const snap = () => {
    if (capture.pending) return;
    // The canvas is drawn at device pixels; the frame is worked out in them too.
    const rect = frameRect(frameId(), map.width, map.height);
    const shot = document.createElement('canvas');
    shot.width = rect.width;
    shot.height = rect.height;
    const ctx = shot.getContext('2d');
    if (!ctx) {
      status.textContent = 'This browser could not make the photo.';
      return;
    }
    ctx.drawImage(map, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
    const name = photoFilename(frameId(), new Date());
    const owner = session;
    capture.start();
    take.disabled = true;
    shot.toBlob((blob) => {
      const current = capture.finish(owner, session, open);
      take.disabled = false;
      if (!current) return;
      if (!blob) {
        status.textContent = 'This browser could not make the photo.';
        return;
      }
      clearPhoto();
      photoUrl = URL.createObjectURL(blob);
      photoName = name;
      preview.src = photoUrl;
      preview.alt = 'Your photo of the midway';
      preview.hidden = false;
      download.disabled = false;
      status.textContent = 'Photo taken. Download it, take another, or exit.';
    }, 'image/png');
  };

  toggle.addEventListener('click', () => setOpen(!open));
  take.addEventListener('click', snap);
  panel.querySelector('.photo-exit')!.addEventListener('click', () => setOpen(false));
  panel.querySelector('.photo-frames')!.addEventListener('change', placeOutline);
  download.addEventListener('click', () => {
    if (!photoUrl) return;
    const link = document.createElement('a');
    link.href = photoUrl;
    link.download = photoName;
    link.click();
    status.textContent = `Download started as ${photoName}.`;
  });
  // Esc leaves photo mode before the guide or any panel sees the key; P takes
  // a photo unless the key is meant for a field.
  const onKeyDown = (event: KeyboardEvent) => {
    if (!open) return;
    if (event.key === 'Escape') {
      event.stopImmediatePropagation();
      setOpen(false);
    } else if (
      (event.key === 'p' || event.key === 'P') &&
      !(event.target instanceof HTMLInputElement && event.target.type === 'text')
    ) {
      event.preventDefault();
      snap();
    }
  };
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('resize', placeOutline);
  return () => {
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('resize', placeOutline);
    open = false;
    session += 1;
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    delete document.body.dataset.photo;
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

const FERRY_BUTTONS: Record<FerryRequest, string> = {
  use: 'Use the ferry',
  board: 'Board the ferry',
  depart: 'Cast off',
  call: 'Call the ferry',
  skip: 'Skip to the dock',
  'turn-back': 'Turn back',
  'step-off': 'Step off',
};

// The ferry's line and buttons, by the waterside docks. Every button does what
// a key or click on the map does, so the ride never needs the pointer or the
// keys alone. Focus goes back to the map, so walking works straight after.
function setUpFerry(request: (request: FerryRequest) => void) {
  const box = app.querySelector<HTMLElement>('.midway-ferry')!;
  const message = box.querySelector<HTMLElement>('.message')!;
  const actions = box.querySelector<HTMLElement>('.actions')!;
  return {
    show(text: string, requests: FerryRequest[]) {
      message.textContent = text;
      box.hidden = text === '' && requests.length === 0;
      const hadFocus = actions.contains(document.activeElement);
      actions.replaceChildren(
        ...requests.map((r) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = FERRY_BUTTONS[r];
          button.addEventListener('click', () => {
            app.querySelector<HTMLElement>('.midway-map')?.focus();
            request(r);
          });
          return button;
        }),
      );
      // A button that went away must not drop focus to the page.
      if (hadFocus) app.querySelector<HTMLElement>('.midway-map')?.focus();
    },
  };
}

// The way back from the waterside: where the player is and a Return to midway
// button that starts the walk back. The route line says when it starts,
// arrives, is cancelled or can't be found. It shows only in the waterside.
function setUpHomeward(back: () => boolean) {
  const box = app.querySelector<HTMLElement>('.midway-homeward')!;
  const message = box.querySelector<HTMLElement>('.message')!;
  box.querySelector('.return')!.addEventListener('click', () => {
    app.querySelector<HTMLElement>('.midway-map')?.focus();
    back();
  });
  return {
    show(text: string) {
      const hadFocus = box.contains(document.activeElement);
      box.hidden = text === '';
      message.textContent = text;
      // A panel that went away must not drop focus to the page.
      if (hadFocus && box.hidden) app.querySelector<HTMLElement>('.midway-map')?.focus();
    },
  };
}

// Keeps the waterside stack under the top controls: its height is measured
// against where the map view buttons end, and anything taller scrolls inside
// the stack, so short or zoomed screens keep Help, Guide, Photo and the map
// view reachable. Focus moving into the stack scrolls the focused button into
// view. On narrow screens the walk line shares the stack.
function setUpWatersideFit() {
  const midway = app.querySelector<HTMLElement>('.midway')!;
  const bottom = app.querySelector<HTMLElement>('.midway-bottom')!;
  const waterside = app.querySelector<HTMLElement>('.midway-waterside')!;
  const view = app.querySelector<HTMLElement>('.midway-view')!;
  const fit = () => {
    const stack = getComputedStyle(bottom).display === 'contents' ? waterside : bottom;
    const other = stack === bottom ? waterside : bottom;
    other.style.maxHeight = '';
    delete other.dataset.overflow;
    const box = midway.getBoundingClientRect();
    const inset = parseFloat(getComputedStyle(stack).bottom) || 0;
    const max = watersideMaxHeight(
      box.height,
      view.getBoundingClientRect().bottom - box.top,
      inset,
    );
    stack.style.maxHeight = `${max}px`;
    if (watersideOverflows(stack.scrollHeight, max)) stack.dataset.overflow = '';
    else delete stack.dataset.overflow;
  };
  const observer = new ResizeObserver(fit);
  [
    midway,
    view,
    ...bottom.querySelectorAll<HTMLElement>('.midway-route, .midway-waterside > *'),
  ].forEach((element) => observer.observe(element));
  window.addEventListener('resize', fit);
  fit();
  return () => {
    observer.disconnect();
    window.removeEventListener('resize', fit);
  };
}

// The chime stones' panel: the call and answer in words, a Play call button
// and a labelled button for each stone, so the stones work without seeing the
// glow or walking onto them. It shows only while the player stands by them.
function setUpStones(press: (input: 'call' | number) => void) {
  const box = app.querySelector<HTMLElement>('.midway-stones')!;
  const message = box.querySelector<HTMLElement>('.message')!;
  const actions = box.querySelector<HTMLElement>('.actions')!;
  box.querySelector('.stones-call')!.addEventListener('click', () => press('call'));
  STONE_NAMES.forEach((name, i) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `${STONE_MARKS[i]} ${name}`;
    button.setAttribute('aria-label', `${name} stone`);
    button.addEventListener('click', () => press(i));
    actions.append(button);
  });
  return {
    show(status: string | undefined) {
      const hadFocus = box.contains(document.activeElement);
      box.hidden = status === undefined;
      message.textContent = status ?? '';
      // A panel that went away must not drop focus to the page.
      if (hadFocus && box.hidden) app.querySelector<HTMLElement>('.midway-map')?.focus();
    },
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

let pocketCard: PocketCard | undefined;

// Surprise my visit: the card is kept in memory only, so it is still there
// when the player comes back to the midway from one of its links.
function setUpPocket() {
  const card = app.querySelector<HTMLElement>('.pocket-card')!;
  const deal = card.querySelector<HTMLButtonElement>('.pocket-deal')!;
  const body = card.querySelector<HTMLElement>('.pocket-body')!;
  const booth = card.querySelector<HTMLAnchorElement>('.pocket-booth')!;
  const place = card.querySelector<HTMLAnchorElement>('.pocket-destination')!;
  const booths = registry.all().map((g) => ({ id: g.id, name: g.name }));

  const render = () => {
    deal.hidden = pocketCard !== undefined;
    body.hidden = pocketCard === undefined;
    if (!pocketCard) return;
    const game = registry.get(pocketCard.gameId)!;
    const destination = findDestination(pocketCard.destination)!;
    booth.href = `#/play/${game.id}`;
    booth.textContent = `${game.name}: ${game.description}`;
    place.href = destination.href;
    place.textContent = `${destination.name}: ${destination.intent}`;
    card.querySelector('.pocket-status')!.textContent = pocketStatus(pocketCard);
  };
  deal.addEventListener('click', () => {
    pocketCard = dealPocket(booths);
    render();
    booth.focus();
  });
  card.querySelector('.pocket-swap')!.addEventListener('click', () => {
    if (pocketCard) pocketCard = swapPocket(pocketCard, booths);
    render();
    booth.focus();
  });
  card.querySelector('.pocket-dismiss')!.addEventListener('click', () => {
    pocketCard = dismissPocket();
    render();
    deal.focus();
  });
  // Plain, Ctrl/Cmd and middle clicks all open the link, so all of them count,
  // and the status updates for a link opened in a new tab.
  const markVisit = (link: HTMLAnchorElement, part: 'booth' | 'destination') => {
    const mark = () => {
      if (pocketCard) pocketCard = markPocketVisit(pocketCard, part);
      render();
    };
    link.addEventListener('click', mark);
    link.addEventListener('auxclick', (event) => {
      if (event.button === 1) mark();
    });
  };
  markVisit(booth, 'booth');
  markVisit(place, 'destination');
  render();
}

// The light garden, from the guide. "Edit on the map" turns clicks on the map
// into picks on the garden's cells until Done or Escape; the column and row
// form makes the same picks from the keyboard. A text summary describes the
// whole design, and the panel says plainly when the browser would not save it.
function setUpLightGarden(
  show: (design: LightGardenDesign, selected?: number) => void,
  edit: (onPick: ((col: number, row: number) => void) | undefined) => void,
): () => void {
  const panel = app.querySelector<HTMLDetailsElement>('.light-garden')!;
  const summary = panel.querySelector<HTMLParagraphElement>('.light-garden-summary')!;
  const toggle = panel.querySelector<HTMLButtonElement>('.light-garden-edit')!;
  const banner = app.querySelector<HTMLElement>('.light-garden-editing')!;
  const place = panel.querySelector<HTMLFormElement>('.light-garden-place')!;
  let garden = createLightGarden(lightGardenStore.load());
  let selected: number | undefined;
  let editing = false;
  const update = (note = '', changed = true) => {
    const saved = changed ? ` ${saveNote(lightGardenStore.save(garden.design))}` : '';
    show(garden.design, selected);
    const chosen = selected === undefined ? '' : ` Lantern ${selected + 1} is picked.`;
    summary.textContent = `${note}${describeDesign(garden.design)}${chosen}${saved}`;
  };
  const notes: Record<string, string> = {
    placed: 'Lantern hung. ',
    'out-of-bounds': 'That spot is outside the garden. ',
    taken: 'A lantern already hangs there. ',
    full: 'That is the most this garden holds: undo or reset to change it. ',
    selected: 'Lantern picked: pick another to string a garland to it. ',
    deselected: 'Lantern let go. ',
    connected: 'Garland strung. ',
    missing: 'There is no lantern with that number. ',
    same: 'Pick two different lanterns. ',
    already: 'Those two are already joined. ',
  };
  const pick = (col: number, row: number) => {
    const color = new FormData(place).get('color') as LanternColor;
    const before = garden;
    const next = editAt(garden, selected, col, row, color);
    garden = next.garden;
    selected = next.selected;
    update(notes[next.result], garden !== before);
  };
  const setEditing = (next: boolean) => {
    editing = next;
    toggle.setAttribute('aria-pressed', String(editing));
    toggle.textContent = editing ? 'Done editing' : 'Edit on the map';
    banner.hidden = !editing;
    if (!editing) selected = undefined;
    edit(editing ? pick : undefined);
    update(editing ? 'Editing on the map. ' : '', false);
  };
  toggle.addEventListener('click', () => setEditing(!editing));
  banner.querySelector('.light-garden-done')!.addEventListener('click', () => {
    setEditing(false);
    toggle.focus();
  });
  place.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(place);
    pick(Number(data.get('col')) - 1, Number(data.get('row')) - 1);
  });
  const connect = panel.querySelector<HTMLFormElement>('.light-garden-connect')!;
  connect.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(connect);
    const next = connectLanterns(garden, Number(data.get('a')) - 1, Number(data.get('b')) - 1);
    const changed = next.garden !== garden;
    garden = next.garden;
    update(notes[next.result], changed);
  });
  panel.querySelector('.light-garden-undo')!.addEventListener('click', () => {
    const before = garden;
    garden = undoGarden(garden);
    selected = undefined;
    update(garden === before ? 'Nothing to undo. ' : 'Undone. ', garden !== before);
  });
  panel.querySelector('.light-garden-reset')!.addEventListener('click', () => {
    garden = resetGarden(garden);
    selected = undefined;
    update('Back to the starter garden. ');
  });
  // Escape leaves editing first, before the guide or any panel sees the key.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !editing) return;
    event.stopImmediatePropagation();
    setEditing(false);
  };
  window.addEventListener('keydown', onKeyDown, true);
  update('', false);
  return () => {
    window.removeEventListener('keydown', onKeyDown, true);
    edit(undefined);
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

// The opt-in soundscape. It starts off on every visit and only a click starts
// it, so the browser's autoplay rules always hold. Hiding the page or leaving
// the midway stops it; the choice is not remembered.
function setUpSound() {
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
  return {
    chime: sound.chime,
    stop() {
      document.removeEventListener('visibilitychange', onVisibility);
      sound.dispose();
    },
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
      <p><a class="pavilion-link room-link" href="#/room">🪴 Arrange your Prize Room</a></p>
      <p><a class="pavilion-link toy-link" href="#/toy">🦆 Wind up a desk toy</a></p>
      <ul class="pavilion-shelves"></ul>
      <p class="note">Prizes come from your best scores in this browser. Nothing to buy, and nothing is spent.</p>
    </section>`;

  app.querySelector('.pavilion-intro')!.textContent =
    'Win prizes at every booth with your best score. Each booth has its own Bronze, Silver and Gold goals, set by how it scores. A booth with a small top score, like the two endings of the Puppet Theatre, has only the tiers a round can reach. Prizes you already won stay won.';
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
    for (const tier of shelf.tiers) {
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

function renderRoom() {
  document.body.dataset.view = 'room';
  const objects = roomObjects(registry.all());
  const owned = new Set(objects.filter((o) => o.owned).map((o) => o.id));
  app.innerHTML = `
    <section class="room" aria-labelledby="room-title">
      <div class="game-header">
        <a href="#/prizes">← Back to the Prize Pavilion</a>
        <h1 id="room-title" tabindex="-1">Prize Room</h1>
      </div>
      <p class="room-intro">Arrange the prizes you have won, and some starter decor, on two shelves and the floor. Pick an object, then pick a spot. With the room picture focused, arrow keys move the picked object, R turns it and Delete takes it back to your collection.</p>
      <div class="room-bench">
        <div class="room-scene">
          <canvas class="room-canvas" tabindex="0" aria-describedby="room-keys"></canvas>
          <p id="room-keys" class="note">Room picture: arrow keys move, R turns, Delete removes the picked object.</p>
          <div class="room-slots" role="group" aria-label="Spots in the room"></div>
          <p class="room-status" role="status" aria-live="polite"></p>
        </div>
        <div class="room-controls">
          <h2>Your collection</h2>
          <ul class="room-collection"></ul>
          <fieldset><legend>Backdrop</legend>${BACKDROPS.map(
            (b) =>
              `<label><input type="radio" name="room-backdrop" value="${b}" /> ${BACKDROP_NAMES[b]}</label>`,
          ).join('')}</fieldset>
          <div class="room-actions">
            <button type="button" class="room-rotate">Turn</button>
            <button type="button" class="room-remove">Put away</button>
            <button type="button" class="room-undo">Undo</button>
            <button type="button" class="room-reset">Clear the room</button>
          </div>
        </div>
      </div>
      <div class="room-walk">
        <h2>Walk the room</h2>
        <div class="room-actions">
          <button type="button" class="room-walk-prev">← Previous spot</button>
          <button type="button" class="room-walk-next">Next spot →</button>
        </div>
        <p class="room-look" role="status" aria-live="polite"></p>
        <p class="room-summary"></p>
        <ol class="room-inspect"></ol>
      </div>
      <p class="note">Your room is kept in this browser only, apart from your scores. Clearing the room never touches scores or prizes. Nothing to buy.</p>
    </section>`;

  const saved = roomStore.load() ?? EMPTY_ROOM;
  let editor = editorFor(reconcileRoom(saved, owned));
  let selected: string | undefined;
  let visitor = 0;
  // Stays empty until the visitor first walks, then follows every edit.
  let looking = false;
  let confirmReset = false;
  const canvas = app.querySelector<HTMLCanvasElement>('.room-canvas')!;
  canvas.width = ROOM_SIZE.width;
  canvas.height = ROOM_SIZE.height;
  const ctx = canvas.getContext('2d');
  const status = app.querySelector<HTMLElement>('.room-status')!;
  const look = app.querySelector<HTMLElement>('.room-look')!;
  const collection = app.querySelector<HTMLUListElement>('.room-collection')!;
  const slots = app.querySelector<HTMLElement>('.room-slots')!;
  const inspect = app.querySelector<HTMLOListElement>('.room-inspect')!;
  const rotate = app.querySelector<HTMLButtonElement>('.room-rotate')!;
  const remove = app.querySelector<HTMLButtonElement>('.room-remove')!;
  const undo = app.querySelector<HTMLButtonElement>('.room-undo')!;
  const reset = app.querySelector<HTMLButtonElement>('.room-reset')!;
  const nameOf = (id: string) => objects.find((o) => o.id === id)?.name ?? id;

  // Objects and their locks are built once, with textContent.
  for (const object of objects) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.object = object.id;
    button.textContent = object.name;
    const source = document.createElement('span');
    source.className = 'room-source';
    source.textContent = object.owned ? ` ${object.source}` : ` Locked: ${object.howToEarn}`;
    if (!object.owned) {
      button.disabled = true;
      item.classList.add('locked');
    }
    button.addEventListener('click', () => {
      selected = object.id;
      const placed = placementOf(editor.current, object.id);
      status.textContent = placed
        ? `Picked ${object.name}. Choose a spot, or use arrow keys on the room picture.`
        : `Picked ${object.name}. Choose a spot to place it.`;
      update();
    });
    item.append(button, source);
    collection.append(item);
  }

  for (const slot of ROOM_SLOTS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.slot = slot.id;
    button.addEventListener('click', () => chooseSlot(slot.id));
    slots.append(button);
  }

  function chooseSlot(slotId: string) {
    const here = editor.current.placements.find((p) => p.slot === slotId);
    if (!selected) {
      if (here) {
        selected = here.objectId;
        status.textContent = `Picked ${nameOf(here.objectId)}.`;
        update();
      } else status.textContent = 'Pick an object from your collection first.';
      return;
    }
    act({ type: 'place', objectId: selected, slot: slotId });
  }

  function act(action: RoomAction) {
    const next = editorApply(editor, action, owned);
    if (next === editor) {
      if (action.type === 'move') status.textContent = 'That is the edge of the room.';
      return;
    }
    editor = next;
    confirmReset = false;
    reset.textContent = 'Clear the room';
    const place = selected && placementOf(editor.current, selected);
    const where = place && ROOM_SLOTS.find((s) => s.id === place.slot);
    if (action.type === 'backdrop')
      status.textContent = `Backdrop: ${BACKDROP_NAMES[action.backdrop]}.`;
    else if (action.type === 'remove')
      status.textContent = `${nameOf(action.objectId)} is back in your collection.`;
    else if (where) status.textContent = describeSlot(editor.current, objects, where);
    persist();
    update();
  }

  function persist() {
    if (!roomStore.save(editor.current))
      status.textContent += ' This browser would not keep the room.';
  }

  function update() {
    const layout = editor.current;
    const placed = selected ? placementOf(layout, selected) : undefined;
    for (const button of collection.querySelectorAll<HTMLButtonElement>('button')) {
      button.setAttribute('aria-pressed', String(button.dataset.object === selected));
      const inRoom = placementOf(layout, button.dataset.object!);
      button.classList.toggle('in-room', Boolean(inRoom));
    }
    for (const button of slots.querySelectorAll<HTMLButtonElement>('button')) {
      const slot = ROOM_SLOTS.find((s) => s.id === button.dataset.slot)!;
      const here = layout.placements.find((p) => p.slot === slot.id);
      button.textContent = here ? nameOf(here.objectId) : '·';
      button.setAttribute('aria-label', describeSlot(layout, objects, slot));
      button.classList.toggle('picked', Boolean(here && here.objectId === selected));
    }
    for (const input of app.querySelectorAll<HTMLInputElement>('input[name="room-backdrop"]')) {
      input.checked = input.value === layout.backdrop;
    }
    rotate.disabled = !placed;
    remove.disabled = !placed;
    undo.disabled = editor.history.length === 0;
    app.querySelector('.room-summary')!.textContent = describeRoom(layout);
    inspect.replaceChildren(
      ...ROOM_SLOTS.map((slot) => {
        const item = document.createElement('li');
        item.textContent = describeSlot(layout, objects, slot);
        return item;
      }),
    );
    canvas.setAttribute('aria-label', `Prize room picture. ${describeRoom(layout)}`);
    look.textContent = describeLook(layout, objects, ROOM_SLOTS[visitor], looking);
    if (ctx) drawRoom(ctx, layout, objects, { selected, visitorSlot: ROOM_SLOTS[visitor].id });
  }

  function walk(step: number) {
    visitor = (visitor + step + ROOM_SLOTS.length) % ROOM_SLOTS.length;
    looking = true;
    update();
  }

  for (const input of app.querySelectorAll<HTMLInputElement>('input[name="room-backdrop"]')) {
    input.addEventListener('change', () =>
      act({ type: 'backdrop', backdrop: input.value as (typeof BACKDROPS)[number] }),
    );
  }
  rotate.addEventListener('click', () => selected && act({ type: 'rotate', objectId: selected }));
  remove.addEventListener('click', () => selected && act({ type: 'remove', objectId: selected }));
  undo.addEventListener('click', () => {
    editor = editorUndo(editor);
    status.textContent = 'Undone.';
    persist();
    update();
  });
  // Clearing asks once more, so a stray press does not lose the room.
  reset.addEventListener('click', () => {
    if (!confirmReset) {
      confirmReset = true;
      reset.textContent = 'Press again to clear the room';
      return;
    }
    confirmReset = false;
    reset.textContent = 'Clear the room';
    editor = editorReset(editor);
    status.textContent = 'Room cleared. Scores and prizes are untouched. Undo brings it back.';
    persist();
    update();
  });
  app.querySelector('.room-walk-prev')!.addEventListener('click', () => walk(-1));
  app.querySelector('.room-walk-next')!.addEventListener('click', () => walk(1));

  const arrows: Record<string, Direction> = {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowUp: 'up',
    ArrowDown: 'down',
  };
  canvas.addEventListener('keydown', (event) => {
    const direction = arrows[event.key];
    if (direction) {
      event.preventDefault();
      if (selected && placementOf(editor.current, selected)) {
        act({ type: 'move', objectId: selected, direction });
      } else {
        const next = neighbourSlot(ROOM_SLOTS[visitor].id, direction);
        if (next) walk(ROOM_SLOTS.findIndex((s) => s.id === next) - visitor);
      }
    } else if ((event.key === 'r' || event.key === 'R') && selected) {
      act({ type: 'rotate', objectId: selected });
    } else if ((event.key === 'Delete' || event.key === 'Backspace') && selected) {
      event.preventDefault();
      act({ type: 'remove', objectId: selected });
    }
  });
  canvas.addEventListener('click', (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) * ROOM_SIZE.width) / rect.width;
    const y = ((event.clientY - rect.top) * ROOM_SIZE.height) / rect.height;
    const slot = slotAt(x, y);
    if (slot) chooseSlot(slot.id);
  });

  if (!ctx) canvas.hidden = true;
  update();
  app.querySelector<HTMLElement>('h1')!.focus();
  stop = onEscapeKey(window, () => (location.hash = '#/prizes'));
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
      <div class="balloon-stall">
        <canvas class="balloon-scene" aria-hidden="true"></canvas>
        <div class="balloon-counter">
          <p class="balloon-intro">Pick a colour, write a short wish and let the balloon go.</p>
          <form class="balloon-form">
            <fieldset class="balloon-colors"><legend>Colour</legend>${BALLOON_COLORS.map(
              (color, i) =>
                `<label class="balloon-swatch balloon-swatch-${color}"><input type="radio" name="balloon-color" value="${color}" ${i === 0 ? 'checked' : ''} /> ${BALLOON_COLOR_NAMES[color]}</label>`,
            ).join('')}</fieldset>
            <label for="balloon-wish">Your wish (up to ${WISH_MAX} characters)</label>
            <input id="balloon-wish" type="text" autocomplete="off" />
            <button type="submit">Release the balloon</button>
          </form>
          <p class="balloon-status" role="status" aria-live="polite"></p>
        </div>
      </div>
      <div class="balloon-shelf">
        <h2>Keepsakes</h2>
        <ul class="balloon-keepsakes"></ul>
        <p class="note">Your wishes stay in this browser only. Nothing is uploaded, shared or counted. Escape leaves without releasing.</p>
      </div>
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
        item.className = `balloon-tag balloon-tag-${balloon.color}`;
        item.textContent = `${BALLOON_COLOR_NAMES[balloon.color]}: ${balloon.wish}`;
        return item;
      }),
    );
    if (keepsakes.length === 0) {
      const item = document.createElement('li');
      item.className = 'balloon-tag';
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
      if (quiet) {
        drawBalloonScene(ctx, balloon, RESTING_POSITION);
        return;
      }
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

function renderSnack() {
  document.body.dataset.view = 'snack';
  const step = (name: string, legend: string, key: string, choices: readonly string[]) =>
    `<fieldset><legend>${legend} (${key})</legend>${choices
      .map(
        (choice) =>
          `<label><input type="radio" name="snack-${name}" value="${choice}" /> ${CHOICE_NAMES[choice as keyof typeof CHOICE_NAMES]}</label>`,
      )
      .join('')}</fieldset>`;
  app.innerHTML = `
    <section class="snack" aria-labelledby="snack-title">
      <div class="game-header">
        <a href="#/">← Back to the midway</a>
        <h1 id="snack-title" tabindex="-1">Snack Stand</h1>
      </div>
      <p>Build a snack in three steps and serve it. Each visitor says what they would like: see how they react, then try another combination.</p>
      <p class="snack-order" aria-live="polite"></p>
      <form class="snack-form">
        ${step('base', 'Base', 'B', BASES)}
        ${step('topping', 'Topping', 'T', TOPPINGS)}
        ${step('presentation', 'Presentation', 'P', PRESENTATIONS)}
        <div class="snack-actions">
          <button type="submit" class="snack-serve">Serve (Enter)</button>
          <div class="snack-reset-group">
            <button type="button" class="snack-reset">Start over (R)</button>
            <button type="button" class="snack-next">Next visitor (N)</button>
          </div>
        </div>
      </form>
      <canvas class="snack-scene" aria-hidden="true"></canvas>
      <p class="snack-status" role="status" aria-live="polite"></p>
      <p class="note">B, T and P cycle each step; arrow keys move within a step. These snacks are imaginary: nothing is ordered, scored or saved. Escape goes back to the midway.</p>
    </section>
  `;
  const form = app.querySelector<HTMLFormElement>('.snack-form')!;
  const order = app.querySelector<HTMLElement>('.snack-order')!;
  const status = app.querySelector<HTMLElement>('.snack-status')!;
  const canvas = app.querySelector<HTMLCanvasElement>('.snack-scene')!;
  canvas.width = SNACK_SCENE.width;
  canvas.height = SNACK_SCENE.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) canvas.hidden = true;
  let visitor = 0;
  let served: ReturnType<typeof react> | undefined;

  const value = (name: string) =>
    form.querySelector<HTMLInputElement>(`input[name="snack-${name}"]:checked`)?.value;
  function current(): Partial<Snack> {
    return {
      base: pickChoice(BASES, value('base')),
      topping: pickChoice(TOPPINGS, value('topping')),
      presentation: pickChoice(PRESENTATIONS, value('presentation')),
    };
  }
  function draw() {
    order.textContent = `${VISITORS[visitor].name}: “${VISITORS[visitor].order}”`;
    if (ctx) drawSnackScene(ctx, current(), VISITORS[visitor], served?.mood);
  }
  function reset(message: string) {
    form.reset();
    served = undefined;
    status.textContent = message;
    draw();
  }
  function cycle(name: string, choices: readonly string[]) {
    const at = choices.indexOf(value(name) ?? '');
    const next = choices[(at + 1) % choices.length];
    const input = form.querySelector<HTMLInputElement>(
      `input[name="snack-${name}"][value="${next}"]`,
    )!;
    input.checked = true;
    input.focus();
    served = undefined;
    status.textContent = '';
    draw();
  }

  form.addEventListener('change', () => {
    served = undefined;
    status.textContent = '';
    draw();
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const { base, topping, presentation } = current();
    if (!base || !topping || !presentation) {
      status.textContent = 'Pick a base, a topping and a presentation first.';
      return;
    }
    served = react(VISITORS[visitor], { base, topping, presentation });
    status.textContent = served.line;
    draw();
  });
  const resetButton = app.querySelector<HTMLButtonElement>('.snack-reset')!;
  const nextButton = app.querySelector<HTMLButtonElement>('.snack-next')!;
  resetButton.addEventListener('click', () => reset('The counter is clear.'));
  nextButton.addEventListener('click', () => {
    visitor = nextVisitor(visitor);
    reset(`${VISITORS[visitor].name} steps up to the counter.`);
  });
  const onKey = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (target?.tagName === 'INPUT' && (target as HTMLInputElement).type === 'text') return;
    const key = event.key.toLowerCase();
    if (key === 'enter' && (target?.tagName === 'BUTTON' || target?.tagName === 'A')) return;
    if (key === 'enter') form.requestSubmit();
    else if (key === 'b') cycle('base', BASES);
    else if (key === 't') cycle('topping', TOPPINGS);
    else if (key === 'p') cycle('presentation', PRESENTATIONS);
    else if (key === 'r') resetButton.click();
    else if (key === 'n') nextButton.click();
    else return;
    event.preventDefault();
  };
  window.addEventListener('keydown', onKey);
  draw();
  app.querySelector<HTMLElement>('h1')!.focus();
  const stopEscape = onEscapeKey(window, () => (location.hash = '#/'));
  stop = () => {
    stopEscape();
    window.removeEventListener('keydown', onKey);
  };
}

function renderCoaster() {
  document.body.dataset.view = 'coaster';
  app.innerHTML = `
    <section class="coaster" aria-labelledby="coaster-title">
      <div class="game-header">
        <a href="#/">← Back to the midway</a>
        <h1 id="coaster-title" tabindex="-1">Coaster Workshop</h1>
      </div>
      <p>Shape a small side-view coaster track, then test it on a toy model with made-up gravity, drag and a speed limit. It says nothing about real coasters.</p>
      <canvas class="coaster-scene" aria-hidden="true"></canvas>
      <div class="coaster-controls">
        <button type="button" data-action="previous">◀ Point</button>
        <button type="button" data-action="next">Point ▶</button>
        <button type="button" data-action="up">Raise</button>
        <button type="button" data-action="down">Lower</button>
        <button type="button" data-action="test">Test (T)</button>
        <button type="button" data-action="pause">Pause (P)</button>
        <button type="button" data-action="step">Step (S)</button>
        <button type="button" data-action="undo">Undo (U)</button>
        <button type="button" data-action="reset">Reset layout (R)</button>
      </div>
      <p class="coaster-status" role="status" aria-live="polite"></p>
      <section class="coaster-placard" aria-labelledby="placard-title">
        <h2 id="placard-title">Entrance placard</h2>
        <div class="placard-preview" aria-label="Placard preview">
          <span class="placard-emblem" aria-hidden="true"></span>
          <strong class="placard-name"></strong>
          <span class="placard-status"></span>
        </div>
        <form class="placard-form">
          <label>Ride name <input name="name" maxlength="${NAME_MAX}" required /></label>
          <label>Emblem <select name="emblem">${EMBLEMS.map((e) => `<option value="${e}">${e}</option>`).join('')}</select></label>
          <label>Colours <select name="palette">${PALETTES.map((p) => `<option value="${p.id}">${p.label}</option>`).join('')}</select></label>
          <button type="submit">Save placard</button>
        </form>
        <p class="placard-note" role="status" aria-live="polite"></p>
      </section>
      <p class="note">${KEYS_HELP}. Escape stops a test, or goes back to the midway when nothing is running. With Quiet midway or reduced motion, a test shows its result at once with dots every half second. After each test two made-up riders, Gentle Gail and Thrill Theo, say which stretches they liked or disliked from the toy model's speed, slope and height, and suggest one change. Not scored. Your layout is kept in this browser only. Below the track, name your ride and pick an emblem and colours for its entrance placard; the placard is saved in this browser when you press Save placard, and its test line comes from the toy model, not a safety check.</p>
    </section>
  `;
  const canvas = app.querySelector<HTMLCanvasElement>('.coaster-scene')!;
  const status = app.querySelector<HTMLElement>('.coaster-status')!;
  const controls = app.querySelector<HTMLElement>('.coaster-controls')!;
  const session = startCoasterWorkshop(canvas, {
    host: window,
    store: coasterStore,
    preference: () => motionPreference.load(),
    onExit: () => (location.hash = '#/'),
    onStatus: (text, saved) => {
      const next = saved ? text : `${text} This browser would not save your layout.`;
      const toyTest = app.querySelector('.placard-status');
      if (toyTest) toyTest.textContent = placardStatus(coasterStore.load());
      if (status.textContent === next) return;
      status.textContent = next;
    },
  });
  const onClick = (event: Event) => {
    const action = (event.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset
      .action;
    if (action) session.act(action as Parameters<typeof session.act>[0]);
  };
  controls.addEventListener('click', onClick);
  const form = app.querySelector<HTMLFormElement>('.placard-form')!;
  const preview = app.querySelector<HTMLElement>('.placard-preview')!;
  const placardNote = app.querySelector<HTMLElement>('.placard-note')!;
  const showPlacard = () => {
    const placard = placardStore.load() ?? defaultPlacard();
    const palette = paletteFor(placard.palette);
    preview.style.background = `var(--color-${palette.background})`;
    preview.style.color = `var(--color-${palette.text})`;
    preview.querySelector('.placard-emblem')!.textContent = placard.emblem;
    preview.querySelector('.placard-name')!.textContent = placard.name;
    preview.querySelector('.placard-status')!.textContent = placardStatus(coasterStore.load());
    return placard;
  };
  const current = showPlacard();
  (form.elements.namedItem('name') as HTMLInputElement).value = current.name;
  (form.elements.namedItem('emblem') as HTMLSelectElement).value = current.emblem;
  (form.elements.namedItem('palette') as HTMLSelectElement).value = current.palette;
  const onSubmit = (event: Event) => {
    event.preventDefault();
    const data = new FormData(form);
    const placard = draftPlacard(
      String(data.get('name') ?? ''),
      String(data.get('emblem') ?? ''),
      String(data.get('palette') ?? ''),
    );
    if (!placard) placardNote.textContent = 'Give the ride a name first.';
    else if (!placardStore.save(placard))
      placardNote.textContent = 'This browser would not save your placard.';
    else {
      (form.elements.namedItem('name') as HTMLInputElement).value = placard.name;
      showPlacard();
      placardNote.textContent = `Placard saved: ${placard.name}.`;
    }
  };
  // Typing in the placard form must not drive the workshop's letter keys; Escape still stops or exits.
  const onFormKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') event.stopPropagation();
  };
  form.addEventListener('submit', onSubmit);
  form.addEventListener('keydown', onFormKey);
  app.querySelector<HTMLElement>('h1')!.focus();
  stop = () => {
    controls.removeEventListener('click', onClick);
    form.removeEventListener('submit', onSubmit);
    form.removeEventListener('keydown', onFormKey);
    session.stop();
  };
}

function renderToy() {
  document.body.dataset.view = 'toy';
  const { name, demo } = pickToy(roomObjects(registry.all()));
  app.innerHTML = `
    <section class="toy" aria-labelledby="toy-title">
      <div class="game-header">
        <a href="#/prizes">← Back to the Prize Pavilion</a>
        <h1 id="toy-title" tabindex="-1">Wind-up Desk Toy</h1>
      </div>
      <p class="toy-intro"></p>
      <canvas class="toy-scene" aria-hidden="true"></canvas>
      <div class="toy-controls">
        <button type="button" class="toy-wind">Wind the key (W)</button>
        <button type="button" class="toy-release">Let it go (Space)</button>
        <button type="button" class="toy-reset">Reset (R)</button>
      </div>
      <p class="toy-status" role="status" aria-live="polite"></p>
      <p class="note">Up to ${MAX_WINDS} turns of the key. Nothing is scored, saved or earned here. Escape goes back to the Prize Pavilion.</p>
    </section>
  `;
  app.querySelector<HTMLElement>('.toy-intro')!.textContent = demo
    ? `${name}: a starter demonstration. Win a rubber duck prize to wind your own.`
    : `${name}: your prize, ready to wind.`;
  const status = app.querySelector<HTMLElement>('.toy-status')!;
  const windButton = app.querySelector<HTMLButtonElement>('.toy-wind')!;
  const releaseButton = app.querySelector<HTMLButtonElement>('.toy-release')!;
  const resetButton = app.querySelector<HTMLButtonElement>('.toy-reset')!;
  const canvas = app.querySelector<HTMLCanvasElement>('.toy-scene')!;
  canvas.width = DESK_SCENE.width;
  canvas.height = DESK_SCENE.height;
  const ctx = canvas.getContext('2d');
  let toy = RESTING_TOY;
  let frame = 0;
  let timer = 0;
  let quiet = false;

  function show() {
    status.textContent = describeToy(toy, name);
    windButton.disabled = toy.phase === 'walking' || toy.winds >= MAX_WINDS;
    releaseButton.disabled = toy.phase !== 'wound';
    if (ctx && toy.phase !== 'walking') drawDesk(ctx, toyPosition(0, 0), toy.winds, demo);
  }

  // Quiet mode skips the animation: the toy stays staged at rest, the words
  // say it walked, and the walk still takes its time before it is done.
  function walk() {
    const duration = walkDuration(toy);
    const winds = toy.winds;
    const started = performance.now();
    const step = (now: number) => {
      const t = (now - started) / duration;
      // Quiet can switch on mid-walk: stage the toy back at rest straight away.
      if (ctx && quiet) drawDesk(ctx, toyPosition(0, 0), winds, demo);
      else if (ctx) drawDesk(ctx, toyPosition(t, winds), winds * (1 - Math.min(t, 1)), demo);
      if (t < 1) frame = requestAnimationFrame(step);
      else act('finish');
    };
    if (quiet) timer = window.setTimeout(() => act('finish'), duration);
    else frame = requestAnimationFrame(step);
  }

  function act(action: ToyAction) {
    const before = toy;
    toy = applyToy(toy, action);
    if (toy === before) return;
    if (action === 'reset' || action === 'finish') {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    }
    show();
    if (toy.phase === 'walking') walk();
  }

  windButton.addEventListener('click', () => act('wind'));
  releaseButton.addEventListener('click', () => act('release'));
  resetButton.addEventListener('click', () => act('reset'));
  const onKey = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLButtonElement && event.key === ' ') return;
    if (event.key === 'w' || event.key === 'W') act('wind');
    else if (event.key === ' ') {
      event.preventDefault();
      act('release');
    } else if (event.key === 'r' || event.key === 'R') act('reset');
  };
  window.addEventListener('keydown', onKey);
  const stopWatching = watchReducedMotion(window, (systemReduces) => {
    quiet = isQuiet(motionPreference.load(), systemReduces);
  });
  if (!ctx) canvas.hidden = true;
  show();
  app.querySelector<HTMLElement>('h1')!.focus();
  const stopEscape = onEscapeKey(window, () => (location.hash = '#/prizes'));
  stop = () => {
    stopEscape();
    stopWatching();
    window.removeEventListener('keydown', onKey);
    cancelAnimationFrame(frame);
    clearTimeout(timer);
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

function renderWorkshop() {
  document.body.dataset.view = 'workshop';
  app.innerHTML = `
    <section class="fair" aria-labelledby="workshop-title">
      <div class="game-header">
        <a href="#/">← Back to the midway</a>
        <h1 id="workshop-title" tabindex="-1">Backstage Repair Workshop</h1>
      </div>
      <div class="fair-body"></div>
      <p class="note">Mend three wind-up toys by hand. Pick up parts and drop them on a spot, or use the arrow keys to pick and Enter or Space to act. 1, 2 and 3 choose the hand, screwdriver or tweezers; T tests, U undoes, R resets the toy, Escape puts a part down or goes back. A wrong set-up never breaks anything. Untimed and not scored: no score changes here. With Quiet midway or reduced motion, a test shows one still frame.</p>
    </section>`;
  const stopWorkshop = startWorkshop(
    app.querySelector<HTMLElement>('.fair-body')!,
    browserSaveStorage(),
    () => (location.hash = '#/'),
  );
  app.querySelector<HTMLElement>('h1')!.focus();
  stop = stopWorkshop;
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
  else if (location.hash === '#/room') renderRoom();
  else if (location.hash === '#/toy') renderToy();
  else if (location.hash === '#/trail') renderTrail();
  else if (location.hash === '#/circuit') renderCircuit();
  else if (location.hash === '#/party') renderParty();
  else if (location.hash === '#/records') renderRecords();
  else if (location.hash === '#/booths') renderBooths();
  else if (location.hash === '#/postcard') renderPostcard();
  else if (location.hash === '#/plush') renderPlush();
  else if (location.hash === '#/tune') renderTune();
  else if (location.hash === '#/balloon') renderBalloon();
  else if (location.hash === '#/snack') renderSnack();
  else if (location.hash === '#/coaster') renderCoaster();
  else if (location.hash === '#/fair') renderFair();
  else if (location.hash === '#/parade') renderParade();
  else if (location.hash === '#/expedition') renderExpedition();
  else if (location.hash === '#/workshop') renderWorkshop();
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
