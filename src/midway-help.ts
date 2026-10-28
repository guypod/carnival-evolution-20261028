/** One line of the midway's Help panel: the keys or action, and what they do. */
export interface HelpControl {
  keys: string[];
  action: string;
}

/**
 * Every control the Help panel lists. Each one is wired up in `src/main.ts` or
 * `src/midway/midway.ts`: keep this list in step with them, and add nothing
 * the midway doesn't do.
 */
export const HELP_CONTROLS: HelpControl[] = [
  { keys: ['W', 'A', 'S', 'D'], action: 'Walk. The arrow keys work too.' },
  {
    keys: ['Click'],
    action: 'Walk to a spot or a booth. You find your own way around the tents.',
  },
  {
    keys: ['E', 'Enter', 'Space'],
    action: 'Play the booth you are standing at. Clicking the booth again plays it too.',
  },
  {
    keys: ['Esc'],
    action: 'Close the Guide or this Help. Focus goes back to its button when it was inside.',
  },
  {
    keys: ['Tab', 'Shift+Tab'],
    action: 'Return to the map from a button or link, or click the map. Keys only walk there.',
  },
  { keys: ['Esc'], action: 'Leave a game or a guide page and come back to the midway.' },
];

/** Whether the Help panel is open: closed by default, so the map has the room. */
export interface HelpState {
  open: boolean;
}

export const CLOSED_HELP: HelpState = { open: false };

/** The Help panel after its button is pressed. */
export function toggleHelp(state: HelpState): HelpState {
  return { open: !state.open };
}

/**
 * What Escape does to the Help panel: it closes an open panel, and says whether
 * it handled the key. Focus goes back to the button only when it was inside the
 * panel, so a player walking the map keeps walking.
 */
export function escapeHelp(
  state: HelpState,
  focusInHelp: boolean,
): { state: HelpState; handled: boolean; restoreFocus: boolean } {
  if (!state.open) return { state, handled: false, restoreFocus: false };
  return { state: CLOSED_HELP, handled: true, restoreFocus: focusInHelp };
}

/** The button's accessible label for the panel's state. */
export function helpToggleLabel(state: HelpState): string {
  return state.open ? 'Close the controls help' : 'Open the controls help';
}
