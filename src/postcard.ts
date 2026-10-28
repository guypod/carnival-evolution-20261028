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
}

export interface PostcardContent {
  heading: string;
  greeting: string;
  /** The card's lines, in the order the picture shows them. */
  lines: string[];
  scene: Scene;
  filename: string;
}

// Control characters, and the invisible marks that reorder or hide text.
const UNSAFE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;

/**
 * The visitor name as the card shows it: no control or formatting characters,
 * spaces collapsed, trimmed, and at most POSTCARD_NAME_MAX characters.
 */
export function cleanVisitorName(raw: string): string {
  const text = raw.replace(UNSAFE, ' ').replace(/\s+/g, ' ').trim();
  return Array.from(text).slice(0, POSTCARD_NAME_MAX).join('').trim();
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
>;

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
    ctx.fillText(line, width / 2, card.y + 140 + i * 28, card.w - 48);
  });
  ctx.fillStyle = colors.accent;
  ctx.font = canvasFont('small', 'bold');
  ctx.fillText('★ Tessl Carnival ★', width / 2, card.y + card.h - 28);
}
