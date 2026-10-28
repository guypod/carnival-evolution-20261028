import { describe, expect, it, vi } from 'vitest';
import {
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
});
