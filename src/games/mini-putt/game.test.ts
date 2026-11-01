import { describe, expect, it, vi } from 'vitest';
import {
  ACTION_BUTTON,
  BALL_RADIUS,
  BOUNCE,
  COURSE,
  CUP_RADIUS,
  HELP,
  HOLES,
  MAX_STROKES,
  METER,
  METER_LABEL,
  PHYSICS_STEP,
  SINK_SPEED,
  aimAt,
  aimPath,
  beginRound,
  changePower,
  clampPower,
  collideBumper,
  collideEdges,
  collideWall,
  createState,
  dropsIn,
  holeScore,
  keyAction,
  nextHole,
  pointerAction,
  putt,
  saveFinalScore,
  setPower,
  startRound,
  step,
  totalScore,
  totalStrokes,
  type PuttState,
} from './game';

function playing(hole = 0): PuttState {
  const state = createState();
  startRound(state);
  for (let i = 0; i < hole; i++) {
    state.phase = 'holeDone';
    state.results.push({ strokes: 1, sunk: true });
    nextHole(state);
  }
  return state;
}

function rollOut(state: PuttState) {
  for (let i = 0; i < 200 && state.phase === 'rolling'; i++) step(state, 0.1);
}

function shoot(state: PuttState, angleSteps: number, power: number) {
  state.angle = (angleSteps * Math.PI) / 36;
  state.power = power;
  expect(putt(state)).toBe(true);
  rollOut(state);
}

describe('holes', () => {
  it('has three holes with the tee and cup on the green and clear of walls', () => {
    expect(HOLES).toHaveLength(3);
    for (const hole of HOLES) {
      for (const p of [hole.start, hole.cup]) {
        expect(p.x).toBeGreaterThan(COURSE.x);
        expect(p.x).toBeLessThan(COURSE.x + COURSE.w);
        for (const wall of hole.walls) {
          const inX = p.x >= wall.x - BALL_RADIUS && p.x <= wall.x + wall.w + BALL_RADIUS;
          const inY = p.y >= wall.y - BALL_RADIUS && p.y <= wall.y + wall.h + BALL_RADIUS;
          expect(inX && inY).toBe(false);
        }
      }
    }
  });

  it('can be sunk on every hole with real putts', () => {
    const plays: [number, number][][] = [
      [[6, 0.85]],
      [
        [42, 1],
        [5, 0.85],
      ],
      [
        [13, 1],
        [5, 0.7],
      ],
    ];
    plays.forEach((shots, hole) => {
      const state = playing(hole);
      for (const [angle, power] of shots) shoot(state, angle, power);
      expect(state.phase).toBe('holeDone');
      expect(state.results[hole]).toEqual({ strokes: shots.length, sunk: true });
    });
  });

  it('rolls the same putt the same way whatever the frame rate', () => {
    const a = playing(1);
    const b = playing(1);
    a.angle = b.angle = 0.3;
    putt(a);
    putt(b);
    for (let i = 0; i < 30; i++) step(a, 0.1);
    for (let i = 0; i < 300; i++) step(b, 0.01);
    expect(a.ball.x).toBeCloseTo(b.ball.x, 6);
    expect(a.ball.y).toBeCloseTo(b.ball.y, 6);
  });
});

describe('physics', () => {
  it('slows the ball with friction until it stops', () => {
    const state = playing();
    state.angle = Math.PI / 2;
    state.power = 0.2;
    putt(state);
    const start = state.velocity.y;
    step(state, 0.1);
    expect(state.velocity.y).toBeLessThan(start);
    rollOut(state);
    expect(state.phase).toBe('aiming');
    expect(state.velocity).toEqual({ x: 0, y: 0 });
  });

  it('bounces off the edges of the green', () => {
    const state = playing();
    state.ball = { x: COURSE.x + 2, y: 200 };
    state.velocity = { x: -100, y: 0 };
    collideEdges(state);
    expect(state.ball.x).toBe(COURSE.x + BALL_RADIUS);
    expect(state.velocity.x).toBeGreaterThan(0);
  });

  it('bounces off a wall', () => {
    const state = playing();
    const wall = { x: 300, y: 100, w: 20, h: 200 };
    state.ball = { x: 295, y: 200 };
    state.velocity = { x: 200, y: 0 };
    collideWall(state, wall);
    expect(state.ball.x).toBeCloseTo(300 - BALL_RADIUS);
    expect(state.velocity.x).toBeLessThan(0);
  });

  it('bounces off a bumper', () => {
    const state = playing();
    const bumper = { x: 300, y: 200, r: 30 };
    state.ball = { x: 300, y: 165 };
    state.velocity = { x: 0, y: 200 };
    collideBumper(state, bumper);
    expect(state.ball.y).toBeCloseTo(200 - 30 - BALL_RADIUS);
    expect(state.velocity.y).toBeLessThan(0);
  });

  it('never lets the ball through the wall on hole 1', () => {
    const state = playing();
    state.angle = 0;
    state.power = 1;
    putt(state);
    const wall = HOLES[0].walls[0];
    for (let i = 0; i < 200 && state.phase === 'rolling'; i++) {
      step(state, 0.02);
      expect(state.ball.x).toBeLessThan(wall.x);
    }
  });
});

