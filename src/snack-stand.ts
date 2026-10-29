import { canvasFont, theme } from './carnival';

/** Each step of a snack, with its choices. Every snack here is made up. */
export const BASES = ['cone', 'cup', 'stick'] as const;
export const TOPPINGS = ['sprinkles', 'drizzle', 'crumbs'] as const;
export const PRESENTATIONS = ['flag', 'ribbon', 'wrapper'] as const;
export type Base = (typeof BASES)[number];
export type Topping = (typeof TOPPINGS)[number];
export type Presentation = (typeof PRESENTATIONS)[number];

export const CHOICE_NAMES: Record<Base | Topping | Presentation, string> = {
  cone: 'waffle cone',
  cup: 'paper cup',
  stick: 'cloud stick',
  sprinkles: 'rainbow sprinkles',
  drizzle: 'star drizzle',
  crumbs: 'moon crumbs',
  flag: 'paper flag',
  ribbon: 'twirl ribbon',
  wrapper: 'shiny wrapper',
};

export interface Snack {
  base: Base;
  topping: Topping;
  presentation: Presentation;
}

export interface Visitor {
  name: string;
  /** What the visitor says they would like, one choice per step. */
  wants: Snack;
  order: string;
}

/** Three fictional visitors, each with a clearly stated preference. */
export const VISITORS: readonly Visitor[] = [
  {
    name: 'Captain Pip',
    wants: { base: 'cone', topping: 'sprinkles', presentation: 'flag' },
    order: 'A waffle cone with rainbow sprinkles, and a paper flag to wave!',
  },
  {
    name: 'Madame Luna',
    wants: { base: 'cup', topping: 'crumbs', presentation: 'wrapper' },
    order: 'Moon crumbs in a paper cup, please, in a shiny wrapper.',
  },
  {
    name: 'Twirly Tess',
    wants: { base: 'stick', topping: 'drizzle', presentation: 'ribbon' },
    order: 'Star drizzle on a cloud stick, finished with a twirl ribbon.',
  },
];

export type Mood = 'delighted' | 'pleased' | 'curious';

export interface Reaction {
  matches: number;
  mood: Mood;
  line: string;
}

/** How a visitor reacts to the snack actually served: all three, some, or none matched. */
export function react(visitor: Visitor, snack: Snack): Reaction {
  const steps = ['base', 'topping', 'presentation'] as const;
  const matched = steps.filter((step) => visitor.wants[step] === snack[step]);
  const missed = steps.filter((step) => visitor.wants[step] !== snack[step]);
  const matches = matched.length;
  if (matches === 3) {
    return {
      matches,
      mood: 'delighted',
      line: `${visitor.name} beams: exactly what they hoped for!`,
    };
  }
  if (matches > 0) {
    const hoped = missed.map((step) => CHOICE_NAMES[visitor.wants[step]]).join(' and ');
    return {
      matches,
      mood: 'pleased',
      line: `${visitor.name} smiles, but was hoping for ${hoped}.`,
    };
  }
  return {
    matches,
    mood: 'curious',
    line: `${visitor.name} tilts their head at this surprise. Try another combination!`,
  };
}

/** Parses a choice from a form value, or undefined when it is not one of the step's choices. */
export function pickChoice<T extends string>(choices: readonly T[], value: unknown): T | undefined {
  return choices.includes(value as T) ? (value as T) : undefined;
}

/** The next visitor in line, wrapping round after the third. */
export function nextVisitor(index: number): number {
  return (index + 1) % VISITORS.length;
}

export const SNACK_SCENE = { width: 360, height: 260 } as const;

const TOPPING_COLORS: Record<Topping, keyof typeof theme.colors> = {
  sprinkles: 'stripeA',
  drizzle: 'accent',
  crumbs: 'muted',
};

/**
 * Draws the counter, the snack as assembled so far and the visitor's face.
 * Everything is static, so Quiet and reduced motion need nothing different.
 */
