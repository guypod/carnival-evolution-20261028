import { describe, expect, it } from 'vitest';
import { arriveRoute, cancelRoute, IDLE_ROUTE, routeMessage, startRoute } from './route';

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