describe('the cup', () => {
  it('drops a slow ball over the cup', () => {
    const cup = { x: 100, y: 100 };
    expect(dropsIn({ x: 100 + CUP_RADIUS - 1, y: 100 }, SINK_SPEED, cup)).toBe(true);
  });

  it('lets a fast ball roll over the cup', () => {
    expect(dropsIn({ x: 100, y: 100 }, SINK_SPEED + 1, { x: 100, y: 100 })).toBe(false);
  });

  it('misses a ball that is too far away', () => {
    expect(dropsIn({ x: 100 + CUP_RADIUS + 1, y: 100 }, 0, { x: 100, y: 100 })).toBe(false);
  });

  it('sinks a gentle putt that rolls into the cup', () => {
    const state = playing();
    const cup = HOLES[0].cup;
    state.ball = { x: cup.x - 40, y: cup.y };
    state.angle = 0;
    state.power = 0.2;
    putt(state);
    rollOut(state);
    expect(state.results[0]).toEqual({ strokes: 1, sunk: true });
  });
});

describe('strokes and score', () => {
  it('counts a stroke per putt and refuses putts while rolling', () => {
    const state = playing();
    expect(putt(state)).toBe(true);
    expect(putt(state)).toBe(false);
    expect(state.strokes).toBe(1);
  });

  it('ends a hole unsunk at the stroke limit', () => {
    const state = playing();
    state.angle = Math.PI / 2;
    state.power = 0.1;
    for (let i = 0; i < MAX_STROKES; i++) {
      expect(state.phase).toBe('aiming');
      putt(state);
      rollOut(state);
    }
    expect(state.phase).toBe('holeDone');
    expect(state.results[0]).toEqual({ strokes: MAX_STROKES, sunk: false });
    expect(holeScore(state.results[0])).toBe(0);
  });

  it('scores fewer strokes higher and never below zero', () => {
    expect(holeScore({ strokes: 1, sunk: true })).toBe(60);
    expect(holeScore({ strokes: 3, sunk: true })).toBe(40);
    expect(holeScore({ strokes: MAX_STROKES, sunk: true })).toBe(10);
    expect(holeScore({ strokes: MAX_STROKES, sunk: false })).toBe(0);
  });

  it('adds up holes and strokes, then ends after the third hole', () => {
    const state = playing();
    state.strokes = 2;
    state.phase = 'holeDone';
    state.results.push({ strokes: 2, sunk: true });
    expect(totalStrokes(state)).toBe(2);
    nextHole(state);
    expect(state.hole).toBe(1);
    expect(state.ball).toEqual(HOLES[1].start);
    state.strokes = 1;
    expect(totalStrokes(state)).toBe(3);
    state.phase = 'holeDone';
    state.results.push({ strokes: 1, sunk: true }, { strokes: 6, sunk: false });
    state.hole = 2;
    nextHole(state);
    expect(state.phase).toBe('over');
    expect(totalScore(state)).toBe(50 + 60);
  });

  it('keeps power in range', () => {
    expect(clampPower(5)).toBe(1);
    expect(clampPower(-1)).toBe(0.1);
    const state = playing();
    setPower(state, 1);
    changePower(state, 1);
    expect(state.power).toBe(1);
  });
});

