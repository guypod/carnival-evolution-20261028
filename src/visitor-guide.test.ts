import { describe, expect, it } from 'vitest';
import { CLOSED_GUIDE, escapeGuide, guideToggleLabel, toggleGuide } from './visitor-guide';

describe('visitor guide', () => {
  it('starts closed and opens and closes with its toggle', () => {
    expect(CLOSED_GUIDE.open).toBe(false);
    const open = toggleGuide(CLOSED_GUIDE);
    expect(open.open).toBe(true);
    expect(toggleGuide(open).open).toBe(false);
  });

  it('closes on Escape and restores focus only from inside the guide', () => {
    const open = toggleGuide(CLOSED_GUIDE);
    expect(escapeGuide(open, true)).toEqual({
      state: { open: false },
      handled: true,
      restoreFocus: true,
    });
    expect(escapeGuide(open, false)).toEqual({
      state: { open: false },
      handled: true,
      restoreFocus: false,
    });
  });

  it('leaves Escape alone when the guide is closed', () => {
    expect(escapeGuide(CLOSED_GUIDE, false)).toEqual({
      state: CLOSED_GUIDE,
      handled: false,
      restoreFocus: false,
    });
  });

  it('labels the toggle for what pressing it does', () => {
    expect(guideToggleLabel(CLOSED_GUIDE)).toBe('Open the visitor guide');
    expect(guideToggleLabel(toggleGuide(CLOSED_GUIDE))).toBe('Close the visitor guide');
  });
});
