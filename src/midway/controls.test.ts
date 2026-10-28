import { describe, expect, it } from 'vitest';
import { CONTROL_SELECTOR, isControl } from './controls';

function element(matches: boolean) {
  return {
    closest(selector: string) {
      expect(selector).toBe(CONTROL_SELECTOR);
      return matches ? {} : null;
    },
  } as unknown as EventTarget;
}

describe('isControl', () => {
  it('is true inside a link, button or field', () => {
    expect(isControl(element(true))).toBe(true);
  });

  it('is false for the page itself and for targets that are not elements', () => {
    expect(isControl(element(false))).toBe(false);
    expect(isControl(null)).toBe(false);
    expect(isControl(new EventTarget())).toBe(false);
  });

  it('leaves the focusable map out, so the keyboard can always get back to walking', () => {
    // The map canvas has tabindex="0"; Tab reaches it and its keys walk the player.
    const selectors = CONTROL_SELECTOR.split(', ');
    expect(selectors).not.toContain('canvas');
    expect(selectors.some((selector) => selector.includes('tabindex'))).toBe(false);
  });

  it('covers text fields and the passport summary', () => {
    for (const tag of ['input', 'textarea', 'select', 'summary', 'a', 'button']) {
      expect(CONTROL_SELECTOR.split(', ')).toContain(tag);
    }
  });
});
