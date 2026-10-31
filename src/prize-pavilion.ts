import { bestScore, type CarnivalGame, type PrizeTier } from './carnival';

/** One reward tier in the Prize Pavilion, from lowest to highest. */
export interface PavilionTier extends PrizeTier {
  id: 'bronze' | 'silver' | 'gold';
  /** The fun prize the tier wins, shown on its badge. */
  prize: string;
  /** How the prize is drawn in the Prize Room, matching its name. */
  motif: PrizeMotif;
}

/** Every drawn prize motif. Each booth's prizes have motifs of their own. */
export const PRIZE_MOTIFS = [
  'duck',
  'penguin',
  'mallet',
  'moustache',
  'bell',
  'golf-tee',
  'windmill',
  'golf-flag',
  'card',
  'lollipop',
  'medal',
  'tickets',
  'skee-ball',
  'crown',
  'poodle',
  'dart',
  'balloons',
  'bottle',
  'hoop',
  'bottle-trophy',
  'lily-pad',
  'duck-cup',
  'foam-hammer',
  'mole',
  'mole-statue',
  'bucket-hat',
  'ferris-wheel',
] as const;
export type PrizeMotif = (typeof PRIZE_MOTIFS)[number];

/**
 * The universal tiers, lowest first, used by a booth without goals of its own.
 * No booth goal is above these, so no prize won under them is ever lost.
 */
export const PAVILION_TIERS: readonly PavilionTier[] = [
  { id: 'bronze', name: 'Bronze', minScore: 50, prize: 'Squeaky Rubber Duck', motif: 'duck' },
  { id: 'silver', name: 'Silver', minScore: 150, prize: 'Giant Plush Penguin', motif: 'penguin' },
  {
    id: 'gold',
    name: 'Gold',
    minScore: 300,
    prize: 'Golden Ferris Wheel Trophy',
    motif: 'ferris-wheel',
  },
];

type Goal = [minScore: number, prize: string, motif: PrizeMotif];
type TierGoals =
  readonly [bronze: Goal, silver: Goal, gold: Goal] | readonly [bronze: Goal, silver: Goal];

/**
 * Each booth's own goals and prizes, checked against the booth's scoring rules
 * (see the booth's README): every Gold is at or under the booth's best possible
 * round, and no goal is above the universal one, so a prize won before booth
 * goals is still won.
 */
const BOOTH_GOALS: Readonly<Record<string, TierGoals>> = {
  // 30 to 300 per round: three swings of up to 100.
  'high-striker': [
    [50, 'Tiny Mallet Keyring', 'mallet'],
    [150, 'Strongman Moustache', 'moustache'],
    [275, 'Brass Bell Trophy', 'bell'],
  ],
  // 0 to 180 per round: three holes of up to 60.
  'mini-putt': [
    [50, 'Golf Tee Pencil', 'golf-tee'],
    [120, 'Windmill Snow Globe', 'windmill'],
    [160, 'Hole in One Flag', 'golf-flag'],
  ],
  // 0 to 300 per round: 6 moves scores 300, 9 moves without a peek scores 270.
  'memory-menagerie': [
    [50, 'Card Back Badge', 'card'],
    [150, 'Lollipop Menagerie', 'lollipop'],
    [270, 'Perfect Memory Medal', 'medal'],
  ],
  // 0 to 500 per round: ten balls of up to 50.
  'skee-ball': [
    [50, 'Ramp Ticket Roll', 'tickets'],
    [150, 'Wooden Skee Ball', 'skee-ball'],
    [300, 'Hundred Ring Crown', 'crown'],
  ],
  // 0 to 315 per round: eight balloons, the star and every streak bonus.
  'balloon-darts': [
    [50, 'Balloon Animal Poodle', 'poodle'],
    [150, 'Feathered Dart Pin', 'dart'],
    [300, 'Star Balloon Bouquet', 'balloons'],
  ],
  // 0 to 600 per round: ten rings of up to 60 on golden top bottles.
  'ring-toss': [
    [50, 'Glass Bottle Charm', 'bottle'],
    [150, 'Ringmaster Hoop', 'hoop'],
    [300, 'Golden Bottle Trophy', 'bottle-trophy'],
  ],
  // 20 seconds of stars at up to 20 each, about 22 objects a round.
  'duck-dash': [
    [50, 'Rubber Duckling', 'duck'],
    [120, 'Lily Pad Cushion', 'lily-pad'],
    [200, 'Racing Duck Cup', 'duck-cup'],
  ],
  // 30 seconds; a streak scores 30 a mole, 75 for a golden one.
  'mole-mayhem': [
    [50, 'Foam Whack Hammer', 'foam-hammer'],
    [150, 'Burrowing Mole Plush', 'mole'],
    [300, 'Crowned Mole Statue', 'mole-statue'],
  ],
  // 1 or 2 per performance: one point per ending seen. Two endings, so no Gold.
  'puppet-theatre': [
    [1, 'Theatre Ticket Stubs', 'tickets'],
    [2, 'Curtain Call Medal', 'medal'],
  ],
  // Up to 90 a hit on a streak, so the universal goals fit.
  'water-cannon': [
    [50, 'Splash Bucket Hat', 'bucket-hat'],
    [150, 'Giant Plush Penguin', 'penguin'],
    [300, 'Golden Ferris Wheel Trophy', 'ferris-wheel'],
  ],
};

/**
 * A booth's tiers, lowest first: its own goals, prizes and motifs, or the universal
 * tiers for a booth without goals of its own yet.
 */
export function boothTiers(gameId: string): readonly PavilionTier[] {
  if (!Object.hasOwn(BOOTH_GOALS, gameId)) return PAVILION_TIERS;
  const goals = BOOTH_GOALS[gameId];
  return PAVILION_TIERS.slice(0, goals.length).map((tier, i) => ({
    ...tier,
    minScore: goals[i][0],
    prize: goals[i][1],
    motif: goals[i][2],
  }));
}

/**
 * The best score a round can reach at booths whose score is bounded low enough
 * that generic goals would be out of reach, read from the booth's README.
 */
const BOOTH_MAX_SCORES: Readonly<Record<string, number>> = {
  'puppet-theatre': 2,
};

/** A booth's best possible round, or undefined when its score has no low bound. */
export function boothMaxScore(gameId: string): number | undefined {
  return Object.hasOwn(BOOTH_MAX_SCORES, gameId) ? BOOTH_MAX_SCORES[gameId] : undefined;
}

/** The grand reward for reaching at least Bronze at every registered booth. */
export const CARNIVAL_COLLECTOR = 'Carnival Collector';

/** One booth's shelf in the Pavilion. */
export interface PavilionShelf {
  gameId: string;
  name: string;
  best: number | undefined;
  /** This booth's tiers, lowest first. */
  tiers: readonly PavilionTier[];
  /** The tiers the best score has reached, lowest first. */
  unlocked: PavilionTier[];
  /** The highest tier reached, or undefined below Bronze. */
  top: PavilionTier | undefined;
  /** The next tier to win, or undefined once the booth's top tier is won. */
  next: PavilionTier | undefined;
  /** Points still needed for `next`, or 0 once the top tier is won. */
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
    const tiers = boothTiers(game.id);
    const unlocked = tiers.filter((tier) => points >= tier.minScore);
    const top = unlocked.at(-1);
    const next = tiers.find((tier) => points < tier.minScore);
    return {
      gameId: game.id,
      name: game.name,
      best: score,
      tiers,
      unlocked,
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
