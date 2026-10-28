import { bestScore, type CarnivalGame } from './carnival';

/** One Carnival Trail mission, worked out from best scores. Nothing is stored. */
export interface TrailMission {
  id: 'explorer' | 'crowd-pleaser' | 'headliner' | 'midway-master';
  name: string;
  goal: string;
  /** Booths that count towards the mission so far. */
  progress: number;
  /** Booths the mission needs. 0 when no booth is registered. */
  target: number;
  /** True only when at least one booth is registered and the target is met. */
  complete: boolean;
  /** The booth to play next, or undefined when complete or with no booths. */
  next: { gameId: string; name: string; playHref: string } | undefined;
  /** The exact next step, in words. */
  nextAction: string;
}

/** How many booths the score missions need, or every booth when fewer are registered. */
export const TRAIL_BOOTHS_NEEDED = 2;

type Best = (gameId: string) => number | undefined;

function boothLink(game: CarnivalGame) {
  return { gameId: game.id, name: game.name, playHref: `#/play/${game.id}` };
}

function finish(
  base: Pick<TrailMission, 'id' | 'name' | 'goal' | 'progress' | 'target'>,
  pick: CarnivalGame | undefined,
  action: (game: CarnivalGame) => string,
): TrailMission {
  const complete = base.target > 0 && base.progress >= base.target;
  if (base.target === 0) {
    return { ...base, complete, next: undefined, nextAction: 'No booths are open yet.' };
  }
  if (complete || !pick) {
    return { ...base, complete, next: undefined, nextAction: 'Mission complete!' };
  }
  return { ...base, complete, next: boothLink(pick), nextAction: action(pick) };
}

function explorer(games: readonly CarnivalGame[], best: Best): TrailMission {
  const unplayed = games.filter((game) => best(game.id) === undefined);
  return finish(
    {
      id: 'explorer',
      name: 'Explorer',
      goal: 'Play every booth on the midway.',
      progress: games.length - unplayed.length,
      target: games.length,
    },
    unplayed[0],
    (game) => `Play ${game.name} for the first time.`,
  );
}

/** Midway Master's score, needed at every registered booth. */
export const MIDWAY_MASTER_SCORE = 100;

function scoreMission(
  id: 'crowd-pleaser' | 'headliner' | 'midway-master',
  name: string,
  minScore: number,
  games: readonly CarnivalGame[],
  best: Best,
  everyBooth = false,
): TrailMission {
  const target = everyBooth ? games.length : Math.min(TRAIL_BOOTHS_NEEDED, games.length);
  const below = games.filter((game) => (best(game.id) ?? 0) < minScore);
  // The unfinished booth closest to the threshold; ties keep registry order.
  const pick = below.reduce<CarnivalGame | undefined>(
    (closest, game) =>
      closest === undefined || (best(game.id) ?? 0) > (best(closest.id) ?? 0) ? game : closest,
    undefined,
  );
  const boothWord = target === 1 ? 'booth' : 'booths';
  return finish(
    {
      id,
      name,
      goal: everyBooth
        ? `Score at least ${minScore} at every booth.`
        : `Score at least ${minScore} at ${target} ${boothWord}.`,
      progress: games.length - below.length,
      target,
    },
    pick,
    (game) => {
      const points = minScore - (best(game.id) ?? 0);
      return `Score ${points} more ${points === 1 ? 'point' : 'points'} at ${game.name} to reach ${minScore}.`;
    },
  );
}

/**
 * The Carnival Trail's missions for the registered games, read from the
 * shared scores module. A new game joins the trail when it registers.
 */
export function trailMissions(
  games: readonly CarnivalGame[],
  best: Best = bestScore,
): TrailMission[] {
  return [
    explorer(games, best),
    scoreMission('crowd-pleaser', 'Crowd Pleaser', 50, games, best),
    scoreMission('headliner', 'Headliner', 150, games, best),
    scoreMission('midway-master', 'Midway Master', MIDWAY_MASTER_SCORE, games, best, true),
  ];
}

/** The trail's intro line, with the real mission count. */
export function trailIntro(missions: readonly TrailMission[]): string {
  const noun = missions.length === 1 ? 'mission' : 'missions';
  return `${missions.length} ${noun} across every booth on the midway.`;
}

/** The mission counter, e.g. "1 of 2 booths". Progress never shows above the target. */
export function progressText(mission: TrailMission): string {
  const noun = mission.target === 1 ? 'booth' : 'booths';
  return `${Math.min(mission.progress, mission.target)} of ${mission.target} ${noun}`;
}

/** The first unfinished mission's next booth, for the trail's headline recommendation. */
export function trailRecommendation(missions: readonly TrailMission[]): TrailMission | undefined {
  return missions.find((mission) => !mission.complete && mission.next !== undefined);
}
