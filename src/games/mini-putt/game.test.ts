import { describe, expect, it, vi } from 'vitest';
import {
  ACTION_BUTTON,
  BALL_RADIUS,
  BUMPER_LABEL,
  COURSE,
  CUP_RADIUS,
  HELP,
  HOLES,
  MAX_STROKES,
  METER,
  METER_LABEL,
  SINK_SPEED,
  aimAt,
  bumperLabelAt,
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

  it('labels every bumper on the green, clear of walls, the tee and the cup', () => {
    expect(BUMPER_LABEL).toBe('Bumper');
    const halfWidth = 30;
    const height = 14;
    for (const hole of HOLES) {
      for (const bumper of hole.bumpers) {
        const label = bumperLabelAt(bumper);
        const box = { x: label.x - halfWidth, y: label.y - height, w: halfWidth * 2, h: height };
        expect(box.y).toBeGreaterThan(bumper.y + bumper.r);
        expect(box.x).toBeGreaterThan(COURSE.x);
        expect(box.x + box.w).toBeLessThan(COURSE.x + COURSE.w);
        expect(box.y + box.h).toBeLessThan(COURSE.y + COURSE.h);
        for (const wall of hole.walls) {
          const apart =
            box.x + box.w < wall.x ||
            box.x > wall.x + wall.w ||
            box.y + box.h < wall.y ||
            box.y > wall.y + wall.h;
          expect(apart).toBe(true);
        }
        for (const other of hole.bumpers) {
          const nx = Math.min(Math.max(other.x, box.x), box.x + box.w);
          const ny = Math.min(Math.max(other.y, box.y), box.y + box.h);
          expect(Math.hypot(other.x - nx, other.y - ny)).toBeGreaterThan(other.r);
        }
        for (const p of [hole.start, hole.cup]) {
          const nx = Math.min(Math.max(p.x, box.x), box.x + box.w);
          const ny = Math.min(Math.max(p.y, box.y), box.y + box.h);
          expect(Math.hypot(p.x - nx, p.y - ny)).toBeGreaterThan(CUP_RADIUS + BALL_RADIUS);
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

  it('bounces the ball off the hole 3 bumper without a stroke or points', () => {
    const state = playing(2);
    const scoreBefore = totalScore(state);
    const bumper = HOLES[2].bumpers[0];
    state.ball = { x: bumper.x - bumper.r - BALL_RADIUS - 20, y: bumper.y };
    state.angle = 0;
    state.power = 0.5;
    putt(state);
    let bounced = false;
    for (let i = 0; i < 400 && state.phase === 'rolling'; i++) {
      step(state, 0.005);
      if (state.velocity.x < 0) bounced = true;
      const gap = Math.hypot(state.ball.x - bumper.x, state.ball.y - bumper.y);
      expect(gap).toBeGreaterThanOrEqual(bumper.r + BALL_RADIUS - 1e-9);
    }
    expect(bounced).toBe(true);
    expect(state.phase).toBe('aiming');
    expect(state.strokes).toBe(1);
    expect(state.results).toHaveLength(2);
    expect(totalScore(state)).toBe(scoreBefore);
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
