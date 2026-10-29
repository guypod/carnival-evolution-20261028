import { describe, expect, it } from 'vitest';
import {
  connectLanterns,
  createLightGarden,
  createLightGardenStore,
  cellAt,
  describeDesign,
  editAt,
  GARDEN_COLUMNS,
  GARDEN_ROWS,
  gardenPatch,
  LIGHT_GARDEN_KEY,
  MAX_LANTERNS,
  parseDesign,
  placeLantern,
  resetGarden,
  saveNote,
  starterDesign,
  undo,
} from './light-garden';
import { archSilhouette, boothBounds, propBounds } from './render';
import { trailLandmarks } from './discovery';
import { canStand, layoutMidway, toScreen, toTile, type Point } from './world';
import { VIEW_SCALES } from './view';
import { registry } from '../games';

const empty = () => createLightGarden({ lanterns: [], garlands: [] });

describe('light garden', () => {
  it('starts from a starter design that obeys its own rules', () => {
    expect(parseDesign(starterDesign())).toEqual(starterDesign());
  });

  it('keeps lanterns inside the garden and off each other', () => {
    let g = empty();
    expect(placeLantern(g, -1, 0, 'warm').result).toBe('out-of-bounds');
    expect(placeLantern(g, GARDEN_COLUMNS, 0, 'warm').result).toBe('out-of-bounds');
    expect(placeLantern(g, 0.5, 0, 'warm').result).toBe('out-of-bounds');
    g = placeLantern(g, 0, 0, 'cool').garden;
    expect(placeLantern(g, 0, 0, 'warm').result).toBe('taken');
  });

  it('stops at the lantern limit', () => {
    let g = empty();
    for (let i = 0; i < MAX_LANTERNS; i++)
      g = placeLantern(g, i % GARDEN_COLUMNS, Math.floor(i / GARDEN_COLUMNS), 'warm').garden;
    expect(placeLantern(g, 3, 2, 'warm').result).toBe('full');
  });

  it('strings garlands only between two different lanterns, once', () => {
    let g = empty();
    g = placeLantern(g, 0, 0, 'warm').garden;
    g = placeLantern(g, 2, 1, 'cool').garden;
    expect(connectLanterns(g, 0, 0).result).toBe('same');
    expect(connectLanterns(g, 0, 5).result).toBe('missing');
    g = connectLanterns(g, 0, 1).garden;
    expect(connectLanterns(g, 1, 0).result).toBe('already');
    expect(g.design.garlands).toEqual([[0, 1]]);
  });

  it('undoes step by step, and undoes a reset', () => {
    let g = empty();
    g = placeLantern(g, 0, 0, 'warm').garden;
    g = placeLantern(g, 1, 0, 'warm').garden;
    g = undo(g);
    expect(g.design.lanterns).toHaveLength(1);
    g = resetGarden(g);
    expect(g.design).toEqual(starterDesign());
    g = undo(g);
    expect(g.design.lanterns).toEqual([{ col: 0, row: 0, color: 'warm' }]);
    expect(undo(undo(g)).design.lanterns).toEqual([]);
  });

  it('describes the arrangement in words', () => {
    expect(describeDesign(starterDesign())).toContain('lantern 2: cool at column 3, row 1');
    expect(describeDesign(starterDesign())).toContain('Garlands join 1 and 2, 2 and 3.');
  });
});

describe('picking cells, from a click or the keyboard', () => {
  it('hangs a lantern on an empty cell and picks it', () => {
    const next = editAt(empty(), undefined, 1, 2, 'cool');
    expect(next.result).toBe('placed');
    expect(next.selected).toBe(0);
    expect(next.garden.design.lanterns).toEqual([{ col: 1, row: 2, color: 'cool' }]);
  });

  it('strings a garland from the picked lantern to the next one picked', () => {
    let g = placeLantern(placeLantern(empty(), 0, 0, 'warm').garden, 3, 2, 'cool').garden;
    const first = editAt(g, undefined, 0, 0, 'warm');
    expect(first.result).toBe('selected');
    expect(first.garden).toBe(g);
    const second = editAt(first.garden, first.selected, 3, 2, 'warm');
    expect(second.result).toBe('connected');
    expect(second.selected).toBe(1);
    g = second.garden;
    expect(g.design.garlands).toEqual([[0, 1]]);
    expect(undo(g).design.garlands).toEqual([]);
  });

  it('lets go of a lantern picked twice, and changes nothing', () => {
    const g = placeLantern(empty(), 2, 1, 'warm').garden;
    const next = editAt(g, 0, 2, 1, 'warm');
    expect(next).toEqual({ garden: g, selected: undefined, result: 'deselected' });
  });

  it('refuses a new lantern once the garden is full, keeping the pick', () => {
    let g = empty();
    for (let i = 0; i < MAX_LANTERNS; i++)
      g = placeLantern(g, i % GARDEN_COLUMNS, Math.floor(i / GARDEN_COLUMNS), 'warm').garden;
    const next = editAt(g, 2, 3, 2, 'warm');
    expect(next.result).toBe('full');
    expect(next.selected).toBe(2);
    expect(next.garden).toBe(g);
  });
});