describe('saving and replay', () => {
  function finished() {
    const state = playing();
    state.results = [
      { strokes: 1, sunk: true },
      { strokes: 2, sunk: true },
      { strokes: 6, sunk: false },
    ];
    state.phase = 'over';
    return state;
  }

  it('saves the final score exactly once', () => {
    const state = finished();
    const record = vi.fn();
    saveFinalScore(state, record);
    saveFinalScore(state, record);
    beginRound(state, record);
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(110);
  });

  it('does not save mid-round', () => {
    const record = vi.fn();
    saveFinalScore(playing(), record);
    expect(record).not.toHaveBeenCalled();
  });

  it('reports a failed save and only retries on replay', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const state = finished();
    const record = vi.fn(() => {
      throw new Error('full');
    });
    expect(saveFinalScore(state, record)).toBeInstanceOf(Error);
    expect(state.saveFailed).toBe(true);
    saveFinalScore(state, record);
    expect(record).toHaveBeenCalledTimes(1);
    const ok = vi.fn();
    const next = beginRound(state, ok);
    expect(ok).toHaveBeenCalledTimes(1);
    expect(next.phase).toBe('aiming');
  });

  it('saves when the last hole ends, before Next is pressed', () => {
    const state = finished();
    state.hole = HOLES.length - 1;
    state.phase = 'holeDone';
    const record = vi.fn();
    saveFinalScore(state, record);
    expect(record).toHaveBeenCalledWith(110);
    nextHole(state);
    expect(state.phase).toBe('over');
    saveFinalScore(state, record, true);
    expect(record).toHaveBeenCalledTimes(1);
  });

  it('saves on exit right after the last hole, before Next', () => {
    const state = finished();
    state.hole = HOLES.length - 1;
    state.phase = 'holeDone';
    const record = vi.fn();
    saveFinalScore(state, record, true);
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(110);
  });

  it('keeps the result screen when the replay retry fails too', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const state = finished();
    const fail = vi.fn(() => {
      throw new Error('full');
    });
    saveFinalScore(state, fail);
    const next = beginRound(state, fail);
    expect(fail).toHaveBeenCalledTimes(2);
    expect(next).toBe(state);
    expect(next.phase).toBe('over');
    expect(next.saveFailed).toBe(true);
    const ok = vi.fn();
    saveFinalScore(next, ok, true);
    expect(ok).toHaveBeenCalledWith(110);
  });

  it('starts a fresh round on replay', () => {
    const next = beginRound(finished(), () => {});
    expect(next.hole).toBe(0);
    expect(next.results).toEqual([]);
    expect(next.strokes).toBe(0);
    expect(next.scoreRecorded).toBe(false);
  });
});

describe('controls', () => {
  it('leaves keys alone while a page control has focus', () => {
    expect(keyAction('Space', ' ', 'BUTTON')).toBeUndefined();
    expect(keyAction('ArrowUp', 'ArrowUp', 'input')).toBeUndefined();
    expect(keyAction('Space', ' ', 'CANVAS')).toBe('go');
    expect(keyAction('Enter', 'Enter')).toBe('go');
    expect(keyAction('ArrowDown', 'ArrowDown')).toBe('down');
  });

  it('aims at a tapped point on the green', () => {
    const state = playing();
    const action = pointerAction(state, state.ball.x, state.ball.y + 100);
    expect(action).toEqual({ kind: 'aim', x: state.ball.x, y: state.ball.y + 100 });
    aimAt(state, state.ball.x, state.ball.y + 100);
    expect(state.angle).toBeCloseTo(Math.PI / 2);
  });

  it('only starts from the start button before a round', () => {
    const state = createState();
    expect(pointerAction(state, 400, 400)).toEqual({ kind: 'begin' });
    expect(pointerAction(state, 100, 100)).toBeUndefined();
  });

  it('keeps the help, power label, meter and button apart, below the green', () => {
    const row = [HELP, METER_LABEL, METER, ACTION_BUTTON];
    for (let i = 1; i < row.length; i++) {
      expect(row[i - 1].x + row[i - 1].w).toBeLessThan(row[i].x);
    }
    for (const box of row) expect(box.y).toBeGreaterThan(COURSE.y + COURSE.h);
  });

  it('putts from the action button only while aiming', () => {
    const state = playing();
    expect(pointerAction(state, 680, 470)).toEqual({ kind: 'putt' });
    putt(state);
    expect(pointerAction(state, 680, 470)).toBeUndefined();
  });
});

