import { describe, expect, it } from 'vitest';
import { bellHammerHead } from './repaired-toys';

describe('bellHammerHead', () => {
  it('touches the bell dome at the start of the swing', () => {
    const p = { x: 100, y: 100 };
    const head = bellHammerHead(p, 0);
    const gap = Math.hypot(head.x - (p.x + 4), head.y - (p.y - 18)) - 4 - 2.5;
    expect(gap).toBeLessThanOrEqual(0.5);
  });
  it('swings clear of the bell halfway through', () => {
    const p = { x: 100, y: 100 };
    const head = bellHammerHead(p, Math.PI / 3);
    expect(Math.hypot(head.x - (p.x + 4), head.y - (p.y - 18))).toBeGreaterThan(8);
  });
});
