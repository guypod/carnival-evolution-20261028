import { describe, expect, it } from 'vitest';
import {
  connectLanterns,
  createLightGarden,
  createLightGardenStore,
  describeDesign,
  GARDEN_COLUMNS,
  LIGHT_GARDEN_KEY,
  MAX_LANTERNS,
  parseDesign,
  placeLantern,
  resetGarden,
  starterDesign,
  undo,
} from './light-garden';

const empty = () => createLightGarden({ lanterns: [], garlands: [] });

describe('light garden', () => {
  it('starts from a starter design that obeys its own rules', () => {
    expect(parseDesign(starterDesign())).toEqual(starterDesign());
  });

  it('keeps lanterns inside the garden and off each other', () => {
    let g = empty();
    expect(placeLantern(g, -1, 0, 'warm').result).toBe('out-of-bounds');
    expect(placeLantern(g, GARDEN_COLUMNS, 0, 'warm').result).toBe('out-of-bounds');
    expect(placeLantern(g, 0.5, 0, 'warm').result).toBe('out-of-bounds');
    g = placeLantern(g, 0, 0, 'cool').garden;
    expect(placeLantern(g, 0, 0, 'warm').result).toBe('taken');
  });

  it('stops at the lantern limit', () => {
    let g = empty();
    for (let i = 0; i < MAX_LANTERNS; i++)
      g = placeLantern(g, i % 6, Math.floor(i / 6), 'warm').garden;
    expect(placeLantern(g, 5, 3, 'warm').result).toBe('full');
  });

  it('strings garlands only between two different lanterns, once', () => {
    let g = empty();
    g = placeLantern(g, 0, 0, 'warm').garden;
    g = placeLantern(g, 2, 1, 'cool').garden;
    expect(connectLanterns(g, 0, 0).result).toBe('same');
    expect(connectLanterns(g, 0, 5).result).toBe('missing');
    g = connectLanterns(g, 0, 1).garden;
    expect(connectLanterns(g, 1, 0).result).toBe('already');
    expect(g.design.garlands).toEqual([[0, 1]]);
  });

  it('undoes step by step, and undoes a reset', () => {
    let g = empty();
    g = placeLantern(g, 0, 0, 'warm').garden;
    g = placeLantern(g, 1, 0, 'warm').garden;
    g = undo(g);
    expect(g.design.lanterns).toHaveLength(1);
    g = resetGarden(g);
    expect(g.design).toEqual(starterDesign());
    g = undo(g);
    expect(g.design.lanterns).toEqual([{ col: 0, row: 0, color: 'warm' }]);
    expect(undo(undo(g)).design.lanterns).toEqual([]);
  });

  it('describes the arrangement in words', () => {
    expect(describeDesign(starterDesign())).toContain('lantern 2: cool at column 4, row 1');
    expect(describeDesign(starterDesign())).toContain('Garlands join 1 and 2, 2 and 3.');
  });
});

describe('light garden store', () => {
  const memory = () => {
    const data = new Map<string, string>();
    return {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      data,
    };
  };

  it('saves and loads a design under its own key only', () => {
    const storage = memory();
    const store = createLightGardenStore(storage);
    const design = placeLantern(empty(), 5, 3, 'cool').garden.design;
    expect(store.save(design)).toBe(true);
    expect([...storage.data.keys()]).toEqual([LIGHT_GARDEN_KEY]);
    expect(store.load()).toEqual(design);
  });

  it('falls back to the starter on missing, broken or out-of-bounds saves', () => {
    expect(createLightGardenStore(undefined).load()).toEqual(starterDesign());
    const storage = memory();
    storage.setItem(LIGHT_GARDEN_KEY, '{not json');
    expect(createLightGardenStore(storage).load()).toEqual(starterDesign());
    storage.setItem(
      LIGHT_GARDEN_KEY,
      JSON.stringify({ lanterns: [{ col: 99, row: 0, color: 'warm' }], garlands: [] }),
    );
    expect(createLightGardenStore(storage).load()).toEqual(starterDesign());
  });
});
