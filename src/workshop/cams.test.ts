import { describe, expect, it } from 'vitest';
import {
  CAM_BASE,
  CAM_REACH,
  GUARD_LIFT,
  PEBBLE,
  camOutline,
  camRadius,
  followerLift,
  frogFigure,
  frogPose,
  frogRig,
  guardTurn,
  pebbleGap,
  stallTurn,
  stillPhase,
  type CamShape,
} from './cams';
import { CAMS, faultyToy, runToy, targets, SHAFT } from './workshop';

const PHASES = Array.from({ length: 41 }, (_, i) => i / 40);

/** The highest point of the drawn outline on the line straight above the shaft. */
function outlineTop(cam: CamShape, turns: number): number {
  const pts = camOutline(cam, turns, 720);
  let top = 0;
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]];
    if (a.x === b.x || Math.sign(a.x) === Math.sign(b.x)) {
      if (Math.abs(a.x) < 1e-9 && a.y < 0) top = Math.min(top, a.y);
      continue;
    }
    const y = a.y + ((b.y - a.y) * (0 - a.x)) / (b.x - a.x);
    if (y < 0) top = Math.min(top, y);
  }
  return top;
}

describe('cam profiles', () => {
  it('stays inside each cam reach the bench uses for its spots and hits', () => {
    for (const cam of CAMS)
      for (let i = 0; i < 360; i++) {
        const r = camRadius(cam, (i / 360) * Math.PI * 2);
        expect(r).toBeGreaterThanOrEqual(CAM_BASE - 1e-9);
        expect(r).toBeLessThanOrEqual(CAM_REACH[cam] + 1e-9);
      }
  });

  it('puts the follower foot on the drawn outline at every phase of every cam', () => {
    for (const cam of CAMS)
      for (const phase of PHASES)
        for (const stalled of [false, true]) {
          const pose = frogPose(cam, phase, stalled);
          const rig = frogRig(pose);
          // The step of the snail is a vertical edge: right on it, the foot is on the lower end.
          if (cam === 'snail' && Math.abs(pose.lift) < 1e-6) continue;
          expect(rig.foot).toBeCloseTo(outlineTop(cam, pose.turns), 0);
        }
  });

  it('rests the follower on the base circle, at the same height with no cam', () => {
    expect(frogRig(frogPose(undefined, 0.4, false)).foot).toBe(-CAM_BASE);
    for (const cam of CAMS)
      expect(Math.min(...PHASES.map((p) => frogPose(cam, p, false).lift))).toBeCloseTo(0, 1);
  });

  it('bobs gently with the round cam, smoothly up and down', () => {
    const lifts = PHASES.map((p) => frogPose('round', p, false).lift);
    expect(Math.max(...lifts)).toBeCloseTo(12, 1);
    expect(Math.max(...lifts)).toBeLessThan(GUARD_LIFT);
    for (let i = 1; i < lifts.length; i++)
      expect(Math.abs(lifts[i] - lifts[i - 1])).toBeLessThan(4);
    expect(guardTurn('round')).toBeUndefined();
  });

  it('climbs the snail spiral slowly, then drops off its step: a hop', () => {
    const climb = Array.from({ length: 20 }, (_, i) => followerLift('snail', i / 20 + 0.01));
    for (let i = 1; i < climb.length; i++) expect(climb[i]).toBeGreaterThan(climb[i - 1]);
    expect(followerLift('snail', 0.995)).toBeGreaterThan(17);
    expect(followerLift('snail', 1.005)).toBeLessThan(1);
    expect(guardTurn('snail')).toBeUndefined();
  });

  it('pushes the frog into the guard with the tall cam, and the guard holds it', () => {
    const at = guardTurn('tall')!;
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(0.5);
    const before = frogPose('tall', (at * 0.9) / 2, false);
    expect(before.caught).toBe(false);
    for (const phase of PHASES.filter((p) => p * 2 >= at)) {
      const pose = frogPose('tall', phase, false);
      expect(pose.caught).toBe(true);
      // Caught: the frog's eyes sit on the guard's underside while the follower may drop away below.
      const rig = frogRig(pose);
      expect(rig.frog - 17).toBeCloseTo(rig.guard, 6);
      expect(rig.rodTop).toBeGreaterThanOrEqual(rig.frog + 14 - 1e-9);
    }
  });

  it('keeps the frog below the guard except when the tall cam puts it there', () => {
    for (const cam of ['round', 'snail'] as const)
      for (const phase of PHASES) {
        const rig = frogRig(frogPose(cam, phase, false));
        expect(rig.frog - 17).toBeGreaterThan(rig.guard);
      }
  });
});

