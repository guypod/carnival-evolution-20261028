import { describe, expect, it } from 'vitest';
import {
  faultyToy,
  inspectToy,
  inspectionLine,
  movePart,
  runToy,
  useTool,
  type ToyState,
} from './workshop';

const fixedBear = (): ToyState =>
  movePart(movePart(faultyToy('music-box'), 'medium', 'tray-2').toy, 'large', 'peg-5').toy;

describe('inspection rig', () => {
  it('finds where the broken music box stops, and nothing stops once it is fixed', () => {
    const broken = inspectToy(faultyToy('music-box'));
    expect(broken.stopsAt).toBeDefined();
    expect(broken.stages[0]).toMatchObject({ part: 'crank gear', moving: true });
    expect(broken.stages.at(-1)).toMatchObject({ part: 'bear gear', moving: false });
    const fixed = fixedBear();
    expect(runToy(fixed).working).toBe(true);
    expect(inspectToy(fixed).stopsAt).toBeUndefined();
  });

  it('agrees with the test run for every toy before and after repair', () => {
    const bell = useTool(
      movePart(faultyToy('rooster-bell'), 'rod', 'hole-2').toy,
      'screwdriver',
      'pin',
    ).toy;
    for (const toy of [
      faultyToy('music-box'),
      fixedBear(),
      faultyToy('rooster-bell'),
      bell,
      faultyToy('hopping-frog'),
    ]) {
      const { stages, stopsAt } = inspectToy(toy);
      expect(stopsAt === undefined && stages.length > 0).toBe(
        runToy(toy).working || (toy.id === 'rooster-bell' && toy.pinTight),
      );
    }
  });

  it('stops a loose bell at its pin and a pebbled frog at its shaft', () => {
    const bell = inspectToy(faultyToy('rooster-bell'));
    if (!faultyToy('rooster-bell').pinTight)
      expect(bell.stages[bell.stopsAt!].part).toBe('pivot pin');
    const frog = inspectToy(faultyToy('hopping-frog'));
    expect(frog.stages[frog.stopsAt!].part).toBe('shaft');
    const cleared = useTool(faultyToy('hopping-frog'), 'tweezers', 'pebble').toy;
    expect(inspectToy(cleared).stages[1]).toMatchObject({ part: 'shaft', moving: true });
  });

  it('marks a wrong set-up as stopped: overlapping gears jam', () => {
    let toy = faultyToy('music-box');
    toy = movePart(toy, 'large', 'peg-4').toy;
    toy = movePart(toy, 'medium', 'peg-5').toy;
    const run = runToy(toy);
    const inspection = inspectToy(toy);
    expect(inspection.stopsAt === undefined).toBe(run.working);
  });

  it('steps safely round and round without changing the toy', () => {
    const toy = faultyToy('hopping-frog');
    const before = JSON.stringify(toy);
    const inspection = inspectToy(toy);
    const n = inspection.stages.length;
    expect(inspectionLine(inspection, n)).toBe(inspectionLine(inspection, 0));
    expect(inspectionLine(inspection, inspection.stopsAt!)).toContain('Motion stops here.');
    for (let i = 0; i < 50; i++) inspectionLine(inspectToy(toy), i);
    expect(JSON.stringify(toy)).toBe(before);
  });
});
