import { bestScore, type CarnivalGame } from './carnival';

/** One line of the midway passport: a booth and how the player has done there. */
export interface PassportStamp {
  gameId: string;
  name: string;
  /** True once a round has ended and recorded a score, even a score of 0. */
  played: boolean;
  best: number | undefined;
  playHref: string;
}

/**
 * The passport's stamps, one per registered game in registry order. A game is
 * played when the shared scores module has any score for it.
 */
export function passportStamps(
  games: readonly CarnivalGame[],
  best: (gameId: string) => number | undefined = bestScore,
): PassportStamp[] {
  return games.map((game) => {
    const score = best(game.id);
    return {
      gameId: game.id,
      name: game.name,
      played: score !== undefined,
      best: score,
      playHref: `#/play/${game.id}`,
    };
  });
}

/** The passport's summary line, e.g. "1 of 3 booths stamped". */
export function passportSummary(stamps: readonly PassportStamp[]): string {
  const played = stamps.filter((stamp) => stamp.played).length;
  const noun = stamps.length === 1 ? 'booth' : 'booths';
  return `${played} of ${stamps.length} ${noun} stamped`;
}

/** The status and score text for one stamp. */
export function stampText(stamp: PassportStamp): { status: string; best: string } {
  return stamp.played
    ? { status: 'Stamped', best: `Best: ${stamp.best}` }
    : { status: 'Not played yet', best: 'No score yet' };
}