export function drawSnackScene(
  ctx: CanvasRenderingContext2D,
  snack: Partial<Snack>,
  visitor: Visitor,
  mood: Mood | undefined,
) {
  const { width, height } = SNACK_SCENE;
  const c = theme.colors;
  ctx.fillStyle = c.background;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = c.wood;
  ctx.fillRect(0, height - 40, width, 40);

  // The snack, centre left.
  const x = 110;
  const top = 90;
  ctx.fillStyle = c.wood;
  ctx.beginPath();
  if (snack.base === 'cone') {
    ctx.moveTo(x - 30, top + 20);
    ctx.lineTo(x + 30, top + 20);
    ctx.lineTo(x, height - 45);
    ctx.closePath();
    ctx.fill();
  } else if (snack.base === 'cup') {
    ctx.fillStyle = c.stripeB;
    ctx.moveTo(x - 34, top + 20);
    ctx.lineTo(x + 34, top + 20);
    ctx.lineTo(x + 24, height - 45);
    ctx.lineTo(x - 24, height - 45);
    ctx.closePath();
    ctx.fill();
  } else if (snack.base === 'stick') {
    ctx.fillRect(x - 3, top + 20, 6, height - 65 - top);
  }
  if (snack.base) {
    ctx.fillStyle = snack.base === 'stick' ? c.water : c.stripeB;
    ctx.beginPath();
    ctx.arc(x, top + 12, 30, 0, Math.PI * 2);
    ctx.fill();
  }
  if (snack.base && snack.topping) {
    ctx.fillStyle = c[TOPPING_COLORS[snack.topping]];
    for (let i = 0; i < 9; i++) {
      const angle = (i / 9) * Math.PI * 2;
      ctx.fillRect(x + Math.cos(angle) * 18 - 3, top + 4 + Math.sin(angle) * 14 - 3, 6, 6);
    }
  }
  if (snack.base && snack.presentation === 'flag') {
    ctx.fillStyle = c.text;
    ctx.fillRect(x + 4, top - 40, 2, 30);
    ctx.fillStyle = c.stripeA;
    ctx.fillRect(x + 6, top - 40, 20, 12);
  } else if (snack.base && snack.presentation === 'ribbon') {
    ctx.strokeStyle = c.accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 30, top + 40);
    ctx.bezierCurveTo(x - 10, top + 20, x + 10, top + 60, x + 30, top + 40);
    ctx.stroke();
  } else if (snack.base && snack.presentation === 'wrapper') {
    ctx.strokeStyle = c.water;
    ctx.lineWidth = 3;
    ctx.strokeRect(x - 40, top - 22, 80, height - 60 - top);
  }

  // The visitor, right, with a face that shows the reaction.
  const vx = 270;
  const vy = 110;
  ctx.fillStyle = c.surface;
  ctx.beginPath();
  ctx.arc(vx, vy, 40, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = c.text;
  ctx.fillRect(vx - 16, vy - 12, 6, 6);
  ctx.fillRect(vx + 10, vy - 12, 6, 6);
  ctx.strokeStyle = mood === 'delighted' ? c.accent : c.text;
  ctx.lineWidth = 3;
  ctx.beginPath();
  if (mood === 'delighted') ctx.arc(vx, vy + 6, 16, 0.1 * Math.PI, 0.9 * Math.PI);
  else if (mood === 'pleased') ctx.arc(vx, vy + 4, 12, 0.25 * Math.PI, 0.75 * Math.PI);
  else if (mood === 'curious') ctx.arc(vx, vy + 18, 6, 0, Math.PI * 2);
  else {
    ctx.moveTo(vx - 10, vy + 14);
    ctx.lineTo(vx + 10, vy + 14);
  }
  ctx.stroke();
  ctx.fillStyle = c.text;
  ctx.font = canvasFont('small', 'bold');
  ctx.textAlign = 'center';
  ctx.fillText(visitor.name, vx, vy + 64, 160);
  if (mood) {
    ctx.font = canvasFont('small');
    ctx.fillText(mood, vx, vy + 84, 160);
  }
}
