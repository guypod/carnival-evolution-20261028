import { describe, expect, it } from 'vitest';
import {
  CANNON,
  MAX_MULTIPLIER,
  TANK_SIZE,
  createState,
  fire,
  isHit,
  multiplierFor,
  registerHit,
  registerMiss,
  scoreForHit,
  step,
  takeFinalScore,
  type Target,
} from './game';

const target: Target = { x: 400, y: 200, radius: 28, speed: 120 };

describe('water cannon', () => {
  it('starts with a full tank and no score', () => {
    const state = createState();
    expect(state.tank).toBe(TANK_SIZE);
    expect(state.score).toBe(0);
    expect(state.phase).toBe('playing');
  });

  it('uses one shot of water per fire', () => {
    const state = createState();
    expect(fire(state, 400, 0)).toBe(true);
    expect(state.tank).toBe(TANK_SIZE - 1);
    expect(state.shots).toHaveLength(1);
  });

  it('cannot fire once the tank is empty', () => {
    const state = createState();
    state.tank = 0;
    expect(fire(state, 400, 0)).toBe(false);
    expect(state.shots).toHaveLength(0);
  });

  it('never fires downwards, even when aimed below the cannon', () => {
    const state = createState();
    fire(state, CANNON.x + 100, CANNON.y + 100);
    expect(state.shots[0].vy).toBeLessThan(0);
  });

  it('scores a hit and sends the target back to the start of its rail', () => {
    const state = createState();
    state.targets = [{ ...target }];
    state.shots = [{ x: target.x, y: target.y + 5, vx: 0, vy: 0 }];
    step(state, 0);
    expect(state.score).toBe(scoreForHit(target));
    expect(state.shots).toHaveLength(0);
    expect(state.targets[0].x).toBeLessThan(0);
  });

  it('ends the game when the tank is empty and the last shot has landed', () => {
    const state = createState();
    state.tank = 0;
    state.shots = [{ x: 10, y: -20, vx: 0, vy: -700 }];
    step(state, 0.1);
    expect(state.phase).toBe('over');
  });

  it('keeps playing while a shot is still in the air', () => {
    const state = createState();
    state.targets = [];
    state.tank = 0;
    state.shots = [{ x: 400, y: 300, vx: 0, vy: -700 }];
    step(state, 0.1);
    expect(state.phase).toBe('playing');
  });

  it('detects a hit inside the target and a miss outside it', () => {
    expect(isHit({ x: 410, y: 210, vx: 0, vy: 0 }, target)).toBe(true);
    expect(isHit({ x: 460, y: 200, vx: 0, vy: 0 }, target)).toBe(false);
  });

  it('scores a fast target higher than a slow one', () => {
    const slow = scoreForHit({ ...target, speed: 60 });
    const fast = scoreForHit({ ...target, speed: -180 });
    expect(Math.max(fast, slow)).toBeGreaterThanOrEqual(slow);
  });

  it('grows the multiplier from the second hit in a row and caps it at 3', () => {
    const state = createState();
    const base = scoreForHit(target);
    expect(registerHit(state, target)).toBe(base);
    expect(registerHit(state, target)).toBe(base * 2);
    expect(registerHit(state, target)).toBe(base * 3);
    expect(registerHit(state, target)).toBe(base * MAX_MULTIPLIER);
    expect(state.streak).toBe(4);
    expect(state.score).toBe(base * 9);
    expect(multiplierFor(10)).toBe(MAX_MULTIPLIER);
  });

  it('resets the streak on a miss', () => {
    const state = createState();
    registerHit(state, target);
    registerHit(state, target);
    registerMiss(state);
    expect(state.streak).toBe(0);
    expect(registerHit(state, target)).toBe(scoreForHit(target));
  });

  it('shows each hit as a popup with its points and multiplier', () => {
    const state = createState();
    registerHit(state, target);
    registerHit(state, target);
    expect(state.splashes[1]).toMatchObject({ points: scoreForHit(target) * 2, multiplier: 2 });
  });

  it('resets the streak when a shot flies off the booth', () => {
    const state = createState();
    state.targets = [];
    state.streak = 2;
    state.shots = [{ x: 400, y: -5, vx: 0, vy: -700 }];
    step(state, 0.1);
    expect(state.streak).toBe(0);
  });

  it('resolves shots in flight in the order they land', () => {
    const state = createState();
    const near = { ...target, x: 200, y: 300, speed: 60 };
    const far = { ...target, x: 600, y: 100, speed: 60 };
    state.targets = [near, far];
    // Fired one after another: the first is close to its target, the second still far off.
    state.shots = [
      { x: 200, y: 340, vx: 0, vy: -700 },
      { x: 600, y: 400, vx: 0, vy: -700 },
    ];
    step(state, 0.05);
    expect(state.streak).toBe(1);
    expect(state.shots).toHaveLength(1);
    for (let i = 0; i < 30; i++) step(state, 0.02);
    expect(state.streak).toBe(2);
    expect(state.score).toBe(scoreForHit(near) + scoreForHit(far) * 2);
  });

  it('keeps the streak alive while a delayed shot is still in the air', () => {
    const state = createState();
    state.targets = [];
    state.streak = 2;
    state.shots = [{ x: 400, y: 300, vx: 0, vy: -700 }];
    step(state, 0.1);
    expect(state.streak).toBe(2);
  });

  it('scores a full round of 15 shots and hands out the final score once', () => {
    const state = createState();
    expect(state.tank).toBe(15);
    const still = { ...target, speed: 60 };
    const base = scoreForHit(still);
    expect(base).toBeGreaterThan(0);
    let fired = 0;
    while (fire(state, target.x, target.y)) {
      fired += 1;
      // Put the soaked target back in front of the cannon for the next shot.
      state.targets = [{ ...still }];
      for (let i = 0; i < 30 && state.shots.length > 0; i++) step(state, 0.02);
    }
    expect(fired).toBe(15);
    expect(state.phase).toBe('over');
    expect(state.score).toBe(base * (1 + 2 + 3 * 13));
    expect(takeFinalScore(state)).toBe(state.score);
    expect(takeFinalScore(state)).toBeNull();
  });

  it('gives no final score while the round is still playing', () => {
    expect(takeFinalScore(createState())).toBeNull();
  });

  it('starts a replay with a fresh streak, score and tank', () => {
    const state = createState();
    registerHit(state, target);
    const replay = createState();
    expect(replay).toMatchObject({ streak: 0, score: 0, tank: TANK_SIZE, scoreTaken: false });
  });
});
