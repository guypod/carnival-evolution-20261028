import { canvasFont, theme } from './carnival';
import { SOUVENIR_TITLE } from './midway/discovery';
import { evening, palette } from './midway/palette';
import type { Scene } from './midway/scene';

/**
 * The souvenir postcard: a card made from this browser's visit, with the
 * discovery trail, the passport stamps and an optional visitor name. It only
 * reads progress, never scores or saves anything, and its picture is drawn
 * locally on a canvas of a fixed size.
 */
export const POSTCARD_NAME_MAX = 24;
/** The card's size in layout pixels. The picture is drawn at POSTCARD_SCALE times this. */
export const POSTCARD_SIZE = { width: 600, height: 400 } as const;
export const POSTCARD_SCALE = 2;

export interface PostcardVisit {
  scene: Scene;
  landmarksFound: number;
  landmarksTotal: number;
  stampsPlayed: number;
  stampsTotal: number;
  /** The visitor's name as typed; it is cleaned before it is shown. */
  name?: string;
  /** Each booth's stamp, in passport order. */
  stamps?: readonly { name: string; earned: boolean }[];
  /** Each trail landmark's emblem, in trail order. */
  emblems?: readonly { name: string; earned: boolean }[];
}

/** One symbol on the card's strip: a booth stamp or a landmark emblem. */
export interface PostcardMark {
  kind: 'stamp' | 'emblem';
  name: string;
  earned: boolean;
  /** The mark in words, for the page's text equivalent. */
  label: string;
}

export interface PostcardContent {
  heading: string;
  greeting: string;
  /** The card's lines, in the order the picture shows them. */
  lines: string[];
  /** The strip of stamps then emblems, earned or not, in the order the picture shows them. */
  marks: PostcardMark[];
  scene: Scene;
  filename: string;
}

// Control characters, and the invisible marks that reorder or hide text.
const UNSAFE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;

/**
 * The name field's value, normalized and then bounded once: control and
 * formatting characters become spaces, runs of spaces become one, leading
 * spaces go, and the result keeps at most POSTCARD_NAME_MAX characters. A
 * single trailing space stays so the visitor can type the next word.
 */
export function limitNameInput(value: string): string {
  const text = value.replace(UNSAFE, ' ').replace(/\s+/g, ' ').trimStart();
  return Array.from(text).slice(0, POSTCARD_NAME_MAX).join('');
}

/**
 * The visitor name as the card shows it: the name field's value with no
 * trailing space. A name that fits after normalization is never shortened.
 */
