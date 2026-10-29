/**
 * The carousel tune workshop: a small step sequencer. Four made-up instruments,
 * eight or sixteen steps, three tempos. Sound is synthesized in the browser
 * with Web Audio, starts only from a click and stops when the page hides or
 * the visitor leaves. Every step is drawn, so the tune makes sense muted.
 */

export const TUNE_TRACKS = ['bells', 'organ', 'bass', 'drum'] as const;
export type TuneTrack = (typeof TUNE_TRACKS)[number];
export const TUNE_TRACK_NAMES: Record<TuneTrack, string> = {
  bells: '🔔 Bells',
  organ: '🎹 Organ',
  bass: '🎻 Bass',
  drum: '🥁 Drum',
};
export const TUNE_LENGTHS = [8, 16] as const;
export type TuneLength = (typeof TUNE_LENGTHS)[number];
/** Beats per minute; each step is an eighth note. */
export const TUNE_TEMPOS = [90, 120, 150] as const;
export type TuneTempo = (typeof TUNE_TEMPOS)[number];

export interface Tune {
  length: TuneLength;
  tempo: TuneTempo;
  /** One row of on/off steps per track, each `length` long. */
  steps: Record<TuneTrack, boolean[]>;
}

const row = (length: number, on: readonly number[] = []) =>
  Array.from({ length }, (_, i) => on.includes(i));

export function blankTune(length: TuneLength = 8, tempo: TuneTempo = 120): Tune {
  return {
    length,
    tempo,
    steps: { bells: row(length), organ: row(length), bass: row(length), drum: row(length) },
  };
}

/** A cheerful oom-pah to start from. */
export const STARTER_TUNE: Tune = {
  length: 8,
  tempo: 120,
  steps: {
    bells: row(8, [0, 3, 6]),
    organ: row(8, [2, 6]),
    bass: row(8, [0, 4]),
    drum: row(8, [0, 2, 4, 6]),
  },
};

export function toggleStep(tune: Tune, track: TuneTrack, step: number): Tune {
  if (!TUNE_TRACKS.includes(track) || !Number.isInteger(step) || step < 0 || step >= tune.length)
    return tune;
  const next = [...tune.steps[track]];
  next[step] = !next[step];
  return { ...tune, steps: { ...tune.steps, [track]: next } };
}

/** Changes the length, keeping the first steps and padding with rests. */
export function setLength(tune: Tune, length: TuneLength): Tune {
  if (!TUNE_LENGTHS.includes(length) || length === tune.length) return tune;
  const steps = {} as Record<TuneTrack, boolean[]>;
  for (const track of TUNE_TRACKS) {
    steps[track] = Array.from({ length }, (_, i) => tune.steps[track][i] ?? false);
  }
  return { ...tune, length, steps };
}

export function setTempo(tune: Tune, tempo: TuneTempo): Tune {
  return TUNE_TEMPOS.includes(tempo) ? { ...tune, tempo } : tune;
}

export function clearTune(tune: Tune): Tune {
  return blankTune(tune.length, tune.tempo);
}

/** The tracks that sound on one step. */
export function tracksAt(tune: Tune, step: number): TuneTrack[] {
  return TUNE_TRACKS.filter((track) => tune.steps[track][step]);
}

/** Milliseconds per step: an eighth note at the tune's tempo. */
export function stepMs(tempo: TuneTempo): number {
  return 60000 / tempo / 2;
}

/** A short description for screen readers and muted listeners. */
export function describeStep(tune: Tune, step: number): string {
  const on = tracksAt(tune, step).map((track) => TUNE_TRACK_NAMES[track].split(' ')[1]);
  return `Step ${step + 1} of ${tune.length}: ${on.length > 0 ? on.join(', ') : 'rest'}`;
}

/** Reads a saved tune, or undefined when it is missing or not a valid tune. */
export function parseTune(raw: string | null): Tune | undefined {
  if (!raw) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;
  if (!TUNE_LENGTHS.includes(v.length as TuneLength)) return undefined;
  if (!TUNE_TEMPOS.includes(v.tempo as TuneTempo)) return undefined;
  const length = v.length as TuneLength;
  const rawSteps = v.steps as Record<string, unknown> | null;
  if (!rawSteps || typeof rawSteps !== 'object') return undefined;
  const steps = {} as Record<TuneTrack, boolean[]>;
  for (const track of TUNE_TRACKS) {
    const r = rawSteps[track];
    if (!Array.isArray(r) || r.length !== length || !r.every((s) => typeof s === 'boolean'))
      return undefined;
    steps[track] = [...r];
  }
  return { length, tempo: v.tempo as TuneTempo, steps };
}

export const TUNE_KEY = 'carnival:carousel-tune';

export interface TuneStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Keeps one saved tune in this browser. Nothing is uploaded. */
export function createTuneStore(storage: TuneStorage | undefined) {
  return {
    load(): Tune | undefined {
      try {
        return parseTune(storage?.getItem(TUNE_KEY) ?? null);
      } catch {
        return undefined;
      }
    },
    save(tune: Tune): boolean {
      try {
        if (!storage) return false;
        storage.setItem(TUNE_KEY, JSON.stringify(tune));
        return true;
      } catch {
        return false;
      }
    },
  };
}

