import { describe, expect, it } from 'vitest';
import {
  benchLabel,
  benchPhase,
  benchStops,
  createRepairsStore,
  faultyToy,
  hitTarget,
  INSPECT_STEPS,
  inspectPhase,
  inspectToy,
  inspectionLine,
  inspectionMarks,
  movePart,
  NO_REPAIRS,
  REPAIRS_KEY,
  runToy,
  startTest,
  stepInspection,
  targets,
  useTool,
  type ToyState,
} from './workshop';
import { frogPose } from './cams';

/** Applies moves in order, failing loudly if one is refused. */
function build(toy: ToyState, ...moves: [string, string][]): ToyState {
  for (const [part, slot] of moves) {
    const r = movePart(toy, part, slot);
    expect(r.changed, `${part} to ${slot}`).toBe(true);
    toy = r.toy;
  }
  return toy;
}

const tighten = (t: ToyState) => useTool(t, 'screwdriver', 'pin').toy;
const bellAt = (hole: number) => {
  const toy = faultyToy('rooster-bell');
  return tighten(toy.parts.rod === `hole-${hole}` ? toy : build(toy, ['rod', `hole-${hole}`]));
};
const clear = (t: ToyState) => useTool(t, 'tweezers', 'pebble').toy;
const frogWith = (cam: string | undefined) => {
  let toy = clear(faultyToy('hopping-frog'));
  toy = build(toy, ['round', 'tray-1']);
  return cam ? build(toy, [cam, 'shaft']) : toy;
};

const gearsBroken = faultyToy('music-box');
const gearsFixed = build(faultyToy('music-box'), ['medium', 'tray-2'], ['large', 'peg-5']);
const gearsJammed = build(faultyToy('music-box'), ['large', 'peg-5']);
const gearsBackwards = build(faultyToy('music-box'), ['small', 'peg-3'], ['medium', 'peg-6']);

describe('inspection stages follow the one run', () => {
  const cases: [string, ToyState, string | undefined][] = [
    ['music box with a gap', gearsBroken, 'bear gear'],
    ['music box fixed', gearsFixed, undefined],
    ['music box jammed', gearsJammed, 'crank gear'],
    ['music box running backwards', gearsBackwards, undefined],
    ['loose bell', faultyToy('rooster-bell'), 'hammer'],
    ['bell short', bellAt(1), 'bell'],
    ['bell ringing', bellAt(2), undefined],
    ['bell overshooting', bellAt(3), 'bell'],
    ['frog on a pebble', faultyToy('hopping-frog'), 'shaft'],
    ['frog with no cam', frogWith(undefined), 'cam'],
    ['frog on the round cam', frogWith('round'), undefined],
    ['frog on the snail cam', frogWith('snail'), undefined],
    ['frog on the tall cam', frogWith('tall'), undefined],
  ];
  it.each(cases)('%s', (_name, toy, stops) => {
    const run = runToy(toy);
    const { stages, stopsAt } = inspectToy(toy);
    expect(stopsAt === undefined ? undefined : stages[stopsAt].part).toBe(stops);
    if (run.kind === 'gears' && !run.jammed)
      for (const s of stages) expect(s.moving).toBe(run.spin[s.id] !== 0);
    if (run.kind === 'gears')
      expect(stopsAt === undefined).toBe(!run.jammed && run.spin.bear !== 0);
    if (run.kind === 'bell') expect(stopsAt === undefined).toBe(run.working);
    if (run.kind === 'cam' && run.cam && !run.stalled)
      expect(stages.at(-1)!.note).toBe(run.message);
  });

  it('says a backwards bear turns against the crank', () => {
    const { stages } = inspectToy(gearsBackwards);
    expect(stages.at(-1)!.note).toBe('The bear gear turns against the crank.');
  });

  it('says a loose bell loses the push between the riding rod end and the still hammer', () => {
    const toy = faultyToy('rooster-bell');
    const { stages } = inspectToy(toy);
    expect(stages.map((s) => [s.part, s.moving])).toEqual([
      ['lever', true],
      ['link rod', true],
      ['hammer', false],
    ]);
    expect(stages[2].note).toContain('never reaches the hammer');
    // The rod's lever end really moves at an inspection step; the hammer really does not.
    const run = runToy(toy);
    const rest = targets(toy).find((t) => t.id === 'rod')!;
    const mid = targets(toy, inspectPhase(1), run).find((t) => t.id === 'rod')!;
    expect(Math.hypot(mid.x - rest.x, mid.y - rest.y)).toBeGreaterThan(1);
    const hammer = (phase: number) =>
      inspectionMarks(toy, run, phase).find((m) => m.id === 'hammer')!;
    expect(hammer(inspectPhase(1))).toMatchObject({ x: hammer(0).x, y: hammer(0).y });
  });
});

