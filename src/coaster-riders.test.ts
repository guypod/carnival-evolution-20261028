import { describe, expect, it } from 'vitest';
import {
  FAST,
  createWorkshop,
  nudge,
  riderReports,
  rideSpans,
  settleReports,
  showStatic,
  starterLayout,
  stopTest,
  wrapText,
  announcement,
  pointX,
  type Point,
} from './coaster-workshop';

/** A flat, low run that a fast drop never happens on. */
function gentle(): Point[] {
  return nudge(nudge(starterLayout(), 1, -200), 3, -100);
}

describe('coaster riders', () => {
  it('measures speed, slope and height from the model', () => {
    const rides = rideSpans(starterLayout());
    expect(rides.length).toBeGreaterThan(0);
    expect(rides[0].steepest).toBeGreaterThan(0.6);
    expect(Math.max(...rides.map((r) => r.topSpeed))).toBeGreaterThan(FAST);
  });

  it('measures only the part of a span the train rode before it stalled', () => {
    // A tall first hill the train cannot climb: it stalls a few pixels in.
    const wall = [440, 80, 80, 80, 80, 80, 80].map((y, i) => ({ x: pointX(i), y }));
    const rides = rideSpans(wall);
    expect(rides).toHaveLength(1);
    expect(rides[0].height).toBeLessThan(20);
    expect(rides[0].mid.y).toBeGreaterThan(420);
    const [gail] = riderReports(wall);
    expect(gail.summary).not.toMatch(/calm view/);
  });

  it('gives the two riders different reactions to the same drop', () => {
    const [gail, theo] = riderReports(starterLayout());
    expect(gail.notes[0].reaction).toBe('disliked');
    expect(theo.notes[0].reaction).toBe('liked');
    expect(gail.summary).toMatch(/Lower point 1 or raise point 2/);
  });

  it('changes when the geometry changes', () => {
    const before = riderReports(starterLayout());
    const after = riderReports(gentle());
    expect(after[0].notes[0].reaction).not.toBe('disliked');
    expect(after).not.toEqual(before);
  });

  it('gives the same report for the same track every time', () => {
    expect(riderReports(starterLayout())).toEqual(riderReports(starterLayout()));
  });

  it('adds the riders to the finished test and clears them on stop', () => {
    const w = createWorkshop();
    showStatic(w);
    settleReports(w);
    expect(announcement(w)).toMatch(/Gentle Gail likes/);
    expect(announcement(w)).toMatch(/Thrill Theo likes/);
    stopTest(w);
    expect(w.reports).toBeUndefined();
  });

  it('wraps long status text to the width', () => {
    const lines = wrapText('one two three four five', 9, (s) => s.length);
    expect(lines).toEqual(['one two', 'three', 'four five']);
  });
});
