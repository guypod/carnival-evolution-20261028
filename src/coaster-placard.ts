/**
 * The entrance placard for the ride shaped in the Coaster Workshop: a short
 * name, an emblem and a colour pair, kept in this browser through the shared
 * save slot. Its test line comes from the toy model, never from a made-up
 * safety claim.
 */
import { browserSaveStorage, createSaveSlot, theme, type SaveStorage } from './carnival';
import { simulate, type Point } from './coaster-workshop';

export const NAME_MAX = 24;
export const DEFAULT_NAME = 'My Coaster';

export const EMBLEMS = ['★', '◆', '●', '▲', '♥', '☾'] as const;
export type Emblem = (typeof EMBLEMS)[number];

type ColorName = keyof typeof theme.colors;
export interface Palette {
  id: string;
  label: string;
  background: ColorName;
  text: ColorName;
}

/** Colour pairs from the theme. Each one passes the contrast test in the tests. */
export const PALETTES: readonly Palette[] = [
  { id: 'night', label: 'Night and cream', background: 'background', text: 'text' },
  { id: 'gold', label: 'Gold and night', background: 'accent', text: 'background' },
  { id: 'cream', label: 'Cream and night', background: 'stripeB', text: 'surface' },
  { id: 'sky', label: 'Sky and night', background: 'water', text: 'background' },
  { id: 'plum', label: 'Plum and gold', background: 'surface', text: 'accent' },
];

export interface Placard {
  name: string;
  emblem: Emblem;
  palette: string;
}

export function defaultPlacard(): Placard {
  return { name: DEFAULT_NAME, emblem: EMBLEMS[0], palette: PALETTES[0].id };
}

/** Plain text on one line, without zero-width characters, trimmed and cut to NAME_MAX characters. */
export function cleanName(value: string): string {
  const visible = value.replace(/[\u200b-\u200d\u2060\ufeff]/g, '');
  const plain = Array.from(visible, (c) => (c < ' ' || c === '\u007f' ? ' ' : c)).join('');
  const flat = Array.from(plain.replace(/\s+/g, ' ').trim());
  return flat.slice(0, NAME_MAX).join('').trim();
}

export function paletteFor(id: string): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}

/** A saved placard, or undefined when the value is not a valid one. */
export function parsePlacard(value: unknown): Placard | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const { name, emblem, palette } = value as Record<string, unknown>;
  if (typeof name !== 'string' || typeof emblem !== 'string' || typeof palette !== 'string')
    return undefined;
  const clean = cleanName(name);
  if (!clean || clean !== name) return undefined;
  if (!(EMBLEMS as readonly string[]).includes(emblem)) return undefined;
  if (!PALETTES.some((p) => p.id === palette)) return undefined;
  return { name: clean, emblem: emblem as Emblem, palette };
}

/** Turns what was typed into a placard to save, or undefined when the name is empty. */
export function draftPlacard(name: string, emblem: string, palette: string) {
  return parsePlacard({ name: cleanName(name), emblem, palette });
}

/** WCAG contrast ratio between two #rrggbb colours. */
export function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The placard's test line, from running the saved layout on the toy model. */
export function placardStatus(points: readonly Point[] | undefined): string {
  if (!points) return 'Toy test: no saved track yet.';
  const run = simulate(points);
  if (run.outcome === 'complete')
    return `Toy test: finished, top speed ${Math.round(run.peak)}. Not a safety check.`;
  if (run.outcome === 'stall') return 'Toy test: stalls before the end. Not a safety check.';
  return 'Toy test: goes past the toy speed limit. Not a safety check.';
}

export const PLACARD_KEY = 'tessl-carnival:coaster-placard';
export const PLACARD_SAVE_MAX = 300;

export function createPlacardStore(storage: SaveStorage | undefined) {
  return createSaveSlot(storage, {
    key: PLACARD_KEY,
    maxLength: PLACARD_SAVE_MAX,
    parse: parsePlacard,
  });
}

export const placardStore = createPlacardStore(browserSaveStorage());