describe('the pebble stall', () => {
  it('sits clear of the shaft and of every cam at rest, inside the pebble hit spot', () => {
    for (const cam of CAMS) expect(pebbleGap(cam, 0)).toBeGreaterThan(0);
    const pebble = targets(faultyToy('hopping-frog')).find((t) => t.id === 'pebble')!;
    expect(pebble).toMatchObject({ x: SHAFT.x + PEBBLE.dx, y: SHAFT.y + PEBBLE.dy });
  });

  it('stops each cam where its outline meets the pebble, and holds it there', () => {
    for (const cam of CAMS) {
      const stop = stallTurn(cam);
      expect(stop).toBeGreaterThan(0);
      expect(stop).toBeLessThan(1);
      expect(Math.abs(pebbleGap(cam, stop))).toBeLessThan(0.5);
      for (const phase of PHASES) {
        const pose = frogPose(cam, phase, true);
        expect(pose.turns).toBeLessThanOrEqual(stop);
        expect(pebbleGap(cam, pose.turns)).toBeGreaterThan(-0.5);
        expect(pose.caught).toBe(false);
      }
    }
  });

  it('stalls the round cam the faulty toy arrives with before it lifts the frog far', () => {
    const toy = faultyToy('hopping-frog');
    const result = runToy(toy);
    expect(result).toMatchObject({ kind: 'cam', cam: 'round', stalled: true });
    expect(frogPose('round', 1, true).lift).toBeLessThan(6);
  });
});

describe('still frames', () => {
  it('show the stalled cam pressed on the pebble', () => {
    for (const cam of CAMS) {
      const pose = frogPose(cam, stillPhase(cam, true), true);
      expect(Math.abs(pebbleGap(cam, pose.turns))).toBeLessThan(0.5);
    }
  });

  it('show the round bob at its top, the tall frog in the guard and the snail before its drop', () => {
    const round = frogPose('round', stillPhase('round', false), false);
    expect(round.lift).toBeCloseTo(12, 1);
    expect(frogPose('tall', stillPhase('tall', false), false).caught).toBe(true);
    const snail = frogPose('snail', stillPhase('snail', false), false);
    expect(snail.lift).toBeGreaterThan(16);
    expect(snail.caught).toBe(false);
  });
});

describe('the crafted frog', () => {
  it('keeps the rod in the socket while the tall cam holds a caught frog against the guard', () => {
    const held = frogPose('tall', stillPhase('tall', false), false);
    expect(held.caught).toBe(true);
    expect(held.lift).toBeCloseTo(GUARD_LIFT, 9);
    expect(frogRig(held).seated).toBe(true);
    const dropped = frogPose('tall', 1, false);
    expect(dropped.caught).toBe(true);
    expect(frogRig(dropped).seated).toBe(false);
  });

  it('keeps the seat on the rod, the eye tops at the guard and the legs off the bench', () => {
    for (const cam of CAMS)
      for (const phase of PHASES)
        for (const stalled of [false, true]) {
          const pose = frogPose(cam, phase, stalled);
          const rig = frogRig(pose);
          const fig = frogFigure(rig.frog);
          const bottom = (b: { y: number; ry: number }) => b.y + b.ry;
          // The socket opens flush with the seat, where the rod's top stands unless the guard holds the frog.
          expect(fig.mount.y + fig.mount.height).toBeCloseTo(bottom(fig.body), 9);
          if (!pose.caught) expect(rig.seated).toBe(true);
          if (rig.seated) expect(rig.rodTop).toBeCloseTo(bottom(fig.body), 9);
          else expect(rig.rodTop).toBeGreaterThan(bottom(fig.body));
          // Nothing else reaches below the body, so only the rod holds the frog up.
          for (const part of [...fig.haunches, ...fig.feet])
            expect(bottom(part)).toBeLessThan(bottom(fig.body));
          // The eyes are still the highest point, which is what meets the guard.
          const top = Math.min(...fig.eyes.map((e) => e.y - e.ry));
          expect(top).toBeCloseTo(rig.frog - 17, 9);
          for (const part of [fig.body, ...fig.haunches, ...fig.feet])
            expect(part.y - part.ry).toBeGreaterThan(top);
          if (pose.caught) expect(top).toBeCloseTo(rig.guard, 6);
          else expect(top).toBeGreaterThan(rig.guard);
        }
  });
});
