import { describe, expect, it } from 'vitest';
import {
  createDiscoveryStore,
  discover,
  discoveryClue,
  discoveryProgress,
  DISCOVERY_KEY,
  landmarkHint,
  landmarkInReach,
  mergeDiscoveries,
  nextLandmark,
  parseDiscoveries,
  pathToLandmark,
  trailComplete,
  trailLandmarks,
} from './discovery';
import { registry } from '../games';
import { canStand, createWalker, findPath, followPath, layoutMidway, walk } from './world';

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

describe('the real nine-booth midway', () => {
  const ids = registry.all().map((g) => g.id);
  const real = layoutMidway(ids);
  const realLandmarks = trailLandmarks(real);

  it('lays out every registered booth and all three landmarks', () => {
    expect(real.booths.filter((b) => b.gameId)).toHaveLength(ids.length);
    expect(realLandmarks.map((l) => l.id)).toEqual(['entrance', 'carousel', 'ferris-wheel']);
  });

  it.each(realLandmarks.map((l) => [l.id, l] as const))(
    'has a walkable spot, reached from the spawn, within reach of the %s',
    (_id, landmark) => {
      const spots: { x: number; y: number }[] = [];
      for (let ty = 0; ty < real.height; ty++) {
        for (let tx = 0; tx < real.width; tx++) {
          const spot = { x: tx + 0.5, y: ty + 0.5 };
          if (!canStand(real, spot.x, spot.y)) continue;
          if (landmarkInReach(realLandmarks, spot)?.id !== landmark.id) continue;
          if (findPath(real, real.spawn, spot)) spots.push(spot);
        }
      }
      expect(spots.length).toBeGreaterThan(0);
    },
  );
});

describe('pathToLandmark on the real nine-booth midway', () => {
  const real = layoutMidway(registry.all().map((g) => g.id));
  const realLandmarks = trailLandmarks(real);

  it.each(realLandmarks.map((l) => [l.id, l] as const))(
    'walks from the spawn to an open spot within reach of the %s',
    (_id, landmark) => {
      const path = pathToLandmark(real, real.spawn, landmark)!;
      expect(path.length).toBeGreaterThan(0);
      for (const step of path) expect(canStand(real, step.x, step.y)).toBe(true);
      expect(landmarkInReach(realLandmarks, path.at(-1)!)?.id).toBe(landmark.id);
    },
  );

  it('only finds the landmark once the walk arrives, with no jump', () => {
    const wheel = realLandmarks.find((l) => l.id === 'ferris-wheel')!;
    const player = createWalker(real.spawn);
    player.path = pathToLandmark(real, player, wheel)!;
    expect(landmarkInReach(realLandmarks, player)).toBeUndefined();

    const dt = 1 / 60;
    let frames = 0;
    let foundAt: number | undefined;
    while (player.path.length > 0 && frames < 10_000) {
      const before = { x: player.x, y: player.y };
      followPath(player, dt);
      expect(Math.hypot(player.x - before.x, player.y - before.y)).toBeLessThan(0.1);
      frames++;
      if (foundAt === undefined && landmarkInReach(realLandmarks, player)?.id === wheel.id) {
        foundAt = frames;
      }
    }
    expect(player.path).toEqual([]);
    expect(foundAt).toBeGreaterThan(1);
    expect(landmarkInReach(realLandmarks, player)?.id).toBe(wheel.id);
  });

  it('stops guiding the moment the player walks by hand', () => {
    const wheel = realLandmarks.find((l) => l.id === 'ferris-wheel')!;
    const player = createWalker(real.spawn);
    player.path = pathToLandmark(real, player, wheel)!;
    followPath(player, 0.5);
    // What the midway does on a movement key: drop the guided walk.
    player.path = [];
    const at = { x: player.x, y: player.y };
    expect(followPath(player, 1)).toBe(true);
    expect({ x: player.x, y: player.y }).toEqual(at);
    walk(real, player, { x: 0, y: 1 }, 0.1);
    expect(landmarkInReach(realLandmarks, player)).toBeUndefined();
  });

  it('needs no walk when the player is already in reach', () => {
    const carousel = realLandmarks.find((l) => l.id === 'carousel')!;
    const path = pathToLandmark(real, real.spawn, carousel)!;
    expect(pathToLandmark(real, path.at(-1)!, carousel)).toEqual([]);
  });

  it('gives up when no open spot in reach can be walked to', () => {
    const carousel = realLandmarks.find((l) => l.id === 'carousel')!;
    const walledIn = { ...real, blocked: [...real.blocked] };
    const { x, y, w, h } = carousel.area;
    for (let ty = y - 3; ty < y + h + 3; ty++) {
      for (let tx = x - 3; tx < x + w + 3; tx++) {
        if (tx >= 0 && ty >= 0 && tx < real.width && ty < real.height) {
          walledIn.blocked[ty * real.width + tx] = true;
        }
      }
    }
    expect(pathToLandmark(walledIn, real.spawn, carousel)).toBeUndefined();
  });

  it('gives up on a landmark placed off the map', () => {
    const away = { ...realLandmarks[0], area: { x: 500, y: 500, w: 2, h: 2 } };
    expect(pathToLandmark(real, real.spawn, away)).toBeUndefined();
  });
});

describe('landmarkHint', () => {
  it('names the next landmark briefly, and hides once the trail is done', () => {
    expect(landmarkHint(landmarks, [])).toBe('🧭 Next landmark: Ticket booth');
    expect(landmarkHint(landmarks, ['entrance'])).toBe('🧭 Next landmark: Carousel');
    expect(landmarkHint(landmarks, ['entrance', 'carousel', 'ferris-wheel'])).toBeUndefined();
    expect(landmarkHint([], [])).toBeUndefined();
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

  it('keeps finds another tab saved when recording a new one', () => {
    const storage = memoryStorage();
    const tabA = createDiscoveryStore(storage);
    const tabB = createDiscoveryStore(storage);
    const staleB = tabB.load();
    tabA.save(discover(tabA.load(), 'entrance'));
    tabB.save(discover(mergeDiscoveries(staleB, tabB.load()), 'carousel'));
    expect(createDiscoveryStore(storage).load()).toEqual(['entrance', 'carousel']);
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