export function cleanVisitorName(raw: string): string {
  return limitNameInput(raw).trimEnd();
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/** The card's words, the same for the picture and the page. */
export function postcardContent(visit: PostcardVisit): PostcardContent {
  const name = cleanVisitorName(visit.name ?? '');
  const complete = visit.landmarksTotal > 0 && visit.landmarksFound >= visit.landmarksTotal;
  const toGo = Math.max(0, visit.landmarksTotal - visit.landmarksFound);
  return {
    heading: `Greetings from Guy's Carnival`,
    greeting: name ? `${name} was here!` : 'A visitor was here!',
    lines: [
      `${visit.landmarksFound} of ${plural(visit.landmarksTotal, 'landmark', 'landmarks')} found`,
      complete
        ? `Title earned: ${SOUVENIR_TITLE}`
        : `${SOUVENIR_TITLE}: ${plural(toGo, 'landmark', 'landmarks')} to go`,
      `${visit.stampsPlayed} of ${plural(visit.stampsTotal, 'booth', 'booths')} stamped`,
      visit.scene === 'evening' ? 'Sent by lantern light' : 'Sent on a sunny day',
    ],
    marks: [
      ...(visit.stamps ?? []).map(({ name, earned }) => ({
        kind: 'stamp' as const,
        name,
        earned,
        label: `${name} booth: ${earned ? 'stamped' : 'not stamped yet'}`,
      })),
      ...(visit.emblems ?? []).map(({ name, earned }) => ({
        kind: 'emblem' as const,
        name,
        earned,
        label: `${name} landmark: ${earned ? 'found' : 'not found yet'}`,
      })),
    ],
    scene: visit.scene,
    filename: `tessl-carnival-postcard-${visit.scene}.png`,
  };
}

/** The card's colours for the scene, from the theme and the midway's palette. */
export function postcardColors(scene: Scene) {
  return scene === 'evening'
    ? {
        skyHigh: evening.skyHigh,
        sky: evening.sky,
        ground: palette.hedgeDark,
        card: theme.colors.surface,
        text: theme.colors.text,
        accent: theme.colors.accent,
      }
    : {
        skyHigh: palette.skyHigh,
        sky: palette.sky,
        ground: palette.grass,
        card: theme.colors.stripeB,
        text: theme.colors.background,
        accent: theme.colors.stripeA,
      };
}

type PostcardContext = Pick<
  CanvasRenderingContext2D,
  | 'createLinearGradient'
  | 'fillRect'
  | 'fillText'
  | 'strokeRect'
  | 'fillStyle'
  | 'strokeStyle'
  | 'lineWidth'
  | 'font'
  | 'textAlign'
  | 'textBaseline'
  | 'setTransform'
  | 'beginPath'
  | 'arc'
  | 'moveTo'
  | 'lineTo'
  | 'closePath'
  | 'fill'
  | 'stroke'
>;

/** Where each mark sits on the strip, centred in the card, in layout pixels. */
export function postcardMarkLayout(count: number, centreX: number, y: number, gap = 36) {
  const start = centreX - ((count - 1) * gap) / 2;
  return Array.from({ length: count }, (_, i) => ({ x: start + i * gap, y }));
}

const MARK_RADIUS = 12;

/**
 * A stamp is a circle and an emblem a diamond. An earned mark is filled and
 * carries a small star; one not yet earned is a thin outline only.
 */
function drawMark(
  ctx: PostcardContext,
  mark: PostcardMark,
  at: { x: number; y: number },
  colors: ReturnType<typeof postcardColors>,
) {
  const r = MARK_RADIUS;
  ctx.beginPath();
  if (mark.kind === 'stamp') {
    ctx.arc(at.x, at.y, r, 0, Math.PI * 2);
  } else {
    ctx.moveTo(at.x, at.y - r - 2);
    ctx.lineTo(at.x + r + 2, at.y);
    ctx.lineTo(at.x, at.y + r + 2);
    ctx.lineTo(at.x - r - 2, at.y);
    ctx.closePath();
  }
  if (mark.earned) {
    ctx.fillStyle = mark.kind === 'stamp' ? colors.accent : theme.colors.water;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = colors.text;
    ctx.stroke();
    // A five-point star in the card's colour.
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const radius = i % 2 === 0 ? r * 0.6 : r * 0.25;
      const angle = -Math.PI / 2 + (i * Math.PI) / 5;
      const px = at.x + Math.cos(angle) * radius;
      const py = at.y + Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = colors.card;
    ctx.fill();
  } else {
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = colors.text;
    ctx.stroke();
  }
}

/**
 * Draws the card on a canvas of POSTCARD_SIZE times POSTCARD_SCALE. Text is
 * drawn as text, never markup.
 */
export function drawPostcard(ctx: PostcardContext, content: PostcardContent) {
  const { width, height } = POSTCARD_SIZE;
  const colors = postcardColors(content.scene);
  ctx.setTransform(POSTCARD_SCALE, 0, 0, POSTCARD_SCALE, 0, 0);

  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, colors.skyHigh);
  sky.addColorStop(1, colors.sky);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = colors.ground;
  ctx.fillRect(0, height * 0.78, width, height * 0.22);

  // Big-top stripes along the top edge.
  const stripe = width / 16;
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = i % 2 === 0 ? theme.colors.stripeA : theme.colors.stripeB;
    ctx.fillRect(i * stripe, 0, stripe, 20);
  }

  const card = { x: 40, y: 50, w: width - 80, h: height - 100 };
  ctx.fillStyle = colors.card;
  ctx.fillRect(card.x, card.y, card.w, card.h);
  ctx.strokeStyle = colors.accent;
  ctx.lineWidth = 4;
  ctx.strokeRect(card.x + 8, card.y + 8, card.w - 16, card.h - 16);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = colors.accent;
  ctx.font = canvasFont('title', 'bold');
  ctx.fillText(content.heading, width / 2, card.y + 45, card.w - 48);
  ctx.fillStyle = colors.text;
  ctx.fillText(content.greeting, width / 2, card.y + 90, card.w - 48);
  ctx.font = canvasFont('body');
  content.lines.forEach((line, i) => {
    ctx.fillText(line, width / 2, card.y + 130 + i * 24, card.w - 48);
  });
  const spots = postcardMarkLayout(content.marks.length, width / 2, card.y + 232);
  content.marks.forEach((mark, i) => drawMark(ctx, mark, spots[i], colors));
  ctx.fillStyle = colors.accent;
  ctx.font = canvasFont('small', 'bold');
  ctx.fillText('★ Tessl Carnival ★', width / 2, card.y + card.h - 22);
}

export const POSTCARD_MESSAGES = {
  making: 'Making your postcard…',
  failed:
    'The postcard picture could not be made in this browser. The card text above is still yours to copy.',
  started: (filename: string) => `Download of ${filename} started.`,
};

/** What a postcard export needs from the browser, so the export can be tested without one. */
export interface PostcardExportIO<B> {
  /** Encodes the picture and calls back once, with null when it cannot. May throw. */
  encode(done: (blob: B | null) => void): void;
  createUrl(blob: B): string;
  revokeUrl(url: string): void;
  /** Asks the browser to download the URL under the file name. */
  download(url: string, filename: string): void;
  report(message: string): void;
}

/**
 * Exports the postcard picture. Each export keeps the file name it was asked
 * for. An encoding that finishes after a newer export started, or after
 * dispose, does nothing: no URL, no download, no status. Dispose revokes the
 * last URL.
 */
export function postcardExporter<B>(io: PostcardExportIO<B>) {
  let url: string | undefined;
  let current = 0;
  let disposed = false;
  return {
    export(filename: string) {
      if (disposed) return;
      const run = ++current;
      const live = () => !disposed && run === current;
      io.report(POSTCARD_MESSAGES.making);
      try {
        io.encode((blob) => {
          if (!live()) return;
          if (!blob) return io.report(POSTCARD_MESSAGES.failed);
          if (url) io.revokeUrl(url);
          url = io.createUrl(blob);
          io.download(url, filename);
          io.report(POSTCARD_MESSAGES.started(filename));
        });
      } catch {
        if (live()) io.report(POSTCARD_MESSAGES.failed);
      }
    },
    dispose() {
      disposed = true;
      if (url) io.revokeUrl(url);
      url = undefined;
    },
  };
}
