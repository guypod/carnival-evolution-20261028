import { bestScore, prizeFor, type CarnivalGame, type PrizeTier } from './carnival';

/** One reward tier in the Prize Pavilion, from lowest to highest. */
export interface PavilionTier extends PrizeTier {
  id: 'bronze' | 'silver' | 'gold';
  /** The fun prize the tier wins, shown on its badge. */
  prize: string;
}

/** The Pavilion's tiers, lowest first. A booth's best score unlocks them. */
export const PAVILION_TIERS: readonly PavilionTier[] = [
  { id: 'bronze', name: 'Bronze', minScore: 50, prize: 'Squeaky Rubber Duck' },
  { id: 'silver', name: 'Silver', minScore: 150, prize: 'Giant Plush Penguin' },
  { id: 'gold', name: 'Gold', minScore: 300, prize: 'Golden Ferris Wheel Trophy' },
];

/** The grand reward for reaching at least Bronze at every registered booth. */
export const CARNIVAL_COLLECTOR = 'Carnival Collector';

/** One booth's shelf in the Pavilion. */
export interface PavilionShelf {
  gameId: string;
  name: string;
  best: number | undefined;
  /** The tiers the best score has reached, lowest first. */
  unlocked: PavilionTier[];
  /** The highest tier reached, or undefined below Bronze. */
  top: PavilionTier | undefined;
  /** The next tier to win, or undefined once Gold is won. */
  next: PavilionTier | undefined;
  /** Points still needed for `next`, or 0 once Gold is won. */
  pointsToNext: number;
  playHref: string;
}

export interface PavilionCollection {
  shelves: PavilionShelf[];
  /** True when every registered booth has at least Bronze. */
  collector: boolean;
  /** How many booths have at least Bronze. */
  bronzeBooths: number;
}

/**
 * The Prize Pavilion, worked out from each registered game's best score in the
 * shared scores module. Nothing is stored: a new game joins on registration.
 */
export function pavilionCollection(
  games: readonly CarnivalGame[],
  best: (gameId: string) => number | undefined = bestScore,
): PavilionCollection {
  const shelves = games.map((game): PavilionShelf => {
    const score = best(game.id);
    const points = score ?? 0;
    const top = prizeFor(points, PAVILION_TIERS) as PavilionTier | undefined;
    const next = PAVILION_TIERS.find((tier) => points < tier.minScore);
    return {
      gameId: game.id,
      name: game.name,
      best: score,
      unlocked: PAVILION_TIERS.filter((tier) => points >= tier.minScore),
      top,
      next,
      pointsToNext: next ? next.minScore - points : 0,
      playHref: `#/play/${game.id}`,
    };
  });
  const bronzeBooths = shelves.filter((shelf) => shelf.top !== undefined).length;
  return {
    shelves,
    collector: shelves.length > 0 && bronzeBooths === shelves.length,
    bronzeBooths,
  };
}

/** The best score and progress text for one shelf. */
export function shelfText(shelf: PavilionShelf): { best: string; next: string } {
  const best = shelf.best === undefined ? 'Not played yet' : `Best: ${shelf.best}`;
  const next = shelf.next
    ? `${shelf.pointsToNext} ${shelf.pointsToNext === 1 ? 'point' : 'points'} to ${shelf.next.name}: ${shelf.next.prize}`
    : 'Every prize won!';
  return { best, next };
}

/** The Carnival Collector line, e.g. "1 of 2 booths at Bronze or better". */
export function collectorText(collection: PavilionCollection): string {
  if (collection.collector) return `${CARNIVAL_COLLECTOR} unlocked! Every booth has a prize.`;
  const total = collection.shelves.length;
  const noun = total === 1 ? 'booth' : 'booths';
  return `${collection.bronzeBooths} of ${total} ${noun} at Bronze or better. Reach Bronze everywhere to become the ${CARNIVAL_COLLECTOR}.`;
}
