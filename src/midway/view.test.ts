import { describe, expect, it } from 'vitest';
import {
  canZoomIn,
  canZoomOut,
  clearOfControls,
  CONTROLS_BAND,
  DEFAULT_VIEW_SCALE,
  fitCamera,
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

describe('fitCamera', () => {
  const bounds = { left: -400, right: 400, top: -100, bottom: 300 };

  it('centres the focus when there is room', () => {
    const camera = fitCamera({ x: 0, y: 100 }, { w: 200, h: 100 }, bounds);
    expect(camera.x).toBe(-100);
    expect(camera.y).toBe(100 - 50 - 16);
  });

  it('keeps the view inside the bounds near an edge, at every zoom', () => {
    for (const scale of VIEW_SCALES) {
      const zoom = viewZoom(1024, 768, scale);
      const view = { w: 1024 / zoom, h: 768 / zoom };
      for (const focus of [
        { x: -1000, y: -1000 },
        { x: 1000, y: 1000 },
      ]) {
        const camera = fitCamera(focus, view, bounds);
        if (view.w < 800) {
          expect(camera.x).toBeGreaterThanOrEqual(bounds.left);
          expect(camera.x + view.w).toBeLessThanOrEqual(bounds.right + 1e-9);
        }
        if (view.h < 400) {
          expect(camera.y).toBeGreaterThanOrEqual(bounds.top);
          expect(camera.y + view.h).toBeLessThanOrEqual(bounds.bottom + 1e-9);
        }
      }
    }
  });

  it('centres a view larger than the bounds', () => {
    const camera = fitCamera({ x: 300, y: 0 }, { w: 1000, h: 600 }, bounds);
    expect(camera).toEqual({ x: -500, y: -200 });
  });
});

describe('clearOfControls', () => {
  const view = { w: 864, h: 540 };
  const zoom = 1.5;

  it('lifts the camera so the highest sign sits below the controls band', () => {
    const camera = clearOfControls({ x: -632, y: 102 }, 80, { x: 0, y: 388 }, view, zoom, -174);
    expect(camera.x).toBe(-632);
    expect((80 - camera.y) * zoom).toBeCloseTo(CONTROLS_BAND);
  });

  it('leaves a camera that already clears the band alone', () => {
    const camera = { x: 10, y: -100 };
    expect(clearOfControls(camera, 80, { x: 0, y: 100 }, view, zoom, -174)).toBe(camera);
  });

  it('keeps the focus on screen above the bottom edge', () => {
    const camera = clearOfControls({ x: 0, y: 400 }, -200, { x: 0, y: 700 }, view, zoom, -400);
    expect(camera.y).toBe(700 - view.h + 48);
  });

  it('never lifts the camera past the top bound', () => {
    const camera = clearOfControls({ x: 0, y: 0 }, -200, { x: 0, y: 0 }, view, zoom, -250);
    expect(camera.y).toBe(-250);
  });
});
