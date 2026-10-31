import { describe, expect, it } from 'vitest';
import { boothPrompt } from './booth-prompt';
import { boothInReach, layoutMidway, type MidwayMap } from './midway/world';

const names: Record<string, string> = { 'water-cannon': 'Water Cannon' };
const gameName = (id: string) => names[id];

function mapWithBooth(): MidwayMap {
  return layoutMidway(['water-cannon']);
}

describe('boothPrompt', () => {
  it('names the booth and its keys when the player stands beside it', () => {
    const map = mapWithBooth();
    const booth = map.booths.find((b) => b.gameId === 'water-cannon')!;
    const beside = { x: booth.x + booth.w / 2, y: booth.y + booth.h + 0.5 };
    expect(boothPrompt(boothInReach(map, beside), gameName)).toBe(
      'Press E, Enter or Space to play Water Cannon',
    );
  });

  it('shows nothing when the player is out of reach', () => {
    const map = mapWithBooth();
    const booth = map.booths.find((b) => b.gameId === 'water-cannon')!;
    const far = { x: booth.x + booth.w / 2, y: booth.y + booth.h + 3 };
    expect(boothPrompt(boothInReach(map, far), gameName)).toBeUndefined();
  });

  it('shows nothing for a booth with no game behind it', () => {
    const map = mapWithBooth();
    const closed = map.booths.find((b) => !b.gameId);
    expect(boothPrompt(closed, gameName)).toBeUndefined();
    expect(boothPrompt({ index: 0, x: 0, y: 0, w: 1, h: 1 }, gameName)).toBeUndefined();
  });

  it('shows nothing when the game id is not registered', () => {
    const booth = { index: 0, x: 0, y: 0, w: 1, h: 1, gameId: 'missing' };
    expect(boothPrompt(booth, gameName)).toBeUndefined();
  });

  it('shows nothing once the player has left', () => {
    expect(boothPrompt(undefined, gameName)).toBeUndefined();
  });
});
