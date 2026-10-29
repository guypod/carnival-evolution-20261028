import { describe, expect, it } from 'vitest';
import { pathToLandmark, trailLandmarks } from './discovery';
import {
  arriveRoute,
  cancelRoute,
  IDLE_ROUTE,
  lanternBrightness,
  lanternTrail,
  requestRoute,
  routeMessage,
  startRoute,
} from './route';
import { layoutMidway, pathToBooth, type MidwayMap, type Rect } from './world';

describe('route status', () => {
  it('says nothing when idle', () => {
    expect(routeMessage(IDLE_ROUTE)).toBe('');
  });

  it('names the destination while walking, then on arrival', () => {
    const walking = startRoute('Water Cannon');
    expect(routeMessage(walking)).toBe('Walking to Water Cannon…');
    const arrived = arriveRoute(walking);
    expect(arrived.phase).toBe('arrived');
    expect(routeMessage(arrived)).toBe('Arrived at Water Cannon.');
  });

  it('cancels a walk in progress', () => {
    const cancelled = cancelRoute(startRoute('Ticket booth'));
    expect(cancelled.phase).toBe('cancelled');
    expect(routeMessage(cancelled)).toBe('Walk to Ticket booth cancelled.');
  });

  it('leaves a finished or idle route alone, so nothing is announced twice', () => {
    const arrived = arriveRoute(startRoute('Ticket booth'));
    expect(cancelRoute(arrived)).toBe(arrived);
    expect(arriveRoute(arrived)).toBe(arrived);
    expect(cancelRoute(IDLE_ROUTE)).toBe(IDLE_ROUTE);
    expect(arriveRoute(IDLE_ROUTE)).toBe(IDLE_ROUTE);
  });

  it('replaces the walk when a new destination starts', () => {
    const next = startRoute('Ring Toss');
    expect(next).toEqual({ phase: 'walking', destination: 'Ring Toss' });
  });
});

describe('lantern trail', () => {
  const path = [1, 2, 3, 4, 5, 6, 7].map((x) => ({ x, y: 4 }));

  it('lights every few steps of a named walk, ending on the destination', () => {
    const lights = lanternTrail(startRoute('Ticket booth'), path, 3);
    expect(lights).toEqual([
      { x: 1, y: 4 },
      { x: 4, y: 4 },
      { x: 7, y: 4 },
    ]);
  });

  it('only lights the steps still ahead as the player walks', () => {
    const lights = lanternTrail(startRoute('Ticket booth'), path.slice(5), 3);
    expect(lights).toEqual([{ x: 7, y: 4 }]);
  });

  it('follows the new route when the destination switches', () => {
    const other = [
      { x: 2, y: 1 },
      { x: 2, y: 2 },
    ];
    expect(lanternTrail(startRoute('Ring Toss'), other, 3)).toEqual([{ x: 2, y: 2 }]);
  });

  it('clears on arrival, cancel and when idle', () => {
    const walking = startRoute('Ticket booth');
    expect(lanternTrail(arriveRoute(walking), path)).toEqual([]);
    expect(lanternTrail(cancelRoute(walking), path)).toEqual([]);
    expect(lanternTrail(IDLE_ROUTE, path)).toEqual([]);
  });

  it('lights nothing for a stale walk with no steps left', () => {
    expect(lanternTrail(startRoute('Ticket booth'), [])).toEqual([]);
  });

  it('holds steady in quiet mode and never goes dark otherwise', () => {
    expect(lanternBrightness(0, 0, true)).toBe(1);
    expect(lanternBrightness(9, 3, true)).toBe(1);
    for (let t = 0; t < 10; t += 0.37) expect(lanternBrightness(t, 2, false)).toBeGreaterThan(0.69);
  });
});

describe('route request', () => {
  const real = layoutMidway(['a', 'b', 'c']);
  const walledIn = (map: MidwayMap, area: Rect): MidwayMap => {
    const blocked = [...map.blocked];
    for (let ty = area.y - 3; ty < area.y + area.h + 3; ty++)
      for (let tx = area.x - 3; tx < area.x + area.w + 3; tx++)
        if (tx >= 0 && ty >= 0 && tx < map.width && ty < map.height)
          blocked[ty * map.width + tx] = true;
    return { ...map, blocked };
  };

  it('starts a lit walk when the place can be reached', () => {
    const booth = real.booths[0];
    const request = requestRoute('Water Cannon', pathToBooth(real, real.spawn, booth));
    expect(request.route).toEqual(startRoute('Water Cannon'));
    expect(lanternTrail(request.route, request.path).length).toBeGreaterThan(0);
  });

  it('says honestly when a booth has no open path, leaving no old walk behind', () => {
    const booth = real.booths[0];
    const map = walledIn(real, booth);
    const request = requestRoute('Water Cannon', pathToBooth(map, map.spawn, booth));
    expect(request.route.phase).toBe('unavailable');
    expect(request.path).toEqual([]);
    expect(lanternTrail(request.route, request.path)).toEqual([]);
    expect(routeMessage(request.route)).toBe('No open path to Water Cannon from here.');
  });

  it('says honestly when a landmark has no open path', () => {
    const landmark = trailLandmarks(real)[0];
    const map = walledIn(real, landmark.area);
    const request = requestRoute(landmark.name, pathToLandmark(map, map.spawn, landmark));
    expect(request).toEqual({
      route: { phase: 'unavailable', destination: landmark.name },
      path: [],
    });
    expect(routeMessage(request.route)).toBe(`No open path to ${landmark.name} from here.`);
  });

  it('shows nothing when the player is already there', () => {
    expect(requestRoute('Water Cannon', [])).toEqual({ route: IDLE_ROUTE, path: [] });
  });

  it('never lets an unavailable route arrive or cancel', () => {
    const unavailable = requestRoute('Water Cannon', undefined).route;
    expect(arriveRoute(unavailable)).toBe(unavailable);
    expect(cancelRoute(unavailable)).toBe(unavailable);
  });
});
