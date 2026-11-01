import { describe, expect, it } from 'vitest';
import { theme } from './theme';

/** WCAG relative luminance of a '#rrggbb' colour. */
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two '#rrggbb' colours, from 1 to 21. */
function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('theme contrast', () => {
  it('measures contrast the WCAG way', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21);
    expect(contrast('#777777', '#777777')).toBe(1);
  });

  // The background and the panels that hints, captions and labels sit on.
  const backdrops = { background: theme.colors.background, surface: theme.colors.surface };

  for (const [name, backdrop] of Object.entries(backdrops)) {
    it(`keeps muted text readable (4.5:1) on ${name}`, () => {
      expect(contrast(theme.colors.muted, backdrop)).toBeGreaterThanOrEqual(4.5);
    });

    it(`keeps body text readable (4.5:1) on ${name}`, () => {
      expect(contrast(theme.colors.text, backdrop)).toBeGreaterThanOrEqual(4.5);
    });
  }
});
