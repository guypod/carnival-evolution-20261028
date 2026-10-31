import { describe, expect, it } from 'vitest';
import type { CarnivalGame } from './carnival';
import { registry } from './games';
import { boothMaxScore } from './prize-pavilion';
import { progressText, trailIntro, trailMissions, trailRecommendation } from './trail';

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
    expect(missions.map((m) => m.id)).toEqual([
      'explorer',
      'crowd-pleaser',
      'headliner',
      'midway-master',
    ]);
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

  it('completes the first three missions with two high scores, leaving Midway Master open', () => {
    const missions = trailMissions(
      [cannon, rings, moles],
      scores({ 'water-cannon': 150, 'ring-toss': 160, 'mole-mayhem': 0 }),
    );
    const [explorer, crowd, headliner, master] = missions;
    expect([explorer, crowd, headliner].every((m) => m.complete)).toBe(true);
    expect([explorer, crowd, headliner].every((m) => m.nextAction === 'Mission complete!')).toBe(
      true,
    );
    expect(master).toMatchObject({ id: 'midway-master', progress: 2, target: 3, complete: false });
    expect(master.nextAction).toBe('Score 100 more points at Mole Mayhem to reach 100.');
    expect(trailRecommendation(missions)?.id).toBe('midway-master');
    expect(progressText(crowd)).toBe('2 of 2 booths');
  });

  it('completes every mission once the scores are there, with no booth left to suggest', () => {
    const missions = trailMissions(
      [cannon, rings, moles],
      scores({ 'water-cannon': 150, 'ring-toss': 160, 'mole-mayhem': 100 }),
    );
    expect(missions.every((m) => m.complete)).toBe(true);
    expect(missions.every((m) => m.nextAction === 'Mission complete!')).toBe(true);
    expect(trailRecommendation(missions)).toBeUndefined();
    expect(progressText(missions[1])).toBe('2 of 2 booths');
  });
});

describe('Midway Master', () => {
  function master(games: CarnivalGame[], map: Record<string, number>) {
    return byId(games, map)['midway-master'];
  }

  it('is never earned with no booths registered', () => {
    expect(master([], {})).toMatchObject({
      progress: 0,
      target: 0,
      complete: false,
      next: undefined,
    });
  });

  it('needs at least 100 at every registered booth, met at exactly 100', () => {
    const below = master([cannon, rings], { 'water-cannon': 100, 'ring-toss': 99 });
    expect(below).toMatchObject({ progress: 1, target: 2, complete: false });
    expect(below.goal).toBe('Score at least 100 at every booth.');
    expect(below.next?.gameId).toBe('ring-toss');
    expect(below.nextAction).toBe('Score 1 more point at Ring Toss to reach 100.');

    const exact = master([cannon, rings], { 'water-cannon': 100, 'ring-toss': 100 });
    expect(exact).toMatchObject({ progress: 2, target: 2, complete: true, next: undefined });
    expect(exact.nextAction).toBe('Mission complete!');
  });

  it('recommends the closest unfinished booth and counts a zero score as below the line', () => {
    const m = master([cannon, rings, moles, ducks], {
      'water-cannon': 0,
      'ring-toss': 70,
      'mole-mayhem': 120,
    });
    expect(m).toMatchObject({ progress: 1, target: 4, complete: false });
    expect(m.next?.gameId).toBe('ring-toss');
    expect(m.nextAction).toBe('Score 30 more points at Ring Toss to reach 100.');
    expect(progressText(m)).toBe('1 of 4 booths');
  });

  it('breaks ties by registry order', () => {
    const m = master([cannon, rings, moles], {
      'water-cannon': 120,
      'ring-toss': 60,
      'mole-mayhem': 60,
    });
    expect(m.next?.gameId).toBe('ring-toss');
  });

  it('reopens when a new booth registers that has not been played', () => {
    const before = master([cannon, rings], { 'water-cannon': 100, 'ring-toss': 140 });
    expect(before.complete).toBe(true);
    const after = master([cannon, rings, ducks], { 'water-cannon': 100, 'ring-toss': 140 });
    expect(after).toMatchObject({ progress: 2, target: 3, complete: false });
    expect(after.next?.gameId).toBe('duck-pond');
    expect(after.nextAction).toBe('Score 100 more points at Duck Pond to reach 100.');
  });
});

describe('trailIntro', () => {
  it('counts the missions on the trail', () => {
    expect(trailIntro(trailMissions([cannon], scores({})))).toBe(
      '4 missions across every booth on the midway.',
    );
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

describe('bounded booths', () => {
  const puppets = game('puppet-theatre', 'Puppet Theatre');

  it('never asks a registered bounded booth for more than its best round', () => {
    const missions = trailMissions(registry.all(), () => undefined);
    for (const mission of missions) {
      const match = mission.nextAction.match(/at (.+) to reach (\d+)\.$/);
      if (!match) continue;
      const booth = registry.all().find((g) => g.name === match[1]);
      const max = booth && boothMaxScore(booth.id);
      if (max !== undefined) expect(Number(match[2])).toBeLessThanOrEqual(max);
    }
  });

  it('counts the Puppet Theatre at Best 2 for Midway Master, and asks for 2 at Best 1', () => {
    const one = byId([cannon, puppets], { 'water-cannon': 100, 'puppet-theatre': 1 });
    expect(one['midway-master']).toMatchObject({ progress: 1, target: 2, complete: false });
    expect(one['midway-master'].nextAction).toBe(
      'Score 1 more point at Puppet Theatre to reach 2.',
    );
    const two = byId([cannon, puppets], { 'water-cannon': 100, 'puppet-theatre': 2 });
    expect(two['midway-master'].complete).toBe(true);
  });

  it('never recommends the Puppet Theatre for Crowd Pleaser or Headliner', () => {
    const missions = byId([cannon, puppets, rings], { 'puppet-theatre': 2 });
    for (const id of ['crowd-pleaser', 'headliner']) {
      expect(missions[id].next?.gameId).not.toBe('puppet-theatre');
      expect(missions[id].target).toBe(2);
    }
    const alone = byId([puppets], { 'puppet-theatre': 2 });
    expect(alone['crowd-pleaser']).toMatchObject({ target: 0, complete: false });
  });
});