describe('where the garden lies on the midway', () => {
  const map = layoutMidway(registry.all().map((g) => g.id));
  const patch = gardenPatch(map);
  const boxes = [
    ...map.booths.map((b) => ({ name: `booth ${b.index}`, box: boothBounds(b) })),
    ...map.props.map((p) => ({ name: p.kind, box: propBounds(p) })),
  ];
  const cells = Array.from({ length: GARDEN_COLUMNS * GARDEN_ROWS }, (_, i) => ({
    col: i % GARDEN_COLUMNS,
    row: Math.floor(i / GARDEN_COLUMNS),
  }));
  // The points the renderer draws for a lantern: its glow on the ground and its
  // dot hung 10 pixels above it.
  const drawn = (col: number, row: number) => {
    const ground = toScreen(patch.x + col + 0.5, patch.y + row + 0.5);
    return [ground, { x: ground.x, y: ground.y - 10 }];
  };

  it('keeps every lantern outside the carousel, the booths and every prop', () => {
    for (const { col, row } of cells) {
      for (const point of drawn(col, row)) {
        const over = boxes.filter(
          ({ box }) =>
            point.x >= box.left &&
            point.x <= box.right &&
            point.y >= box.top &&
            point.y <= box.bottom,
        );
        expect(
          over.map((o) => o.name),
          `column ${col + 1}, row ${row + 1}`,
        ).toEqual([]);
      }
    }
  });

  // Everything the renderer can paint for the garden, in world pixels: each
  // lantern's ground glow, the full 30 by 15 ellipse drawLightGarden fills,
  // its dot 10 pixels up with a margin wider than its selection ring, and
  // points along a garland between every pair of cells, since any two
  // lanterns can be joined.
  const RING = 8;
  const painted = (p: ReturnType<typeof gardenPatch>) => {
    const points: { at: Point; what: string }[] = [];
    const centre = (c: { col: number; row: number }) =>
      toScreen(p.x + c.col + 0.5, p.y + c.row + 0.5);
    for (const cell of cells) {
      const c = centre(cell);
      const what = `lantern at column ${cell.col + 1}, row ${cell.row + 1}`;
      points.push({ at: c, what });
      for (let a = 0; a < 32; a++) {
        const turn = (a / 32) * Math.PI * 2;
        points.push({
          at: { x: c.x + 30 * Math.cos(turn), y: c.y + 15 * Math.sin(turn) },
          what: `glow at column ${cell.col + 1}, row ${cell.row + 1}`,
        });
      }
      for (const [dx, dy] of [
        [0, 0],
        [RING, 0],
        [-RING, 0],
        [0, RING],
        [0, -RING],
      ])
        points.push({ at: { x: c.x + dx, y: c.y - 10 + dy }, what });
    }
    for (const a of cells) {
      for (const b of cells) {
        const from = centre(a);
        const to = centre(b);
        for (let s = 0; s <= 1; s += 0.125) {
          points.push({
            at: { x: from.x + (to.x - from.x) * s, y: from.y + (to.y - from.y) * s - 10 },
            what: `garland from column ${a.col + 1}, row ${a.row + 1} to column ${b.col + 1}, row ${b.row + 1}`,
          });
        }
      }
    }
    return points;
  };
  const inside = (point: Point, shape: readonly Point[]) => {
    let hit = false;
    for (let i = 0, j = shape.length - 1; i < shape.length; j = i++) {
      const a = shape[i];
      const b = shape[j];
      if (
        a.y > point.y !== b.y > point.y &&
        point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
      )
        hit = !hit;
    }
    return hit;
  };

  it('keeps every cell and every possible garland clear of the entrance arch on screen', () => {
    // Zoom scales the whole world uniformly, so clear in world pixels is clear
    // at every step in VIEW_SCALES; this checks each step's scaled geometry too.
    for (const scale of VIEW_SCALES) {
      const zoomed = (q: Point) => ({ x: q.x * scale, y: q.y * scale });
      const arch = archSilhouette(map).map((shape) => shape.map(zoomed));
      const hidden = painted(patch)
        .filter(({ at }) => arch.some((shape) => inside(zoomed(at), shape)))
        .map(({ what }) => what);
      expect([...new Set(hidden)], `zoom ${scale}`).toEqual([]);
    }
  });

  it('would catch the arch hiding the old patch, so the check is real', () => {
    const before = map.height - 5;
    const old = { x: map.avenueX - 2, y: before - 6, w: GARDEN_COLUMNS, h: GARDEN_ROWS };
    const arch = archSilhouette({ ...map, height: before });
    const hidden = painted(old).filter(({ at }) => arch.some((shape) => inside(at, shape)));
    expect(hidden.map((h) => h.what)).toContain('lantern at column 1, row 2');
  });

  it('keeps every lantern and garland clear of the arch, booths and props, however many games there are', () => {
    for (const count of [0, 4, 9, 12, 20]) {
      const ids = Array.from({ length: count }, (_, i) => `game-${i}`);
      const grown = layoutMidway(ids);
      const where = gardenPatch(grown);
      const arch = archSilhouette(grown);
      const shapes = [
        ...grown.booths.map((b) => ({ name: `booth ${b.index}`, box: boothBounds(b) })),
        ...grown.props.map((p) => ({ name: p.kind, box: propBounds(p) })),
      ];
      const over = new Set<string>();
      for (const { at, what } of painted(where)) {
        if (arch.some((shape) => inside(at, shape))) over.add(`arch over ${what}`);
        for (const { name, box } of shapes) {
          if (at.x >= box.left && at.x <= box.right && at.y >= box.top && at.y <= box.bottom)
            over.add(`${name} over ${what}`);
        }
      }
      expect([...over], `${count} games`).toEqual([]);
    }
  });

  it('lies on open ground that is walked over, never blocked or a landmark', () => {
    const landmarks = trailLandmarks(map);
    for (const { col, row } of cells) {
      const x = patch.x + col + 0.5;
      const y = patch.y + row + 0.5;
      expect(canStand(map, x, y)).toBe(true);
      for (const l of landmarks) {
        const inside =
          x >= l.area.x && x < l.area.x + l.area.w && y >= l.area.y && y < l.area.y + l.area.h;
        expect(inside, `${l.name} at column ${col + 1}, row ${row + 1}`).toBe(false);
      }
    }
  });

  it('keeps the player spawn off the garden', () => {
    expect(cellAt(patch, map.spawn)).toBeUndefined();
  });

  it('turns a click on a drawn cell back into that cell', () => {
    for (const { col, row } of cells) {
      const [ground] = drawn(col, row);
      expect(cellAt(patch, toTile(ground.x, ground.y))).toEqual({ col, row });
    }
    const outside = toScreen(patch.x - 0.5, patch.y + 0.5);
    expect(cellAt(patch, toTile(outside.x, outside.y))).toBeUndefined();
  });
});

