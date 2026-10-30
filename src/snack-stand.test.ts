import { describe, expect, it } from 'vitest';
import {
  BASES,
  PRESENTATIONS,
  TOPPINGS,
  VISITORS,
  nextVisitor,
  pickChoice,
  portraitFor,
  react,
} from './snack-stand';

describe('snack stand', () => {
  const pip = VISITORS[0];

  it('delights a visitor served exactly what they asked for', () => {
    expect(react(pip, pip.wants)).toMatchObject({ matches: 3, mood: 'delighted' });
  });

  it('names what a visitor was still hoping for on a partial match', () => {
    const reaction = react(pip, { ...pip.wants, topping: 'crumbs' });
    expect(reaction).toMatchObject({ matches: 2, mood: 'pleased' });
    expect(reaction.line).toContain('rainbow sprinkles');
  });

  it('is curious, not unhappy, when nothing matches', () => {
    const reaction = react(pip, { base: 'stick', topping: 'drizzle', presentation: 'ribbon' });
    expect(reaction).toMatchObject({ matches: 0, mood: 'curious' });
  });

  it('gives every visitor a different order that can be made', () => {
    const orders = new Set(VISITORS.map((v) => JSON.stringify(v.wants)));
    expect(orders.size).toBe(3);
    for (const v of VISITORS) {
      expect(BASES).toContain(v.wants.base);
      expect(TOPPINGS).toContain(v.wants.topping);
      expect(PRESENTATIONS).toContain(v.wants.presentation);
    }
  });

  it('accepts only known choices', () => {
    expect(pickChoice(BASES, 'cup')).toBe('cup');
    expect(pickChoice(BASES, 'pizza')).toBeUndefined();
    expect(pickChoice(BASES, undefined)).toBeUndefined();
  });

  it('wraps round to the first visitor after the third', () => {
    expect(nextVisitor(0)).toBe(1);
    expect(nextVisitor(2)).toBe(0);
  });

  it('gives every visitor their own portrait accessory', () => {
    const headwear = VISITORS.map((visitor) => portraitFor(visitor).headwear);
    expect(new Set(headwear).size).toBe(VISITORS.length);
  });

  it('gives a plain portrait to a name that is not listed', () => {
    const plain = { face: { rx: 36, ry: 36 }, headwear: 'none' };
    for (const name of ['Nobody Yet', 'toString', 'constructor', '__proto__', 'hasOwnProperty']) {
      expect(portraitFor({ ...pip, name })).toEqual(plain);
    }
  });
});
