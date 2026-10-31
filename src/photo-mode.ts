// Photo mode: frame the midway as it is drawn right now and take a local
// snapshot. These are the plain parts: the frame shapes, the crop inside the
// map and the file name. main.ts does the DOM and the canvas copy.

export const PHOTO_FRAMES = [
  { id: 'full', label: 'Full view', ratio: 0 },
  { id: 'wide', label: 'Wide 16:9', ratio: 16 / 9 },
  { id: 'square', label: 'Square', ratio: 1 },
  { id: 'portrait', label: 'Portrait 3:4', ratio: 3 / 4 },
] as const;

export type PhotoFrameId = (typeof PHOTO_FRAMES)[number]['id'];

export interface PhotoRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function photoFrame(id: string) {
  return PHOTO_FRAMES.find((frame) => frame.id === id) ?? PHOTO_FRAMES[0];
}

// The largest centred rectangle of the frame's shape that fits the map. Whole
// pixels, never outside the map and never empty.
export function frameRect(id: string, width: number, height: number): PhotoRect {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  const { ratio } = photoFrame(id);
  if (!ratio) return { x: 0, y: 0, width: w, height: h };
  let fw = w;
  let fh = Math.round(w / ratio);
  if (fh > h) {
    fh = h;
    fw = Math.round(h * ratio);
  }
  fw = Math.min(w, Math.max(1, fw));
  fh = Math.min(h, Math.max(1, fh));
  return { x: Math.floor((w - fw) / 2), y: Math.floor((h - fh) / 2), width: fw, height: fh };
}

// A safe local file name, from the frame and the time: letters, digits and dashes.
export function photoFilename(id: string, when: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp =
    `${when.getFullYear()}${pad(when.getMonth() + 1)}${pad(when.getDate())}` +
    `-${pad(when.getHours())}${pad(when.getMinutes())}${pad(when.getSeconds())}`;
  return `carnival-photo-${photoFrame(id).id}-${stamp}.png`;
}

// One photo encode at a time, across photo sessions. A capture belongs to the
// session it started in; when its encode finishes it always frees the guard,
// but only publishes if that session is still open.
export function createCaptureGuard() {
  let pending = false;
  return {
    get pending() {
      return pending;
    },
    start(): boolean {
      if (pending) return false;
      pending = true;
      return true;
    },
    finish(owner: number, session: number, open: boolean): boolean {
      pending = false;
      return open && owner === session;
    },
  };
}
