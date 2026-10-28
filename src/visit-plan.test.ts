import { afterEach, describe, expect, it, vi } from 'vitest';
import { registry } from './games';
import {
  VISIT_MOODS,
  advanceVisit,
  chooseVisit,
  currentStop,
  exitVisit,
  restartVisit,
  visitFinished,
  visitProgress,
} from './visit-plan';

describe('visit plan', () => {
  it('offers three moods of three stops, each with a reason', () => {
    expect(VISIT_MOODS).toHaveLength(3);
    for (const mood of VISIT_MOODS) {
      expect(mood.stops).toHaveLength(3);
      for (const stop of mood.stops) expect(stop.why.length).toBeGreaterThan(0);
    }
  });

  it('only names booths that are registered, with their registered names', () => {
    for (const stop of VISIT_MOODS.flatMap((mood) => mood.stops)) {
      if (stop.kind === 'booth') expect(registry.get(stop.gameId)?.name).toBe(stop.name);
    }
  });

  it('only names landmarks on the discovery trail', () => {
    const ids = ['entrance', 'carousel', 'ferris-wheel'];
    for (const stop of VISIT_MOODS.flatMap((mood) => mood.stops)) {
      if (stop.kind === 'landmark') expect(ids).toContain(stop.landmarkId);
    }
  });

  it('chooses a mood at its first stop and rejects unknown moods', () => {
    const plan = chooseVisit('reflex')!;
    expect(plan).toEqual({ moodId: 'reflex', index: 0 });
    expect(currentStop(plan)).toMatchObject({ gameId: 'mole-mayhem' });
    expect(visitProgress(plan)).toBe('Reflex visit: stop 1 of 3.');
    expect(chooseVisit('nope')).toBeUndefined();
  });

  it('advances stop by stop and stays finished', () => {
    let plan = chooseVisit('explorer')!;
    plan = advanceVisit(plan);
    expect(currentStop(plan)).toMatchObject({ gameId: 'mini-putt' });
    plan = advanceVisit(advanceVisit(plan));
    expect(visitFinished(plan)).toBe(true);
    expect(currentStop(plan)).toBeUndefined();
    expect(advanceVisit(plan)).toEqual(plan);
    expect(visitProgress(plan)).toBe('Explorer visit complete: all 3 stops done.');
  });

  it('restarts at the first stop and exits to no plan', () => {
    const plan = advanceVisit(advanceVisit(chooseVisit('relaxed')!));
    expect(restartVisit(plan)).toEqual({ moodId: 'relaxed', index: 0 });
    expect(exitVisit()).toBeUndefined();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('never touches storage, so scores and stamps are untouched', () => {
    const storage = { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn() };
    vi.stubGlobal('localStorage', storage);
    let plan = chooseVisit('reflex')!;
    plan = advanceVisit(restartVisit(advanceVisit(plan)));
    currentStop(plan);
    visitProgress(plan);
    exitVisit();
    for (const method of Object.values(storage)) expect(method).not.toHaveBeenCalled();
  });
});
