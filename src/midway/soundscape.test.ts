import { describe, expect, it, vi } from 'vitest';
import {
  CHIME_LENGTH,
  MAX_CHIME_NOTES,
  createSoundscape,
  MAX_SOUNDSCAPE_GAIN,
  SOUNDSCAPE_TONES,
  soundscapeGain,
  soundToggleState,
  type SoundContext,
  type SoundGain,
  type SoundOscillator,
} from './soundscape';

function fakeContext() {
  const oscillators: SoundOscillator[] = [];
  const gains: SoundGain[] = [];
  const context = {
    destination: {},
    state: 'suspended',
    createOscillator: () => {
      const oscillator = {
        type: '',
        frequency: { value: 0 },
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      oscillators.push(oscillator);
      return oscillator;
    },
    createGain: () => {
      const gain = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() };
      gains.push(gain);
      return gain;
    },
    resume: vi.fn(async () => void (context.state = 'running')),
    suspend: vi.fn(async () => void (context.state = 'suspended')),
    close: vi.fn(async () => void (context.state = 'closed')),
  } satisfies SoundContext;
  return { context, oscillators, gains };
}

describe('soundscape', () => {
  it('touches no audio until it is started', () => {
    const create = vi.fn();
    const sound = createSoundscape(create);
    expect(create).not.toHaveBeenCalled();
    expect(sound.isPlaying()).toBe(false);
  });

  it('plays one quiet loop, even when started twice', () => {
    const fake = fakeContext();
    const sound = createSoundscape(() => fake.context);
    expect(sound.start()).toBe(true);
    expect(sound.start()).toBe(true);
    expect(fake.oscillators).toHaveLength(SOUNDSCAPE_TONES.length);
    expect(fake.gains[0].gain.value).toBeLessThanOrEqual(MAX_SOUNDSCAPE_GAIN);
    expect(fake.context.resume).toHaveBeenCalled();
    expect(sound.isPlaying()).toBe(true);
  });

  it('stops every tone and suspends on mute, and starts fresh afterwards', async () => {
    const fake = fakeContext();
    const sound = createSoundscape(() => fake.context);
    sound.start();
    await Promise.resolve();
    sound.stop();
    for (const oscillator of fake.oscillators) expect(oscillator.stop).toHaveBeenCalledOnce();
    expect(fake.context.suspend).toHaveBeenCalled();
    expect(sound.isPlaying()).toBe(false);
    sound.start();
    expect(fake.oscillators.filter((o) => !vi.mocked(o.stop).mock.calls.length)).toHaveLength(
      SOUNDSCAPE_TONES.length,
    );
  });

  it('closes the context on dispose', () => {
    const fake = fakeContext();
    const sound = createSoundscape(() => fake.context);
    sound.start();
    sound.dispose();
    expect(fake.context.close).toHaveBeenCalled();
    expect(sound.isPlaying()).toBe(false);
  });

  it('changes the volume while playing', () => {
    const fake = fakeContext();
    const sound = createSoundscape(() => fake.context);
    sound.start();
    sound.setVolume(1);
    expect(fake.gains[0].gain.value).toBe(MAX_SOUNDSCAPE_GAIN);
    sound.setVolume(0);
    expect(fake.gains[0].gain.value).toBe(0);
  });

  it('reports false without Web Audio', () => {
    const sound = createSoundscape(() => undefined);
    expect(sound.start()).toBe(false);
    expect(sound.isPlaying()).toBe(false);
  });
});

describe('soundscapeGain', () => {
  it('scales and clamps the slider', () => {
    expect(soundscapeGain(0.5)).toBe(MAX_SOUNDSCAPE_GAIN / 2);
    expect(soundscapeGain(5)).toBe(MAX_SOUNDSCAPE_GAIN);
    expect(soundscapeGain(-1)).toBe(0);
    expect(soundscapeGain(Number.NaN)).toBe(0);
  });
});

describe('soundToggleState', () => {
  it('says off until playing', () => {
    expect(soundToggleState(false)).toEqual({ label: '🔇 Midway sound: off', pressed: false });
    expect(soundToggleState(true).pressed).toBe(true);
  });

  it('shows off again and can retry when the browser refuses to resume', async () => {
    const fake = fakeContext();
    fake.context.resume.mockImplementationOnce(async () => {
      throw new Error('blocked');
    });
    const stopped = vi.fn();
    const sound = createSoundscape(() => fake.context, stopped);
    sound.start();
    await Promise.resolve();
    await Promise.resolve();
    expect(sound.isPlaying()).toBe(false);
    expect(stopped).toHaveBeenCalledTimes(1);
    expect(sound.start()).toBe(true);
    expect(sound.isPlaying()).toBe(true);
  });

  it('suspends again when a resume finishes after a mute', async () => {
    const fake = fakeContext();
    let finishResume = () => {};
    fake.context.resume.mockImplementationOnce(
      () =>
        new Promise<undefined>((resolve) => {
          finishResume = () => {
            fake.context.state = 'running';
            resolve(undefined);
          };
        }),
    );
    const sound = createSoundscape(() => fake.context);
    sound.start();
    sound.stop();
    finishResume();
    await Promise.resolve();
    await Promise.resolve();
    expect(fake.context.state).toBe('suspended');
    expect(sound.isPlaying()).toBe(false);
  });
});

