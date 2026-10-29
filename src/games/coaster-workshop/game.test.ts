import { describe, expect, it } from 'vitest';
import {
  MAX_SPEED,
  MAX_Y,
  MIN_Y,
  createRun,
  createWorkshop,
  adjust,
  nudge,
  parseLayout,
  pathLength,
  resetLayout,
  scoreFor,
  serializeLayout,
  simulate,
  simulateSamples,
  starterLayout,
  stepRun,
  trackPath,
  undo,
} from './game';

describe('coaster workshop', () => {
  it('builds the same finite track from the same layout', () => {
    const a = trackPath(starterLayout());
    const b = trackPath(starterLayout());
    expect(a).toEqual(b);
    expect(a.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
    expect(pathLength(a)).toBeGreaterThan(0);
  });

  it('runs the starter layout to a safe finish, the same way every time', () => {
    const run = simulate(starterLayout());
    expect(run.outcome).toBe('complete');
    expect(run.peak).toBeLessThanOrEqual(MAX_SPEED);
    expect(simulate(starterLayout())).toEqual(run);
    expect(scoreFor(run)).toBeGreaterThan(0);
  });

  it('stalls when a hill is raised too high', () => {
    const run = simulate(nudge(starterLayout(), 2, -300));
    expect(run.outcome).toBe('stall');
    expect(run.at).toBeDefined();
    expect(scoreFor(run)).toBe(0);
  });

  it('goes too fast on a long steep drop', () => {
    const points = starterLayout().map((p, i) => ({ x: p.x, y: i === 0 ? MIN_Y : MAX_Y }));
    const run = simulate(points);
    expect(run.outcome).toBe('too-fast');
    expect(scoreFor(run)).toBe(0);
  });

  it('keeps points inside the frame', () => {
    expect(nudge(starterLayout(), 0, -9999)[0].y).toBe(MIN_Y);
    expect(nudge(starterLayout(), 0, 9999)[0].y).toBe(MAX_Y);
    expect(nudge(starterLayout(), 0, NaN)[0].y).toBe(MAX_Y);
  });

  it('stops stepping once a run has an outcome', () => {
    const path = trackPath(starterLayout());
    const done = { ...createRun(), outcome: 'stall' as const };
    expect(stepRun(done, path)).toBe(done);
  });

  it('undoes an edit and resets only the layout', () => {
    const w = createWorkshop();
    adjust(w, -20);
    expect(w.points).not.toEqual(starterLayout());
    undo(w);
    expect(w.points).toEqual(starterLayout());
    adjust(w, 30);
    resetLayout(w);
    expect(w.points).toEqual(starterLayout());
    undo(w);
    expect(w.points[w.selected].y).toBe(starterLayout()[w.selected].y + 30);
  });

  it('saves and resumes a layout, and rejects bad saves', () => {
    const points = nudge(starterLayout(), 3, -40);
    expect(parseLayout(serializeLayout(points))).toEqual(points);
    expect(parseLayout('not json')).toBeUndefined();
    expect(parseLayout('[1,2]')).toBeUndefined();
    expect(parseLayout('[1,2,3,4,5,6,"x"]')).toBeUndefined();
    expect(parseLayout(null)).toBeUndefined();
  });

  it('gives static samples for reduced motion', () => {
    const samples = simulateSamples(starterLayout());
    expect(samples.length).toBeGreaterThan(0);
    expect(samples.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });
});
