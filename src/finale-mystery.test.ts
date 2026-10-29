import { describe, expect, it } from 'vitest';
import {
  approachesAt,
  canTheorize,
  createMysteryStore,
  evidenceOf,
  landmarkDetail,
  landmarkScene,
  misreadHint,
  MYSTERY_KEY,
  mysteryStatus,
  mysteryStep,
  NEW_MYSTERY,
  npcLine,
  openEndings,
  parseMystery,
  sameMystery,
  type MysteryAction,
} from './finale-mystery';

const play = (...actions: MysteryAction[]) => actions.reduce(mysteryStep, NEW_MYSTERY);
const start: MysteryAction = { type: 'start' };
const tin: MysteryAction = { type: 'investigate', at: 'entrance', approach: 'tin' };
const ledger: MysteryAction = { type: 'investigate', at: 'entrance', approach: 'ledger' };
const star: MysteryAction = { type: 'investigate', at: 'carousel', approach: 'star' };
const askOtto: MysteryAction = { type: 'investigate', at: 'carousel', approach: 'otto' };
const top: MysteryAction = { type: 'investigate', at: 'ferris-wheel', approach: 'top' };
const log: MysteryAction = { type: 'investigate', at: 'ferris-wheel', approach: 'log' };
const stencil: MysteryAction = { type: 'theorize', theory: 'stencil' };
const rescue: MysteryAction = { type: 'theorize', theory: 'rescue' };
const wind: MysteryAction = { type: 'theorize', theory: 'wind' };

/** The paint trail: tin, star and the view from the top. */
const paintTrail = [start, tin, star, top];
/** The lamp trail: Mara, Otto and the operator's log. */
const lampTrail = [start, ledger, askOtto, log];
/** A bit of both: paint at the tin, the lamp from Otto. */
const mixedTrail = [start, tin, askOtto, top];

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    data,
  };
}

describe('finale mystery: investigating', () => {
  it('offers two ways to look into every landmark', () => {
    expect(approachesAt('entrance')).toEqual(['tin', 'ledger']);
    expect(approachesAt('carousel')).toEqual(['star', 'otto']);
    expect(approachesAt('ferris-wheel')).toEqual(['top', 'log']);
  });

  it('ignores investigating until Mara asks for help', () => {
    expect(play(star)).toBe(NEW_MYSTERY);
  });

  it('takes one approach per landmark, in any order, and ignores repeats as no-ops', () => {
    const state = play(start, top, tin);
    expect(state.approaches).toEqual({ 'ferris-wheel': 'top', entrance: 'tin' });
    expect(mysteryStep(state, ledger)).toBe(state);
    expect(mysteryStep(state, tin)).toBe(state);
    expect(mysteryStep(state, start)).toBe(state);
    expect(mysteryStatus(state)).toBe('2 of 3 landmarks looked into.');
  });

  it('rejects an approach at the wrong landmark', () => {
    const state = play(start);
    expect(mysteryStep(state, { type: 'investigate', at: 'carousel', approach: 'tin' })).toBe(
      state,
    );
  });

  it('gathers different evidence depending on how you look', () => {
    expect(evidenceOf(play(...paintTrail))).toEqual(['paint', 'bridle']);
    expect(evidenceOf(play(...lampTrail))).toEqual(['lamp']);
    expect(evidenceOf(play(...mixedTrail))).toEqual(['paint', 'lamp', 'bridle']);
  });

  it('only lets you put a theory once every landmark is looked into', () => {
    const partial = play(start, tin, star);
    expect(canTheorize(partial)).toBe(false);
    expect(mysteryStep(partial, stencil)).toBe(partial);
    expect(canTheorize(play(...paintTrail))).toBe(true);
  });
});

