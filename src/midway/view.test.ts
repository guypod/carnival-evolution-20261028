import { describe, expect, it } from 'vitest';
import {
  canZoomIn,
  canZoomOut,
  DEFAULT_VIEW_SCALE,
  project,
  unproject,
  VIEW_SCALES,
  viewZoom,
  zoomIn,
  zoomOut,
} from './view';

describe('view zoom', () => {
  it('steps in and out from the default and stops at the bounds', () => {
    expect(zoomIn(DEFAULT_VIEW_SCALE)).toBe(1.25);
    expect(zoomOut(DEFAULT_VIEW_SCALE)).toBe(0.75);
    let scale = DEFAULT_VIEW_SCALE;
    for (let i = 0; i < 10; i++) scale = zoomIn(scale);
    expect(scale).toBe(VIEW_SCALES.at(-1));
    expect(canZoomIn(scale)).toBe(false);
    for (let i = 0; i < 10; i++) scale = zoomOut(scale);
    expect(scale).toBe(VIEW_SCALES[0]);
    expect(canZoomOut(scale)).toBe(false);
    expect(canZoomIn(scale)).toBe(true);
  });

  it('scales the fitted zoom and keeps it bounded', () => {
    expect(viewZoom(1440, 1080, 1)).toBe(2);
    expect(viewZoom(1440, 1080, 1.5)).toBe(3);
    expect(viewZoom(100, 100, 1)).toBe(1.3);
    expect(viewZoom(10000, 10000, 1)).toBe(3);
    for (const scale of VIEW_SCALES) {
      const z = viewZoom(800, 600, scale);
      expect(z).toBeGreaterThan(0.9);
      expect(z).toBeLessThanOrEqual(6);
    }
  });
});

describe('projection', () => {
  it('unprojects what it projects, at every zoom', () => {
    const camera = { x: -120, y: 40 };
    const world = { x: 33.5, y: 210 };
    for (const scale of VIEW_SCALES) {
      const zoom = viewZoom(1024, 768, scale);
      const back = unproject(project(world, camera, zoom), camera, zoom);
      expect(back.x).toBeCloseTo(world.x);
      expect(back.y).toBeCloseTo(world.y);
    }
  });

  it('puts the camera corner at the canvas origin', () => {
    expect(project({ x: 5, y: 7 }, { x: 5, y: 7 }, 2.5)).toEqual({ x: 0, y: 0 });
    expect(unproject({ x: 20, y: 10 }, { x: 0, y: 0 }, 2)).toEqual({ x: 10, y: 5 });
  });
});
