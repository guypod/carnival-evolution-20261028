import { describe, expect, it } from 'vitest';
import {
  HIDDEN_LOCATE,
  isLocateKey,
  isLocateShown,
  LOCATE_SECONDS,
  locateMessage,
  showLocate,
  tickLocate,
  watchLocateEscape,
} from './locate';
import { createWalker, followPath, layoutMidway, pathToBooth } from './world';

function press(target: EventTarget, key: string) {
  const event = Object.assign(new Event('keydown'), { key });
  target.dispatchEvent(event);
}

describe('locate marker', () => {
  it('starts hidden, shows on request and goes after a few seconds without blinking', () => {
    expect(isLocateShown(HIDDEN_LOCATE)).toBe(false);
    let state = showLocate();
    const seen: boolean[] = [];
    for (let t = 0; t < LOCATE_SECONDS + 1; t += 0.25) {
      seen.push(isLocateShown(state));
      state = tickLocate(state, 0.25);
    }
    // Up, then gone: one change, never back on by itself.
    const changes = seen.filter((v, i) => i > 0 && v !== seen[i - 1]).length;
    expect(seen[0]).toBe(true);
    expect(changes).toBe(1);
    expect(state).toBe(HIDDEN_LOCATE);
  });

  it('restarts the time when asked again', () => {
    const later = tickLocate(showLocate(), LOCATE_SECONDS - 0.5);
    expect(later.left).toBeCloseTo(0.5);
    expect(showLocate().left).toBe(LOCATE_SECONDS);
  });

  it('answers a plain L only', () => {
    expect(isLocateKey({ code: 'KeyL' })).toBe(true);
    expect(isLocateKey({ code: 'KeyL', ctrlKey: true })).toBe(false);
    expect(isLocateKey({ code: 'KeyL', metaKey: true })).toBe(false);
    expect(isLocateKey({ code: 'KeyK' })).toBe(false);
  });

  it('names the nearest booth in the status line', () => {
    const map = layoutMidway(['water-cannon']);
    const booth = map.booths.find((b) => b.gameId === 'water-cannon')!;
    const beside = { x: booth.x + booth.w / 2, y: booth.y + booth.h + 0.5 };
    const message = locateMessage(map, beside, new Map([['water-cannon', 'Water Cannon']]));
    expect(message).toContain('You are here');
    expect(message).toContain('Water Cannon');
    expect(message).toContain('Escape');
  });

  it('leaves the player, their walk and destination alone', () => {
    const map = layoutMidway(['water-cannon']);
    const player = createWalker(map.spawn);
    player.path = pathToBooth(map, player, map.booths[0])!;
    followPath(player, 0.2);
    const before = JSON.stringify(player);
    locateMessage(map, player, new Map());
    tickLocate(showLocate(), 1);
    expect(JSON.stringify(player)).toBe(before);
  });
});

describe('locate Escape', () => {
  it('hides the marker and keeps Escape from panels only while it shows', () => {
    const target = new EventTarget();
    let shown = true;
    let panelSaw = 0;
    const stop = watchLocateEscape(target, () => {
      const was = shown;
      shown = false;
      return was;
    });
    target.addEventListener('keydown', () => panelSaw++);
    press(target, 'Escape');
    expect(shown).toBe(false);
    expect(panelSaw).toBe(0);
    press(target, 'Escape');
    expect(panelSaw).toBe(1);
    press(target, 'l');
    expect(panelSaw).toBe(2);
    stop();
    shown = true;
    press(target, 'Escape');
    expect(shown).toBe(true);
  });
});
