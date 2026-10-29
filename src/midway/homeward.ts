import { dockById, onFarShore } from './ferry';
import type { MidwayMap, Point } from './world';

/**
 * The way back from the waterside district. Plain functions with no canvas or
 * DOM. Returning never teleports: on the promenade it is a walk back through
 * the hedge gap, and on the far shore a walk to the dock the ferry home leaves
 * from. The player rides the ferry across as usual.
 */

export interface Homeward {
  /** Where the player is: the promenade or the far shore. */
  area: 'the promenade' | 'the far shore';
  /** The named place the Return to midway walk heads for. */
  destination: string;
  /** The tile the walk ends on. */
  target: Point;
}

/** Whether a point is beyond the midway's east hedge, in the waterside district. */
export function inWaterside(map: MidwayMap, point: Point): boolean {
  return point.x >= map.midwayWidth;
}

/** The way back from where the player stands, or undefined inside the midway. */
export function homeward(map: MidwayMap, point: Point): Homeward | undefined {
  if (!inWaterside(map, point)) return undefined;
  if (onFarShore(map, point)) {
    const dock = dockById(map, 'far-shore');
    return { area: 'the far shore', destination: dock.name, target: { ...dock.landing } };
  }
  const gap = map.waterside.gap;
  return {
    area: 'the promenade',
    destination: 'the midway',
    // The first tile inside the hedge, on the back cross path.
    target: { x: gap.x - 1, y: gap.y },
  };
}

/** The away line by the Return to midway button, empty inside the midway. */
export function homewardMessage(way: Homeward | undefined): string {
  if (!way) return '';
  return way.area === 'the far shore'
    ? `You are on the far shore. Return to midway walks you to ${way.destination} only: board the ferry there to cross home.`
    : 'You are on the promenade. Return to midway walks you back through the hedge gap.';
}