describe('finale mystery: characters respond to your choices', () => {
  it('Mara answers how you investigated her booth', () => {
    const byTin = npcLine(play(start, tin), 'mara');
    const byLedger = npcLine(play(start, ledger), 'mara');
    expect(byTin).toContain('paint');
    expect(byLedger).toContain('counter');
    expect(byTin).not.toBe(byLedger);
  });

  it('Otto answers how you approached the carousel, and stays quiet before', () => {
    expect(npcLine(play(start, tin), 'otto')).toContain('hums');
    expect(npcLine(play(start, star), 'otto')).not.toBe(npcLine(play(start, askOtto), 'otto'));
  });

  it('both change their story with the theory you put to them', () => {
    const s = play(...mixedTrail, stencil);
    const r = play(...mixedTrail, rescue);
    expect(npcLine(s, 'otto')).toContain('Guilty');
    expect(npcLine(r, 'otto')).toContain('step');
    expect(npcLine(s, 'mara')).not.toBe(npcLine(r, 'mara'));
  });

  it('Otto remembers the theory even after the ending', () => {
    const s = play(...mixedTrail, stencil, { type: 'resolve', ending: 'returned' });
    const r = play(...mixedTrail, rescue, { type: 'resolve', ending: 'returned' });
    expect(npcLine(s, 'otto')).not.toBe(npcLine(r, 'otto'));
  });
});

describe('finale mystery: theories and recovery', () => {
  it('a theory the evidence does not support is a hint, not a dead end', () => {
    const state = play(...lampTrail, stencil);
    expect(state.theory).toBeUndefined();
    expect(state.misread).toBe('stencil');
    expect(misreadHint(state)).toContain('look again');
    expect(canTheorize(state)).toBe(true);
    expect(mysteryStatus(state)).toContain('didn’t hold up');
    expect(mysteryStep(state, stencil)).toBe(state);
  });

  it('the wind theory never holds, and the hint uses what you saw', () => {
    expect(play(...paintTrail, wind).theory).toBeUndefined();
    expect(misreadHint(play(...paintTrail, wind))).toContain('bridle');
    expect(misreadHint(play(...lampTrail, wind))).toContain('no wind');
  });

  it('looking again swaps an approach, and the new evidence opens the theory', () => {
    const stuck = play(...lampTrail, stencil);
    const swapped = play(
      ...lampTrail,
      stencil,
      { type: 'look-again', at: 'carousel' },
      star,
      stencil,
    );
    expect(stuck.theory).toBeUndefined();
    expect(swapped.approaches.carousel).toBe('star');
    expect(swapped.theory).toBe('stencil');
    expect(swapped.misread).toBeUndefined();
  });

  it('looking again at a landmark you have not looked into changes nothing', () => {
    const state = play(start, tin);
    expect(mysteryStep(state, { type: 'look-again', at: 'carousel' })).toBe(state);
  });

  it('locks the investigation once a theory is accepted', () => {
    const state = play(...paintTrail, stencil);
    expect(mysteryStep(state, { type: 'look-again', at: 'entrance' })).toBe(state);
    expect(mysteryStep(state, rescue)).toBe(state);
  });
});

describe('finale mystery: endings', () => {
  it('opens two endings, and a third only with both paint and lamp', () => {
    expect(openEndings(play(...paintTrail, stencil))).toEqual(['returned', 'gifted']);
    expect(openEndings(play(...lampTrail, rescue))).toEqual(['returned', 'gifted']);
    expect(openEndings(play(...mixedTrail, rescue))).toEqual(['returned', 'gifted', 'shared']);
    expect(openEndings(play(...paintTrail))).toEqual([]);
  });

  it('will not accept an ending that is not open', () => {
    const state = play(...paintTrail, stencil);
    expect(mysteryStep(state, { type: 'resolve', ending: 'shared' })).toBe(state);
  });

  it('each ending changes both characters and the drawn world', () => {
    const endings = (['returned', 'gifted', 'shared'] as const).map((ending) =>
      play(...mixedTrail, rescue, { type: 'resolve', ending }),
    );
    const maras = new Set(endings.map((s) => npcLine(s, 'mara')));
    const ottos = new Set(endings.map((s) => npcLine(s, 'otto')));
    const details = new Set(endings.map((s) => JSON.stringify(landmarkDetail(s))));
    expect(maras.size).toBe(3);
    expect(ottos.size).toBe(3);
    expect(details.size).toBe(3);
    expect(mysteryStatus(endings[2])).toBe('Solved: The lamp-lit finale.');
  });

  it('shows the clue in the world before the ending and the outcome after', () => {
    const before = landmarkDetail(play(...paintTrail));
    expect(before).toEqual({ tin: false, bridle: true, lamp: 'booth-out', ribbon: false });
    const returned = play(...paintTrail, stencil, { type: 'resolve', ending: 'returned' });
    expect(landmarkDetail(returned)).toMatchObject({ tin: true, bridle: false, lamp: 'booth-lit' });
    expect(landmarkScene(returned).entrance).toContain('holding the gold finale ticket');
    const gifted = play(...paintTrail, stencil, { type: 'resolve', ending: 'gifted' });
    expect(landmarkScene(gifted).carousel).toContain('red ribbon');
  });

  it('keeps an ending until a deliberate restart', () => {
    const done = play(...paintTrail, stencil, { type: 'resolve', ending: 'gifted' });
    expect(mysteryStep(done, { type: 'resolve', ending: 'returned' })).toBe(done);
    expect(mysteryStep(done, top)).toBe(done);
    expect(mysteryStep(done, { type: 'restart' })).toEqual(NEW_MYSTERY);
  });
});

