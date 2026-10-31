import type { BoothSlot } from './midway/world';

/**
 * The cue on the booth card that names the booth the player can play right
 * now and the key that plays it. A "coming soon" booth gets no cue, and no
 * booth in reach means no cue, so nothing promises a game that won't start.
 */
export function boothPrompt(
  booth: BoothSlot | undefined,
  gameName: (gameId: string) => string | undefined,
): string | undefined {
  const name = booth?.gameId ? gameName(booth.gameId) : undefined;
  return name ? `Press E, Enter or Space to play ${name}` : undefined;
}
