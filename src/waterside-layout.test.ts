import { describe, expect, it } from 'vitest';
import { watersideMaxHeight, watersideOverflows } from './waterside-layout';

describe('watersideMaxHeight', () => {
  it('fits a short enlarged-text viewport under the top controls', () => {
    // 590x378 at 200% zoom with the toolbar ending at y178 and an 8px inset.
    expect(watersideMaxHeight(378, 178, 8)).toBe(184);
  });

  it('leaves a wide desktop plenty of room', () => {
    expect(watersideMaxHeight(900, 100, 16)).toBe(776);
  });

  it('never goes below zero', () => {
    expect(watersideMaxHeight(100, 180, 8)).toBe(0);
  });
});

describe('watersideOverflows', () => {
  it('scrolls only when the stack is taller than its room', () => {
    expect(watersideOverflows(251, 184)).toBe(true);
    expect(watersideOverflows(120, 184)).toBe(false);
  });
});
