import { distanceToRect, type Dock, type DockId, type MidwayMap, type Point } from './world';

/**
 * The ferry across the waterside's river. Plain functions with no canvas or
 * DOM. The ferry only moves when someone asks: it waits at a dock until the
 * player boards and casts off, or calls it over from the other dock. Nothing
 * runs on a timer, and the player is only ever set down on a pier.
 */

/** Seconds a crossing takes with motion on. Quiet mode crosses in one step. */
export const CROSSING_SECONDS = 6;
/** How close, in tiles, the player must stand to a pier to use the ferry. */
export const DOCK_REACH = 1.2;

export interface FerryState {
  phase: 'docked' | 'sailing';
  /** Docked: the dock it waits at. Sailing: the dock it is headed for. */
  dock: DockId;
  /** How far through the crossing, 0 to 1. Always 1 when docked. */
  progress: number;
  /** Whether the player is aboard. */
  riding: boolean;
}

export const START_FERRY: FerryState = {
  phase: 'docked',
  dock: 'promenade',
  progress: 1,
  riding: false,
};

/**
 * What the player can ask of the ferry. `use` is the one key or click: board,
 * cast off, call it over, or hurry a crossing to its dock. Arriving always sets
 * a rider down on the pier, so there is no separate request to land.
 */
export type FerryRequest = 'use' | 'board' | 'depart' | 'call' | 'skip' | 'turn-back' | 'step-off';

export function otherDock(id: DockId): DockId {
  return id === 'promenade' ? 'far-shore' : 'promenade';
}

export function dockById(map: MidwayMap, id: DockId): Dock {
  return map.waterside.docks.find((dock) => dock.id === id)!;
}

/** The dock whose pier the player stands within reach of, if any. */
export function dockInReach(map: MidwayMap, point: Point, reach = DOCK_REACH): Dock | undefined {
  return map.waterside.docks.find((dock) => distanceToRect(point, dock.pier) <= reach);
}

/** Where the ferry is on the water: at its berth, or part way across. */
export function ferryPosition(map: MidwayMap, ferry: FerryState): Point {
  const to = dockById(map, ferry.dock).berth;
  if (ferry.phase === 'docked') return { ...to };
  const from = dockById(map, otherDock(ferry.dock)).berth;
  // Ease in and out, so it pulls away and ties up gently.
  const s = ferry.progress * ferry.progress * (3 - 2 * ferry.progress);
  return { x: from.x + (to.x - from.x) * s, y: from.y + (to.y - from.y) * s };
}

/**
 * The ferry after a request from a player standing at `near` (the dock in
 * reach, if any). A request that makes no sense right now changes nothing, so
 * a repeated key or a double click never boards twice or casts off twice.
 */
export function requestFerry(
  ferry: FerryState,
  request: FerryRequest,
  near: DockId | undefined,
): FerryState {
  if (request === 'use') {
    if (ferry.phase === 'sailing') return requestFerry(ferry, 'skip', near);
    if (ferry.riding) return requestFerry(ferry, 'depart', near);
    return requestFerry(ferry, near === ferry.dock ? 'board' : 'call', near);
  }
  switch (request) {
    case 'board':
      return ferry.phase === 'docked' && !ferry.riding && near === ferry.dock
        ? { ...ferry, riding: true }
        : ferry;
    case 'depart':
      return ferry.phase === 'docked' && ferry.riding
        ? { phase: 'sailing', dock: otherDock(ferry.dock), progress: 0, riding: true }
        : ferry;
    case 'call':
      return ferry.phase === 'docked' && !ferry.riding && near === otherDock(ferry.dock)
        ? { phase: 'sailing', dock: near, progress: 0, riding: false }
        : ferry;
    case 'skip':
      return ferry.phase === 'sailing' ? settleFerry(ferry) : ferry;
    case 'turn-back':
      return ferry.phase === 'sailing'
        ? { ...ferry, dock: otherDock(ferry.dock), progress: 1 - ferry.progress }
        : ferry;
    case 'step-off':
      return ferry.phase === 'docked' && ferry.riding ? { ...ferry, riding: false } : ferry;
  }
  return ferry;
}

/**
 * The ferry `dt` seconds later. In quiet mode a crossing lands at once, so the
 * trip still happens, and ends at the same dock, with nothing gliding by.
 */
export function sailFerry(ferry: FerryState, dt: number, quiet: boolean): FerryState {
  if (ferry.phase !== 'sailing') return ferry;
  const progress = quiet ? 1 : ferry.progress + dt / CROSSING_SECONDS;
  return progress >= 1 ? settleFerry(ferry) : { ...ferry, progress };
}

/**
 * Whether the camera should jump to the player rather than ease after a ferry
 * change. In quiet mode a ride moves the player across the river in one step,
 * so a long eased pan would undo the stillness; animated crossings ease.
 */
export function ferrySnapsCamera(before: FerryState, after: FerryState, quiet: boolean): boolean {
  return quiet && before !== after && (before.riding || after.riding);
}

/**
 * The crossing finished: the ferry ties up at the dock it was headed for and a
 * rider steps off onto that pier. Arriving, hurrying a crossing and leaving the
 * midway mid-ride all end this way, so a ride never leaves anyone on the water.
 */
export function settleFerry(ferry: FerryState): FerryState {
  return { phase: 'docked', dock: ferry.dock, progress: 1, riding: false };
}

/** What the ferry status line says, empty when there is nothing to tell. */
export function ferryMessage(
  map: MidwayMap,
  ferry: FerryState,
  near: DockId | undefined,
  farShore = false,
): string {
  const to = dockById(map, ferry.dock).name;
  if (ferry.phase === 'sailing') {
    // No running percentage: the line changes only when the ride does, so it never chatters.
    return ferry.riding
      ? `Crossing to ${to}. Press E to hurry to the dock.`
      : `The ferry is coming over to ${to}. Press E to hurry it.`;
  }
  if (ferry.riding) {
    return `Aboard the ferry at ${to}. Press E to cast off for ${dockById(map, otherDock(ferry.dock)).name}, or walk to step off.`;
  }
  if (near === undefined) {
    // The far shore is only joined to the midway by water, so say how to get back.
    return farShore
      ? `The ferry back to the midway leaves from ${dockById(map, 'far-shore').name}.`
      : '';
  }
  if (near === ferry.dock) return `The ferry waits at ${to}. Press E or click it to board.`;
  return `The ferry is at ${to}. Press E or click it to call it over.`;
}

/** Whether a point is on the far shore, which only the ferry reaches. */
export function onFarShore(map: MidwayMap, point: Point): boolean {
  return point.x >= map.waterside.farShoreX - 1;
}

/** The buttons the ferry panel offers right now, in order. */
export function ferryButtons(ferry: FerryState, near: DockId | undefined): FerryRequest[] {
  if (ferry.phase === 'sailing') return ['skip', 'turn-back'];
  if (ferry.riding) return ['depart', 'step-off'];
  if (near === ferry.dock) return ['board'];
  if (near !== undefined) return ['call'];
  return [];
}
