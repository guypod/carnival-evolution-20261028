import { describe, expect, it, vi } from 'vitest';
import {
  COASTER_KEY,
  COASTER_SAVE_MAX,
  GRAB_RADIUS,
  MAX_SPEED,
  MAX_Y,
  MIN_Y,
  STEP,
  advancePlayback,
  createCoasterStore,
  createRun,
  createWorkshop,
  adjust,
  dragTo,
  keyAction,
  nudge,
  parseLayout,
  pathLength,
  pickPoint,
  press,
  release,
  resetLayout,
  simulate,
  simulateSamples,
  startCoasterWorkshop,
  startTest,
  starterLayout,
  stepOnce,
  stepRun,
  stopTest,
  trackPath,
  undo,
  type CoasterCanvas,
  type CoasterHost,
  type CoasterOptions,
} from './coaster-workshop';
import type { MotionPreference } from './midway/motion';

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
  });

  it('stalls when a hill is raised too high', () => {
    const run = simulate(nudge(starterLayout(), 2, -300));
    expect(run.outcome).toBe('stall');
    expect(run.at).toBeDefined();
  });

  it('goes too fast on a long steep drop', () => {
    const points = starterLayout().map((p, i) => ({ x: p.x, y: i === 0 ? MIN_Y : MAX_Y }));
    const run = simulate(points);
    expect(run.outcome).toBe('too-fast');
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

  it('gives static samples for reduced motion', () => {
    const samples = simulateSamples(starterLayout());
    expect(samples.length).toBeGreaterThan(0);
    expect(samples.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });

  it('picks the point nearest a press and grabs it only when close', () => {
    const points = starterLayout();
    expect(pickPoint(points, { x: points[3].x + 5, y: points[3].y })).toEqual({
      index: 3,
      grab: true,
    });
    expect(pickPoint(points, { x: points[3].x, y: points[3].y + GRAB_RADIUS + 1 })).toEqual({
      index: 3,
      grab: false,
    });
    expect(pickPoint(points, { x: -100, y: 0 }).index).toBe(0);
  });

  it('drags a point with one undo step, and a plain click changes nothing', () => {
    const w = createWorkshop();
    const p = w.points[2];
    expect(press(w, { x: p.x, y: p.y + 100 })).toBe(false);
    expect(w.selected).toBe(2);
    dragTo(w, 100);
    expect(w.points).toEqual(starterLayout());
    expect(w.history).toHaveLength(0);
    expect(press(w, p)).toBe(true);
    dragTo(w, p.y - 20);
    dragTo(w, p.y - 40);
    expect(w.points[2].y).toBe(p.y - 40);
    expect(w.history).toHaveLength(1);
    release(w);
    dragTo(w, MIN_Y);
    expect(w.points[2].y).toBe(p.y - 40);
    undo(w);
    expect(w.points).toEqual(starterLayout());
  });
});

describe('coaster test runs', () => {
  it('shows a Quiet test as an outcome with static dots worked out once', () => {
    const w = createWorkshop();
    startTest(w, true);
    expect(w.run?.outcome).toBe('complete');
    expect(w.samples).toEqual(simulateSamples(w.points));
    startTest(w, false);
    expect(w.run?.outcome).toBeUndefined();
    expect(w.samples).toBeUndefined();
  });

  it('plays back by elapsed time, the same at any frame rate', () => {
    const path = trackPath(starterLayout());
    const length = pathLength(path);
    const play = (fps: number) => {
      const w = createWorkshop();
      startTest(w, false);
      let carry = 0;
      for (let i = 0; i < fps; i++) carry = advancePlayback(w, path, length, 1 / fps, carry);
      return w.run!.time;
    };
    expect(play(30)).toBeCloseTo(1, 1);
    expect(play(120)).toBeCloseTo(play(30), 1);
    const paused = createWorkshop();
    startTest(paused, false);
    paused.paused = true;
    expect(advancePlayback(paused, path, length, 1, 0)).toBe(0);
    expect(paused.run!.time).toBe(0);
  });

  it('steps one fixed tick paused, and stays put once the test has ended', () => {
    const path = trackPath(starterLayout());
    const w = createWorkshop();
    stepOnce(w, path);
    expect(w.paused).toBe(true);
    expect(w.run!.time).toBeCloseTo(STEP);
    startTest(w, true);
    const ended = w.run;
    stepOnce(w, path);
    expect(w.run).toBe(ended);
  });

  it('stops a running test first, and only then has nothing to stop', () => {
    const w = createWorkshop();
    startTest(w, false);
    expect(stopTest(w)).toBe(true);
    expect(w.run).toBeUndefined();
    expect(stopTest(w)).toBe(false);
  });

  it('maps keys to actions and leaves other keys alone', () => {
    expect(keyAction('T')).toBe('test');
    expect(keyAction('Escape')).toBe('escape');
    expect(keyAction('ArrowUp')).toBe('up');
    expect(keyAction('x')).toBeUndefined();
  });
});

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

describe('coaster save', () => {
  it('keeps a layout across a reload', () => {
    const storage = memoryStorage();
    const points = nudge(starterLayout(), 3, -40);
    expect(createCoasterStore(storage).save(points)).toBe(true);
    expect(createCoasterStore(storage).load()).toEqual(points);
  });

  it('reads malformed, wrong-sized or oversized saves as none', () => {
    const storage = memoryStorage();
    const store = createCoasterStore(storage);
    for (const raw of [
      'not json',
      '[1,2]',
      '[1,2,3,4,5,6,"x"]',
      '{"y":[1,2,3,4,5,6,7]}',
      '[1,2,3,4,5,6,null]',
      `[${' '.repeat(COASTER_SAVE_MAX)}1,2,3,4,5,6,7]`,
    ]) {
      storage.data.set(COASTER_KEY, raw);
      expect(store.load()).toBeUndefined();
    }
  });

  it('accepts only seven finite heights as a layout', () => {
    expect(parseLayout(starterLayout().map((p) => p.y))).toEqual(starterLayout());
    expect(parseLayout([1, 2, 3, 4, 5, 6, Infinity])).toBeUndefined();
    expect(parseLayout('1234567')).toBeUndefined();
  });

  it('clamps saved heights back inside the frame', () => {
    const storage = memoryStorage();
    storage.data.set(COASTER_KEY, '[-9999,9999,200,200,200,200,200]');
    const points = createCoasterStore(storage).load()!;
    expect(points[0].y).toBe(MIN_Y);
    expect(points[1].y).toBe(MAX_Y);
  });

  it('reports a failed write and a failed read without throwing', () => {
    const store = createCoasterStore({
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
    });
    expect(store.save(starterLayout())).toBe(false);
    expect(store.load()).toBeUndefined();
  });
});

type Listener = (event: Event) => void;

class FakeTarget extends EventTarget {
  listeners = 0;
  addEventListener(type: string, listener: Listener) {
    this.listeners++;
    super.addEventListener(type, listener);
  }
  removeEventListener(type: string, listener: Listener) {
    this.listeners--;
    super.removeEventListener(type, listener);
  }
}

function fakeCanvas(): CoasterCanvas & FakeTarget {
  return Object.assign(new FakeTarget(), {
    width: 0,
    height: 0,
    getContext: () => null,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 500 }),
  });
}

