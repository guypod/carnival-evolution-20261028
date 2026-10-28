import type { Point } from './world';

/** How far the view zooms from the fitted size: a modest range, never far. */
export const VIEW_SCALES = [0.75, 1, 1.25, 1.5, 2] as const;
export const DEFAULT_VIEW_SCALE = 1;

/** The next step in, or the largest step when already there. */
export function zoomIn(scale: number): number {
  return VIEW_SCALES.find((s) => s > scale + 1e-9) ?? VIEW_SCALES[VIEW_SCALES.length - 1];
}

/** The next step out, or the smallest step when already there. */
export function zoomOut(scale: number): number {
  return [...VIEW_SCALES].reverse().find((s) => s < scale - 1e-9) ?? VIEW_SCALES[0];
}

export function canZoomIn(scale: number): boolean {
  return scale < VIEW_SCALES[VIEW_SCALES.length - 1] - 1e-9;
}

export function canZoomOut(scale: number): boolean {
  return scale > VIEW_SCALES[0] + 1e-9;
}

/** CSS pixels per world pixel: the size that fits the canvas, times the view scale. */
export function viewZoom(width: number, height: number, scale: number): number {
  const fit = Math.max(1.3, Math.min(3, Math.min(width / 720, height / 540)));
  return fit * scale;
}

/** A world point to CSS pixels on the canvas. */
export function project(world: Point, camera: Point, zoom: number): Point {
  return { x: (world.x - camera.x) * zoom, y: (world.y - camera.y) * zoom };
}

/** CSS pixels on the canvas back to a world point, for pointer hit testing. */
export function unproject(screen: Point, camera: Point, zoom: number): Point {
  return { x: screen.x / zoom + camera.x, y: screen.y / zoom + camera.y };
}
