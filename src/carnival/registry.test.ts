import { describe, expect, it } from 'vitest';
import { createRegistry, type CarnivalGame } from './registry';

const game = (id: string): CarnivalGame => ({
  id,
  name: id,
  description: `The ${id} game`,
  start: () => () => {},
});

describe('createRegistry', () => {
  it('looks games up by id, in the order they were registered', () => {
    const registry = createRegistry([game('ring-toss'), game('water-cannon')]);
    expect(registry.all().map((g) => g.id)).toEqual(['ring-toss', 'water-cannon']);
    expect(registry.get('water-cannon')?.id).toBe('water-cannon');
    expect(registry.get('missing')).toBeUndefined();
  });

  it('rejects ids that are not kebab-case', () => {
    expect(() => createRegistry([game('Water Cannon')])).toThrow(/kebab-case/);
  });

  it('rejects two games with the same id', () => {
    expect(() => createRegistry([game('ring-toss'), game('ring-toss')])).toThrow(/share the id/);
  });
});
