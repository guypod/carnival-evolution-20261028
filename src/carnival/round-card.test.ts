import { describe, expect, it } from 'vitest';
import { ROUND_CARD, layoutRoundCard } from './round-card';
import { theme } from './theme';

const canvas = theme.canvas;

describe('layoutRoundCard', () => {
  it('centres the panel on the canvas', () => {
    const { panel } = layoutRoundCard({ title: 'Skee Ball', lines: ['Roll'], action: 'Go' });
    expect(panel.x + panel.width / 2).toBe(canvas.width / 2);
    expect(panel.y + panel.height / 2).toBe(canvas.height / 2);
  });

  it('stacks title, lines and action top to bottom inside the panel', () => {
    const layout = layoutRoundCard({
      title: 'Round over',
      lines: ['Score 40', 'Best 60', 'Prize: Bronze'],
      action: 'Press Space',
    });
    const ys = [layout.title.y, ...layout.lines.map((l) => l.y), layout.action!.y];
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
    expect(new Set(ys).size).toBe(ys.length);
    const { panel } = layout;
    expect(layout.title.y - ROUND_CARD.titleHeight / 2).toBe(panel.y + ROUND_CARD.padding);
    expect(layout.action!.y + ROUND_CARD.actionHeight / 2).toBe(
      panel.y + panel.height - ROUND_CARD.padding,
    );
  });

  it('keeps at most four lines', () => {
    const layout = layoutRoundCard({ title: 'T', lines: ['1', '2', '3', '4', '5', '6'] });
    expect(layout.lines.map((l) => l.text)).toEqual(['1', '2', '3', '4']);
  });

  it('grows with each line and shrinks without lines or an action', () => {
    const bare = layoutRoundCard({ title: 'T' });
    const one = layoutRoundCard({ title: 'T', lines: ['a'] });
    const two = layoutRoundCard({ title: 'T', lines: ['a', 'b'] });
    expect(bare.panel.height).toBe(ROUND_CARD.padding * 2 + ROUND_CARD.titleHeight);
    expect(two.panel.height - one.panel.height).toBe(ROUND_CARD.lineHeight);
    expect(bare.lines).toEqual([]);
    expect(bare.action).toBeUndefined();
  });

  it('fits the widest card on the carnival canvas and narrows on a small one', () => {
    const full = layoutRoundCard({ title: 'T', lines: ['1', '2', '3', '4'], action: 'Go' });
    expect(full.panel.x).toBeGreaterThanOrEqual(0);
    expect(full.panel.y).toBeGreaterThanOrEqual(0);
    expect(full.panel.y + full.panel.height).toBeLessThanOrEqual(canvas.height);
    const small = layoutRoundCard({ title: 'T' }, { width: 300, height: 200 });
    expect(small.panel).toMatchObject({ x: 0, width: 300 });
  });
});
