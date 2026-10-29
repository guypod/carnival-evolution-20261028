import { describe, expect, it } from 'vitest';
import { bestScore, recordScore } from '../carnival';
import { layoutMidway } from '../midway/world';
import { toySpots } from '../midway/repaired-toys';
import { registry } from '../games';
import {
  BENCH,
  LEVER_PIN,
  bellPull,
  CAMS,
  GEAR_RADII,
  NO_REPAIRS,
  REPAIRS_KEY,
  TOYS,
  benchPoint,
  benchStops,
  onLever,
  commit,
  createRepairsStore,
  dropSlot,
  faultyToy,
  hitTarget,
  midwayToys,
  movePart,
  onPart,
  openBench,
  parseRepairs,
  parseToy,
  recordRepair,
  resetBench,
  gearOutline,
  gearRadius,
  gearTurn,
  partOutline,
  partRadius,
  releaseTarget,
  runToy,
  targets,
  undo,
  useTool,
  type Target,
  type ToyState,
} from './workshop';
import { PEBBLE } from './cams';

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

describe('rooster bell lever pose', () => {
  const rest = (t: { x: number; y: number }) => ({ x: t.x, y: t.y });
  const atThree = movePart(faultyToy('rooster-bell'), 'rod', 'hole-3').toy;
  const find = (toy: typeof atThree, id: string, phase: number) =>
    targets(toy, phase).find((t) => t.id === id)!;
  // 0.25 is the quiet still frame and the peak of the pull; 0.1 is mid swing.
  const poses = [0.1, 0.25];

  it('turns the holes and the rod with the lever, keeping each one its distance from the pin', () => {
    expect(bellPull(0.25)).toBeCloseTo(1);
    for (const phase of poses) {
      for (const id of ['hole-1', 'hole-2', 'hole-3', 'rod']) {
        const still = find(atThree, id, 0);
        const moved = find(atThree, id, phase);
        expect(moved).toMatchObject(onLever(rest(still), phase));
        expect(Math.hypot(moved.x - LEVER_PIN.x, moved.y - LEVER_PIN.y)).toBeCloseTo(
          Math.hypot(still.x - LEVER_PIN.x, still.y - LEVER_PIN.y),
        );
        // Further out than the hit radius from where it rests, except hole 1 close by the pin.
        if (id !== 'hole-1')
          expect(Math.hypot(moved.x - still.x, moved.y - still.y)).toBeGreaterThan(12);
      }
    }
    expect(find(atThree, 'pin', 0.25)).toMatchObject(LEVER_PIN);
    expect(find(atThree, 'hole-3', 1)).toMatchObject(rest(find(atThree, 'hole-3', 0)));
  });

  it('picks the rod where it is drawn mid swing and in the quiet pose, not where it rests', () => {
    const still = find(atThree, 'rod', 0);
    for (const phase of poses) {
      const shown = find(atThree, 'rod', phase);
      expect(hitTarget(atThree, shown, undefined, phase)?.id).toBe('rod');
      expect(hitTarget(atThree, still, undefined, phase)?.id).not.toBe('rod');
    }
    expect(hitTarget(atThree, still)?.id).toBe('rod');
  });

  it('places a held rod on the hole drawn under the pointer', () => {
    for (const phase of poses) {
      const hole = find(atThree, 'hole-2', phase);
      expect(hitTarget(atThree, hole, 'rod', phase)?.id).toBe('hole-2');
      expect(hitTarget(atThree, rest(find(atThree, 'hole-2', 0)), 'rod', phase)?.id).not.toBe(
        'hole-2',
      );
      // A press and release on the drawn rod keeps it in hand; a drag to a drawn hole drops it there.
      const rod = find(atThree, 'rod', phase);
      expect(releaseTarget(atThree, 'rod', rod, rod, phase)).toBeUndefined();
      expect(releaseTarget(atThree, 'rod', rod, hole, phase)?.id).toBe('hole-2');
    }
  });

  it('rings the keyboard focus around the holes and rod where they are drawn', () => {
    for (const phase of poses) {
      const stops = benchStops(atThree, phase);
      expect(stops.map((t) => t.id).sort()).toEqual(['hole-1', 'hole-2', 'pin', 'rod']);
      for (const t of stops) expect(t).toMatchObject(rest(find(atThree, t.id, phase)));
      expect(stops.find((t) => t.id === 'rod')).toMatchObject(
        onLever(rest(find(atThree, 'rod', 0)), phase),
      );
    }
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

  it('falls short, rings or overshoots by the hole the rod is in', () => {
    const tight = useTool(faultyToy('rooster-bell'), 'screwdriver', 'pin').toy;
    expect(runToy(tight).message).toMatch(/short/);
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

describe('bench geometry', () => {
  /** Every part a toy has, each placed in turn on every spot it can reach by a swap-free move. */
  const parts = (id: ToyState['id']) => Object.keys(faultyToy(id).parts);
  const spots = (id: ToyState['id']) =>
    targets(faultyToy(id)).filter((t) => t.kind === 'slot' && !t.id.startsWith('peg-'));
  const inBench = (x: number, y: number, r: number) =>
    x - r >= 0 && y - r >= 0 && x + r <= BENCH.width && y + r <= BENCH.height;
  const apart = (a: Target, b: Target) => Math.hypot(a.x - b.x, a.y - b.y) >= a.r + b.r;

  it('draws each part at its own size wherever it sits', () => {
    for (const gear of Object.keys(GEAR_RADII))
      expect(partRadius(gear)).toBe(GEAR_RADII[gear] * 30 - 3 + 2);
    const box = faultyToy('music-box');
    const large = targets(box).find((t) => t.id === 'large')!;
    const mounted = targets(movePart(box, 'large', 'peg-5').toy).find((t) => t.id === 'large')!;
    expect(large.r).toBe(mounted.r);
  });

  it.each(['music-box', 'hopping-frog'] as const)(
    '%s: every tray spot holds its largest part wholly on the bench',
    (id) => {
      const largest = Math.max(...parts(id).map(partRadius));
      for (const s of spots(id)) {
        expect(s.r, s.id).toBeGreaterThanOrEqual(largest);
        expect(inBench(s.x, s.y, largest), s.id).toBe(true);
      }
    },
  );

  it.each(TOYS.map((t) => t.id))('%s: no two spots overlap', (id) => {
    const all = targets(faultyToy(id)).filter((t) => t.kind === 'slot');
    all.forEach((a, i) =>
      all.slice(i + 1).forEach((b) => expect(apart(a, b), `${a.id}/${b.id}`).toBe(true)),
    );
  });

  it('keeps every parked gear clear of the others and of the gears on the pegs, in any arrangement', () => {
    const pegs = targets(faultyToy('music-box')).filter((t) => t.id.startsWith('peg-'));
    const trays = spots('music-box');
    // Every way to park the three gears across the tray and pegs, one gear per spot.
    const all = [...trays, ...pegs].map((t) => t.id);
    for (const a of all)
      for (const b of all)
        for (const c of all) {
          if (new Set([a, b, c]).size < 3) continue;
          const toy: ToyState = {
            ...faultyToy('music-box'),
            parts: { small: a, medium: b, large: c },
          };
          const placed = targets(toy).filter((t) => t.kind === 'part');
          for (const p of placed)
            expect(inBench(p.x, p.y, p.r), `${p.id} at ${toy.parts[p.id]}`).toBe(true);
          const parked = placed.filter((p) => toy.parts[p.id].startsWith('tray-'));
          for (const p of parked)
            for (const q of placed) if (p !== q) expect(apart(p, q), `${p.id}/${q.id}`).toBe(true);
        }
  });

  it('keeps every cam on the bench and the parked ones apart', () => {
    for (const shaft of CAMS) {
      const rest = CAMS.filter((c) => c !== shaft);
      const toy: ToyState = {
        ...faultyToy('hopping-frog'),
        pebble: false,
        parts: { [shaft]: 'shaft', [rest[0]]: 'tray-1', [rest[1]]: 'tray-3' },
      };
      const placed = targets(toy).filter((t) => t.kind === 'part');
      for (const p of placed) expect(inBench(p.x, p.y, p.r), p.id).toBe(true);
      placed.forEach((a, i) => placed.slice(i + 1).forEach((b) => expect(apart(a, b)).toBe(true)));
    }
  });
});

describe('picking parts with the pointer', () => {
  const at = (toy: ToyState, id: string) => targets(toy).find((t) => t.id === id)!;

  it('picks a parked gear anywhere inside its drawn outline, and nothing just outside it', () => {
    const toy = faultyToy('music-box');
    const large = at(toy, 'large');
    expect(hitTarget(toy, { x: large.x, y: large.y + large.r - 1 })?.id).toBe('large');
    expect(hitTarget(toy, { x: large.x - large.r + 1, y: large.y })?.id).toBe('large');
    // Just past the large gear's teeth, towards its neighbour, is bare bench between spots.
    expect(hitTarget(toy, { x: large.x - large.r - 1, y: large.y })).toBeUndefined();
  });

  it('picks each tray gear by its own outline, never a neighbour', () => {
    const toy: ToyState = {
      ...faultyToy('music-box'),
      parts: { small: 'tray-1', medium: 'tray-2', large: 'tray-3' },
    };
    for (const part of ['small', 'medium', 'large']) {
      const t = at(toy, part);
      for (const [dx, dy] of [
        [0, 0],
        [t.r - 1, 0],
        [-(t.r - 1), 0],
        [0, t.r - 1],
      ])
        expect(hitTarget(toy, { x: t.x + dx, y: t.y + dy })?.id, part).toBe(part);
    }
  });

  it('picks the gear drawn on top where two mounted gears overlap', () => {
    const toy = steps(faultyToy('music-box'), (t) => movePart(t, 'small', 'peg-5'));
    // The small gear on peg 5 lies across the medium gear on peg 4; the small one is drawn last.
    const small = at(toy, 'small');
    expect(hitTarget(toy, { x: small.x - 10, y: small.y })?.id).toBe('small');
    const medium = at(toy, 'medium');
    expect(hitTarget(toy, { x: medium.x - 40, y: medium.y })?.id).toBe('medium');
  });

  it('picks the gear that shows through a tooth valley of the gear on top', () => {
    const toy = steps(faultyToy('music-box'), (t) => movePart(t, 'small', 'peg-5'));
    const small = at(toy, 'small');
    const p = { x: 184.13, y: 160.72 };
    // Inside the small gear's tooth tips (29), but in a valley past its drawn edge.
    expect(Math.hypot(p.x - small.x, p.y - small.y)).toBeLessThan(small.r);
    expect(onPart(small, p)).toBe(false);
    expect(onPart(at(toy, 'medium'), p)).toBe(true);
    expect(hitTarget(toy, p)?.id).toBe('medium');
    // The reviewer's case: a valley of the medium gear on peg 4 over the large gear on peg 7.
    const big = steps(faultyToy('music-box'), (t) => movePart(t, 'large', 'peg-7'));
    const q = { x: 235.6, y: 162.7 };
    expect(onPart(at(big, 'medium'), q)).toBe(false);
    expect(hitTarget(big, q)?.id).toBe('large');
  });

  it("splits overlapping gears along the top gear's drawn teeth", () => {
    const toy = steps(faultyToy('music-box'), (t) => movePart(t, 'small', 'peg-5'));
    const small = at(toy, 'small');
    const r = gearRadius('small');
    const teeth = gearOutline(r, 0).length / 2;
    // Facing the medium gear (to the left), just inside and just outside a tooth tip and a valley.
    const tip = Math.PI;
    const valley = Math.PI + Math.PI / teeth;
    const point = (a: number, d: number) => ({
      x: small.x + Math.cos(a) * d,
      y: small.y + Math.sin(a) * d,
    });
    expect(teeth % 2).toBe(0);
    expect(hitTarget(toy, point(tip, r + 1))?.id).toBe('small');
    expect(hitTarget(toy, point(valley, r - 5))?.id).toBe('small');
    expect(hitTarget(toy, point(valley, r - 3))?.id).toBe('medium');
    // A tooth's flank, between the two: on the gear's edge either side of the outline.
    const outline = partOutline(small)!;
    const mid = {
      x: (outline[teeth].x + outline[teeth + 1].x) / 2,
      y: (outline[teeth].y + outline[teeth + 1].y) / 2,
    };
    const inward = { x: mid.x + (small.x - mid.x) * 0.05, y: mid.y + (small.y - mid.y) * 0.05 };
    const outward = { x: mid.x - (small.x - mid.x) * 0.05, y: mid.y - (small.y - mid.y) * 0.05 };
    expect(hitTarget(toy, inward)?.id).toBe('small');
    expect(hitTarget(toy, outward)?.id).toBe('medium');
  });

  it("keeps an easy pickup in a lone gear's tooth valley", () => {
    const toy = faultyToy('music-box');
    const large = at(toy, 'large');
    const r = gearRadius('large');
    const teeth = gearOutline(r, 0).length / 2;
    const a = Math.PI / teeth;
    const p = { x: large.x + Math.cos(a) * (r - 2), y: large.y + Math.sin(a) * (r - 2) };
    expect(onPart(large, p)).toBe(false);
    expect(hitTarget(toy, p)?.id).toBe('large');
  });

  it('picks a turning gear by its teeth where they are drawn mid run and in the quiet frame', () => {
    const toy = fixedMusicBox();
    const run = runToy(toy);
    const r = gearRadius('large');
    const pitch = (2 * Math.PI) / (gearOutline(r, 0).length / 2);
    // 0.25 is the quiet still frame; 0.1 and 0.6 are mid run.
    for (const phase of [0.1, 0.25, 0.6]) {
      const large = targets(toy, phase, run).find((t) => t.id === 'large')!;
      const turned = large.angle!;
      expect(turned).toBeCloseTo(gearTurn(phase) * (run.kind === 'gears' ? run.spin.large : 0));
      // The outline the pointer is tested against is the one the bench draws at this turn.
      expect(partOutline(large)).toEqual(
        gearOutline(r, turned).map((q) => ({ x: large.x + q.x, y: large.y + q.y })),
      );
      // Half a tooth on from wherever the teeth are now: a tooth tip as drawn, a valley at rest.
      const k = Math.round(-turned / pitch);
      const tip = turned + k * pitch;
      const shown = { x: large.x + Math.cos(tip) * (r + 1), y: large.y + Math.sin(tip) * (r + 1) };
      expect(onPart(large, shown), `${phase}`).toBe(true);
      expect(hitTarget(toy, shown, undefined, phase, run)?.id).toBe('large');
    }
  });

  it("follows a jammed gear's shake, still giving the click to the gear that shows", () => {
    const toy = steps(faultyToy('music-box'), (t) => movePart(t, 'small', 'peg-5'));
    const run = runToy(toy);
    expect(run.kind === 'gears' && run.jammed).toBe(true);
    for (const phase of [0.03, 0.25]) {
      const small = targets(toy, phase, run).find((t) => t.id === 'small')!;
      const dx = small.x - at(toy, 'small').x;
      const p = { x: 184.13 + dx, y: 160.72 };
      expect(onPart(small, p)).toBe(false);
      expect(hitTarget(toy, p, undefined, phase, run)?.id).toBe('medium');
    }
  });

  it('picks a cam by its lobe, not its widest reach', () => {
    const toy: ToyState = { ...faultyToy('hopping-frog'), pebble: false };
    const round = at(toy, 'round');
    // The round cam sits low on the shaft: its widest reach is below, its narrowest above.
    const above = { x: round.x, y: round.y - (round.r - 2) };
    const below = { x: round.x, y: round.y + (round.r - 2) };
    expect(onPart(round, above)).toBe(false);
    expect(onPart(round, below)).toBe(true);
    // Turned half a turn mid run, the lobe and the hit swing round together.
    const fixed = movePart(toy, 'snail', 'shaft').toy;
    const run = runToy(fixed);
    for (const phase of [0.1, 0.25, 0.4]) {
      const snail = targets(fixed, phase, run).find((t) => t.id === 'snail')!;
      expect(snail.angle).toBeDefined();
      const outline = partOutline(snail)!;
      for (const q of outline.slice(1, -1).filter((_, i) => i % 12 === 0)) {
        const inner = { x: snail.x + (q.x - snail.x) * 0.9, y: snail.y + (q.y - snail.y) * 0.9 };
        expect(hitTarget(fixed, inner, undefined, phase, run)?.id).toBe('snail');
      }
    }
  });

  it('drops a held part on the spot under the pointer, even under a big gear', () => {
    const toy = faultyToy('music-box');
    const peg5 = at(toy, 'peg-5');
    // The medium gear on peg 4 covers peg 5, but a held part still lands on the peg.
    expect(hitTarget(toy, peg5)?.id).toBe('medium');
    expect(hitTarget(toy, peg5, 'large')?.id).toBe('peg-5');
    // Over another part, away from any spot, a held part swaps with it.
    const medium = at(toy, 'medium');
    const over = hitTarget(toy, { x: medium.x, y: medium.y - 40 }, 'large')!;
    expect(dropSlot(toy, over)).toBe('peg-4');
  });

  it('keeps a part in hand after a click on its edge over a neighbouring spot', () => {
    const toy = faultyToy('music-box');
    const medium = at(toy, 'medium');
    const peg5 = at(toy, 'peg-5');
    // A point on the medium gear on peg 4 that also lies inside peg 5.
    const edge = { x: peg5.x, y: medium.y };
    expect(Math.hypot(edge.x - medium.x, edge.y - medium.y)).toBeLessThan(medium.r);
    expect(hitTarget(toy, edge)?.id).toBe('medium');
    expect(hitTarget(toy, edge, 'medium')?.id).toBe('peg-5');
    // Pressed and released without moving: a click, so nothing drops.
    expect(releaseTarget(toy, 'medium', edge, edge)).toBeUndefined();
    expect(releaseTarget(toy, 'medium', edge, { x: edge.x + 3, y: edge.y + 2 })).toBeUndefined();
  });

  it('drops a part dragged onto a nearby spot, but not one dragged back home', () => {
    const toy = faultyToy('music-box');
    const medium = at(toy, 'medium');
    const peg5 = at(toy, 'peg-5');
    const onto = releaseTarget(toy, 'medium', medium, peg5)!;
    expect(dropSlot(toy, onto)).toBe('peg-5');
    // A short drag that ends on the edge over peg 5 is still a drag.
    const edge = { x: peg5.x, y: medium.y };
    expect(releaseTarget(toy, 'medium', { x: edge.x - 20, y: edge.y }, edge)?.id).toBe('peg-5');
    // Dragged around and released on its own peg: it stays in hand.
    expect(releaseTarget(toy, 'medium', peg5, at(toy, 'peg-4'))).toBeUndefined();
  });

  it('reaches fixtures before the parts around them', () => {
    const bell = faultyToy('rooster-bell');
    expect(hitTarget(bell, { x: 120, y: 200 })?.id).toBe('pin');
    const frog = faultyToy('hopping-frog');
    expect(hitTarget(frog, { x: 200 + PEBBLE.dx, y: 200 + PEBBLE.dy })?.id).toBe('pebble');
  });

  it('maps a pointer onto the same bench pixels at any shown size', () => {
    const toy = faultyToy('music-box');
    const large = at(toy, 'large');
    for (const scale of [1, 0.5, 0.42, 1.5]) {
      const box = { left: 30, top: 80, width: BENCH.width * scale, height: BENCH.height * scale };
      const client = { x: box.left + large.x * scale, y: box.top + large.y * scale };
      const p = benchPoint(client, box);
      expect(p.x).toBeCloseTo(large.x);
      expect(p.y).toBeCloseTo(large.y);
      expect(hitTarget(toy, p)?.id).toBe('large');
    }
  });
});

describe('moving parts by drag or keyboard, then undoing', () => {
  it('a drag from a tray gear to a peg moves it, and undo puts it back', () => {
    const toy = faultyToy('music-box');
    const from = hitTarget(
      toy,
      targets(toy).find((t) => t.id === 'large')!,
    )!;
    expect(from.id).toBe('large');
    const onto = hitTarget(
      toy,
      targets(toy).find((t) => t.id === 'peg-6')!,
      from.id,
    )!;
    let bench = commit(openBench(toy), movePart(toy, from.id, dropSlot(toy, onto)));
    expect(bench.toy.parts.large).toBe('peg-6');
    bench = undo(bench);
    expect(bench.toy).toEqual(toy);
  });

  it('the keyboard reaches every part and empty spot, and its moves undo the same way', () => {
    const toy = faultyToy('music-box');
    const stops = benchStops(toy).map((t) => `${t.kind}:${t.id}`);
    expect(stops).toEqual(
      expect.arrayContaining([
        'part:small',
        'part:medium',
        'part:large',
        'slot:tray-2',
        'slot:peg-5',
      ]),
    );
    expect(stops).not.toContain('slot:tray-1');
    // Pick up the medium gear, step to tray spot 2, press Enter; then the large one onto peg 5.
    const step1 = movePart(
      toy,
      'medium',
      dropSlot(
        toy,
        benchStops(toy).find((t) => t.id === 'tray-2')!,
      ),
    );
    let bench = commit(openBench(toy), step1);
    const step2 = movePart(bench.toy, 'large', 'peg-5');
    bench = commit(bench, step2);
    expect(runToy(bench.toy).working).toBe(true);
    bench = undo(undo(bench));
    expect(bench.toy).toEqual(toy);
  });
});
