import { describe, expect, it } from 'vitest';
import { CAM_BASE, camOutline, followerLift } from '../workshop/cams';
import { bellHammerHead, frogSeat, frogTurns } from './repaired-toys';

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

describe('frogSeat', () => {
  it('rides the rod on the snail cam: a slow climb, then a drop', () => {
    const shaft = { x: 100, y: 100 };
    const seats = Array.from({ length: 10 }, (_, i) => frogSeat(shaft, 0.05 + i * 0.1));
    for (let i = 1; i < seats.length; i++) expect(seats[i]).toBeLessThan(seats[i - 1]);
    expect(frogSeat(shaft, 1.01)).toBeGreaterThan(frogSeat(shaft, 0.99) + 4);
  });

  it('stands the rod foot on the drawn cam outline straight above the shaft', () => {
    for (const turns of [0.1, 0.4, 0.75, 0.95]) {
      const pts = camOutline('snail', turns, 720);
      const top = Math.min(...pts.filter((q) => Math.abs(q.x) < 0.2 && q.y < 0).map((q) => q.y));
      expect((CAM_BASE + followerLift('snail', turns)) * -1).toBeCloseTo(top, 0);
      expect(frogTurns(turns / 0.8)).toBeCloseTo(turns, 9);
    }
  });
});
