import { describe, expect, it } from 'vitest';
import { FAIR_KEY } from './fair';
import {
  CAMPAIGN_KEY,
  EMPTY_PACKING,
  NEW_CAMPAIGN,
  STOPS,
  chooseStop,
  complete,
  createCampaignStore,
  currentStop,
  layoutProblem,
  pack,
  parseCampaign,
  placeAtStop,
  recordDay,
  unpack,
  unvisited,
  withCapacity,
  type Packing,
} from './campaign';
import type { Layout } from './fair';
import { measure, openGates, runToEnd, type Outcome } from './opening-day';

const win: Outcome = {
  arrived: 8,
  served: 8,
  happy: 7,
  unreachable: 0,
  spent: 100,
  complete: true,
  success: true,
  unmet: { fun: 0, rest: 0, thirst: 0 },
};
const loss: Outcome = { ...win, served: 3, happy: 2, success: false };

function memory() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

describe('travelling fair campaign', () => {
  it('gives each stop a different site', () => {
    const sites = new Set(STOPS.map((s) => [...s.blocked].sort().join(';')));
    expect(sites.size).toBe(3);
  });

  it('refuses packing past wagon capacity', () => {
    const stop = STOPS[2];
    let p: Packing = EMPTY_PACKING;
    for (let i = 0; i < stop.capacity; i++) {
      const r = pack(stop, p, 'path');
      if (!r.ok) throw new Error(r.reason);
      p = r.value;
    }
    expect(pack(stop, p, 'game').ok).toBe(false);
  });

  it('refuses blocked ground and pieces left at home', () => {
    const stop = STOPS[0];
    const packing = { ...EMPTY_PACKING, game: 1 };
    expect(placeAtStop(stop, packing, {}, { x: 3, y: 0 }, 'game').ok).toBe(false);
    expect(placeAtStop(stop, packing, {}, { x: 1, y: 1 }, 'food').ok).toBe(false);
    expect(placeAtStop(stop, packing, {}, { x: 1, y: 1 }, 'game').ok).toBe(true);
  });

  it('names an impossible layout', () => {
    const stop = STOPS[0];
    const packing = { ...EMPTY_PACKING, game: 1 };
    expect(layoutProblem(stop, packing, {})).toMatch(/at least one/);
    expect(layoutProblem(stop, packing, { '3,0': 'game' })).toMatch(/blocked/);
    expect(layoutProblem(stop, packing, { '1,1': 'game', '1,2': 'game' })).toMatch(/than packed/);
    expect(layoutProblem(stop, packing, { '1,1': 'game' })).toBeUndefined();
  });

  it('stays at a stop for a retry after a loss, and travels on after a win', () => {
    const at = { ...NEW_CAMPAIGN, layout: { '1,1': 'game' as const } };
    expect(recordDay(at, loss)).toBe(at);
    const next = recordDay(at, win);
    expect(next.stop).toBe(1);
    expect(next.reputation).toBeGreaterThan(0);
    expect(next.keepsakes).toEqual(['riverside']);
  });

  it('completes after all three stops', () => {
    let c = NEW_CAMPAIGN;
    for (let i = 0; i < 3; i++) c = recordDay(c, win);
    expect(complete(c)).toBe(true);
    expect(recordDay(c, win)).toBe(c);
  });

  it('saves, resumes and resets only the campaign', () => {
    const storage = memory();
    storage.setItem(FAIR_KEY, 'sandbox');
    const store = createCampaignStore(storage);
    const c = recordDay(NEW_CAMPAIGN, win);
    expect(store.save(c)).toBe(true);
    expect(store.load()).toEqual(c);
    store.reset();
    expect(storage.data.has(CAMPAIGN_KEY)).toBe(false);
    expect(storage.getItem(FAIR_KEY)).toBe('sandbox');
  });

  it('reads a broken save as a new campaign', () => {
    expect(parseCampaign({ version: 2 })).toBeUndefined();
    const storage = memory();
    storage.setItem(CAMPAIGN_KEY, '{bad');
    expect(createCampaignStore(storage).load()).toEqual(NEW_CAMPAIGN);
  });
});

describe('choosing stops', () => {
  it('lets the player pick any stop not yet passed, in any order', () => {
    const r = chooseStop(NEW_CAMPAIGN, 'hilltop');
    if (!r.ok) throw new Error(r.reason);
    expect(currentStop(r.value)?.id).toBe('hilltop');
    const after = recordDay(r.value, win);
    expect(after.keepsakes).toEqual(['hilltop']);
    expect(after.at).toBeUndefined();
    expect(unvisited(after).map((s) => s.id)).toEqual(['riverside', 'market']);
    expect(chooseStop(after, 'hilltop').ok).toBe(false);
  });

  it('carries reputation into extra wagon capacity, up to three', () => {
    const stop = STOPS[2];
    expect(withCapacity(stop, NEW_CAMPAIGN).capacity).toBe(stop.capacity);
    expect(withCapacity(stop, { ...NEW_CAMPAIGN, reputation: 9 }).capacity).toBe(
      stop.capacity + 3,
    );
  });

  it('will not leave a placed piece at home', () => {
    const packing = { ...EMPTY_PACKING, game: 1 };
    expect(unpack(packing, 'game', { '1,1': 'game' }).ok).toBe(false);
    expect(unpack(packing, 'game', {}).ok).toBe(true);
  });

  it('wins a real Opening Day at every stop with a small packed layout', () => {
    const layout: Layout = {
      '1,3': 'path',
      '2,3': 'path',
      '3,3': 'path',
      '4,3': 'path',
      '1,2': 'game',
      '3,2': 'food',
      '1,4': 'bench',
      '3,4': 'bench',
    };
    const packing = { path: 4, game: 1, food: 1, bench: 2, tree: 0 };
    let c = NEW_CAMPAIGN;
    for (const stop of STOPS) {
      expect(layoutProblem(stop, packing, layout)).toBeUndefined();
      c = recordDay({ ...c, packing, layout }, measure(runToEnd(openGates(layout)), true));
    }
    expect(complete(c)).toBe(true);
    expect(c.keepsakes).toEqual(['riverside', 'market', 'hilltop']);
  });

  it('migrates a save from before stops could be chosen, and refuses inconsistent ones', () => {
    const old = { ...NEW_CAMPAIGN, stop: 1, reputation: 2, keepsakes: ['riverside'] };
    expect(currentStop(parseCampaign(old)!)?.id).toBe('market');
    expect(parseCampaign({ ...old, keepsakes: [] })).toBeUndefined();
    expect(parseCampaign({ ...old, at: 'riverside' })).toBeUndefined();
    expect(parseCampaign({ ...old, at: 'hilltop' })?.at).toBe('hilltop');
  });
});
