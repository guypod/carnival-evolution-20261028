import { describe, expect, it } from 'vitest';
import {
  CROSSING_SECONDS,
  dockById,
  dockInReach,
  ferryButtons,
  ferryMessage,
  ferryPosition,
  ferrySnapsCamera,
  onFarShore,
  requestFerry,
  sailFerry,
  settleFerry,
  START_FERRY,
  type FerryState,
} from './ferry';
import { canStand, findPath, isBlocked, layoutMidway, strollTiles } from './world';

const map = layoutMidway(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k']);
const promenade = dockById(map, 'promenade');
const farShore = dockById(map, 'far-shore');

/** Sails until the ferry docks, a frame at a time. */
function sailAll(ferry: FerryState, quiet = false) {
  let next = ferry;
  for (let i = 0; i < 1000 && next.phase === 'sailing'; i++) next = sailFerry(next, 1 / 60, quiet);
  return next;
}

describe('the waterside', () => {
  it('can be walked to from the spawn, through the hedge, to the promenade dock', () => {
    const path = findPath(map, map.spawn, promenade.landing);
    expect(path).toBeDefined();
    expect(dockInReach(map, path!.at(-1)!)).toBe(promenade);
  });

  it('keeps the far shore off foot paths: only the ferry reaches it', () => {
    expect(findPath(map, map.spawn, farShore.landing)).toBeUndefined();
    expect(findPath(map, farShore.landing, map.spawn)).toBeUndefined();
  });

  it('gives the far shore room to explore', () => {
    const reachable = [];
    for (let y = 0; y < map.height; y++) {
      for (let x = map.waterside.farShoreX; x < map.width; x++) {
        if (!isBlocked(map, x, y) && findPath(map, farShore.landing, { x, y })) reachable.push(x);
      }
    }
    expect(reachable.length).toBeGreaterThan(80);
  });

  it('blocks every water tile, so nobody walks on water', () => {
    const { water } = map.waterside;
    for (let y = water.y; y < water.y + water.h; y++) {
      for (let x = water.x; x < water.x + water.w; x++) {
        const ground = map.ground[y * map.width + x];
        expect(ground === 'water' || ground === 'boards').toBe(true);
        if (ground === 'water') expect(isBlocked(map, x, y)).toBe(true);
      }
    }
  });

  it('sets the player down on firm ground at both docks, with the ferry berthed on water', () => {
    for (const dock of map.waterside.docks) {
      expect(canStand(map, dock.landing.x, dock.landing.y)).toBe(true);
      expect(dockInReach(map, dock.landing)).toBe(dock);
      expect(isBlocked(map, Math.floor(dock.berth.x), Math.floor(dock.berth.y))).toBe(true);
    }
  });

  it('never sends strolling visitors over the water to the far shore', () => {
    for (const tile of strollTiles(map)) expect(tile.x).toBeLessThan(map.waterside.water.x);
  });

  it('leaves the midway inside its hedge where it was', () => {
    expect(map.midwayWidth).toBe(24);
    expect(map.spawn).toEqual({ x: 14.5, y: map.height - 3 });
    expect(map.booths[0]).toMatchObject({ x: 8, y: 24 });
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.midwayWidth - 1; x++) {
        expect(map.ground[y * map.width + x] === 'water').toBe(false);
      }
    }
  });
});

describe('boarding the ferry', () => {
  it('boards from the pier the ferry waits at', () => {
    expect(requestFerry(START_FERRY, 'use', 'promenade').riding).toBe(true);
  });

  it('ignores a board from nowhere, or from the other pier', () => {
    expect(requestFerry(START_FERRY, 'board', undefined)).toBe(START_FERRY);
    expect(requestFerry(START_FERRY, 'board', 'far-shore')).toBe(START_FERRY);
    expect(requestFerry(START_FERRY, 'use', undefined)).toBe(START_FERRY);
  });

  it('casts off once however often the key is pressed', () => {
    const aboard = requestFerry(START_FERRY, 'board', 'promenade');
    expect(requestFerry(aboard, 'board', 'promenade')).toBe(aboard);
    const sailing = requestFerry(aboard, 'depart', undefined);
    expect(sailing).toMatchObject({ phase: 'sailing', dock: 'far-shore', riding: true });
    expect(requestFerry(sailing, 'depart', undefined)).toBe(sailing);
    expect(requestFerry(sailing, 'board', 'promenade')).toBe(sailing);
    expect(requestFerry(sailing, 'call', 'promenade')).toBe(sailing);
    expect(requestFerry(sailing, 'step-off', undefined)).toBe(sailing);
  });

  it('calls the ferry over, empty, from the other pier', () => {
    const called = requestFerry(START_FERRY, 'use', 'far-shore');
    expect(called).toMatchObject({ phase: 'sailing', dock: 'far-shore', riding: false });
    expect(sailAll(called)).toMatchObject({ phase: 'docked', dock: 'far-shore', riding: false });
  });
});

