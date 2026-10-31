import { bestScore, type CarnivalGame } from './carnival';
import { boothMaxScore } from './prize-pavilion';

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

/**
 * The score a booth needs for a mission: `minScore`, or the booth's best
 * possible round when that is lower, or undefined when the booth cannot count.
 */
function boothGoal(game: CarnivalGame, minScore: number, everyBooth: boolean): number | undefined {
  const max = boothMaxScore(game.id);
  if (max === undefined || max >= minScore) return minScore;
  return everyBooth ? max : undefined;
}

function scoreMission(
  id: 'crowd-pleaser' | 'headliner' | 'midway-master',
  name: string,
  minScore: number,
  games: readonly CarnivalGame[],
  best: Best,
  everyBooth = false,
): TrailMission {
  // A booth whose best round is below the score counts at its own best for an
  // every-booth mission, and not at all otherwise.
  const eligible = games.filter((game) => boothGoal(game, minScore, everyBooth) !== undefined);
  const goalFor = (game: CarnivalGame) => boothGoal(game, minScore, everyBooth) ?? minScore;
  const target = everyBooth ? games.length : Math.min(TRAIL_BOOTHS_NEEDED, eligible.length);
  const below = eligible.filter((game) => (best(game.id) ?? 0) < goalFor(game));
  // The unfinished booth closest to the threshold; ties keep registry order.
  const gap = (game: CarnivalGame) => goalFor(game) - (best(game.id) ?? 0);
  const pick = below.reduce<CarnivalGame | undefined>(
    (closest, game) => (closest === undefined || gap(game) < gap(closest) ? game : closest),
    undefined,
  );
  const boothWord = target === 1 ? 'booth' : 'booths';
  if (target === 0 && games.length > 0) {
    const goal = `Score at least ${minScore} at ${TRAIL_BOOTHS_NEEDED} booths.`;
    const base = { id, name, goal, progress: 0, target: 0, complete: false, next: undefined };
    return { ...base, nextAction: 'No open booth can score this high yet.' };
  }
  return finish(
    {
      id,
      name,
      goal: everyBooth
        ? games.some((game) => goalFor(game) < minScore)
          ? `Score at least ${minScore} at every booth, or a booth's best possible round where that is lower.`
          : `Score at least ${minScore} at every booth.`
        : `Score at least ${minScore} at ${target} ${boothWord}.`,
      progress: eligible.length - below.length,
      target,
    },
    pick,
    (game) => {
      const goal = goalFor(game);
      const points = goal - (best(game.id) ?? 0);
      return `Score ${points} more ${points === 1 ? 'point' : 'points'} at ${game.name} to reach ${goal}.`;
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