function fakeHost(systemReduces = false) {
  const frames = new Map<number, (now: number) => void>();
  let next = 1;
  let mediaListeners = 0;
  let onMedia: ((event: { matches: boolean }) => void) | undefined;
  const host = Object.assign(new FakeTarget(), {
    requestAnimationFrame: (callback: (now: number) => void) => {
      frames.set(next, callback);
      return next++;
    },
    cancelAnimationFrame: (id: number) => void frames.delete(id),
    matchMedia: () => ({
      matches: systemReduces,
      addEventListener: (_: 'change', l: (event: { matches: boolean }) => void) => {
        mediaListeners++;
        onMedia = l;
      },
      removeEventListener: () => void mediaListeners--,
    }),
  }) as CoasterHost & FakeTarget;
  return {
    host,
    frames,
    mediaListeners: () => mediaListeners,
    setSystem: (matches: boolean) => onMedia?.({ matches }),
    tick(now: number) {
      const pending = [...frames.entries()];
      frames.clear();
      for (const [, callback] of pending) callback(now);
    },
  };
}

function start(overrides: Partial<CoasterOptions> = {}, systemReduces = false) {
  const canvas = fakeCanvas();
  const fake = fakeHost(systemReduces);
  const storage = memoryStorage();
  const statuses: string[] = [];
  const onExit = vi.fn();
  const session = startCoasterWorkshop(canvas, {
    host: fake.host,
    store: createCoasterStore(storage),
    preference: () => 'system',
    onExit,
    onStatus: (status) => statuses.push(status),
    ...overrides,
  });
  const key = (k: string) =>
    fake.host.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key: k }));
  return { canvas, fake, storage, statuses, onExit, session, key };
}

