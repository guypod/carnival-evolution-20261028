import { describe, expect, it } from 'vitest';
import { bestScore, recordScore } from '../carnival';
import { layoutMidway } from '../midway/world';
import { toySpots } from '../midway/repaired-toys';
import { registry } from '../games';
import {
  NO_REPAIRS,
  REPAIRS_KEY,
  TOYS,
  camLift,
  commit,
  createRepairsStore,
  faultyToy,
  midwayToys,
  movePart,
  openBench,
  parseRepairs,
  parseToy,
  recordRepair,
  resetBench,
  runToy,
  undo,
  useTool,
  type ToyState,
} from './workshop';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
  };
}

/** Applies a list of steps to a toy, failing loudly if any step was refused. */
function steps(toy: ToyState, ...moves: ((t: ToyState) => ReturnType<typeof movePart>)[]) {
  return moves.reduce((t, m) => {
    const result = m(t);
    expect(result.changed, result.message).toBe(true);
    return result.toy;
  }, toy);
}

function fixedMusicBox() {
  return steps(
    faultyToy('music-box'),
    (t) => movePart(t, 'medium', 'tray-2'),
    (t) => movePart(t, 'large', 'peg-5'),
  );
}

describe('every toy starts broken', () => {
  it.each(TOYS.map((t) => t.id))('%s fails its first test', (id) => {
    expect(runToy(faultyToy(id)).working).toBe(false);
  });
});

describe('music box gear train', () => {
  it('leaves the bear still while the train has a gap', () => {
    const run = runToy(faultyToy('music-box'));
    expect(run.kind === 'gears' && run.spin.bear).toBe(0);
    expect(run.message).toMatch(/gap/);
  });

  it('jams safely when two gears overlap', () => {
    const toy = movePart(faultyToy('music-box'), 'large', 'peg-5').toy;
    const run = runToy(toy);
    expect(run.kind === 'gears' && run.jammed).toBe(true);
    expect(run.working).toBe(false);
    expect(run.message).toMatch(/nothing breaks/);
  });

  it('turns the bear backwards through two idler gears', () => {
    // Crank (r2 at 0), medium (r2 at 4), small (r1 at 7), bear (r2 at 10): every gear meshes.
    const toy = movePart(faultyToy('music-box'), 'small', 'peg-7').toy;
    const run = runToy(toy);
    expect(run.kind === 'gears' && run.spin).toMatchObject({ crank: 1, medium: -1, small: 2 });
    expect(run.kind === 'gears' && run.spin.bear).toBeLessThan(0);
    expect(run.working).toBe(false);
    expect(run.message).toMatch(/backwards/);
  });

  it('dances forward through one large idler', () => {
    const run = runToy(fixedMusicBox());
    expect(run.working).toBe(true);
    expect(run.kind === 'gears' && run.spin).toMatchObject({ crank: 1, large: -2 / 3, bear: 1 });
  });

  it('swaps parts when a slot is taken, and refuses non-slots', () => {
    const toy = faultyToy('music-box');
    const swapped = movePart(toy, 'small', 'peg-4');
    expect(swapped.toy.parts).toMatchObject({ small: 'peg-4', medium: 'tray-1' });
    expect(movePart(toy, 'small', 'shaft').changed).toBe(false);
    expect(movePart(toy, 'bear', 'peg-3').changed).toBe(false);
  });
});

describe('rooster bell linkage', () => {
  it('slips while the pin is loose, wherever the rod is', () => {
    for (const hole of ['hole-1', 'hole-2', 'hole-3']) {
      const toy = movePart(faultyToy('rooster-bell'), 'rod', hole).toy;
      const run = runToy(toy);
      expect(run.kind === 'bell' && run.travel).toBe(0);
    }
  });

  it('needs the screwdriver, not the hand, for the pin', () => {
    expect(useTool(faultyToy('rooster-bell'), 'tweezers', 'pin').changed).toBe(false);
    expect(useTool(faultyToy('rooster-bell'), 'screwdriver', 'pin').toy.pinTight).toBe(true);
  });

  it('taps, rings or overshoots by the hole the rod is in', () => {
    const tight = useTool(faultyToy('rooster-bell'), 'screwdriver', 'pin').toy;
    expect(runToy(tight).message).toMatch(/taps/);
    const loose = useTool(tight, 'screwdriver', 'pin').toy;
    const atThree = useTool(movePart(loose, 'rod', 'hole-3').toy, 'screwdriver', 'pin').toy;
    const over = runToy(atThree);
    expect(over.working).toBe(false);
    expect(over.message).toMatch(/rubber stop/);
    const atTwo = useTool(movePart(loose, 'rod', 'hole-2').toy, 'screwdriver', 'pin').toy;
    expect(runToy(atTwo)).toMatchObject({ working: true, travel: 1 });
  });

  it('will not move the rod while the pin is tight', () => {
    const tight = useTool(faultyToy('rooster-bell'), 'screwdriver', 'pin').toy;
    const result = movePart(tight, 'rod', 'hole-2');
    expect(result.changed).toBe(false);
    expect(result.message).toMatch(/Loosen/);
  });
});

