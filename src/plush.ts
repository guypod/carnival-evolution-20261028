import { theme } from './carnival';

/** Choices on the plush bench. Each body has its own silhouette. */
export const PLUSH_BODIES = ['bear', 'bunny', 'octopus'] as const;
export const PLUSH_FACES = ['smile', 'sleepy', 'surprised'] as const;
export const PLUSH_ACCESSORIES = ['party-hat', 'bow', 'wings', 'crown'] as const;
/** Accessible plush colours, all from the carnival theme. */
export const PLUSH_COLORS = ['accent', 'stripeA', 'water', 'muted', 'wood'] as const;
/** The crown is a cosmetic unlock for anyone who has a score on any booth. */
export const PLUSH_COLOR_NAMES: Record<PlushColor, string> = {
  accent: 'gold',
  stripeA: 'red',
  water: 'blue',
  muted: 'lavender',
  wood: 'brown',
};
export const UNLOCKABLE: readonly PlushAccessory[] = ['crown'];
export const PLUSH_NAME_MAX = 16;
export const PLUSH_HISTORY_MAX = 50;

export type PlushBody = (typeof PLUSH_BODIES)[number];
export type PlushFace = (typeof PLUSH_FACES)[number];
export type PlushAccessory = (typeof PLUSH_ACCESSORIES)[number];
export type PlushColor = (typeof PLUSH_COLORS)[number];

export interface Plush {
  body: PlushBody;
  face: PlushFace;
  color: PlushColor;
  accessories: PlushAccessory[];
  name: string;
}

export const STARTER_PLUSH: Plush = {
  body: 'bear',
  face: 'smile',
  color: 'accent',
  accessories: [],
  name: '',
};

export function availableAccessories(hasAnyScore: boolean): PlushAccessory[] {
  return PLUSH_ACCESSORIES.filter((item) => hasAnyScore || !UNLOCKABLE.includes(item));
}

export function cleanPlushName(raw: string): string {
  const text = raw
    .replace(/[\p{Cc}<>]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(text).slice(0, PLUSH_NAME_MAX).join('');
}

export type PlushAction =
  | { type: 'body'; body: PlushBody }
  | { type: 'face'; face: PlushFace }
  | { type: 'color'; color: PlushColor }
  | { type: 'attach'; accessory: PlushAccessory }
  | { type: 'remove'; accessory: PlushAccessory }
  | { type: 'name'; name: string };

/** Applies one change. Returns the same object when nothing changes. */
export function applyPlush(plush: Plush, action: PlushAction): Plush {
  switch (action.type) {
    case 'body':
      return PLUSH_BODIES.includes(action.body) && action.body !== plush.body
        ? { ...plush, body: action.body }
        : plush;
    case 'face':
      return PLUSH_FACES.includes(action.face) && action.face !== plush.face
        ? { ...plush, face: action.face }
        : plush;
    case 'color':
      return PLUSH_COLORS.includes(action.color) && action.color !== plush.color
        ? { ...plush, color: action.color }
        : plush;
    case 'attach':
      return PLUSH_ACCESSORIES.includes(action.accessory) &&
        !plush.accessories.includes(action.accessory)
        ? { ...plush, accessories: [...plush.accessories, action.accessory] }
        : plush;
    case 'remove':
      return plush.accessories.includes(action.accessory)
        ? { ...plush, accessories: plush.accessories.filter((a) => a !== action.accessory) }
        : plush;
    case 'name': {
      const name = cleanPlushName(action.name);
      return name === plush.name ? plush : { ...plush, name };
    }
  }
}

/** A plush under construction, with an undo history and a reset. */
export interface PlushBench {
  current: Plush;
  history: Plush[];
}

export function benchFor(plush: Plush): PlushBench {
  return { current: plush, history: [] };
}

export function benchApply(bench: PlushBench, action: PlushAction): PlushBench {
  const next = applyPlush(bench.current, action);
  if (next === bench.current) return bench;
  return {
    current: next,
    history: [...bench.history, bench.current].slice(-PLUSH_HISTORY_MAX),
  };
}

export function benchUndo(bench: PlushBench): PlushBench {
  if (bench.history.length === 0) return bench;
  return { current: bench.history[bench.history.length - 1], history: bench.history.slice(0, -1) };
}

/** Reset back to the starter plush. It can be undone like any change. */
export function benchReset(bench: PlushBench): PlushBench {
  if (samePlush(bench.current, STARTER_PLUSH)) return bench;
  return {
    current: STARTER_PLUSH,
    history: [...bench.history, bench.current].slice(-PLUSH_HISTORY_MAX),
  };
}

export function samePlush(a: Plush, b: Plush): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Reads a saved plush, or undefined when the saved value is not a valid one. */
export function parsePlush(raw: string | null): Plush | undefined {
  if (raw === null) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof value !== 'object' || value === null) return undefined;
  const v = value as Record<string, unknown>;
  if (!PLUSH_BODIES.includes(v.body as PlushBody)) return undefined;
  if (!PLUSH_FACES.includes(v.face as PlushFace)) return undefined;
  if (!PLUSH_COLORS.includes(v.color as PlushColor)) return undefined;
  if (!Array.isArray(v.accessories)) return undefined;
  if (typeof v.name !== 'string') return undefined;
  const accessories = PLUSH_ACCESSORIES.filter((a) => (v.accessories as unknown[]).includes(a));
  return {
    body: v.body as PlushBody,
    face: v.face as PlushFace,
    color: v.color as PlushColor,
    accessories,
    name: cleanPlushName(v.name),
  };
}

