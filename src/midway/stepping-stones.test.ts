import { describe, expect, it } from 'vitest';
import {
  ANSWERED_GLOW,
  CALL_PATTERN,
  CALL_STEP,
  GLOW_TIME,
  STONE_MARKS,
  STONE_NAMES,
  STONE_SHAPES,
  STONE_TONES,
  calling,
  createStones,
  playCall,
  stoneGlow,
  stoneUnder,
  stonesInReach,
  stoneInput,
  stoneOrder,
  stonesPrompt,
  stonesStatus,
  tapStone,
  touchStone,
  type ChimeStones,
} from './stepping-stones';

const afterCall = CALL_PATTERN.length * CALL_STEP + 0.1;

describe('chime stones', () => {
  it('stays dark until someone plays the call', () => {
    const stones = createStones({ x: 10, y: 10 });
    expect(stones.stones.map((_, i) => stoneGlow(stones, i, 5))).toEqual([0, 0, 0, 0]);
    expect(stonesPrompt(stones, 0)).toBe('Press C or tap a stone to hear the stones');
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
    stones = touchStone(stones, 3, afterCall + 1);
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

  it('plays the call when a stone is tapped before any call or after an answer', () => {
    const tapped = tapStone(createStones({ x: 0, y: 0 }), 1, 2);
    expect(tapped.calledAt).toBe(2);
    expect(calling(tapped, 2.1)).toBe(true);
    let stones = tapped;
    CALL_PATTERN.forEach((stone, step) => {
      stones = tapStone(stones, stone, 2 + afterCall + step);
    });
    expect(stones.doneAt).toBeDefined();
    const again = tapStone(stones, 0, 20);
    expect(again.calledAt).toBe(20);
    expect(again.doneAt).toBeUndefined();
    expect(again.answered).toBe(0);
  });

  it('gives every stone its own shape, name, mark and note', () => {
    const count = createStones({ x: 0, y: 0 }).stones.length;
    const lists: readonly (readonly unknown[])[] = [
      STONE_SHAPES,
      STONE_NAMES,
      STONE_MARKS,
      STONE_TONES,
    ];
    for (const list of lists) {
      expect(list).toHaveLength(count);
      expect(new Set(list).size).toBe(count);
    }
  });
});

describe('stone input', () => {
  it('lets a pointer alone start the call and answer it to the end', () => {
    let stones = createStones({ x: 0, y: 0 });
    const first = stoneInput(stones, { kind: 'tap', stone: 2 }, 1);
    expect(first.tones).toEqual(CALL_PATTERN.map((i) => STONE_TONES[i]));
    expect(first.spacing).toBe(CALL_STEP);
    stones = first.stones;
    CALL_PATTERN.forEach((stone, step) => {
      const out = stoneInput(stones, { kind: 'tap', stone }, 1 + afterCall + step);
      expect(out.tones).toEqual([STONE_TONES[stone]]);
      stones = out.stones;
    });
    expect(stones.doneAt).toBeDefined();
  });

  it('lets the Play call and stone buttons start and answer the call', () => {
    let stones = stoneInput(createStones({ x: 0, y: 0 }), { kind: 'call' }, 0).stones;
    for (const [step, stone] of CALL_PATTERN.entries()) {
      stones = stoneInput(stones, { kind: 'button', stone }, afterCall + step).stones;
    }
    expect(stones.doneAt).toBeDefined();
    // A stone button never replays the call: it only rings its stone.
    const again = stoneInput(stones, { kind: 'button', stone: 1 }, 20);
    expect(again.stones.calledAt).toBe(0);
    expect(again.tones).toEqual([STONE_TONES[1]]);
  });

  it('has a new call replace notes still ringing, while a stone adds to them', () => {
    let stones = createStones({ x: 0, y: 0 });
    const first = stoneInput(stones, { kind: 'call' }, 0);
    expect(first.replace).toBe(true);
    // Pressing C again at once restarts the call and its notes, not just the glow.
    const again = stoneInput(first.stones, { kind: 'call' }, 0.1);
    expect(again.replace).toBe(true);
    expect(again.stones.calledAt).toBe(0.1);
    stones = again.stones;
    expect(stoneInput(stones, { kind: 'button', stone: 0 }, afterCall).replace).toBe(false);
    expect(stoneInput(stones, { kind: 'step', stone: 0 }, afterCall).replace).toBe(false);
  });

  it('stops a walk on a deliberate tap or press, but not on the walk’s own footsteps', () => {
    const stones = playCall(createStones({ x: 0, y: 0 }), 0);
    expect(stoneInput(stones, { kind: 'tap', stone: 0 }, afterCall).cancelWalk).toBe(true);
    expect(stoneInput(stones, { kind: 'button', stone: 0 }, afterCall).cancelWalk).toBe(true);
    expect(stoneInput(stones, { kind: 'call' }, afterCall).cancelWalk).toBe(true);
    expect(stoneInput(stones, { kind: 'step', stone: 0 }, afterCall).cancelWalk).toBe(false);
  });

  it('keeps a tapped answer when the cancelled walk would have crossed a wrong stone', () => {
    // The tap cancels the walk, so the only footstep left is the one the
    // player chooses next: the answer moves on rather than starting again.
    let stones = playCall(createStones({ x: 0, y: 0 }), 0);
    const tapped = stoneInput(stones, { kind: 'tap', stone: CALL_PATTERN[0] }, afterCall);
    expect(tapped.cancelWalk).toBe(true);
    stones = tapped.stones;
    stones = stoneInput(stones, { kind: 'step', stone: CALL_PATTERN[1] }, afterCall + 1).stones;
    expect(stones.answered).toBe(2);
  });
});

describe('quiet mode', () => {
  const called = (): ChimeStones => playCall(createStones({ x: 0, y: 0 }), 0);

  it('shows the whole call at once as numbers, with nothing to watch', () => {
    const stones = called();
    expect(calling(stones, 0.1, true)).toBe(false);
    expect(stonesPrompt(stones, 0.1, true)).toMatch(/Step on the stones in order/);
    CALL_PATTERN.forEach((stone, step) => {
      expect(stoneOrder(stones, stone, true)).toBe(step + 1);
      expect(stoneOrder(stones, stone, false)).toBeUndefined();
    });
    expect(stoneOrder(createStones({ x: 0, y: 0 }), 0, true)).toBeUndefined();
  });

  it('never fades: a touch adds no glow, and answered stones stay lit', () => {
    let stones = called();
    expect(stones.stones.map((_, i) => stoneGlow(stones, i, 0.1, true))).toEqual([0, 0, 0, 0]);
    stones = touchStone(stones, CALL_PATTERN[0], 0.1, true);
    expect(stones.answered).toBe(1);
    expect(stoneGlow(stones, CALL_PATTERN[0], 0.1, true)).toBe(ANSWERED_GLOW);
    expect(stoneGlow(stones, CALL_PATTERN[0], 50, true)).toBe(ANSWERED_GLOW);
    expect(stoneGlow(stones, CALL_PATTERN[1], 0.1, true)).toBe(0);
  });

  it('takes answers straight after the call', () => {
    let stones = called();
    CALL_PATTERN.forEach((stone) => (stones = tapStone(stones, stone, 0.05, true)));
    expect(stones.doneAt).toBeDefined();
  });
});

describe('stones status', () => {
  it('reads the call and the answer by shape, without any glow', () => {
    let stones = createStones({ x: 0, y: 0 });
    expect(stonesStatus(stones, 0)).toMatch(/Play call/);
    stones = playCall(stones, 0);
    expect(stonesStatus(stones, 0.1)).toBe('Playing the call: Circle, Square, Triangle, Diamond.');
    expect(stonesStatus(stones, afterCall)).toBe(
      'The call: Circle, Square, Triangle, Diamond. Answered 0 of 4: nothing yet.',
    );
    stones = touchStone(stones, CALL_PATTERN[0], afterCall);
    expect(stonesStatus(stones, afterCall)).toMatch(/Answered 1 of 4: Circle\.$/);
    CALL_PATTERN.slice(1).forEach((s, i) => (stones = touchStone(stones, s, afterCall + i + 1)));
    expect(stonesStatus(stones, 99)).toMatch(/^Answered!/);
  });

  it('skips the playing line in quiet mode', () => {
    expect(stonesStatus(playCall(createStones({ x: 0, y: 0 }), 0), 0.1, true)).toMatch(
      /^The call:/,
    );
  });
});