describe('the inspection phase', () => {
  it('advances through the run in even steps and wraps round', () => {
    const phases = Array.from({ length: INSPECT_STEPS }, (_, i) => inspectPhase(i));
    for (let i = 1; i < phases.length; i++) expect(phases[i]).toBeGreaterThan(phases[i - 1]);
    expect(phases[0]).toBeGreaterThan(0);
    expect(inspectPhase(INSPECT_STEPS)).toBe(phases[0]);
    expect(inspectPhase(-1)).toBe(phases.at(-1));
  });

  it('turns the gears, swings the lever and turns the cam a step at a time', () => {
    const gearAngle = (step: number) => {
      const run = runToy(gearsFixed);
      return targets(gearsFixed, inspectPhase(step), run).find((t) => t.id === 'large')!.angle!;
    };
    expect(gearAngle(1)).not.toBe(gearAngle(0));
    const cam = frogWith('snail');
    const camAngle = (step: number) =>
      targets(cam, inspectPhase(step), runToy(cam)).find((t) => t.id === 'snail')!.angle!;
    expect(camAngle(1)).toBeGreaterThan(camAngle(0));
    // A pebbled cam stops where it meets the pebble, step after step.
    const pebbled = faultyToy('hopping-frog');
    const stuck = (step: number) =>
      targets(pebbled, inspectPhase(step), runToy(pebbled)).find((t) => t.id === 'round')!.angle!;
    expect(stuck(INSPECT_STEPS - 1)).toBe(stuck(INSPECT_STEPS - 2));
    expect(frogPose('round', inspectPhase(7), true).turns).toBeLessThan(1);
  });

  it('holds still: the same step shows the same frame, whatever the clock or Quiet says', () => {
    const run = stepInspection(stepInspection(undefined, gearsFixed), gearsFixed);
    expect(benchPhase(run, 0, false, 2400)).toBe(inspectPhase(1));
    expect(benchPhase(run, 99999, true, 2400)).toBe(inspectPhase(1));
  });
});

describe('inspect and test modes', () => {
  it('Inspect stops a test and starts at the first step; Test leaves the inspection', () => {
    const toy = gearsBroken;
    const testing = startTest(toy, 1000);
    expect(testing.mode).toBe('test');
    const first = stepInspection(testing, toy);
    expect(first).toMatchObject({ mode: 'inspect', step: 0 });
    const second = stepInspection(first, toy);
    expect(second).toMatchObject({ mode: 'inspect', step: 1 });
    const again = startTest(toy, 2000);
    expect(again).toMatchObject({ mode: 'test', startedAt: 2000 });
    expect(benchPhase(again, 2000 + 1200, false, 2400)).toBe(0.5);
    expect(stepInspection(again, toy)).toMatchObject({ mode: 'inspect', step: 0 });
  });

  it('starts over from a cleared bench, even when an edit restored the same set-up', () => {
    // The view clears the run on every edit, undo, reset and toy switch; a cleared run starts at step 0.
    const toy = faultyToy('rooster-bell');
    const restored = useTool(tighten(toy), 'screwdriver', 'pin').toy;
    expect(restored).toEqual(toy);
    expect(stepInspection(undefined, restored)).toMatchObject({ mode: 'inspect', step: 0 });
  });

  it('uses the same run the Test button would', () => {
    for (const toy of [gearsJammed, faultyToy('rooster-bell'), frogWith('tall')])
      expect(stepInspection(undefined, toy).result).toEqual(startTest(toy, 0).result);
  });
});