describe('aim guide', () => {
  const open = { start: { x: 0, y: 0 }, cup: { x: 0, y: 0 }, walls: [], bumpers: [] };

  it('runs to the first edge and shows the bounce off it', () => {
    const [start, bounce, next] = aimPath({ x: 400, y: 255 }, Math.PI / 4, open);
    const bottom = COURSE.y + COURSE.h - BALL_RADIUS;
    expect(start).toEqual({ x: 400, y: 255 });
    expect(bounce.x).toBeCloseTo(400 + (bottom - 255));
    expect(bounce.y).toBeCloseTo(bottom);
    // Off the bottom edge it keeps BOUNCE of its downward speed, so it climbs
    // at a shallower slope until the right edge.
    expect(next.x).toBeCloseTo(COURSE.x + COURSE.w - BALL_RADIUS);
    expect(next.y).toBeCloseTo(bottom - BOUNCE * (next.x - bounce.x));
  });

  it('follows the rolling ball through an oblique bounce on hole 1', () => {
    const state = playing();
    const hole = HOLES[0];
    const [, bounce, next] = aimPath(state.ball, Math.PI / 4, hole);
    state.angle = Math.PI / 4;
    setPower(state, 1);
    putt(state);
    // Roll until the ball has bounced off the bottom edge and reached the wall.
    while (state.phase === 'rolling' && state.ball.x < next.x - 0.5) step(state, PHYSICS_STEP);
    expect(bounce.y).toBeCloseTo(COURSE.y + COURSE.h - BALL_RADIUS);
    expect(next.x).toBeCloseTo(hole.walls[0].x - BALL_RADIUS);
    // The fixed physics step lands it within a pixel or two of the guide.
    expect(Math.abs(state.ball.y - next.y)).toBeLessThan(3);
  });

  it('lets the ball clear a wall corner it only passes near', () => {
    const hole = HOLES[0];
    const angle = Math.atan2(-122, 257);
    const [, bounce] = aimPath(hole.start, angle, hole);
    // The ray passes about 9.75px from the corner, more than BALL_RADIUS.
    expect(bounce.y).toBeCloseTo(COURSE.y + BALL_RADIUS);
  });

  it('bounces off a wall corner the ball does touch', () => {
    const wall = { x: 400, y: 200, w: 30, h: 100 };
    const hole = { ...open, walls: [wall] };
    // Aimed straight at the corner along the diagonal, it meets the round corner.
    const from = { x: 300, y: 100 };
    const [, bounce, next] = aimPath(from, Math.PI / 4, hole);
    const offset = BALL_RADIUS / Math.SQRT2;
    expect(bounce.x).toBeCloseTo(wall.x - offset);
    expect(bounce.y).toBeCloseTo(wall.y - offset);
    expect(next.x).toBeLessThan(bounce.x);
    expect(next.y).toBeLessThan(bounce.y);
  });

  it('meets a wall or bumper the ball is resting against', () => {
    const hole = HOLES[0];
    const touching = { x: hole.walls[0].x - BALL_RADIUS, y: hole.start.y };
    const [, bounce, next] = aimPath(touching, 0, hole);
    expect(bounce.x).toBeCloseTo(touching.x);
    expect(next.x).toBeCloseTo(COURSE.x + BALL_RADIUS);
    // Aiming away from the wall it rolls to the far edge.
    const [, away] = aimPath(touching, Math.PI, hole);
    expect(away.x).toBeCloseTo(COURSE.x + BALL_RADIUS);

    const bumper = { x: 400, y: 255, r: 30 };
    const resting = { x: bumper.x - bumper.r - BALL_RADIUS, y: bumper.y };
    const [, hit] = aimPath(resting, 0, { ...open, bumpers: [bumper] });
    expect(hit.x).toBeCloseTo(resting.x);
    const [, gone] = aimPath(resting, Math.PI, { ...open, bumpers: [bumper] });
    expect(gone.x).toBeCloseTo(COURSE.x + BALL_RADIUS);
  });

  it('stops at the centre wall of hole 1 and bounces straight back', () => {
    const hole = HOLES[0];
    const [, bounce, next] = aimPath(hole.start, 0, hole);
    expect(bounce.x).toBeCloseTo(hole.walls[0].x - BALL_RADIUS);
    expect(bounce.y).toBeCloseTo(hole.start.y);
    expect(next.x).toBeCloseTo(COURSE.x + BALL_RADIUS);
    expect(next.y).toBeCloseTo(hole.start.y);
  });

  it('bounces off a bumper away from its centre', () => {
    const bumper = { x: 400, y: 255, r: 30 };
    const hole = { ...open, bumpers: [bumper] };
    const [, bounce, next] = aimPath({ x: 200, y: 255 }, 0, hole);
    expect(bounce.x).toBeCloseTo(bumper.x - bumper.r - BALL_RADIUS);
    expect(next.x).toBeCloseTo(COURSE.x + BALL_RADIUS);
  });

  it('matches where the rolling ball first bounces on hole 3', () => {
    const state = createState();
    startRound(state);
    while (state.hole < 2) {
      state.phase = 'holeDone';
      nextHole(state);
    }
    const hole = HOLES[2];
    const angle = Math.atan2(hole.cup.y - hole.start.y, hole.cup.x - hole.start.x);
    const [, bounce] = aimPath(state.ball, angle, hole);
    expect(bounce.x).toBeCloseTo(hole.walls[0].x - BALL_RADIUS);

    setPower(state, 1);
    state.angle = angle;
    putt(state);
    while (state.phase === 'rolling' && state.velocity.x > 0) step(state, 1 / 240);
    expect(state.velocity.x).toBeLessThan(0);
    expect(state.ball.x).toBeCloseTo(bounce.x, 0);
    expect(state.ball.y).toBeCloseTo(bounce.y, -1);
  });
});