export const PLUSH_KEY = 'carnival:plush';

export interface PlushStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Keeps one saved plush in this browser. Nothing is uploaded. */
export function createPlushStore(storage: PlushStorage | undefined) {
  return {
    load(): Plush | undefined {
      try {
        return parsePlush(storage?.getItem(PLUSH_KEY) ?? null);
      } catch {
        return undefined;
      }
    },
    save(plush: Plush): boolean {
      try {
        if (!storage) return false;
        storage.setItem(PLUSH_KEY, JSON.stringify(plush));
        return true;
      } catch {
        return false;
      }
    },
  };
}

function browserStorage(): PlushStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export const plushStore = createPlushStore(browserStorage());

export const PLUSH_SIZE = { width: 320, height: 320 } as const;

/** A short spoken description of the plush, for the page and screen readers. */
export function describePlush(plush: Plush): string {
  const label = (s: string) => s.replace('-', ' ');
  const parts = [`A ${PLUSH_COLOR_NAMES[plush.color]} ${plush.body}`];
  parts.push(`with a ${plush.face} face`);
  if (plush.accessories.length > 0)
    parts.push(`wearing ${plush.accessories.map(label).join(', ')}`);
  const name = plush.name ? `${plush.name}: ` : '';
  return `${name}${parts.join(' ')}.`;
}

/** Draws the layered plush: accessories behind, body, face, accessories in front. */
export function drawPlush(ctx: CanvasRenderingContext2D, plush: Plush) {
  const { width, height } = PLUSH_SIZE;
  const c = theme.colors;
  const fill = c[plush.color];
  const cx = width / 2;
  const cy = height / 2 + 20;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = c.surface;
  ctx.fillRect(0, 0, width, height);
  ctx.lineWidth = 3;
  ctx.strokeStyle = c.background;

  const shape = (draw: () => void, color: string = fill) => {
    ctx.beginPath();
    draw();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.stroke();
  };

  if (plush.accessories.includes('wings')) {
    for (const side of [-1, 1]) {
      shape(() => {
        ctx.ellipse(cx + side * 95, cy - 10, 55, 28, side * -0.5, 0, Math.PI * 2);
      }, c.text);
    }
  }

  if (plush.body === 'bear') {
    for (const side of [-1, 1]) shape(() => ctx.arc(cx + side * 55, cy - 95, 26, 0, Math.PI * 2));
    shape(() => ctx.arc(cx, cy - 40, 70, 0, Math.PI * 2));
    shape(() => ctx.ellipse(cx, cy + 70, 60, 50, 0, 0, Math.PI * 2));
  } else if (plush.body === 'bunny') {
    for (const side of [-1, 1]) {
      shape(() => ctx.ellipse(cx + side * 28, cy - 140, 18, 55, side * 0.15, 0, Math.PI * 2));
    }
    shape(() => ctx.ellipse(cx, cy - 40, 58, 62, 0, 0, Math.PI * 2));
    shape(() => ctx.ellipse(cx, cy + 75, 50, 55, 0, 0, Math.PI * 2));
  } else {
    for (let i = 0; i < 6; i += 1) {
      const x = cx - 75 + i * 30;
      shape(() => ctx.ellipse(x, cy + 70, 13, 48, (i - 2.5) * 0.18, 0, Math.PI * 2));
    }
    shape(() => ctx.ellipse(cx, cy - 10, 95, 80, 0, 0, Math.PI * 2));
  }

  const faceY = plush.body === 'octopus' ? cy - 15 : cy - 40;
  ctx.fillStyle = c.background;
  ctx.strokeStyle = c.background;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    if (plush.face === 'sleepy') {
      ctx.arc(cx + side * 24, faceY - 8, 9, 0, Math.PI);
      ctx.stroke();
    } else {
      ctx.arc(cx + side * 24, faceY - 8, plush.face === 'surprised' ? 10 : 7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.beginPath();
  if (plush.face === 'surprised') {
    ctx.arc(cx, faceY + 22, 9, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.arc(cx, faceY + 14, 14, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  }

  const top = plush.body === 'bunny' ? cy - 190 : plush.body === 'bear' ? cy - 115 : cy - 95;
  ctx.strokeStyle = c.background;
  if (plush.accessories.includes('party-hat')) {
    shape(() => {
      ctx.moveTo(cx - 30, top + 5);
      ctx.lineTo(cx, top - 60);
      ctx.lineTo(cx + 30, top + 5);
      ctx.closePath();
    }, c.stripeA);
  }
  if (plush.accessories.includes('crown')) {
    shape(() => {
      ctx.moveTo(cx - 40, top + 10);
      ctx.lineTo(cx - 40, top - 25);
      ctx.lineTo(cx - 20, top - 5);
      ctx.lineTo(cx, top - 35);
      ctx.lineTo(cx + 20, top - 5);
      ctx.lineTo(cx + 40, top - 25);
      ctx.lineTo(cx + 40, top + 10);
      ctx.closePath();
    }, c.accent);
  }
  if (plush.accessories.includes('bow')) {
    const y = cy + 25;
    for (const side of [-1, 1]) {
      shape(() => {
        ctx.moveTo(cx, y);
        ctx.lineTo(cx + side * 45, y - 25);
        ctx.lineTo(cx + side * 45, y + 25);
        ctx.closePath();
      }, c.danger);
    }
  }
}
