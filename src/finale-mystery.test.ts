import { describe, expect, it } from 'vitest';
import {
  canChoose,
  createMysteryStore,
  MYSTERY_KEY,
  mysteryEnding,
  mysteryStatus,
  mysteryStep,
  NEW_MYSTERY,
  npcLine,
  parseMystery,
  sameMystery,
  type MysteryAction,
} from './finale-mystery';

const play = (...actions: MysteryAction[]) => actions.reduce(mysteryStep, NEW_MYSTERY);
const allClues: MysteryAction[] = [
  { type: 'start' },
  { type: 'inspect', at: 'ferris-wheel' },
  { type: 'inspect', at: 'entrance' },
  { type: 'inspect', at: 'carousel' },
];

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    data,
  };
}

describe('finale mystery', () => {
  it('ignores clues until Mara asks for help', () => {
    expect(play({ type: 'inspect', at: 'carousel' })).toEqual(NEW_MYSTERY);
  });

  it('collects clues in any order, once each, and then opens the choice', () => {
    const state = play(...allClues, { type: 'inspect', at: 'entrance' });
    expect(state.clues).toEqual(['entrance', 'carousel', 'ferris-wheel']);
    expect(canChoose(state)).toBe(true);
    expect(mysteryStatus(state)).toBe('All three clues found. Whom do you trust?');
  });

  it('will not let the player choose before seeing every clue', () => {
    const state = play({ type: 'start' }, { type: 'trust', npc: 'otto' });
    expect(state.trusted).toBeUndefined();
  });

  it('trusting Mara and trusting Otto lead to different endings and dialogue', () => {
    const returned = play(...allClues, { type: 'trust', npc: 'mara' });
    const gifted = play(...allClues, { type: 'trust', npc: 'otto' });
    expect(mysteryEnding(returned)).toBe('returned');
    expect(mysteryEnding(gifted)).toBe('gifted');
    expect(npcLine(returned, 'mara')).not.toBe(npcLine(gifted, 'mara'));
    expect(npcLine(returned, 'otto')).not.toBe(npcLine(gifted, 'otto'));
  });

  it('changes what Mara says once the carousel clue is found', () => {
    const before = play({ type: 'start' });
    const after = mysteryStep(before, { type: 'inspect', at: 'carousel' });
    expect(npcLine(after, 'mara')).not.toBe(npcLine(before, 'mara'));
  });

  it('lets an unsure player take a hint and still choose', () => {
    const unsure = play(...allClues, { type: 'unsure' });
    expect(unsure.rethought).toBe(true);
    expect(canChoose(unsure)).toBe(true);
    expect(mysteryEnding(mysteryStep(unsure, { type: 'trust', npc: 'otto' }))).toBe('gifted');
  });

  it('keeps an ending until a deliberate restart', () => {
    const done = play(...allClues, { type: 'trust', npc: 'mara' });
    expect(mysteryStep(done, { type: 'trust', npc: 'otto' })).toBe(done);
    expect(mysteryStep(done, { type: 'restart' })).toEqual(NEW_MYSTERY);
  });

  it('resumes saved progress under its own key', () => {
    const storage = memoryStorage();
    const store = createMysteryStore(storage);
    const midway = play({ type: 'start' }, { type: 'inspect', at: 'carousel' });
    expect(store.save(midway)).toBe(true);
    expect([...storage.data.keys()]).toEqual([MYSTERY_KEY]);
    expect(store.load()).toEqual(midway);
  });

  it('reads malformed or impossible saves safely', () => {
    expect(parseMystery('nope')).toEqual(NEW_MYSTERY);
    expect(parseMystery('{"started":true,"clues":["x"],"trusted":"otto"}')).toEqual({
      started: true,
      clues: [],
      rethought: false,
    });
  });

  it("keeps this session's progress when storage is missing or fails", () => {
    const none = createMysteryStore(undefined);
    const started = play({ type: 'start' });
    expect(none.save(started)).toBe(false);
    expect(none.load()).toEqual(started);

    const storage = memoryStorage();
    const flaky = createMysteryStore(storage);
    flaky.save(started);
    storage.setItem = () => {
      throw new Error('quota');
    };
    const next = mysteryStep(flaky.load(), { type: 'inspect', at: 'carousel' });
    expect(flaky.save(next)).toBe(false);
    expect(flaky.load()).toEqual(next);

    storage.getItem = () => {
      throw new Error('blocked');
    };
    expect(createMysteryStore(storage).load()).toEqual(NEW_MYSTERY);
  });

  it("still picks up another tab's saved steps", () => {
    const storage = memoryStorage();
    const store = createMysteryStore(storage);
    store.save(play({ type: 'start' }));
    const other = play({ type: 'start' }, { type: 'inspect', at: 'entrance' });
    storage.setItem(MYSTERY_KEY, JSON.stringify(other));
    expect(store.load()).toEqual(other);
  });

  it('treats an equal reloaded state as no change', () => {
    const storage = memoryStorage();
    const store = createMysteryStore(storage);
    const state = play({ type: 'start' }, { type: 'inspect', at: 'carousel' });
    store.save(state);
    const reloaded = store.load();
    expect(reloaded).not.toBe(state);
    expect(sameMystery(mysteryStep(reloaded, { type: 'inspect', at: 'carousel' }), state)).toBe(
      true,
    );
    expect(sameMystery(reloaded, play({ type: 'start' }))).toBe(false);
  });
});
