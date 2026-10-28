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

  it('covers text fields and the passport summary', () => {
    for (const tag of ['input', 'textarea', 'select', 'summary', 'a', 'button']) {
      expect(CONTROL_SELECTOR.split(', ')).toContain(tag);
    }
  });
});