describe('coaster workshop session', () => {
  it('removes every listener and frame when stopped, and ignores keys after', () => {
    const { canvas, fake, session, key, statuses } = start();
    key('t');
    expect(fake.frames.size).toBe(1);
    expect(canvas.listeners + fake.host.listeners).toBeGreaterThan(0);
    expect(fake.mediaListeners()).toBe(1);
    session.stop();
    session.stop();
    expect(fake.frames.size).toBe(0);
    expect(canvas.listeners).toBe(0);
    expect(fake.host.listeners).toBe(0);
    expect(fake.mediaListeners()).toBe(0);
    const seen = statuses.length;
    session.act('test');
    expect(statuses.length).toBe(seen);
  });

  it('honours the Quiet midway choice even when the system allows motion', () => {
    let preference: MotionPreference = 'quiet';
    const { fake, key, statuses } = start({ preference: () => preference });
    key('t');
    expect(fake.frames.size).toBe(0);
    expect(statuses.at(-1)).toContain('Safe finish');
    preference = 'system';
    key('t');
    expect(fake.frames.size).toBe(1);
  });

  it('follows the system reduced-motion setting, including mid-test', () => {
    const quiet = start({}, true);
    quiet.key('t');
    expect(quiet.fake.frames.size).toBe(0);
    expect(quiet.statuses.at(-1)).toContain('Safe finish');

    const lively = start();
    lively.key('t');
    lively.fake.tick(0);
    lively.fake.setSystem(true);
    expect(lively.statuses.at(-1)).toContain('Safe finish');
  });

  it('only asks for frames while the train moves', () => {
    const { fake, key, statuses } = start();
    key('t');
    for (let t = 0; t <= 60_000 && fake.frames.size; t += 16) fake.tick(t);
    expect(fake.frames.size).toBe(0);
    expect(statuses.at(-1)).toContain('Safe finish');
  });

  it('stops a test on Escape and leaves only when nothing is running', () => {
    const { fake, key, onExit, statuses } = start();
    key('t');
    key('Escape');
    expect(onExit).not.toHaveBeenCalled();
    expect(fake.frames.size).toBe(0);
    expect(statuses.at(-1)).toContain('press T to test');
    key('Escape');
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('saves every edit and resumes it after a reload', () => {
    const first = start();
    first.key('ArrowDown');
    first.session.stop();
    const saved = first.storage.data.get(COASTER_KEY);
    expect(saved).toBeDefined();
    const store = createCoasterStore(first.storage);
    expect(store.load()![1].y).toBe(starterLayout()[1].y + 10);
  });

  it('keeps working when the browser will not save', () => {
    const saves: boolean[] = [];
    const statuses: string[] = [];
    const { key } = start({
      store: { load: () => undefined, save: () => false },
      onStatus: (status, saved) => {
        statuses.push(status);
        saves.push(saved);
      },
    });
    key('ArrowUp');
    expect(saves.at(-1)).toBe(false);
    key('t');
    key('s');
    expect(statuses.at(-1)).toContain('paused');
  });

  it('starts from a broken save as the working starter', () => {
    const storage = memoryStorage();
    storage.data.set(COASTER_KEY, '{oops');
    const statuses: string[] = [];
    startCoasterWorkshop(fakeCanvas(), {
      host: fakeHost(true).host,
      store: createCoasterStore(storage),
      preference: () => 'system',
      onExit: () => {},
      onStatus: (s) => statuses.push(s),
    }).act('test');
    expect(statuses.at(-1)).toContain('Safe finish');
  });

  it('never records a score', () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { setItem, getItem: () => null });
    const { key, fake } = start({}, true);
    key('t');
    key('s');
    fake.tick(0);
    expect(setItem).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
