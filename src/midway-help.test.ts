import { describe, expect, it } from 'vitest';
import { CLOSED_HELP, HELP_CONTROLS, escapeHelp, helpToggleLabel, toggleHelp } from './midway-help';

describe('midway help', () => {
  it('starts closed and opens and closes with its button', () => {
    expect(CLOSED_HELP.open).toBe(false);
    const open = toggleHelp(CLOSED_HELP);
    expect(open.open).toBe(true);
    expect(toggleHelp(open).open).toBe(false);
  });

  it('closes on Escape and restores focus only from inside the panel', () => {
    const open = toggleHelp(CLOSED_HELP);
    expect(escapeHelp(open, true)).toEqual({
      state: CLOSED_HELP,
      handled: true,
      restoreFocus: true,
    });
    expect(escapeHelp(open, false)).toEqual({
      state: CLOSED_HELP,
      handled: true,
      restoreFocus: false,
    });
  });

  it('leaves Escape alone when the panel is closed', () => {
    expect(escapeHelp(CLOSED_HELP, true)).toEqual({
      state: CLOSED_HELP,
      handled: false,
      restoreFocus: false,
    });
  });

  it('labels the button for what pressing it does', () => {
    expect(helpToggleLabel(CLOSED_HELP)).toBe('Open the controls help');
    expect(helpToggleLabel(toggleHelp(CLOSED_HELP))).toBe('Close the controls help');
  });

  it('lists the walking, travel, play and return-to-map controls', () => {
    const keys = HELP_CONTROLS.flatMap((control) => control.keys);
    for (const key of ['W', 'A', 'S', 'D', 'Click', 'E', 'Enter', 'Space', 'Esc', 'Tab']) {
      expect(keys).toContain(key);
    }
    for (const control of HELP_CONTROLS) {
      expect(control.keys.length).toBeGreaterThan(0);
      expect(control.action).not.toBe('');
    }
  });
});
