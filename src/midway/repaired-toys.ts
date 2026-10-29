/**
 * Repaired toys: the wind-up toys a player fixed in the backstage repair
 * workshop stand on the grass beside the entrance and play. They are small
 * scenery that blocks nobody's way, covers no booth, and keeps no score. With
 * no repairs, or with them hidden, the midway looks just as it always did.
 */

import { palette } from './palette';
import type { MidwayMap, Point } from './world';

export type RepairedToyId = 'music-box' | 'rooster-bell' | 'hopping-frog';

const ORDER: readonly RepairedToyId[] = ['music-box', 'rooster-bell', 'hopping-frog'];

/**
 * Where each toy stands, in tile coordinates: a row on the open grass east of
 * the light garden and south of the carousel, a step from where you arrive.
 */
export function toySpots(
  map: Pick<MidwayMap, 'avenueX' | 'height'>,
  toys: readonly RepairedToyId[],
): { id: RepairedToyId; at: Point }[] {
  return ORDER.filter((id) => toys.includes(id)).map((id) => ({
    id,
    at: { x: map.avenueX + 7.6 + ORDER.indexOf(id) * 1.2, y: map.height - 2.6 },
  }));
}

/** Draws one toy at its spot. `t` is the scenery clock, which stands still in quiet mode. */
export function drawRepairedToy(
  ctx: CanvasRenderingContext2D,
  id: RepairedToyId,
  p: Point,
  t: number,
) {
  ctx.fillStyle = palette.shadow;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, 11, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  // A little wooden plinth under every toy.
  ctx.fillStyle = palette.wood;
  ctx.fillRect(p.x - 9, p.y - 7, 18, 7);
  ctx.fillStyle = palette.woodLight;
  ctx.fillRect(p.x - 9, p.y - 8, 18, 2);
  const top = p.y - 8;
  if (id === 'music-box') {
    // The bear turns on its box: drawn narrower and wider as it spins.
    const turn = Math.cos(t * 2.4);
    ctx.fillStyle = palette.woodDark;
    ctx.beginPath();
    ctx.ellipse(p.x, top - 7, 4 * Math.max(0.35, Math.abs(turn)), 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p.x, top - 14, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = palette.gold;
    ctx.fillRect(p.x - 1, top - 2, 2, 2);
  } else if (id === 'rooster-bell') {
    // The hammer swings to the bell and back.
    ctx.fillStyle = palette.gold;
    ctx.beginPath();
    ctx.arc(p.x + 4, top - 10, 4, Math.PI, 0);
    ctx.lineTo(p.x + 8, top - 8);
    ctx.lineTo(p.x, top - 8);
    ctx.fill();
    const swing = 0.5 - 0.5 * Math.cos(t * 3);
    const a = -Math.PI / 2 - 0.9 + swing * 0.9;
    ctx.strokeStyle = palette.woodDark;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(p.x - 5, top);
    ctx.lineTo(p.x - 5 + Math.cos(a) * 12, top + Math.sin(a) * 12);
    ctx.stroke();
    ctx.fillStyle = palette.red;
    ctx.beginPath();
    ctx.arc(p.x - 5, top - 13, 2.5, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // The frog rises slowly on its snail cam, then drops.
    const lift = (((t * 0.8) % 1) + 1) % 1;
    const y = top - 4 - lift * 6;
    ctx.fillStyle = palette.hedgeLight;
    ctx.beginPath();
    ctx.ellipse(p.x, y, 6, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = palette.cream;
    ctx.beginPath();
    ctx.arc(p.x - 3, y - 3, 1.5, 0, Math.PI * 2);
    ctx.arc(p.x + 3, y - 3, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
}
