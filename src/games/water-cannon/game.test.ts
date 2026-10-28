import { describe, expect, it } from 'vitest';
import {
  CANNON,
  MAX_MULTIPLIER,
  MODES,
  TANK_SIZE,
  applyAction,
  beginRound,
  createReadyState,
  createState,
  cycleMode,
  fire,
  isHit,
  keyAction,
  modeById,
  modeLabel,
  multiplierFor,
  pointerAction,
  registerHit,
  registerMiss,
  replay,
  scoreForHit,
  selectMode,
  selectorActionAt,
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
    expect(fast).toBeGreaterThan(slow);
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

describe('water cannon challenge modes', () => {
  const slowTarget = (): Target => ({ x: 100, y: 200, radius: 28, speed: 120 });

  /** Where a target moving at 120 px/s ends up after one second in `mode`. */
  const positionAfterOneSecond = (mode: Parameters<typeof createState>[0]) => {
    const state = createState(mode);
    state.targets = [slowTarget()];
    for (let i = 0; i < 10; i++) step(state, 0.1);
    return state.targets[0].x;
  };

  it('offers Calm x0.5, Classic x1 and Rapid x1.5, in that order', () => {
    expect(MODES.map((mode) => [mode.id, mode.speedFactor])).toEqual([
      ['calm', 0.5],
      ['classic', 1],
      ['rapid', 1.5],
    ]);
    expect(MODES.map((mode) => modeLabel(mode.id))).toEqual([
      'Calm x0.5',
      'Classic x1',
      'Rapid x1.5',
    ]);
  });

  it('applies each mode speed factor to the targets in the simulation', () => {
    expect(positionAfterOneSecond('calm')).toBeCloseTo(100 + 60);
    expect(positionAfterOneSecond('classic')).toBeCloseTo(100 + 120);
    expect(positionAfterOneSecond('rapid')).toBeCloseTo(100 + 180);
  });

  it('keeps Classic exactly as before: unscaled rail speeds and the default mode', () => {
    const state = createState();
    expect(state.mode).toBe('classic');
    expect(state.phase).toBe('playing');
    expect(state.targets.map((t) => t.speed)).toEqual([
      180, 180, 180, -120, -120, -120, 60, 60, 60,
    ]);
    const before = state.targets.map((t) => t.x);
    step(state, 0.01);
    state.targets.forEach((t, i) => expect(t.x).toBeCloseTo(before[i] + t.speed * 0.01));
  });

  it('keeps points and streaks the same in every mode', () => {
    for (const mode of MODES) {
      const state = createState(mode.id);
      state.targets = [{ ...target }];
      state.shots = [{ x: target.x, y: target.y, vx: 0, vy: 0 }];
      step(state, 0);
      expect(state.score).toBe(scoreForHit(target));
      registerHit(state, target);
      expect(state.score).toBe(scoreForHit(target) * 3);
      expect(state.streak).toBe(2);
    }
  });

  it('holds still and refuses to fire on the selector', () => {
    const state = createReadyState('rapid');
    const before = state.targets.map((t) => t.x);
    step(state, 1);
    expect(state.targets.map((t) => t.x)).toEqual(before);
    expect(fire(state, 400, 0)).toBe(false);
    expect(state.tank).toBe(TANK_SIZE);
    expect(state.phase).toBe('ready');
  });

  it('picks a mode only on the selector', () => {
    const ready = createReadyState();
    expect(selectMode(ready, 'calm')).toBe(true);
    expect(ready.mode).toBe('calm');
    const playing = createState('rapid');
    expect(selectMode(playing, 'calm')).toBe(false);
    expect(playing.mode).toBe('rapid');
  });

  it('begins the round in the picked mode with a full tank, and only from the selector', () => {
    const ready = createReadyState();
    selectMode(ready, 'rapid');
    const round = beginRound(ready);
    expect(round).toMatchObject({
      phase: 'playing',
      mode: 'rapid',
      tank: TANK_SIZE,
      score: 0,
      streak: 0,
      shots: [],
    });
    expect(beginRound(round)).toBe(round);
  });

  it('plays again in the same mode with fresh ammo, score and streak', () => {
    const state = createState('calm');
    registerHit(state, target);
    registerHit(state, target);
    state.tank = 0;
    step(state, 0);
    expect(state.phase).toBe('over');
    expect(takeFinalScore(state)).toBe(state.score);

    const again = replay(state);
    expect(again).toMatchObject({
      phase: 'ready',
      mode: 'calm',
      tank: TANK_SIZE,
      score: 0,
      streak: 0,
    });
    const round = beginRound(again);
    expect(round).toMatchObject({ phase: 'playing', mode: 'calm', scoreTaken: false });
    expect(takeFinalScore(round)).toBeNull();
    expect(replay(round)).toBe(round);
  });

  it('cycles modes with wrap-around', () => {
    expect(cycleMode('classic', 1)).toBe('rapid');
    expect(cycleMode('rapid', 1)).toBe('calm');
    expect(cycleMode('calm', -1)).toBe('rapid');
    expect(modeById('calm').speedFactor).toBe(0.5);
  });

  it('maps keys to selector actions: 1 to 3, arrows, Space and Enter', () => {
    const ready = createReadyState();
    expect(keyAction(ready, 'Digit1', '1')).toEqual({ type: 'select', mode: 'calm' });
    expect(keyAction(ready, 'Digit3', '3')).toEqual({ type: 'select', mode: 'rapid' });
    expect(keyAction(ready, 'Digit4', '4')).toBeUndefined();
    expect(keyAction(ready, 'ArrowRight', 'ArrowRight')).toEqual({ type: 'select', mode: 'rapid' });
    expect(keyAction(ready, 'ArrowLeft', 'ArrowLeft')).toEqual({ type: 'select', mode: 'calm' });
    expect(keyAction(ready, 'Space', ' ')).toEqual({ type: 'start' });
    expect(keyAction(ready, 'Enter', 'Enter')).toEqual({ type: 'start' });
  });

  it('leaves keys alone while a link or control has focus, or during a round', () => {
    const ready = createReadyState();
    expect(keyAction(ready, 'Enter', 'Enter', 'A')).toBeUndefined();
    expect(keyAction(ready, 'Space', ' ', 'button')).toBeUndefined();
    expect(keyAction(ready, 'Digit1', '1', 'INPUT')).toBeUndefined();
    expect(keyAction(ready, 'Space', ' ', 'BODY')).toEqual({ type: 'start' });
    expect(keyAction(createState(), 'Space', ' ')).toBeUndefined();
    expect(keyAction(createState(), 'Digit1', '1')).toBeUndefined();
    const over = createState();
    over.phase = 'over';
    expect(keyAction(over, 'Space', ' ')).toEqual({ type: 'replay' });
    expect(keyAction(over, 'Digit1', '1')).toBeUndefined();
  });

  it('runs a full keyboard flow: pick, start, finish, replay keeps the pick', () => {
    let state = createReadyState();
    state = applyAction(state, keyAction(state, 'Digit3', '3')!);
    expect(state.mode).toBe('rapid');
    state = applyAction(state, keyAction(state, 'Space', ' ')!);
    expect(state).toMatchObject({ phase: 'playing', mode: 'rapid', tank: TANK_SIZE });
    state.tank = 0;
    step(state, 0);
    state = applyAction(state, keyAction(state, 'Enter', 'Enter')!);
    expect(state).toMatchObject({ phase: 'ready', mode: 'rapid', tank: TANK_SIZE, score: 0 });
  });

  it('only acts on selector buttons, so a stray click never starts or fires', () => {
    const ready = createReadyState();
    expect(pointerAction(ready, 400, 30)).toBeUndefined();
    expect(pointerAction(ready, 400, 470)).toBeUndefined();
    expect(selectorActionAt(400, 346)).toEqual({ type: 'start' });
    expect(selectorActionAt(176, 238)).toEqual({ type: 'select', mode: 'calm' });
    expect(selectorActionAt(400, 238)).toEqual({ type: 'select', mode: 'classic' });
    expect(selectorActionAt(624, 238)).toEqual({ type: 'select', mode: 'rapid' });
    expect(pointerAction(createState(), 400, 30)).toEqual({ type: 'fire' });
    const over = createState();
    over.phase = 'over';
    expect(pointerAction(over, 400, 30)).toEqual({ type: 'replay' });
  });

  it('does not use a shot when the click that starts the round lands', () => {
    let state = createReadyState();
    const action = pointerAction(state, 400, 346);
    expect(action).toEqual({ type: 'start' });
    state = applyAction(state, action as { type: 'start' });
    expect(state.tank).toBe(TANK_SIZE);
    expect(state.shots).toHaveLength(0);
  });
});
