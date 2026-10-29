import { describe, expect, it, vi } from 'vitest';
import { registry } from './games';
import {
  POCKET_DESTINATIONS,
  dealPocket,
  dismissPocket,
  findDestination,
  markPocketVisit,
  pocketStatus,
  swapPocket,
} from './pocket-itinerary';

const booths = registry.all().map((g) => ({ id: g.id, name: g.name }));
const routes = [
  '#/postcard',
  '#/plush',
  '#/tune',
  '#/balloon',
  '#/snack',
  '#/parade',
  '#/expedition',
];

describe('pocket itinerary', () => {
  it('deals the same card for the same deal number', () => {
    expect(dealPocket(booths, 4)).toEqual(dealPocket(booths, 4));
  });

  it('pairs a registered booth with a shipped, non-score destination', () => {
    for (let deal = 0; deal < 20; deal++) {
      const card = dealPocket(booths, deal)!;
      expect(registry.get(card.gameId)).toBeDefined();
      expect(routes).toContain(findDestination(card.destination)!.href);
    }
    for (const d of POCKET_DESTINATIONS) expect(d.intent.length).toBeGreaterThan(0);
  });

  it('never repeats the booth or destination when swapped', () => {
    let card = dealPocket(booths)!;
    for (let i = 0; i < 20; i++) {
      const next = swapPocket(card, booths);
      expect(next.gameId).not.toBe(card.gameId);
      expect(next.destination).not.toBe(card.destination);
      card = next;
    }
  });

  it('never repeats on swap for any collection size with a choice', () => {
    for (let b = 2; b <= 10; b++) {
      for (let d = 2; d <= 8; d++) {
        const bs = booths.slice(0, b);
        const ds = POCKET_DESTINATIONS.concat(POCKET_DESTINATIONS).slice(0, d);
        const named = ds.map((x, i) => ({ ...x, name: `${x.name} ${i}` }));
        let card = dealPocket(bs, 0, named)!;
        for (let i = 0; i < 12; i++) {
          const next = swapPocket(card, bs, named);
          expect(next.gameId).not.toBe(card.gameId);
          expect(next.destination).not.toBe(card.destination);
          card = next;
        }
      }
    }
  });

  it('tracks only what was opened, and a swap starts fresh', () => {
    const card = markPocketVisit(dealPocket(booths)!, 'booth');
    expect(card.visited).toEqual({ booth: true, destination: false });
    expect(pocketStatus(card)).toBe('Opened 1 of 2 from this card. No timer, no streak.');
    expect(swapPocket(card, booths).visited).toEqual({ booth: false, destination: false });
  });

  it('dismisses to no card without touching saved scores', () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { setItem, getItem: () => null, removeItem: setItem });
    const first = dealPocket(booths)!;
    const card = markPocketVisit(first, 'destination');
    swapPocket(card, booths);
    expect(first.visited).toEqual({ booth: false, destination: false });
    expect(dismissPocket()).toBeUndefined();
    expect(setItem).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('deals nothing with no booths', () => {
    expect(dealPocket([])).toBeUndefined();
  });
});