describe('chime notes', () => {
  const tones = [392, 440, 523.25, 659.25];
  const chimeOscillators = (fake: ReturnType<typeof fakeContext>) =>
    fake.oscillators.slice(SOUNDSCAPE_TONES.length);

  it('makes no sound and touches no audio while the midway sound is off', () => {
    const create = vi.fn();
    const sound = createSoundscape(create);
    sound.chime(tones, 0.7);
    expect(create).not.toHaveBeenCalled();
  });

  it('rings each note once, spaced out, through the hum’s volume', () => {
    const fake = fakeContext();
    const sound = createSoundscape(() => fake.context);
    sound.start();
    sound.chime(tones, 0.7);
    const notes = chimeOscillators(fake);
    expect(notes.map((o) => o.frequency.value)).toEqual(tones);
    expect(vi.mocked(notes[2].start).mock.calls[0][0]).toBeCloseTo(1.4);
    expect(vi.mocked(notes[2].stop).mock.calls[0][0]).toBeCloseTo(1.4 + CHIME_LENGTH);
    // Every note goes through the master gain, so the slider and mute reach it.
    const master = fake.gains[0];
    for (const gain of fake.gains.slice(1)) expect(gain.connect).toHaveBeenCalledWith(master);
  });

  it('stops every pending and sounding note on mute, and rings none after', () => {
    const fake = fakeContext();
    const sound = createSoundscape(() => fake.context);
    sound.start();
    sound.chime(tones, 0.7);
    sound.stop();
    for (const note of chimeOscillators(fake)) expect(note.stop).toHaveBeenLastCalledWith();
    const before = fake.oscillators.length;
    sound.chime(tones, 0.7);
    expect(fake.oscillators).toHaveLength(before);
  });

  it('stops pending notes and rings none after the midway closes', () => {
    const fake = fakeContext();
    const sound = createSoundscape(() => fake.context);
    sound.start();
    sound.chime(tones, 0.7);
    sound.dispose();
    for (const note of chimeOscillators(fake)) expect(note.stop).toHaveBeenLastCalledWith();
    const before = fake.oscillators.length;
    sound.chime(tones, 0.7);
    expect(fake.oscillators).toHaveLength(before);
    expect(fake.context.close).toHaveBeenCalled();
  });

  it('keeps overlapping notes to a few, stopping the oldest first', () => {
    const fake = fakeContext();
    const sound = createSoundscape(() => fake.context);
    sound.start();
    for (let i = 0; i < 5; i++) sound.chime(tones, 0.7);
    const notes = chimeOscillators(fake);
    const live = notes.filter((o) => vi.mocked(o.stop).mock.calls.length === 1);
    expect(live).toHaveLength(MAX_CHIME_NOTES);
    expect(live).toEqual(notes.slice(-MAX_CHIME_NOTES));
  });

  it('rings nothing once a refused resume has stopped the sound', async () => {
    const fake = fakeContext();
    fake.context.resume.mockImplementationOnce(async () => {
      throw new Error('blocked');
    });
    const sound = createSoundscape(() => fake.context);
    sound.start();
    sound.chime(tones, 0.7);
    await Promise.resolve();
    await Promise.resolve();
    for (const note of chimeOscillators(fake)) expect(note.stop).toHaveBeenLastCalledWith();
    const before = fake.oscillators.length;
    sound.chime(tones, 0.7);
    expect(fake.oscillators).toHaveLength(before);
  });

  it('stays suspended when a late resume lands after a mute that cut notes off', async () => {
    const fake = fakeContext();
    let finishResume = () => {};
    fake.context.resume.mockImplementationOnce(
      () =>
        new Promise<undefined>((resolve) => {
          finishResume = () => {
            fake.context.state = 'running';
            resolve(undefined);
          };
        }),
    );
    const sound = createSoundscape(() => fake.context);
    sound.start();
    sound.chime(tones, 0.7);
    sound.stop();
    finishResume();
    await Promise.resolve();
    await Promise.resolve();
    expect(fake.context.state).toBe('suspended');
    const before = fake.oscillators.length;
    sound.chime(tones, 0.7);
    expect(fake.oscillators).toHaveLength(before);
  });
});
