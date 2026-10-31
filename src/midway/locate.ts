import { distanceToRect, type MidwayMap, type Point } from './world';

/** How long the locate marker stays up, in seconds of real time, in quiet mode too. */
export const LOCATE_SECONDS = 4;

/** The locate marker: hidden, or up with this many seconds left. */
export interface LocateState {
  left: number;
}

export const HIDDEN_LOCATE: LocateState = { left: 0 };

/** The marker after the player asks where they are. */
export function showLocate(): LocateState {
  return { left: LOCATE_SECONDS };
}

export function isLocateShown(state: LocateState): boolean {
  return state.left > 0;
}

/** The marker `dt` seconds later. It never blinks or fades: it is up, then gone. */
export function tickLocate(state: LocateState, dt: number): LocateState {
  if (!isLocateShown(state)) return state;
  const left = state.left - dt;
  return left > 0 ? { left } : HIDDEN_LOCATE;
}

/** What the status line says when the marker goes up: the nearest booth, by name. */
export function locateMessage(
  map: MidwayMap,
  point: Point,
  names: ReadonlyMap<string, string>,
): string {
  let nearest: string | undefined;
  let best = Infinity;
  for (const booth of map.booths) {
    const distance = distanceToRect(point, booth);
    if (distance < best) {
      best = distance;
      nearest = booth.gameId ? (names.get(booth.gameId) ?? booth.gameId) : 'an empty booth';
    }
  }
  const near = nearest ? `, nearest ${nearest}` : '';
  return `You are here${near}. The ring marks you on the map; Escape hides it.`;
}

/** Whether a key press asks to locate the player: a plain L. */
export function isLocateKey(event: {
  code: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
}): boolean {
  return event.code === 'KeyL' && !event.metaKey && !event.ctrlKey && !event.altKey;
}

/**
 * Hides the marker on Escape, before any panel sees the key, but only while it
 * is up: `dismiss` says whether it was. Returns a function that removes the listener.
 */
export function watchLocateEscape(target: EventTarget, dismiss: () => boolean): () => void {
  const onKeyDown = (event: Event) => {
    if ((event as KeyboardEvent).key !== 'Escape') return;
    if (dismiss()) event.stopImmediatePropagation();
  };
  target.addEventListener('keydown', onKeyDown, { capture: true });
  return () => target.removeEventListener('keydown', onKeyDown, { capture: true });
}
