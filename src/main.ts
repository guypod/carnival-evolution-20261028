import './style.css';
import { applyTheme, bestScore, type CarnivalGame } from './carnival';
import { registry } from './games';
import { onEscapeKey } from './escape';
import { boothScoresText } from './booth-scores';
import { passportStamps, passportSummary, stampText } from './passport';
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
  else renderMidway();
}

window.addEventListener('hashchange', route);
route();