function browserStorage(): TuneStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export const tuneStore = createTuneStore(
  typeof window === 'undefined' ? undefined : browserStorage(),
);

/** Timers the player uses, so tests can drive it by hand. */
export interface TuneTimers {
  setInterval(callback: () => void, ms: number): number;
  clearInterval(id: number): void;
}

export interface TunePlayer {
  /** Starts from step one. Calling it while playing restarts without a second timer. */
  play(): void;
  stop(): void;
  isPlaying(): boolean;
}

/**
 * Steps through the tune. `onStep` gets each step and the tracks on it; the
 * page draws the playhead and, when audio is on, sounds the tracks. `getTune`
 * is read every step, so edits while playing are heard at once. Only one
 * interval ever runs, and `stop` clears it.
 */
export function createTunePlayer(
  getTune: () => Tune,
  onStep: (step: number, tracks: TuneTrack[]) => void,
  timers: TuneTimers,
): TunePlayer {
  let timer: number | undefined;
  let step = 0;
  let tempo: TuneTempo | undefined;

  const tick = () => {
    const tune = getTune();
    if (step >= tune.length) step = 0;
    onStep(step, tracksAt(tune, step));
    step = (step + 1) % tune.length;
    if (tune.tempo !== tempo) schedule(tune.tempo);
  };
  const schedule = (next: TuneTempo) => {
    if (timer !== undefined) timers.clearInterval(timer);
    tempo = next;
    timer = timers.setInterval(tick, stepMs(next));
  };

  const stop = () => {
    if (timer !== undefined) timers.clearInterval(timer);
    timer = undefined;
    tempo = undefined;
    step = 0;
  };

  return {
    play() {
      stop();
      schedule(getTune().tempo);
      tick();
    },
    stop,
    isPlaying: () => timer !== undefined,
  };
}

/** The parts of Web Audio the voices use, so tests can pass a fake. */
export interface VoiceContext {
  currentTime: number;
  destination: unknown;
  state: string;
  createOscillator(): {
    type: string;
    frequency: { value: number };
    connect(node: unknown): unknown;
    start(when?: number): void;
    stop(when?: number): void;
  };
  createGain(): {
    gain: {
      value: number;
      setValueAtTime(v: number, t: number): unknown;
      exponentialRampToValueAtTime(v: number, t: number): unknown;
    };
    connect(node: unknown): unknown;
    disconnect(): void;
  };
  resume(): Promise<void>;
  suspend(): Promise<void>;
  close(): Promise<void>;
}

/** Each instrument's waveform, pitch and length, so they sound distinct. */
export const TUNE_VOICES: Record<TuneTrack, { wave: string; hz: number; seconds: number }> = {
  bells: { wave: 'sine', hz: 1046.5, seconds: 0.4 },
  organ: { wave: 'square', hz: 523.25, seconds: 0.2 },
  bass: { wave: 'triangle', hz: 130.81, seconds: 0.25 },
  drum: { wave: 'sawtooth', hz: 70, seconds: 0.08 },
};

/** Kept soft, below the loudest booth sounds. */
export const TUNE_GAIN = 0.08;

export interface TuneVoices {
  /**
   * Opens audio. Call it from a click. Returns false when audio is not available.
   * `onFailed` runs if the browser later refuses to resume, after sound is off again.
   */
  enable(onFailed?: () => void): boolean;
  /** Plays nothing while the audio clock is not running, so voices never pile up. */
  sound(tracks: TuneTrack[]): void;
  /** Cuts any unfinished notes and suspends audio; nothing sounds until `enable` again. */
  silence(): void;
  enabled(): boolean;
  dispose(): void;
}

/**
 * Synthesized voices. `createContext` is only called on the first `enable`,
 * so nothing touches audio until someone asks for it.
 */
export function createTuneVoices(createContext: () => VoiceContext | undefined): TuneVoices {
  let context: VoiceContext | undefined;
  let on = false;
  let playing: {
    oscillator: { stop(when?: number): void };
    gain: { disconnect(): void };
    end: number;
  }[] = [];
  const cut = () => {
    for (const voice of playing) {
      try {
        voice.oscillator.stop();
      } catch {
        // already stopped
      }
      voice.gain.disconnect();
    }
    playing = [];
  };
  return {
    enable(onFailed) {
      if (!context) {
        try {
          context = createContext();
        } catch {
          context = undefined;
        }
        if (!context) return false;
      }
      on = true;
      context.resume().catch(() => {
        on = false;
        onFailed?.();
      });
      return true;
    },
    sound(tracks) {
      if (!on || !context || context.state !== 'running') return;
      const now = context.currentTime;
      playing = playing.filter((voice) => voice.end > now);
      for (const track of tracks) {
        const voice = TUNE_VOICES[track];
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = voice.wave;
        oscillator.frequency.value = voice.hz;
        gain.gain.setValueAtTime(TUNE_GAIN, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + voice.seconds);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(now);
        oscillator.stop(now + voice.seconds);
        playing.push({ oscillator, gain, end: now + voice.seconds });
      }
    },
    silence() {
      on = false;
      cut();
      if (context && context.state !== 'closed') void context.suspend().catch(() => {});
    },
    enabled: () => on,
    dispose() {
      on = false;
      cut();
      void context?.close().catch(() => {});
      context = undefined;
    },
  };
}
