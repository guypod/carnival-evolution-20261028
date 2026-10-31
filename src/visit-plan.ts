import type { LandmarkId } from './midway/discovery';

/**
 * Choose My Visit: three curated moods, each a three-stop itinerary through
 * booths and landmarks. The plan lives in memory for this visit only. It never
 * reads or writes scores, stamps or discovery finds, and has no timer.
 */
export type VisitStop =
  | { kind: 'booth'; gameId: string; name: string; why: string }
  | { kind: 'landmark'; landmarkId: LandmarkId; name: string; why: string };

export interface VisitMood {
  id: string;
  name: string;
  summary: string;
  stops: readonly VisitStop[];
}

export const VISIT_MOODS: readonly VisitMood[] = [
  {
    id: 'relaxed',
    name: 'Relaxed',
    summary: 'An easy stroll with gentle games.',
    stops: [
      {
        kind: 'landmark',
        landmarkId: 'carousel',
        name: 'Carousel',
        why: 'Start slow with a look at the carousel.',
      },
      {
        kind: 'booth',
        gameId: 'ring-toss',
        name: 'Ring Toss',
        why: 'Take your time lining up each throw.',
      },
      {
        kind: 'booth',
        gameId: 'memory-menagerie',
        name: 'Memory Menagerie',
        why: 'A calm puzzle with no rush.',
      },
    ],
  },
  {
    id: 'reflex',
    name: 'Reflex',
    summary: 'Quick hands and fast reactions.',
    stops: [
      {
        kind: 'booth',
        gameId: 'mole-mayhem',
        name: 'Mole Mayhem',
        why: 'Warm up your reactions on popping moles.',
      },
      {
        kind: 'booth',
        gameId: 'water-cannon',
        name: 'Water Cannon',
        why: 'Keep your aim steady on moving targets.',
      },
      {
        kind: 'booth',
        gameId: 'duck-dash',
        name: 'Duck Dash',
        why: 'Finish on the fastest dash on the midway.',
      },
    ],
  },
  {
    id: 'explorer',
    name: 'Explorer',
    summary: 'See the far corners of the midway.',
    stops: [
      {
        kind: 'landmark',
        landmarkId: 'entrance',
        name: 'Ticket booth',
        why: 'Begin where every visit begins, at the gate.',
      },
      {
        kind: 'booth',
        gameId: 'mini-putt',
        name: 'Mini Putt',
        why: 'A course worth wandering over to.',
      },
      {
        kind: 'landmark',
        landmarkId: 'ferris-wheel',
        name: 'Ferris wheel',
        why: 'End at the top of the avenue by the big wheel.',
      },
    ],
  },
];

export interface VisitPlan {
  moodId: string;
  /** The stop the visitor is heading to next; equal to the stop count when finished. */
  index: number;
}

export function findMood(moodId: string, moods: readonly VisitMood[] = VISIT_MOODS) {
  return moods.find((mood) => mood.id === moodId);
}

/** Starts a mood's itinerary at its first stop, or undefined for an unknown mood. */
export function chooseVisit(
  moodId: string,
  moods: readonly VisitMood[] = VISIT_MOODS,
): VisitPlan | undefined {
  return findMood(moodId, moods) ? { moodId, index: 0 } : undefined;
}

/** Marks the current stop done. A finished plan stays finished. */
export function advanceVisit(
  plan: VisitPlan,
  moods: readonly VisitMood[] = VISIT_MOODS,
): VisitPlan {
  const mood = findMood(plan.moodId, moods);
  if (!mood) return plan;
  return { ...plan, index: Math.min(plan.index + 1, mood.stops.length) };
}

export function restartVisit(plan: VisitPlan): VisitPlan {
  return { ...plan, index: 0 };
}

/** Leaving the plan: there is no plan afterwards. */
export function exitVisit(): undefined {
  return undefined;
}

export function currentStop(
  plan: VisitPlan,
  moods: readonly VisitMood[] = VISIT_MOODS,
): VisitStop | undefined {
  return findMood(plan.moodId, moods)?.stops[plan.index];
}

export function visitFinished(plan: VisitPlan, moods: readonly VisitMood[] = VISIT_MOODS): boolean {
  const mood = findMood(plan.moodId, moods);
  return mood !== undefined && plan.index >= mood.stops.length;
}

export function visitProgress(plan: VisitPlan, moods: readonly VisitMood[] = VISIT_MOODS): string {
  const mood = findMood(plan.moodId, moods);
  if (!mood) return '';
  if (plan.index >= mood.stops.length)
    return `${mood.name} visit complete: all ${mood.stops.length} stops done.`;
  return `${mood.name} visit: stop ${plan.index + 1} of ${mood.stops.length}.`;
}

/**
 * The quiet celebration once every stop is marked done: the mood and its stops
 * in order. Undefined until the plan is finished. It awards nothing.
 */
export function visitSummary(plan: VisitPlan, moods: readonly VisitMood[] = VISIT_MOODS) {
  const mood = findMood(plan.moodId, moods);
  if (!mood || !visitFinished(plan, moods)) return undefined;
  const names = mood.stops.map((stop) => stop.name);
  const stops = `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `Well done! You finished the ${mood.name} visit: ${stops}.`;
}
