/**
 * Surprise my visit: a pocket card that pairs one booth with one scenic or
 * creative destination already on the midway. It lives in memory for this
 * visit only, never reads or writes scores or stamps, and has no timer.
 */
export interface PocketDestination {
  name: string;
  href: string;
  intent: string;
}

export const POCKET_DESTINATIONS: readonly PocketDestination[] = [
  { name: 'Souvenir Postcard', href: '#/postcard', intent: 'a quiet moment to make a keepsake' },
  { name: 'Plush Workshop', href: '#/plush', intent: 'a little stitching, at your own pace' },
  { name: 'Carousel Tune Workshop', href: '#/tune', intent: 'a short tune to hum on the way out' },
  { name: 'Wish Balloon', href: '#/balloon', intent: 'a wish to send up, no score involved' },
  { name: 'Snack Stand', href: '#/snack', intent: 'a snack break with picky visitors' },
  { name: 'Parade Composer', href: '#/parade', intent: 'a parade to arrange, then watch' },
  { name: 'Mirror Maze Expedition', href: '#/expedition', intent: 'a wander through the mirrors' },
];

export interface PocketBooth {
  id: string;
  name: string;
}

export interface PocketCard {
  /** How many cards have been dealt this visit; drives the next deal. */
  deal: number;
  gameId: string;
  destination: string;
  /** What the player has actually opened from this card. */
  visited: { booth: boolean; destination: boolean };
}

/**
 * Deals card number `deal`. The pairing is deterministic, and consecutive deals
 * never repeat the booth or the destination of the card before.
 */
export function dealPocket(
  booths: readonly PocketBooth[],
  deal = 0,
  destinations: readonly PocketDestination[] = POCKET_DESTINATIONS,
): PocketCard | undefined {
  if (booths.length === 0 || destinations.length === 0) return undefined;
  return {
    deal,
    gameId: booths[(deal * 4) % booths.length].id,
    destination: destinations[(deal * 2 + 1) % destinations.length].name,
    visited: { booth: false, destination: false },
  };
}

/** A fresh suggestion in place of the current card. */
export function swapPocket(
  card: PocketCard,
  booths: readonly PocketBooth[],
  destinations: readonly PocketDestination[] = POCKET_DESTINATIONS,
): PocketCard {
  return dealPocket(booths, card.deal + 1, destinations) ?? card;
}

/** Records that the player opened one half of the card. */
export function markPocketVisit(card: PocketCard, part: 'booth' | 'destination'): PocketCard {
  return { ...card, visited: { ...card.visited, [part]: true } };
}

/** Dismissing the card: back to free play, with no card afterwards. */
export function dismissPocket(): undefined {
  return undefined;
}

export function findDestination(
  name: string,
  destinations: readonly PocketDestination[] = POCKET_DESTINATIONS,
) {
  return destinations.find((d) => d.name === name);
}

/** The card's honest status line: only what was opened from it. */
export function pocketStatus(card: PocketCard): string {
  const opened = Number(card.visited.booth) + Number(card.visited.destination);
  return opened === 2
    ? 'You opened both from this card. Free play continues.'
    : `Opened ${opened} of 2 from this card. No timer, no streak.`;
}
