import { describe, expect, it } from 'vitest';
import type { CarnivalGame } from './carnival';
import { progressText, trailMissions, trailRecommendation } from './trail';

function game(id: string, name: string): CarnivalGame {
  return { id, name, description: `${name}.`, start: () => () => {} };
}

const cannon = game('water-cannon', 'Water Cannon');
const rings = game('ring-toss', 'Ring Toss');
const moles = game('mole-mayhem', 'Mole Mayhem');
const ducks = game('duck-pond', 'Duck Pond');

function scores(map: Record<string, number>) {
  return (gameId: string) => map[gameId];
}

function byId(games: CarnivalGame[], map: Record<string, number>) {
  return Object.fromEntries(trailMissions(games, scores(map)).map((m) => [m.id, m]));
}

describe('trailMissions', () => {
  it('never completes a mission with no booths registered', () => {
    const missions = trailMissions([], scores({}));
    expect(missions.map((m) => m.id)).toEqual(['explorer', 'crowd-pleaser', 'headliner']);
    for (const mission of missions) {
      expect(mission).toMatchObject({ progress: 0, target: 0, complete: false, next: undefined });
      expect(mission.nextAction).toBe('No booths are open yet.');
    }
    expect(trailRecommendation(missions)).toBeUndefined();
  });

  it('counts a zero score as played but not towards a score threshold', () => {
    const m = byId([cannon, rings], { 'water-cannon': 0 });
    expect(m.explorer).toMatchObject({ progress: 1, target: 2, complete: false });
    expect(m.explorer.next?.gameId).toBe('ring-toss');
    expect(m['crowd-pleaser']).toMatchObject({ progress: 0, target: 2, complete: false });
    expect(m.headliner).toMatchObject({ progress: 0, target: 2, complete: false });
  });

  it('meets each threshold at exactly its score, not one point before', () => {
    const below = byId([cannon, rings], { 'water-cannon': 49, 'ring-toss': 149 });
    expect(below['crowd-pleaser']).toMatchObject({ progress: 1, complete: false });
    expect(below['crowd-pleaser'].nextAction).toBe(
      'Score 1 more point at Water Cannon to reach 50.',
    );
    expect(below.headliner.progress).toBe(0);

    const exact = byId([cannon, rings], { 'water-cannon': 50, 'ring-toss': 150 });
    expect(exact['crowd-pleaser']).toMatchObject({ progress: 2, complete: true, next: undefined });
    expect(exact.headliner).toMatchObject({ progress: 1, complete: false });
    expect(exact.headliner.nextAction).toBe('Score 100 more points at Water Cannon to reach 150.');
  });

  it('needs every booth when fewer than two are registered', () => {
    const m = byId([cannon], { 'water-cannon': 50 });
    expect(m.explorer).toMatchObject({ progress: 1, target: 1, complete: true });
    expect(m['crowd-pleaser']).toMatchObject({ target: 1, complete: true });
    expect(m['crowd-pleaser'].goal).toBe('Score at least 50 at 1 booth.');
    expect(m.headliner).toMatchObject({ target: 1, complete: false });
  });

  it('handles four or more booths from the registry and recommends the closest booth', () => {
    const m = byId([cannon, rings, moles, ducks], {
      'water-cannon': 10,
      'ring-toss': 40,
      'mole-mayhem': 200,
    });
    expect(m.explorer).toMatchObject({ progress: 3, target: 4 });
    expect(m.explorer.next).toEqual({
      gameId: 'duck-pond',
      name: 'Duck Pond',
      playHref: '#/play/duck-pond',
    });
    expect(m.explorer.nextAction).toBe('Play Duck Pond for the first time.');
    expect(m['crowd-pleaser']).toMatchObject({ progress: 1, target: 2 });
    expect(m['crowd-pleaser'].next?.gameId).toBe('ring-toss');
    expect(m.headliner.next?.gameId).toBe('ring-toss');
  });

  it('completes every mission once the scores are there, with no booth left to suggest', () => {
    const missions = trailMissions(
      [cannon, rings, moles],
      scores({ 'water-cannon': 150, 'ring-toss': 160, 'mole-mayhem': 0 }),
    );
    expect(missions.every((m) => m.complete)).toBe(true);
    expect(missions.every((m) => m.nextAction === 'Mission complete!')).toBe(true);
    expect(trailRecommendation(missions)).toBeUndefined();
    expect(progressText(missions[1])).toBe('2 of 2 booths');
  });
});

describe('trailRecommendation', () => {
  it('picks the first unfinished mission in order', () => {
    const missions = trailMissions([cannon, rings], scores({ 'water-cannon': 60, 'ring-toss': 5 }));
    expect(trailRecommendation(missions)?.id).toBe('crowd-pleaser');
    expect(trailRecommendation(missions)?.next?.gameId).toBe('ring-toss');
  });
});

describe('progressText', () => {
  it('caps progress at the target and uses the singular for one booth', () => {
    const [, crowd] = trailMissions(
      [cannon, rings, moles],
      scores({ 'water-cannon': 60, 'ring-toss': 60, 'mole-mayhem': 60 }),
    );
    expect(progressText(crowd)).toBe('2 of 2 booths');
    expect(progressText(trailMissions([cannon], scores({}))[0])).toBe('0 of 1 booth');
  });
});
