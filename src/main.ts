import './style.css';
import { applyTheme, bestScore, type CarnivalGame } from './carnival';
import { registry } from './games';
import { onEscapeKey } from './escape';
import { boothScoresText } from './booth-scores';
import { passportStamps, passportSummary, stampText } from './passport';
import {
  CARNIVAL_COLLECTOR,
  PAVILION_TIERS,
  collectorText,
  pavilionCollection,
  shelfText,
} from './prize-pavilion';
import { progressText, trailMissions, trailRecommendation } from './trail';
import { startMidway } from './midway/midway';
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
      <canvas class="midway-map" aria-label="The carnival midway. Walk up to a booth to play its game."></canvas>
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
        <a class="pavilion-link" href="#/prizes">🏆 Prize Pavilion</a>
        <a class="trail-link" href="#/trail">🧭 Carnival Trail</a>
        <nav class="midway-guide" aria-label="Booths">
          <h2>Booths</h2>
          <ul></ul>
        </nav>
        <details class="midway-passport">
          <summary><h2>Passport</h2> <span class="summary"></span></summary>
          <ul></ul>
          <p class="note">Stamps are kept in this browser only.</p>
        </details>
      </div>
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
  });
  stop = midway.stop;
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
      <p class="trail-intro">Three missions across every booth on the midway.</p>
      <p class="trail-next" role="status"></p>
      <ol class="trail-missions"></ol>
      <p class="note">Progress comes from your best scores in this browser only. Nothing to buy, and nothing is spent.</p>
    </section>`;

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

  const match = location.hash.match(/^#\/play\/([\w-]+)$/);
  const game = match ? registry.get(match[1]) : undefined;
  if (game) renderGame(game);
  else if (location.hash === '#/prizes') renderPrizes();
  else if (location.hash === '#/trail') renderTrail();
  else renderMidway();
}

window.addEventListener('hashchange', route);
route();