describe('finale mystery: saving', () => {
  it('resumes saved progress under its own key, including theory and ending', () => {
    const storage = memoryStorage();
    const store = createMysteryStore(storage);
    const done = play(...mixedTrail, wind, rescue, { type: 'resolve', ending: 'shared' });
    expect(store.save(done)).toBe(true);
    expect([...storage.data.keys()]).toEqual([MYSTERY_KEY]);
    expect(sameMystery(createMysteryStore(storage).load(), done)).toBe(true);
  });

  it('resumes a misread theory so the hint is still there', () => {
    const misread = play(...lampTrail, stencil);
    const loaded = parseMystery(JSON.stringify(misread));
    expect(sameMystery(loaded, misread)).toBe(true);
    expect(misreadHint(loaded)).toBe(misreadHint(misread));
  });

  it('never accepts a rejected theory when a save is loaded, even mid-reinvestigation', () => {
    // Ledger, Otto and log reject stencil; then the carousel is looked at again as the star.
    const partial = play(...lampTrail, stencil, { type: 'look-again', at: 'carousel' });
    const repainted = mysteryStep(partial, {
      type: 'investigate',
      at: 'carousel',
      approach: 'star',
    });
    expect(repainted.misread).toBe('stencil');
    const loaded = parseMystery(JSON.stringify(repainted));
    expect(loaded.theory).toBeUndefined();
    expect(sameMystery(loaded, repainted)).toBe(true);
    expect(mysteryStep(loaded, { type: 'theorize', theory: 'rescue' }).theory).toBe('rescue');
  });

  it('reads malformed or impossible saves safely', () => {
    expect(parseMystery('nope')).toEqual(NEW_MYSTERY);
    expect(parseMystery('null')).toEqual(NEW_MYSTERY);
    // An ending without a theory, a theory the evidence does not support, and a bad approach.
    const impossible = parseMystery(
      JSON.stringify({
        started: true,
        approaches: { entrance: 'ledger', carousel: 'tin', 'ferris-wheel': 'log' },
        theory: 'stencil',
        ending: 'shared',
      }),
    );
    expect(impossible).toEqual({
      started: true,
      approaches: { entrance: 'ledger', 'ferris-wheel': 'log' },
    });
    // An old save from the first version of the mystery still starts cleanly.
    expect(parseMystery('{"started":true,"clues":["entrance"],"trusted":"otto"}')).toEqual({
      started: true,
      approaches: {},
    });
  });

  it("keeps this session's progress when storage is missing or fails", () => {
    const none = createMysteryStore(undefined);
    const started = play(start);
    expect(none.save(started)).toBe(false);
    expect(none.load()).toEqual(started);

    const storage = memoryStorage();
    const flaky = createMysteryStore(storage);
    flaky.save(started);
    storage.setItem = () => {
      throw new Error('quota');
    };
    const next = mysteryStep(flaky.load(), tin);
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
    store.save(play(start));
    const other = play(start, ledger);
    storage.setItem(MYSTERY_KEY, JSON.stringify(other));
    expect(store.load()).toEqual(other);
  });

  it('treats an equal reloaded state as no change', () => {
    const storage = memoryStorage();
    const store = createMysteryStore(storage);
    const state = play(start, star);
    store.save(state);
    const reloaded = store.load();
    expect(reloaded).not.toBe(state);
    expect(sameMystery(mysteryStep(reloaded, star), state)).toBe(true);
    expect(sameMystery(reloaded, play(start, askOtto))).toBe(false);
    expect(sameMystery(reloaded, play(start))).toBe(false);
  });
});
