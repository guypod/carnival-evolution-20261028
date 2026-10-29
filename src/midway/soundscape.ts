/**
 * The midway's soundscape: a soft, made-up carnival hum played with Web Audio.
 * No recordings, no network and no microphone. It starts off, and only a click
 * on its button starts it. It stops when the page hides, the midway closes or
 * the button mutes it, and it never plays two loops at once. While it plays,
 * places on the map such as the chime stones can ring short notes through it,
 * at its volume; they stop with it. Games keep their own sound: the soundscape
 * only plays on the midway.
 */

/** The loudest the soundscape gets, kept well below a game's sounds. */
export const MAX_SOUNDSCAPE_GAIN = 0.06;

/** The default slider position, from 0 to 1. */
export const DEFAULT_SOUNDSCAPE_VOLUME = 0.5;

/** A soft major chord, in hertz. */
export const SOUNDSCAPE_TONES = [196, 246.94, 293.66];

/** How loud a chime note peaks, relative to the hum's volume. */
export const CHIME_LEVEL = 1.5;
/** Seconds a chime note rings before it has died away. */
export const CHIME_LENGTH = 0.9;
/** The most chime notes sounding or waiting at once; the oldest stop first. */
export const MAX_CHIME_NOTES = 6;

/** The parts of Web Audio the soundscape uses, so tests can pass a fake. */
export interface SoundNode {
  connect(destination: unknown): unknown;
  disconnect(): void;
}
export interface SoundOscillator extends SoundNode {
  type: string;
  frequency: { value: number };
  start(when?: number): void;
  stop(when?: number): void;
}
export interface SoundGain extends SoundNode {
  gain: {
    value: number;
    setValueAtTime?(value: number, at: number): void;
    setTargetAtTime?(target: number, at: number, timeConstant: number): void;
  };
}
export interface SoundContext {
  destination: unknown;
  state: string;
  currentTime?: number;
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
  /**
   * Rings soft notes, in hertz, `spacing` seconds apart. Only while the hum
   * plays: with the sound off it does nothing and never starts audio.
   */
  chime(tones: readonly number[], spacing: number): void;
  /** Stops the hum and closes the audio context for good. */
  dispose(): void;
}

/**
 * Makes a soundscape. `createContext` is only called on the first `start`, so
 * nothing touches audio until someone asks for it. `onStopped` is called when
 * the hum stops on its own, such as when the browser refuses to resume audio.
 */
export function createSoundscape(
  createContext: () => SoundContext | undefined,
  onStopped: () => void = () => {},
): Soundscape {
  let context: SoundContext | undefined;
  let master: SoundGain | undefined;
  let oscillators: SoundOscillator[] = [];
  let notes: { oscillator: SoundOscillator; gain: SoundGain; ends: number }[] = [];
  let volume = DEFAULT_SOUNDSCAPE_VOLUME;

  const silence = (note: (typeof notes)[number]) => {
    note.oscillator.stop();
    note.oscillator.disconnect();
    note.gain.disconnect();
  };

  const stop = () => {
    for (const oscillator of oscillators) {
      oscillator.stop();
      oscillator.disconnect();
    }
    oscillators = [];
    notes.forEach(silence);
    notes = [];
    master?.disconnect();
    master = undefined;
    // Suspend even while a resume is still pending, so a late resume can't
    // leave the context running after a mute.
    if (context && context.state !== 'closed') void context.suspend().catch(() => {});
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
      const started = context;
      started.resume().then(
        () => {
          // A mute or dispose while resuming wins over the late resume.
          if (oscillators.length === 0 && context === started) stop();
        },
        () => {
          if (context !== started || oscillators.length === 0) return;
          stop();
          onStopped();
        },
      );
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
    chime(tones, spacing) {
      if (!context || !master || oscillators.length === 0) return;
      const now = context.currentTime ?? 0;
      notes = notes.filter((note) => {
        if (note.ends > now) return true;
        note.oscillator.disconnect();
        note.gain.disconnect();
        return false;
      });
      tones.forEach((tone, i) => {
        const at = now + i * spacing;
        const gain = context!.createGain();
        // A soft bell: a quick rise, then a long fade. No clicks, no sharp edges.
        gain.gain.value = 0;
        gain.gain.setValueAtTime?.(0, at);
        gain.gain.setTargetAtTime?.(CHIME_LEVEL, at, 0.01);
        gain.gain.setTargetAtTime?.(0, at + 0.05, CHIME_LENGTH / 5);
        if (!gain.gain.setTargetAtTime) gain.gain.value = CHIME_LEVEL;
        gain.connect(master!);
        const oscillator = context!.createOscillator();
        oscillator.type = 'triangle';
        oscillator.frequency.value = tone;
        oscillator.connect(gain);
        oscillator.start(at);
        oscillator.stop(at + CHIME_LENGTH);
        notes.push({ oscillator, gain, ends: at + CHIME_LENGTH });
      });
      while (notes.length > MAX_CHIME_NOTES) silence(notes.shift()!);
    },
    dispose() {
      stop();
      void context?.close().catch(() => {});
      context = undefined;
    },
  };
}