describe('crossing', () => {
  const sailing = requestFerry(
    requestFerry(START_FERRY, 'board', 'promenade'),
    'depart',
    undefined,
  );

  it('glides across over a few seconds and ties up at the other dock', () => {
    const halfway = sailFerry(sailing, CROSSING_SECONDS / 2, false);
    expect(halfway.phase).toBe('sailing');
    const p = ferryPosition(map, halfway);
    expect(p.x).toBeGreaterThan(promenade.berth.x);
    expect(p.x).toBeLessThan(farShore.berth.x);
    expect(isBlocked(map, Math.floor(p.x), Math.floor(p.y))).toBe(true);
    expect(sailAll(sailing)).toEqual({
      phase: 'docked',
      dock: 'far-shore',
      progress: 1,
      riding: false,
    });
  });

  it('stays on the water every step of the way', () => {
    let ferry = sailing;
    while (ferry.phase === 'sailing') {
      const p = ferryPosition(map, ferry);
      expect(map.ground[Math.floor(p.y) * map.width + Math.floor(p.x)]).toBe('water');
      ferry = sailFerry(ferry, 0.1, false);
    }
  });

  it('lands in one step in quiet mode, at the same dock', () => {
    expect(sailFerry(sailing, 1 / 60, true)).toEqual(sailAll(sailing));
  });

  it('can be skipped to the dock ahead, which still lands the rider there', () => {
    const skipped = requestFerry(sailing, 'use', undefined);
    expect(skipped).toEqual({ phase: 'docked', dock: 'far-shore', progress: 1, riding: false });
  });

  it('can turn back to where it came from, from the same spot on the water', () => {
    const part = sailFerry(sailing, CROSSING_SECONDS / 4, false);
    const back = requestFerry(part, 'turn-back', undefined);
    expect(back.dock).toBe('promenade');
    const a = ferryPosition(map, part);
    const b = ferryPosition(map, back);
    expect(b.x).toBeCloseTo(a.x);
    expect(b.y).toBeCloseTo(a.y);
    expect(sailAll(back)).toMatchObject({ dock: 'promenade', riding: false });
  });

  it('never leaves anyone on the water when the midway closes mid-crossing', () => {
    expect(settleFerry(sailing)).toEqual({
      phase: 'docked',
      dock: 'far-shore',
      progress: 1,
      riding: false,
    });
    const aboard = requestFerry(START_FERRY, 'board', 'promenade');
    expect(settleFerry(aboard)).toEqual(START_FERRY);
  });

  it('round-trips back to the promenade', () => {
    const there = sailAll(sailing);
    const back = sailAll(requestFerry(requestFerry(there, 'use', 'far-shore'), 'use', undefined));
    expect(back).toEqual(START_FERRY);
  });
});

describe('what the ferry says', () => {
  it('says nothing away from the docks on the midway side', () => {
    expect(ferryMessage(map, START_FERRY, undefined)).toBe('');
    expect(ferryButtons(START_FERRY, undefined)).toEqual([]);
  });

  it('tells a player on the far shore where the ferry home leaves from', () => {
    expect(onFarShore(map, { x: map.waterside.farShoreX + 2, y: 10 })).toBe(true);
    expect(onFarShore(map, map.spawn)).toBe(false);
    expect(ferryMessage(map, START_FERRY, undefined, true)).toContain('far shore dock');
  });

  it('offers the request that makes sense at each step', () => {
    expect(ferryButtons(START_FERRY, 'promenade')).toEqual(['board']);
    expect(ferryButtons(START_FERRY, 'far-shore')).toEqual(['call']);
    const aboard = requestFerry(START_FERRY, 'board', 'promenade');
    expect(ferryButtons(aboard, undefined)).toEqual(['depart', 'step-off']);
    expect(ferryMessage(map, aboard, undefined)).toContain('cast off for the far shore dock');
    const sailing = requestFerry(aboard, 'depart', undefined);
    expect(ferryButtons(sailing, undefined)).toEqual(['skip', 'turn-back']);
    expect(ferryMessage(map, sailing, undefined)).toBe(
      'Crossing to the far shore dock. Press E to hurry to the dock.',
    );
  });

  it('keeps one line for the whole crossing, so it never chatters', () => {
    const aboard = requestFerry(START_FERRY, 'board', 'promenade');
    const sailing = requestFerry(aboard, 'depart', undefined);
    const later = sailFerry(sailing, 2, false);
    expect(ferryMessage(map, later, undefined)).toBe(ferryMessage(map, sailing, undefined));
  });
});

describe('the camera on a ferry ride', () => {
  const aboard = requestFerry(START_FERRY, 'board', 'promenade');
  const sailing = requestFerry(aboard, 'depart', undefined);

  it('jumps with the player when a quiet crossing lands in one step', () => {
    const landed = sailFerry(sailing, 0.016, true);
    expect(landed.riding).toBe(false);
    expect(ferrySnapsCamera(sailing, landed, true)).toBe(true);
  });

  it('jumps when quiet mode turns on mid-crossing', () => {
    const halfway = sailFerry(sailing, CROSSING_SECONDS / 2, false);
    expect(halfway.phase).toBe('sailing');
    expect(ferrySnapsCamera(halfway, sailFerry(halfway, 0.016, true), true)).toBe(true);
  });

  it('eases through an ordinary animated crossing', () => {
    const moving = sailFerry(sailing, 0.016, false);
    expect(ferrySnapsCamera(sailing, moving, false)).toBe(false);
    const landed = sailFerry(moving, CROSSING_SECONDS, false);
    expect(ferrySnapsCamera(moving, landed, false)).toBe(false);
  });

  it('leaves the camera alone when nothing changes or nobody rides', () => {
    expect(ferrySnapsCamera(sailing, sailing, true)).toBe(false);
    const called = requestFerry(START_FERRY, 'call', 'far-shore');
    expect(called.riding).toBe(false);
    expect(ferrySnapsCamera(START_FERRY, called, true)).toBe(false);
  });
});
