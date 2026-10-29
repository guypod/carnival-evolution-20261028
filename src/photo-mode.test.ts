import { describe, expect, it } from 'vitest';
import {
  PHOTO_FRAMES,
  createCaptureGuard,
  frameRect,
  photoFilename,
  photoFrame,
} from './photo-mode';

describe('frameRect', () => {
  it('takes the whole map for the full view', () => {
    expect(frameRect('full', 800, 600)).toEqual({ x: 0, y: 0, width: 800, height: 600 });
  });

  it('centres a square in a wide map', () => {
    expect(frameRect('square', 800, 600)).toEqual({ x: 100, y: 0, width: 600, height: 600 });
  });

  it('centres a wide frame in a tall map', () => {
    expect(frameRect('wide', 320, 900)).toEqual({ x: 0, y: 360, width: 320, height: 180 });
  });

  it('stays inside the map for every frame and odd sizes', () => {
    for (const frame of PHOTO_FRAMES) {
      for (const [w, h] of [
        [1, 1],
        [3, 1000],
        [1000, 3],
        [1279.6, 719.2],
      ]) {
        const rect = frameRect(frame.id, w, h);
        expect(rect.width).toBeGreaterThanOrEqual(1);
        expect(rect.height).toBeGreaterThanOrEqual(1);
        expect(rect.x).toBeGreaterThanOrEqual(0);
        expect(rect.y).toBeGreaterThanOrEqual(0);
        expect(rect.x + rect.width).toBeLessThanOrEqual(Math.max(1, Math.floor(w)));
        expect(rect.y + rect.height).toBeLessThanOrEqual(Math.max(1, Math.floor(h)));
      }
    }
  });

  it('never returns an empty frame for an empty map', () => {
    expect(frameRect('portrait', 0, 0)).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });
});

describe('photoFrame', () => {
  it('falls back to the full view for an unknown id', () => {
    expect(photoFrame('<script>').id).toBe('full');
  });
});

describe('photoFilename', () => {
  it('names the file from the frame and the time, with safe characters only', () => {
    const name = photoFilename('square', new Date(2026, 9, 29, 4, 5, 6));
    expect(name).toBe('carnival-photo-square-20261029-040506.png');
    expect(photoFilename('../evil', new Date(2026, 0, 1))).toMatch(/^[a-z0-9-]+\.png$/);
  });
});

describe('createCaptureGuard', () => {
  it('allows one encode at a time within a session', () => {
    const guard = createCaptureGuard();
    expect(guard.start()).toBe(true);
    expect(guard.start()).toBe(false);
    expect(guard.finish(1, 1, true)).toBe(true);
    expect(guard.start()).toBe(true);
  });

  it('keeps an old encode pending across exit and reopen, then drops its result', () => {
    const guard = createCaptureGuard();
    expect(guard.start()).toBe(true); // taken in session 1
    // exit (session 2) and reopen (session 3) while it is still encoding
    expect(guard.pending).toBe(true);
    expect(guard.start()).toBe(false);
    // the stale encode finishes: it frees the guard but does not publish
    expect(guard.finish(1, 3, true)).toBe(false);
    expect(guard.pending).toBe(false);
    expect(guard.start()).toBe(true);
    expect(guard.finish(3, 3, true)).toBe(true);
  });

  it('frees the guard but does not publish after teardown', () => {
    const guard = createCaptureGuard();
    guard.start();
    expect(guard.finish(1, 2, false)).toBe(false);
    expect(guard.pending).toBe(false);
  });
});
