import { topScores, type ScoreEntry } from './carnival';

/** How many scores the booth card lists. */
export const BOOTH_CARD_SCORES = 5;

/**
 * The scores line on a booth card: up to five scores, highest first, or
 * "No scores yet" when the game has none.
 */
export function boothScoresText(
  gameId: string,
  top: (gameId: string, count: number) => ScoreEntry[] = topScores,
): string {
  const scores = top(gameId, BOOTH_CARD_SCORES).map((entry) => entry.score);
  return scores.length === 0 ? 'No scores yet' : `Top scores: ${scores.join(', ')}`;
}
