/**
 * Repaired toys: the wind-up toys a player fixed in the backstage repair
 * workshop stand on the grass beside the entrance and play. They are small
 * scenery that blocks nobody's way, covers no booth, and keeps no score. With
 * no repairs, or with them hidden, the midway looks just as it always did.
 */

import { CAM_BASE, camOutline, followerLift } from '../workshop/cams';
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

const HAMMER_HEAD = 2.5;
const HAMMER_LENGTH = 12;

/**
 * Where the rooster bell's hammer head is: on the end of the handle, which
 * pivots at the plinth and swings from upright onto the bell's left edge. The
 * swing starts and rests on the bell, so a still scenery clock (quiet mode)
 * shows the head touching it.
 */
export function bellHammerHead(p: Point, t: number): Point {
  const top = p.y - 8;
  const swing = 0.5 + 0.5 * Math.cos(t * 3);
  // At full swing the head sits 2.9px right of the pivot, so its edge touches the bell's dome.
  const hit = Math.atan2(-Math.sqrt(HAMMER_LENGTH ** 2 - 2.9 ** 2), 2.9);
  const a = hit - 0.9 + swing * 0.9;
  return { x: p.x - 5 + Math.cos(a) * HAMMER_LENGTH, y: top + Math.sin(a) * HAMMER_LENGTH };
}

/** The midway frog's cam is drawn at this share of the bench's size. */
export const FROG_SCALE = 0.25;
const FROG_ROD = 5;

/** How far the midway frog's snail cam has turned at scenery clock `t`. */
export function frogTurns(t: number): number {
  return t * 0.8;
}

/**
 * The bottom of the midway frog: on top of its rod, whose foot stands on the
 * snail cam straight above the shaft, using the bench's cam profile.
 */
export function frogSeat(shaft: Point, turns: number): number {
  return shaft.y - (CAM_BASE + followerLift('snail', turns)) * FROG_SCALE - FROG_ROD;
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
    const head = bellHammerHead(p, t);
    ctx.strokeStyle = palette.woodDark;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(p.x - 5, top);
    ctx.lineTo(head.x, head.y);
    ctx.stroke();
    ctx.fillStyle = palette.red;
    ctx.beginPath();
    ctx.arc(head.x, head.y, HAMMER_HEAD, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // The frog rides a rod on a small snail cam: the same profile as the bench, at quarter size.
    const turns = frogTurns(t);
    const shaft = { x: p.x, y: top - 8 };
    ctx.fillStyle = palette.gold;
    ctx.beginPath();
    for (const q of camOutline('snail', turns, 32))
      ctx.lineTo(shaft.x + q.x * FROG_SCALE, shaft.y + q.y * FROG_SCALE);
    ctx.closePath();
    ctx.fill();
    const y = frogSeat(shaft, turns);
    ctx.strokeStyle = palette.woodDark;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(shaft.x, shaft.y - (CAM_BASE + followerLift('snail', turns)) * FROG_SCALE);
    ctx.lineTo(shaft.x, y);
    ctx.stroke();
    ctx.fillStyle = palette.hedgeLight;
    ctx.beginPath();
    ctx.ellipse(p.x, y - 3, 6, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = palette.cream;
    ctx.beginPath();
    ctx.arc(p.x - 3, y - 6, 1.5, 0, Math.PI * 2);
    ctx.arc(p.x + 3, y - 6, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
}
