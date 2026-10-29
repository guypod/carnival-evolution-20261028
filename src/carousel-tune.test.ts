import { describe, expect, it, vi } from 'vitest';
import {
  STARTER_TUNE,
  TUNE_KEY,
  blankTune,
  clearTune,
  createTunePlayer,
  createTuneStore,
  createTuneVoices,
  describeStep,
  parseTune,
  setLength,
  setTempo,
  stepMs,
  toggleStep,
  tracksAt,
  type TuneTimers,
  type VoiceContext,
} from './carousel-tune';

function fakeTimers() {
  let next = 1;
  const live = new Map<number, () => void>();
  const timers: TuneTimers = {
    setInterval(callback) {
      live.set(next, callback);
      return next++;
    },
    clearInterval(id) {
      live.delete(id);
    },
  };
  return { timers, live, fire: () => [...live.values()].forEach((cb) => cb()) };
}

describe('editing a tune', () => {
  it('starts with a pattern and offers a blank canvas', () => {
    expect(tracksAt(STARTER_TUNE, 0)).toEqual(['bells', 'bass', 'drum']);
    const blank = blankTune(16);
    expect(blank.length).toBe(16);
    expect(Object.values(blank.steps).every((r) => r.length === 16 && r.every((s) => !s))).toBe(
      true,
    );
  });

  it('toggles steps and ignores steps outside the tune', () => {
    const tune = toggleStep(blankTune(), 'organ', 3);
    expect(tune.steps.organ[3]).toBe(true);
    expect(toggleStep(tune, 'organ', 3).steps.organ[3]).toBe(false);
    expect(toggleStep(tune, 'organ', 8)).toBe(tune);
  });

  it('keeps the first steps when the length changes', () => {
    const long = setLength(STARTER_TUNE, 16);
    expect(long.steps.drum.slice(0, 8)).toEqual(STARTER_TUNE.steps.drum);
    expect(long.steps.drum.slice(8).every((s) => !s)).toBe(true);
    expect(setLength(long, 8).steps.bells).toEqual(STARTER_TUNE.steps.bells);
  });

  it('sets tempo and clears without changing length or tempo', () => {
    const fast = setTempo(setLength(STARTER_TUNE, 16), 150);
    expect(stepMs(fast.tempo)).toBe(200);
    const cleared = clearTune(fast);
    expect(cleared).toEqual(blankTune(16, 150));
  });

  it('describes a step in words', () => {
    expect(describeStep(STARTER_TUNE, 0)).toBe('Step 1 of 8: Bells, Bass, Drum');
    expect(describeStep(STARTER_TUNE, 1)).toBe('Step 2 of 8: rest');
  });
});

describe('saving a tune', () => {
  it('round-trips through storage', () => {
    const data = new Map<string, string>();
    const store = createTuneStore({
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => void data.set(k, v),
    });
    const tune = toggleStep(setLength(STARTER_TUNE, 16), 'bass', 12);
    expect(store.save(tune)).toBe(true);
    expect(store.load()).toEqual(tune);
  });

  it('rejects malformed saves', () => {
    expect(parseTune('not json')).toBeUndefined();
    expect(parseTune(JSON.stringify({ ...STARTER_TUNE, tempo: 99 }))).toBeUndefined();
    expect(parseTune(JSON.stringify({ ...STARTER_TUNE, length: 12 }))).toBeUndefined();
    const short = { ...STARTER_TUNE, steps: { ...STARTER_TUNE.steps, bass: [true] } };
    expect(parseTune(JSON.stringify(short))).toBeUndefined();
    const wrong = { ...STARTER_TUNE, steps: { ...STARTER_TUNE.steps, drum: Array(8).fill(1) } };
    expect(parseTune(JSON.stringify(wrong))).toBeUndefined();
  });

  it('reports a failed save and survives a throwing store', () => {
    expect(createTuneStore(undefined).save(STARTER_TUNE)).toBe(false);
    const broken = createTuneStore({
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
    });
    expect(broken.load()).toBeUndefined();
    expect(broken.save(STARTER_TUNE)).toBe(false);
    expect(TUNE_KEY).toBe('carnival:carousel-tune');
  });
});

describe('the player', () => {
  it('steps through and wraps around', () => {
    const { timers, fire } = fakeTimers();
    const steps: number[] = [];
    const player = createTunePlayer(
      () => STARTER_TUNE,
      (s) => steps.push(s),
      timers,
    );
    player.play();
    for (let i = 0; i < 8; i++) fire();
    expect(steps).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 0]);
  });

  it('never runs two timers when played again, and stop clears it', () => {
    const { timers, live } = fakeTimers();
    const player = createTunePlayer(
      () => STARTER_TUNE,
      () => {},
      timers,
    );
    player.play();
    player.play();
    player.play();
    expect(live.size).toBe(1);
    player.stop();
    expect(live.size).toBe(0);
    expect(player.isPlaying()).toBe(false);
  });

  it('follows a tempo change with one timer', () => {
    const { timers, live } = fakeTimers();
    const calls: number[] = [];
    let tune = STARTER_TUNE;
    const player = createTunePlayer(
      () => tune,
      () => {},
      {
        setInterval: (cb, ms) => (calls.push(ms), timers.setInterval(cb, ms)),
        clearInterval: timers.clearInterval,
      },
    );
    player.play();
    tune = setTempo(tune, 90);
    [...live.values()][0]();
    expect(calls).toEqual([250, stepMs(90)]);
    expect(live.size).toBe(1);
  });
});

