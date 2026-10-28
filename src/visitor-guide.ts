/** Where the Visitor Guide is: closed by default, so the map has the room. */
export interface GuideState {
  open: boolean;
}

export const CLOSED_GUIDE: GuideState = { open: false };

/** The guide after its toggle button is pressed. */
export function toggleGuide(state: GuideState): GuideState {
  return { open: !state.open };
}

/**
 * What Escape does on the midway: it closes an open guide, and says whether it
 * handled the key so nothing else acts on it. A closed guide leaves Escape alone.
 * Focus goes back to the toggle only when it was inside the guide, so a player
 * walking the map keeps walking.
 */
export function escapeGuide(
  state: GuideState,
  focusInGuide: boolean,
): { state: GuideState; handled: boolean; restoreFocus: boolean } {
  if (!state.open) return { state, handled: false, restoreFocus: false };
  return { state: CLOSED_GUIDE, handled: true, restoreFocus: focusInGuide };
}

/** The toggle's accessible label for the guide's state. */
export function guideToggleLabel(state: GuideState): string {
  return state.open ? 'Close the visitor guide' : 'Open the visitor guide';
}
