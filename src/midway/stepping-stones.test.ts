import { describe, expect, it } from 'vitest';
import {
  CALL_PATTERN,
  CALL_STEP,
  GLOW_TIME,
  calling,
  createStones,
  playCall,
  stoneGlow,
  stoneUnder,
  stonesInReach,
  stonesPrompt,
  touchStone,
} from './stepping-stones';

const afterCall = CALL_PATTERN.length * CALL_STEP + 0.1;

describe('chime stones', () => {
  it('stays dark until someone plays the call', () => {
    const stones = createStones({ x: 10, y: 10 });
    expect(stones.stones.map((_, i) => stoneGlow(stones, i, 5))).toEqual([0, 0, 0, 0]);
    expect(stonesPrompt(stones, 0)).toBe('Press C to hear the stones');
  });

  it('lights the call one stone at a time in order', () => {
    const stones = playCall(createStones({ x: 0, y: 0 }), 0);
    CALL_PATTERN.forEach((stone, step) => {
      const at = step * CALL_STEP + 0.01;
      expect(stoneGlow(stones, stone, at)).toBeGreaterThan(0.9);
      const brightest = stones.stones
        .map((_, i) => stoneGlow(stones, i, at))
        .indexOf(Math.max(...stones.stones.map((_, i) => stoneGlow(stones, i, at))));
      expect(brightest).toBe(stone);
    });
    expect(calling(stones, afterCall)).toBe(false);
  });

  it('fades a glow over time rather than flashing it', () => {
    const stones = touchStone(createStones({ x: 0, y: 0 }), 1, 0);
    expect(stoneGlow(stones, 1, 0)).toBe(1);
    expect(stoneGlow(stones, 1, GLOW_TIME / 2)).toBeCloseTo(0.5);
    expect(stoneGlow(stones, 1, GLOW_TIME)).toBe(0);
  });

  it('counts an answer in the call order and finishes it', () => {
    let stones = playCall(createStones({ x: 0, y: 0 }), 0);
    CALL_PATTERN.forEach((stone, step) => {
      stones = touchStone(stones, stone, afterCall + step);
    });
    expect(stones.answered).toBe(CALL_PATTERN.length);
    expect(stones.doneAt).toBeDefined();
    expect(stoneGlow(stones, 0, 100)).toBe(0.5);
    expect(stonesPrompt(stones, 100)).toMatch(/Answered/);
  });

  it('starts the answer again on a wrong stone, with no penalty', () => {
    let stones = playCall(createStones({ x: 0, y: 0 }), 0);
    stones = touchStone(stones, CALL_PATTERN[0], afterCall);
    stones = touchStone(stones, CALL_PATTERN[0] === 3 ? 2 : 3, afterCall + 1);
    expect(stones.answered).toBe(0);
    stones = touchStone(stones, CALL_PATTERN[0], afterCall + 2);
    expect(stones.answered).toBe(1);
    expect(stones.doneAt).toBeUndefined();
  });

  it('ignores answers while the call is still playing', () => {
    let stones = playCall(createStones({ x: 0, y: 0 }), 0);
    stones = touchStone(stones, CALL_PATTERN[0], 0.1);
    expect(stones.answered).toBe(0);
    expect(stoneGlow(stones, CALL_PATTERN[0], 0.1)).toBeGreaterThan(0);
  });

  it('clears an answer when the call plays again', () => {
    let stones = playCall(createStones({ x: 0, y: 0 }), 0);
    stones = touchStone(stones, CALL_PATTERN[0], afterCall);
    stones = playCall(stones, 10);
    expect(stones.answered).toBe(0);
    expect(stones.doneAt).toBeUndefined();
  });

  it('finds the stone underfoot and whether the player is near', () => {
    const stones = createStones({ x: 4, y: 4 });
    expect(stoneUnder(stones, { x: 4.1, y: 4 })).toBe(0);
    expect(stoneUnder(stones, { x: 4.9, y: 4.9 })).toBe(1);
    expect(stoneUnder(stones, { x: 4.45, y: 4.45 })).toBeUndefined();
    expect(stonesInReach(stones, { x: 5, y: 5 })).toBe(true);
    expect(stonesInReach(stones, { x: 9, y: 9 })).toBe(false);
  });
});