function fakeContext() {
  const started: string[] = [];
  const disconnected = vi.fn();
  const context: VoiceContext = {
    currentTime: 0,
    destination: {},
    state: 'running',
    createOscillator: () => {
      const osc = {
        type: '',
        frequency: { value: 0 },
        connect: () => undefined,
        start: () => void started.push(osc.type),
        stop: () => {},
      };
      return osc;
    },
    createGain: () => ({
      gain: {
        value: 0,
        setValueAtTime: () => undefined,
        exponentialRampToValueAtTime: () => undefined,
      },
      connect: () => undefined,
      disconnect: disconnected,
    }),
    resume: vi.fn(() => Promise.resolve()),
    suspend: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
  };
  return { context, started, disconnected };
}

describe('the voices', () => {
  it('makes no sound until enabled, and none after silence', () => {
    const { context, started } = fakeContext();
    const create = vi.fn(() => context);
    const voices = createTuneVoices(create);
    voices.sound(['bells']);
    expect(create).not.toHaveBeenCalled();
    expect(voices.enable()).toBe(true);
    voices.sound(['bells', 'drum']);
    expect(started).toEqual(['sine', 'sawtooth']);
    voices.silence();
    voices.sound(['bass']);
    expect(started).toHaveLength(2);
    expect(context.suspend).toHaveBeenCalled();
  });

  it('falls back quietly when the browser has no audio', () => {
    const voices = createTuneVoices(() => undefined);
    expect(voices.enable()).toBe(false);
    expect(voices.enabled()).toBe(false);
    voices.sound(['bells']);
    const throwing = createTuneVoices(() => {
      throw new Error('no audio');
    });
    expect(throwing.enable()).toBe(false);
  });

  it('makes no voices while the audio clock is not running', () => {
    const { context, started } = fakeContext();
    const voices = createTuneVoices(() => context);
    voices.enable();
    context.state = 'suspended';
    voices.sound(['bells', 'organ', 'bass', 'drum']);
    expect(started).toHaveLength(0);
    context.state = 'interrupted';
    voices.sound(['bells']);
    expect(started).toHaveLength(0);
    context.state = 'running';
    voices.sound(['bells']);
    expect(started).toEqual(['sine']);
  });

  it('cuts unfinished notes on silence, so they do not return on the next enable', () => {
    const { context, started, disconnected } = fakeContext();
    const voices = createTuneVoices(() => context);
    voices.enable();
    voices.sound(['bells', 'drum']);
    voices.silence();
    expect(disconnected).toHaveBeenCalledTimes(2);
    voices.enable();
    expect(started).toEqual(['sine', 'sawtooth']);
    voices.silence();
    expect(disconnected).toHaveBeenCalledTimes(2);
  });

  it('turns sound back off and reports it when the browser refuses to resume', async () => {
    const { context } = fakeContext();
    context.resume = vi.fn(() => Promise.reject(new Error('not allowed')));
    const voices = createTuneVoices(() => context);
    const failed = vi.fn();
    expect(voices.enable(failed)).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(failed).toHaveBeenCalledOnce();
    expect(voices.enabled()).toBe(false);
    context.resume = vi.fn(() => Promise.resolve());
    expect(voices.enable(failed)).toBe(true);
    expect(context.resume).toHaveBeenCalledOnce();
    expect(voices.enabled()).toBe(true);
  });

  it('stays off and reports nothing when disposed while resume is pending', async () => {
    const { context, started } = fakeContext();
    let refuse: (error: Error) => void = () => {};
    context.resume = vi.fn(() => new Promise<void>((_resolve, reject) => (refuse = reject)));
    const voices = createTuneVoices(() => context);
    const failed = vi.fn();
    voices.enable(failed);
    voices.dispose();
    refuse(new Error('closed'));
    await Promise.resolve();
    await Promise.resolve();
    expect(failed).not.toHaveBeenCalled();
    expect(voices.enabled()).toBe(false);
    voices.sound(['bells']);
    expect(started).toHaveLength(0);
    expect(context.close).toHaveBeenCalled();
  });

  it('closes the context on dispose', () => {
    const { context } = fakeContext();
    const voices = createTuneVoices(() => context);
    voices.enable();
    voices.dispose();
    expect(context.close).toHaveBeenCalled();
    expect(voices.enabled()).toBe(false);
  });
});