describe('light garden store', () => {
  const memory = () => {
    const data = new Map<string, string>();
    return {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      data,
    };
  };

  it('saves and loads a design under its own key only', () => {
    const storage = memory();
    const store = createLightGardenStore(storage);
    const design = placeLantern(empty(), 3, 2, 'cool').garden.design;
    expect(store.save(design)).toBe(true);
    expect([...storage.data.keys()]).toEqual([LIGHT_GARDEN_KEY]);
    expect(store.load()).toEqual(design);
  });

  it('falls back to the starter on missing, broken or out-of-bounds saves', () => {
    expect(createLightGardenStore(undefined).load()).toEqual(starterDesign());
    const storage = memory();
    storage.setItem(LIGHT_GARDEN_KEY, '{not json');
    expect(createLightGardenStore(storage).load()).toEqual(starterDesign());
    storage.setItem(
      LIGHT_GARDEN_KEY,
      JSON.stringify({ lanterns: [{ col: 99, row: 0, color: 'warm' }], garlands: [] }),
    );
    expect(createLightGardenStore(storage).load()).toEqual(starterDesign());
  });

  it('reports a failed save, and the note says so', () => {
    const full = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(createLightGardenStore(full).save(starterDesign())).toBe(false);
    expect(createLightGardenStore(undefined).save(starterDesign())).toBe(false);
    expect(saveNote(false)).toMatch(/^Not saved/);
    expect(saveNote(true)).toBe('Saved in this browser.');
  });
});
