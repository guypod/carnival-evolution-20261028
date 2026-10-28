/**
 * The midway's soundscape: a soft, made-up carnival hum played with Web Audio.
 * No recordings, no network and no microphone. It starts off, and only a click
 * on its button starts it. It stops when the page hides, the midway closes or
 * the button mutes it, and it never plays two loops at once. Games keep their
 * own sound: the soundscape only plays on the midway.
 */

/** The loudest the soundscape gets, kept well below a game's sounds. */
export const MAX_SOUNDSCAPE_GAIN = 0.06;

/** The default slider position, from 0 to 1. */
export const DEFAULT_SOUNDSCAPE_VOLUME = 0.5;

/** A soft major chord, in hertz. */
export const SOUNDSCAPE_TONES = [196, 246.94, 293.66];

/** The parts of Web Audio the soundscape uses, so tests can pass a fake. */
export interface SoundNode {
  connect(destination: unknown): unknown;
  disconnect(): void;
}
export interface SoundOscillator extends SoundNode {
  type: string;
  frequency: { value: number };
  start(): void;
  stop(): void;
}
export interface SoundGain extends SoundNode {
  gain: { value: number };
}
export interface SoundContext {
  destination: unknown;
  state: string;
  createOscillator(): SoundOscillator;
  createGain(): SoundGain;
  resume(): Promise<void>;
  suspend(): Promise<void>;
  close(): Promise<void>;
}

/** The gain a slider position plays at. */
export function soundscapeGain(volume: number): number {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 0));
  return clamped * MAX_SOUNDSCAPE_GAIN;
}

/** What the sound button says and whether it is pressed. */
export function soundToggleState(playing: boolean): { label: string; pressed: boolean } {
  return playing
    ? { label: '🔊 Midway sound: on', pressed: true }
    : { label: '🔇 Midway sound: off', pressed: false };
}

export interface Soundscape {
  /** Starts the hum. Call it from a click. Returns false when the browser has no Web Audio. */
  start(): boolean;
  /** Stops the hum and suspends the audio context. */
  stop(): void;
  setVolume(volume: number): void;
  isPlaying(): boolean;
  /** Stops the hum and closes the audio context for good. */
  dispose(): void;
}

/**
 * Makes a soundscape. `createContext` is only called on the first `start`, so
 * nothing touches audio until someone asks for it.
 */
export function createSoundscape(createContext: () => SoundContext | undefined): Soundscape {
  let context: SoundContext | undefined;
  let master: SoundGain | undefined;
  let oscillators: SoundOscillator[] = [];
  let volume = DEFAULT_SOUNDSCAPE_VOLUME;

  const stop = () => {
    for (const oscillator of oscillators) {
      oscillator.stop();
      oscillator.disconnect();
    }
    oscillators = [];
    master?.disconnect();
    master = undefined;
    if (context && context.state === 'running') void context.suspend().catch(() => {});
  };

  return {
    start() {
      if (oscillators.length > 0) return true;
      if (!context) {
        try {
          context = createContext();
        } catch {
          context = undefined;
        }
        if (!context) return false;
      }
      void context.resume().catch(() => {});
      master = context.createGain();
      master.gain.value = soundscapeGain(volume);
      master.connect(context.destination);
      for (const tone of SOUNDSCAPE_TONES) {
        const oscillator = context.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.value = tone;
        oscillator.connect(master);
        oscillator.start();
        oscillators.push(oscillator);
      }
      return true;
    },
    stop,
    setVolume(next) {
      volume = Math.min(1, Math.max(0, Number.isFinite(next) ? next : 0));
      if (master) master.gain.value = soundscapeGain(volume);
    },
    isPlaying: () => oscillators.length > 0,
    dispose() {
      stop();
      void context?.close().catch(() => {});
      context = undefined;
    },
  };
}
