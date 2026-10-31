import { describe, expect, it } from 'vitest';
import { prizeFor } from './prizes';

const tiers = [
  { name: 'Gold', minScore: 500 },
  { name: 'Bronze', minScore: 100 },
  { name: 'Silver', minScore: 250 },
];

describe('prizeFor', () => {
  it('gives nothing below the lowest tier', () => {
    expect(prizeFor(99, tiers)).toBeUndefined();
  });

  it('gives the best tier the score reaches, whatever order tiers are listed in', () => {
    expect(prizeFor(100, tiers)?.name).toBe('Bronze');
    expect(prizeFor(499, tiers)?.name).toBe('Silver');
    expect(prizeFor(10_000, tiers)?.name).toBe('Gold');
  });
});
