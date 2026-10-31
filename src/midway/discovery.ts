import {
  canStand,
  distanceToRect,
  findPath,
  type MidwayMap,
  type Point,
  type PropKind,
  type Rect,
} from './world';

/**
 * A small, optional trail of midway landmarks to find by walking up to them.
 * It never touches scores or passport stamps, and is kept in this browser
 * under its own key.
 */
export type LandmarkId = 'entrance' | 'carousel' | 'ferris-wheel';

export interface Landmark {
  id: LandmarkId;
  name: string;
  /** Where to look, for the next-landmark clue. */
  clue: string;
  area: Rect;
}

export const DISCOVERY_KEY = 'tessl-carnival:discoveries';
/** How close, in tiles from the landmark's edge, counts as finding it. */
export const DISCOVERY_REACH = 1.5;
export const SOUVENIR_TITLE = 'Midway Explorer';

const TRAIL: { id: LandmarkId; kind: PropKind; name: string; clue: string }[] = [
  {
    id: 'entrance',
    kind: 'ticket-booth',
    name: 'Ticket booth',
    clue: 'Head back to the gate at the south end of the avenue and visit the ticket booth.',
  },
  {
    id: 'carousel',
    kind: 'carousel',
    name: 'Carousel',
    clue: 'Walk east from the gate to the carousel by the balloons.',
  },
  {
    id: 'ferris-wheel',
    kind: 'ferris-wheel',
    name: 'Ferris wheel',
    clue: 'Go all the way up the avenue, then west past the big top to the Ferris wheel.',
  },
];

/** The trail's landmarks, placed where the map actually put them. */
export function trailLandmarks(map: MidwayMap): Landmark[] {
  const landmarks: Landmark[] = [];
  for (const step of TRAIL) {
    const prop = map.props.find((p) => p.kind === step.kind);
    if (!prop) continue;
    landmarks.push({
      id: step.id,
      name: step.name,
      clue: step.clue,
      area: { x: prop.x, y: prop.y, w: prop.w, h: prop.h },
    });
  }
  return landmarks;
}

/** The landmark close enough to count as found, if any. */
export function landmarkInReach(
  landmarks: readonly Landmark[],
  at: Point,
  reach = DISCOVERY_REACH,
): Landmark | undefined {
  return landmarks.find((landmark) => distanceToRect(at, landmark.area) <= reach);
}

/**
 * The shortest walk from `from` to an open tile within reach of a landmark, so
 * the player arrives where the find counts. An empty walk means the player is
 * already in reach; undefined means no open tile in reach can be walked to.
 * The walk only moves the player: the find still happens on arrival.
 */
export function pathToLandmark(
  map: MidwayMap,
  from: Point,
  landmark: Landmark,
  reach = DISCOVERY_REACH,
): Point[] | undefined {
  if (distanceToRect(from, landmark.area) <= reach) return [];
  const { area } = landmark;
  const margin = Math.ceil(reach);
  let best: Point[] | undefined;
  let bestLength = Infinity;
  for (let ty = Math.floor(area.y) - margin; ty < area.y + area.h + margin; ty++) {
    for (let tx = Math.floor(area.x) - margin; tx < area.x + area.w + margin; tx++) {
      const spot = { x: tx + 0.5, y: ty + 0.5 };
      if (!canStand(map, spot.x, spot.y)) continue;
      if (distanceToRect(spot, area) > reach) continue;
      const found = findPath(map, from, spot);
      if (!found) continue;
      // Same tile, but not yet in reach: step to the tile's centre.
      const path = found.length > 0 ? found : [spot];
      let length = 0;
      let prev = from;
      for (const step of path) {
        length += Math.hypot(step.x - prev.x, step.y - prev.y);
        prev = step;
      }
      if (length < bestLength) {
        best = path;
        bestLength = length;
      }
    }
  }
  return best;
}

/** A short hint for the corner of the map, or undefined once the trail is done. */
export function landmarkHint(
  landmarks: readonly Landmark[],
  found: readonly LandmarkId[],
): string | undefined {
  const next = nextLandmark(landmarks, found);
  return next ? `🧭 Next landmark: ${next.name}` : undefined;
}

/** Adds a find. Finding the same landmark again changes nothing. */
export function discover(found: readonly LandmarkId[], id: LandmarkId): LandmarkId[] {
  return found.includes(id) ? [...found] : [...found, id];
}

/** Finds from both lists, in order, so another tab's saved finds are kept. */
export function mergeDiscoveries(
  found: readonly LandmarkId[],
  saved: readonly LandmarkId[],
): LandmarkId[] {
  return saved.reduce(discover, [...found]);
}

/** The first landmark still to find, in trail order. */
export function nextLandmark(
  landmarks: readonly Landmark[],
  found: readonly LandmarkId[],
): Landmark | undefined {
  return landmarks.find((landmark) => !found.includes(landmark.id));
}

export function trailComplete(landmarks: readonly Landmark[], found: readonly LandmarkId[]) {
  return landmarks.length > 0 && nextLandmark(landmarks, found) === undefined;
}

/** "2 of 3 landmarks found", plus the souvenir title once the trail is done. */
export function discoveryProgress(
  landmarks: readonly Landmark[],
  found: readonly LandmarkId[],
): string {
  const count = landmarks.filter((landmark) => found.includes(landmark.id)).length;
  const text = `${count} of ${landmarks.length} landmarks found`;
  return trailComplete(landmarks, found) ? `${text}. You're a ${SOUVENIR_TITLE}!` : text;
}

/** The clue for the next landmark, or the souvenir once all are found. */
export function discoveryClue(
  landmarks: readonly Landmark[],
  found: readonly LandmarkId[],
): string {
  const next = nextLandmark(landmarks, found);
  return next ? `Next: ${next.clue}` : `🎖️ Souvenir earned: ${SOUVENIR_TITLE}.`;
}

const IDS = new Set<string>(TRAIL.map((step) => step.id));

/** Reads saved finds, keeping only known, unrepeated ids. Anything else reads as none. */
export function parseDiscoveries(raw: string | null): LandmarkId[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    const found: LandmarkId[] = [];
    for (const id of value) {
      if (typeof id === 'string' && IDS.has(id) && !found.includes(id as LandmarkId)) {
        found.push(id as LandmarkId);
      }
    }
    return found;
  } catch {
    return [];
  }
}

type DiscoveryStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function createDiscoveryStore(storage: DiscoveryStorage | undefined) {
  function load(): LandmarkId[] {
    try {
      return parseDiscoveries(storage?.getItem(DISCOVERY_KEY) ?? null);
    } catch {
      return [];
    }
  }

  /** Saves the finds, and returns whether the write worked. */
  function save(found: readonly LandmarkId[]): boolean {
    try {
      if (!storage) return false;
      storage.setItem(DISCOVERY_KEY, JSON.stringify(found));
      return true;
    } catch {
      return false;
    }
  }

  function reset(): void {
    try {
      storage?.removeItem(DISCOVERY_KEY);
    } catch {
      // Nothing saved to clear.
    }
  }

  return { load, save, reset };
}

function browserStorage(): DiscoveryStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export const discoveryStore = createDiscoveryStore(
  typeof window === 'undefined' ? undefined : browserStorage(),
);