describe('hopping frog cam', () => {
  it('stalls on the pebble and will not swap cams until it is lifted out', () => {
    const toy = faultyToy('hopping-frog');
    expect(runToy(toy)).toMatchObject({ stalled: true, working: false });
    expect(movePart(toy, 'snail', 'shaft').changed).toBe(false);
    const clear = useTool(toy, 'tweezers', 'pebble');
    expect(clear.toy.pebble).toBe(false);
    expect(useTool(clear.toy, 'tweezers', 'pebble').changed).toBe(false);
  });

  it('bobs with the round cam, overshoots with the tall one, hops with the snail', () => {
    const clear = useTool(faultyToy('hopping-frog'), 'tweezers', 'pebble').toy;
    expect(runToy(clear).message).toMatch(/bobs/);
    const tall = movePart(clear, 'tall', 'shaft').toy;
    expect(runToy(tall).message).toMatch(/safety guard/);
    const snail = movePart(clear, 'snail', 'shaft').toy;
    expect(runToy(snail)).toMatchObject({ working: true, cam: 'snail' });
  });

  it('lifts in the shape of each cam', () => {
    expect(camLift('snail', 0.9)).toBeGreaterThan(camLift('snail', 0.1));
    expect(camLift('snail', 1)).toBe(0);
    expect(camLift('tall', 0.9)).toBeGreaterThan(1);
    expect(camLift('round', 0.5)).toBeLessThanOrEqual(0.6);
    expect(camLift(undefined, 0.5)).toBe(0);
  });
});

describe('the bench', () => {
  it('undoes each change in turn, and ignores refused ones', () => {
    let bench = openBench(faultyToy('music-box'));
    bench = commit(bench, movePart(bench.toy, 'small', 'peg-3'));
    bench = commit(bench, movePart(bench.toy, 'small', 'shaft'));
    expect(bench.history).toHaveLength(1);
    bench = undo(bench);
    expect(bench.toy).toEqual(faultyToy('music-box'));
    expect(undo(bench)).toBe(bench);
  });

  it('resets to the original faults, and undo brings the work back', () => {
    const fixed = openBench(fixedMusicBox());
    const reset = resetBench(fixed);
    expect(reset.toy).toEqual(faultyToy('music-box'));
    expect(undo(reset).toy).toEqual(fixedMusicBox());
  });
});

describe('saved repairs', () => {
  it('records only a toy that actually works', () => {
    expect(recordRepair(NO_REPAIRS, faultyToy('music-box'))).toBe(NO_REPAIRS);
    const repairs = recordRepair(NO_REPAIRS, fixedMusicBox());
    expect(midwayToys(repairs)).toEqual(['music-box']);
    expect(midwayToys({ ...repairs, shown: false })).toEqual([]);
  });

  it('survives a reload', () => {
    const storage = memoryStorage();
    const store = createRepairsStore(storage);
    expect(store.load()).toEqual(NO_REPAIRS);
    expect(store.save(recordRepair(NO_REPAIRS, fixedMusicBox()))).toBe(true);
    const again = createRepairsStore(storage).load();
    expect(again.toys['music-box']).toEqual(fixedMusicBox());
  });

  it('reads malformed, oversized or forged saves as no repairs', () => {
    for (const raw of [
      '{',
      '[]',
      '"x"',
      JSON.stringify({ toys: {}, shown: 'yes' }),
      'x'.repeat(3000),
    ]) {
      expect(createRepairsStore(memoryStorage({ [REPAIRS_KEY]: raw })).load()).toEqual(NO_REPAIRS);
    }
    // A save that claims a repair the model says does not work is dropped.
    const forged = { toys: { 'music-box': faultyToy('music-box') }, shown: true };
    expect(parseRepairs(forged)?.toys).toEqual({});
  });

  it('rejects parts in unknown, shared or missing slots', () => {
    const ok = fixedMusicBox();
    expect(parseToy(ok, 'music-box')).toEqual(ok);
    expect(parseToy({ ...ok, parts: { ...ok.parts, small: 'moon' } }, 'music-box')).toBeUndefined();
    expect(
      parseToy({ ...ok, parts: { ...ok.parts, small: 'peg-5' } }, 'music-box'),
    ).toBeUndefined();
    expect(parseToy({ ...ok, parts: { small: 'peg-3' } }, 'music-box')).toBeUndefined();
    expect(parseToy({ ...ok, pebble: true }, 'music-box')).toBeUndefined();
    expect(parseToy(ok, 'hopping-frog')).toBeUndefined();
  });

  it('falls back to no repairs, and reports a failed save, when storage is blocked', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const store = createRepairsStore(broken);
    expect(store.load()).toEqual(NO_REPAIRS);
    expect(store.save(recordRepair(NO_REPAIRS, fixedMusicBox()))).toBe(false);
    expect(createRepairsStore(undefined).save(NO_REPAIRS)).toBe(false);
  });

  it('never touches scores', () => {
    recordScore('water-cannon', 42);
    const before = registry.all().map((g) => bestScore(g.id));
    const store = createRepairsStore(memoryStorage());
    store.save(recordRepair(NO_REPAIRS, fixedMusicBox()));
    expect(registry.all().map((g) => bestScore(g.id))).toEqual(before);
  });
});

describe('repaired toys on the midway', () => {
  const map = layoutMidway(registry.all().map((g) => g.id));

  it('shows nothing without repairs', () => {
    expect(toySpots(map, [])).toEqual([]);
  });

  it('stands each repaired toy on open grass, off every path and blocked tile', () => {
    const spots = toySpots(map, ['music-box', 'rooster-bell', 'hopping-frog']);
    expect(spots.map((s) => s.id)).toEqual(['music-box', 'rooster-bell', 'hopping-frog']);
    for (const { at } of spots) {
      const tile = Math.floor(at.y) * map.width + Math.floor(at.x);
      expect(map.blocked[tile]).toBe(false);
      expect(map.ground[tile]).toBe('grass');
    }
  });

  it('keeps each toy in its own spot whichever others are repaired', () => {
    const all = toySpots(map, ['music-box', 'rooster-bell', 'hopping-frog']);
    const frogOnly = toySpots(map, ['hopping-frog']);
    expect(frogOnly).toEqual([all[2]]);
  });
});