describe('the rig on the bench', () => {
  it('puts each mark on its part where it is drawn, clicked and ringed at that step', () => {
    for (const toy of [gearsFixed, gearsBroken, bellAt(1), frogWith('snail')]) {
      const run = runToy(toy);
      for (let step = 0; step < INSPECT_STEPS; step++) {
        const phase = inspectPhase(step);
        const stops = benchStops(toy, phase, run);
        for (const m of inspectionMarks(toy, run, phase)) {
          // Parts the player can pick up; fixed parts such as the crank or the hammer are not targets.
          const part = targets(toy, phase, run).find((t) => t.id === m.id && t.kind === 'part');
          if (!part) continue;
          expect(m).toMatchObject({ x: part.x, y: part.y });
          expect(stops.some((t) => t.id === m.id && t.x === m.x && t.y === m.y)).toBe(true);
          expect(hitTarget(toy, { x: m.x, y: m.y }, undefined, phase, run)?.id).toBe(m.id);
        }
      }
    }
  });

  it('labels every arrow in words, never colour alone, and marks the stop once', () => {
    const run = runToy(gearsBroken);
    const marks = inspectionMarks(gearsBroken, run, inspectPhase(0));
    expect(marks.filter((m) => m.state === 'stops')).toHaveLength(1);
    for (const m of marks) expect(m.label).toMatch(/turns|stops here|still/);
    const crank = marks.find((m) => m.id === 'crank')!;
    expect(crank).toMatchObject({
      state: 'moves',
      turn: 1,
      label: '1 crank gear: turns with crank',
    });
    const back = inspectionMarks(gearsBackwards, runToy(gearsBackwards), inspectPhase(0));
    expect(back.find((m) => m.id === 'bear')).toMatchObject({ turn: -1 });
  });

  it('names the inspected part in the bench label, for the toy and tool on the bench now', () => {
    const bell = faultyToy('rooster-bell');
    const run = runToy(bell);
    const marks = inspectionMarks(bell, run, inspectPhase(0));
    const rod = targets(bell, inspectPhase(0), run).find((t) => t.id === 'rod');
    expect(benchLabel(rod, 'hand', marks)).toContain(
      'link rod picked, inspecting: link rod: moves',
    );
    expect(benchLabel(rod, 'screwdriver', marks)).toContain('with the screwdriver');
    expect(benchLabel(rod, 'hand')).not.toContain('inspecting');
    // A frog's mark never names a part on another toy's bench.
    const frog = faultyToy('hopping-frog');
    const shaftMarks = inspectionMarks(frog, runToy(frog), inspectPhase(0));
    expect(benchLabel(rod, 'hand', shaftMarks)).not.toContain('inspecting');
  });
});

describe('the status line', () => {
  it('says where motion passes and where it stops, and wraps safely', () => {
    const insp = inspectToy(gearsBroken);
    const line = inspectionLine(insp, 0);
    expect(line).toMatch(
      /^Inspect step 1 of 8: motion passes the crank gear.* stops at the bear gear\./,
    );
    expect(inspectionLine(insp, INSPECT_STEPS)).toBe(line);
    expect(inspectionLine(inspectToy(gearsFixed), 3)).toContain('motion reaches the bear gear');
    expect(inspectionLine(inspectToy(gearsJammed), 0)).toContain('motion stops at the crank gear');
  });
});

describe('inspection changes nothing', () => {
  it('never moves parts, records a repair or touches storage, even when saves fail', () => {
    let writes = 0;
    const storage = {
      getItem: () => null,
      setItem: () => {
        writes++;
        throw new Error('quota');
      },
    };
    const store = createRepairsStore(storage);
    for (const toy of [gearsFixed, bellAt(2), frogWith('snail'), faultyToy('hopping-frog')]) {
      const before = JSON.stringify(toy);
      let run = stepInspection(undefined, toy);
      for (let i = 0; i < 3 * INSPECT_STEPS; i++) {
        run = stepInspection(run, toy);
        inspectionMarks(toy, run.result, inspectPhase(i));
        inspectionLine(inspectToy(toy, run.result), i);
      }
      expect(JSON.stringify(toy)).toBe(before);
    }
    expect(writes).toBe(0);
    expect(store.load()).toEqual(NO_REPAIRS);
    expect(store.save(NO_REPAIRS)).toBe(false);
    expect(REPAIRS_KEY).not.toMatch(/score/);
  });
});
