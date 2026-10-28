/**
 * Where a guided walk is headed, for the status line on the map. A walk to a
 * booth or a landmark has a name; a click on open ground does not, and shows
 * nothing. The phase only changes at the start, arrival or cancel of a walk,
 * so the status line never chatters while the player moves.
 */
export type RoutePhase = 'idle' | 'walking' | 'arrived' | 'cancelled';

export interface RouteState {
  phase: RoutePhase;
  /** The booth or landmark the walk is headed to. Empty when idle. */
  destination: string;
}

export const IDLE_ROUTE: RouteState = { phase: 'idle', destination: '' };

/** A new named walk, replacing whatever walk came before. */
export function startRoute(destination: string): RouteState {
  return { phase: 'walking', destination };
}

/** The walk reached its spot. Only a walk in progress can arrive. */
export function arriveRoute(route: RouteState): RouteState {
  return route.phase === 'walking' ? { ...route, phase: 'arrived' } : route;
}

/** The player cancelled, or took over with the keys. Only a walk in progress cancels. */
export function cancelRoute(route: RouteState): RouteState {
  return route.phase === 'walking' ? { ...route, phase: 'cancelled' } : route;
}

/** The line the map shows for a route, empty when there is nothing to show. */
export function routeMessage(route: RouteState): string {
  switch (route.phase) {
    case 'walking':
      return `Walking to ${route.destination}…`;
    case 'arrived':
      return `Arrived at ${route.destination}.`;
    case 'cancelled':
      return `Walk to ${route.destination} cancelled.`;
    default:
      return '';
  }
}
