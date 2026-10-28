import { describe, expect, it } from 'vitest';
import {
  createDiscoveryStore,
  discover,
  discoveryClue,
  discoveryProgress,
  DISCOVERY_KEY,
  landmarkInReach,
  nextLandmark,
  parseDiscoveries,
  trailComplete,
  trailLandmarks,
} from './discovery';
import { layoutMidway } from './world';

const map = layoutMidway(['a', 'b', 'c']);
const landmarks = trailLandmarks(map);

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

describe('trailLandmarks', () => {
  it('places three landmarks on the map props', () => {
    expect(landmarks.map((l) => l.id)).toEqual(['entrance', 'carousel', 'ferris-wheel']);
    const wheel = map.props.find((p) => p.kind === 'ferris-wheel')!;
    expect(landmarks[2].area).toEqual({ x: wheel.x, y: wheel.y, w: wheel.w, h: wheel.h });
  });
});

describe('landmarkInReach', () => {
  it('finds nothing where the player starts', () => {
    expect(landmarkInReach(landmarks, map.spawn)).toBeUndefined();
  });

  it('finds a landmark from right beside it', () => {
    const carousel = landmarks[1].area;
    const beside = { x: carousel.x - 1, y: carousel.y + 1 };
    expect(landmarkInReach(landmarks, beside)?.id).toBe('carousel');
  });

  it('finds nothing from a few tiles away', () => {
    const wheel = landmarks[2].area;
    expect(landmarkInReach(landmarks, { x: wheel.x + wheel.w + 3, y: wheel.y })).toBeUndefined();
  });
});

describe('progress', () => {
  it('counts each landmark once', () => {
    const found = discover(discover(discover([], 'carousel'), 'carousel'), 'entrance');
    expect(found).toEqual(['carousel', 'entrance']);
    expect(discoveryProgress(landmarks, found)).toBe('2 of 3 landmarks found');
  });

  it('gives a clue for the next landmark still to find', () => {
    expect(nextLandmark(landmarks, ['entrance'])?.id).toBe('carousel');
    expect(discoveryClue(landmarks, ['entrance'])).toMatch(/^Next: .*carousel/);
  });

  it('awards the souvenir once all three are found', () => {
    const found = ['ferris-wheel', 'entrance', 'carousel'] as const;
    expect(trailComplete(landmarks, found)).toBe(true);
    expect(discoveryProgress(landmarks, found)).toContain('Midway Explorer');
    expect(discoveryClue(landmarks, found)).toContain('Souvenir earned');
  });
});

describe('storage', () => {
  it('ignores missing, malformed and unknown saved values', () => {
    expect(parseDiscoveries(null)).toEqual([]);
    expect(parseDiscoveries('{oops')).toEqual([]);
    expect(parseDiscoveries('{"carousel":true}')).toEqual([]);
    expect(parseDiscoveries('["carousel","moon",3,"carousel"]')).toEqual(['carousel']);
  });

  it('keeps finds across loads under its own key, and resets', () => {
    const storage = memoryStorage();
    const store = createDiscoveryStore(storage);
    expect(store.save(['entrance'])).toBe(true);
    expect(storage.getItem(DISCOVERY_KEY)).toBe('["entrance"]');
    expect(createDiscoveryStore(storage).load()).toEqual(['entrance']);
    store.reset();
    expect(store.load()).toEqual([]);
  });

  it('survives storage that throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    const store = createDiscoveryStore(broken);
    expect(store.load()).toEqual([]);
    expect(store.save(['carousel'])).toBe(false);
    expect(() => store.reset()).not.toThrow();
    expect(createDiscoveryStore(undefined).save(['carousel'])).toBe(false);
  });
});
