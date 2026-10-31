import { describe, expect, it } from 'vitest';
import { dockById } from './ferry';
import { homeward, homewardMessage, inWaterside } from './homeward';
import { arriveRoute, cancelRoute, requestRoute, routeMessage } from './route';
import { canStand, findPath, layoutMidway } from './world';

const map = layoutMidway(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k']);
const promenade = dockById(map, 'promenade');
const farShore = dockById(map, 'far-shore');
const onPromenade = { x: map.midwayWidth + 1.5, y: 14.5 };
const onFarShore = { x: map.waterside.farShoreX + 1.5, y: 10.5 };

describe('the waterside boundary', () => {
  it('starts at the midway hedge', () => {
    expect(inWaterside(map, map.spawn)).toBe(false);
    expect(inWaterside(map, { x: map.midwayWidth - 0.5, y: 6.5 })).toBe(false);
    expect(inWaterside(map, { x: map.midwayWidth, y: 6.5 })).toBe(true);
    expect(inWaterside(map, onFarShore)).toBe(true);
  });

  it('offers no way back inside the midway', () => {
    expect(homeward(map, map.spawn)).toBeUndefined();
    expect(homewardMessage(homeward(map, map.spawn))).toBe('');
  });
});

describe('the way back from the promenade', () => {
  const way = homeward(map, onPromenade)!;

  it('names the midway and ends inside the hedge', () => {
    expect(way.area).toBe('the promenade');
    expect(way.destination).toBe('the midway');
    expect(inWaterside(map, way.target)).toBe(false);
    expect(canStand(map, way.target.x + 0.5, way.target.y + 0.5)).toBe(true);
  });

  it('walks there from anywhere on the promenade, the dock included', () => {
    for (const from of [onPromenade, promenade.landing, { x: map.midwayWidth + 1.5, y: 3.5 }]) {
      const path = findPath(map, from, homeward(map, from)!.target);
      expect(path).toBeDefined();
      expect(path!.length).toBeGreaterThan(0);
    }
  });

  it('says where the player is and where the walk goes', () => {
    expect(homewardMessage(way)).toContain('promenade');
    expect(homewardMessage(way)).toContain('hedge gap');
  });
});

describe('the way back from the far shore', () => {
  const way = homeward(map, onFarShore)!;

  it('walks to the ferry dock rather than across the water', () => {
    expect(way.area).toBe('the far shore');
    expect(way.destination).toBe(farShore.name);
    expect(way.target).toEqual(farShore.landing);
    expect(findPath(map, onFarShore, way.target)).toBeDefined();
    // No walk reaches the midway itself from here; only the ferry does.
    expect(findPath(map, onFarShore, map.spawn)).toBeUndefined();
  });

  it('names the dock in the away line', () => {
    expect(homewardMessage(way)).toContain(farShore.name);
  });
});

describe('a return walk', () => {
  const way = homeward(map, onPromenade)!;
  const path = findPath(map, onPromenade, way.target);

  it('starts, then arrives or cancels with the destination named', () => {
    const { route } = requestRoute(way.destination, path);
    expect(routeMessage(route)).toBe('Walking to the midway…');
    expect(routeMessage(arriveRoute(route))).toBe('Arrived at the midway.');
    expect(routeMessage(cancelRoute(route))).toBe('Walk to the midway cancelled.');
  });

  it('says so when there is no path', () => {
    expect(routeMessage(requestRoute(way.destination, undefined).route)).toBe(
      'No open path to the midway from here.',
    );
  });

  it('leaves no away line once the player is back', () => {
    expect(homewardMessage(homeward(map, way.target))).toBe('');
  });
});
