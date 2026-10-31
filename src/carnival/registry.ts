/**
 * A game the midway can list and launch.
 *
 * `start` draws onto the canvas it is given and returns a function that stops
 * the game and removes any listeners it added.
 */
export interface CarnivalGame {
  /** Kebab-case, and the same as the game's folder name under src/games. */
  id: string;
  name: string;
  /** One sentence, shown on the midway. */
  description: string;
  start(canvas: HTMLCanvasElement): () => void;
}

const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function createRegistry(games: readonly CarnivalGame[]) {
  const byId = new Map<string, CarnivalGame>();

  for (const game of games) {
    if (!ID_PATTERN.test(game.id)) {
      throw new Error(`Game id "${game.id}" must be kebab-case`);
    }
    if (byId.has(game.id)) {
      throw new Error(`Two games share the id "${game.id}"`);
    }
    byId.set(game.id, game);
  }

  return {
    all: (): CarnivalGame[] => [...byId.values()],
    get: (id: string): CarnivalGame | undefined => byId.get(id),
  };
}
