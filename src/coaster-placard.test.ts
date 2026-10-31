import { describe, expect, it } from 'vitest';
import { theme } from './carnival';
import {
  EMBLEMS,
  NAME_MAX,
  PALETTES,
  PLACARD_KEY,
  cleanName,
  contrast,
  createPlacardStore,
  defaultPlacard,
  draftPlacard,
  parsePlacard,
  placardStatus,
} from './coaster-placard';
import { MAX_Y, POINT_COUNT, pointX, starterLayout } from './coaster-workshop';

function memory() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe('coaster placard', () => {
  it('keeps names to one short line of plain text', () => {
    expect(cleanName('  Big\n\tDipper  ')).toBe('Big Dipper');
    expect(Array.from(cleanName('x'.repeat(80)))).toHaveLength(NAME_MAX);
    expect(cleanName('   ')).toBe('');
  });

  it('keeps markup as plain characters', () => {
    expect(draftPlacard('<b>Loop</b>', EMBLEMS[1], PALETTES[1].id)?.name).toBe('<b>Loop</b>');
  });

  it('refuses empty names, unknown emblems and unknown palettes', () => {
    expect(draftPlacard('  ', EMBLEMS[0], PALETTES[0].id)).toBeUndefined();
    expect(draftPlacard('\u200b\u2060', EMBLEMS[0], PALETTES[0].id)).toBeUndefined();
    expect(draftPlacard('Loop', '💥', PALETTES[0].id)).toBeUndefined();
    expect(draftPlacard('Loop', EMBLEMS[0], 'neon')).toBeUndefined();
    expect(
      parsePlacard({ name: 'x'.repeat(40), emblem: EMBLEMS[0], palette: 'night' }),
    ).toBeUndefined();
    expect(parsePlacard('Loop')).toBeUndefined();
  });

  it('only offers colour pairs that are easy to read', () => {
    for (const p of PALETTES)
      expect(contrast(theme.colors[p.background], theme.colors[p.text])).toBeGreaterThanOrEqual(
        4.5,
      );
  });

  it('saves and loads a placard, and reads a bad save as none', () => {
    const storage = memory();
    const store = createPlacardStore(storage);
    expect(store.load()).toBeUndefined();
    const placard = { ...defaultPlacard(), name: 'Night Owl' };
    expect(store.save(placard)).toBe(true);
    expect(createPlacardStore(storage).load()).toEqual(placard);
    storage.data.set(PLACARD_KEY, '{"name":1}');
    expect(store.load()).toBeUndefined();
  });

  it('reports the toy test honestly, never as a safety certificate', () => {
    expect(placardStatus(undefined)).toMatch(/no saved track/);
    expect(placardStatus(starterLayout())).toMatch(/^Toy test: finished.*Not a safety check\.$/);
    const flat = Array.from({ length: POINT_COUNT }, (_, i) => ({ x: pointX(i), y: MAX_Y }));
    flat[3] = { x: pointX(3), y: 80 };
    expect(placardStatus(flat)).not.toMatch(/finished/);
  });
});
