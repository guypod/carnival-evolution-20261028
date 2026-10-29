import { describe, expect, it } from 'vitest';
import { createScoreBoard, type CarnivalGame } from './carnival';
import {
  EMPTY_ROOM,
  ROOM_HISTORY_MAX,
  ROOM_KEY,
  ROOM_SLOTS,
  STARTER_DECOR,
  applyRoom,
  createRoomStore,
  describeLook,
  describeRoom,
  describeSlot,
  editorApply,
  editorFor,
  editorReset,
  editorUndo,
  neighbourSlot,
  parseRoom,
  reconcileRoom,
  roomObjects,
  slotAt,
  slotCenter,
  type RoomLayout,
} from './prize-room';

const game = (id: string, name: string): CarnivalGame => ({
  id,
  name,
  description: '',
  start: () => () => {},
});
const games = [game('skee-ball', 'Skee Ball'), game('ring-toss', 'Ring Toss')];

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    items,
  };
}

const ownedIds = (best: Record<string, number>) =>
  new Set(
    roomObjects(games, (id) => best[id])
      .filter((o) => o.owned)
      .map((o) => o.id),
  );

describe('the room collection', () => {
  it('gives a newcomer starter decor and explains every locked prize', () => {
    const objects = roomObjects(games, () => undefined);
    expect(objects.filter((o) => o.owned).map((o) => o.id)).toEqual(STARTER_DECOR.map((o) => o.id));
    const locked = objects.find((o) => o.id === 'skee-ball:bronze')!;
    expect(locked.owned).toBe(false);
    expect(locked.howToEarn).toBe('Score 50 or more in one round of Skee Ball.');
  });

  it('owns a booth prize once its best score reaches the tier', () => {
    const owned = ownedIds({ 'skee-ball': 150, 'ring-toss': 49 });
    expect(owned.has('skee-ball:bronze')).toBe(true);
    expect(owned.has('skee-ball:silver')).toBe(true);
    expect(owned.has('skee-ball:gold')).toBe(false);
    expect(owned.has('ring-toss:bronze')).toBe(false);
  });

  it('gives each booth its own prize objects rather than one shared prize', () => {
    const objects = roomObjects(games, () => 300);
    const sources = objects.filter((o) => o.name === 'Squeaky Rubber Duck').map((o) => o.source);
    expect(sources).toEqual(['Skee Ball, Bronze', 'Ring Toss, Bronze']);
  });
});

describe('arranging the room', () => {
  const owned = ownedIds({ 'skee-ball': 300 });

  it('places owned objects only, and only in real slots', () => {
    let room = applyRoom(
      EMPTY_ROOM,
      { type: 'place', objectId: 'ring-toss:bronze', slot: '0-0' },
      owned,
    );
    expect(room).toBe(EMPTY_ROOM);
    room = applyRoom(EMPTY_ROOM, { type: 'place', objectId: 'skee-ball:gold', slot: '9-9' }, owned);
    expect(room).toBe(EMPTY_ROOM);
    room = applyRoom(EMPTY_ROOM, { type: 'place', objectId: 'skee-ball:gold', slot: '0-0' }, owned);
    expect(room.placements).toEqual([{ objectId: 'skee-ball:gold', slot: '0-0', rotation: 0 }]);
  });

  it('moves with arrow directions, swaps with a neighbour and stops at the edge', () => {
    let room = applyRoom(
      EMPTY_ROOM,
      { type: 'place', objectId: 'skee-ball:gold', slot: '0-0' },
      owned,
    );
    room = applyRoom(room, { type: 'place', objectId: 'starter:fern', slot: '0-1' }, owned);
    expect(
      applyRoom(room, { type: 'move', objectId: 'skee-ball:gold', direction: 'left' }, owned),
    ).toBe(room);
    expect(
      applyRoom(room, { type: 'move', objectId: 'skee-ball:gold', direction: 'up' }, owned),
    ).toBe(room);
    room = applyRoom(room, { type: 'move', objectId: 'skee-ball:gold', direction: 'right' }, owned);
    expect(room.placements).toContainEqual({
      objectId: 'skee-ball:gold',
      slot: '0-1',
      rotation: 0,
    });
    expect(room.placements).toContainEqual({ objectId: 'starter:fern', slot: '0-0', rotation: 0 });
    room = applyRoom(room, { type: 'move', objectId: 'skee-ball:gold', direction: 'down' }, owned);
    room = applyRoom(room, { type: 'move', objectId: 'skee-ball:gold', direction: 'down' }, owned);
    expect(room.placements).toContainEqual({
      objectId: 'skee-ball:gold',
      slot: '2-1',
      rotation: 0,
    });
    expect(
      applyRoom(room, { type: 'move', objectId: 'skee-ball:gold', direction: 'down' }, owned),
    ).toBe(room);
  });

  it('sends an object back to the collection when a new one takes its slot', () => {
    let room = applyRoom(
      EMPTY_ROOM,
      { type: 'place', objectId: 'starter:rug', slot: '2-0' },
      owned,
    );
    room = applyRoom(room, { type: 'place', objectId: 'starter:fern', slot: '2-0' }, owned);
    expect(room.placements).toEqual([{ objectId: 'starter:fern', slot: '2-0', rotation: 0 }]);
  });

  it('turns an object a quarter at a time and removes it', () => {
    let room = applyRoom(
      EMPTY_ROOM,
      { type: 'place', objectId: 'starter:rug', slot: '2-0' },
      owned,
    );
    for (const expected of [90, 180, 270, 0]) {
      room = applyRoom(room, { type: 'rotate', objectId: 'starter:rug' }, owned);
      expect(room.placements[0].rotation).toBe(expected);
    }
    room = applyRoom(room, { type: 'remove', objectId: 'starter:rug' }, owned);
    expect(room.placements).toEqual([]);
  });

  it('changes the backdrop', () => {
    const room = applyRoom(EMPTY_ROOM, { type: 'backdrop', backdrop: 'starry-night' }, owned);
    expect(room.backdrop).toBe('starry-night');
  });

  it('finds neighbouring slots inside the room only', () => {
    expect(neighbourSlot('1-3', 'right')).toBeUndefined();
    expect(neighbourSlot('1-3', 'left')).toBe('1-2');
    expect(neighbourSlot('1-3', 'down')).toBe('2-3');
    expect(neighbourSlot('nope', 'down')).toBeUndefined();
  });

  it('finds the slot under a canvas point', () => {
    for (const slot of ROOM_SLOTS) {
      const { x, y } = slotCenter(slot);
      expect(slotAt(x, y)).toBe(slot);
    }
    expect(slotAt(5, 5)).toBeUndefined();
  });
});

describe('ownership changes', () => {
  it('drops prizes the visitor no longer owns, bad slots and duplicates', () => {
    const layout: RoomLayout = {
      backdrop: 'sunset-pier',
      placements: [
        { objectId: 'skee-ball:gold', slot: '0-0', rotation: 90 },
        { objectId: 'starter:rug', slot: '2-0', rotation: 0 },
        { objectId: 'starter:rug', slot: '2-1', rotation: 0 },
        { objectId: 'starter:fern', slot: '2-0', rotation: 0 },
        { objectId: 'starter:lantern', slot: '7-7', rotation: 0 },
      ],
    };
    const room = reconcileRoom(layout, ownedIds({}));
    expect(room).toEqual({
      backdrop: 'sunset-pier',
      placements: [{ objectId: 'starter:rug', slot: '2-0', rotation: 0 }],
    });
  });

  it('keeps a valid layout as it is', () => {
    const layout: RoomLayout = {
      backdrop: 'striped-tent',
      placements: [{ objectId: 'skee-ball:gold', slot: '0-0', rotation: 90 }],
    };
    expect(reconcileRoom(layout, ownedIds({ 'skee-ball': 300 }))).toBe(layout);
  });
});

describe('undo and reset', () => {
  const owned = ownedIds({ 'skee-ball': 50 });

  it('undoes changes one at a time and ignores no-ops', () => {
    let editor = editorFor(EMPTY_ROOM);
    editor = editorApply(
      editor,
      { type: 'place', objectId: 'skee-ball:bronze', slot: '1-1' },
      owned,
    );
    editor = editorApply(editor, { type: 'place', objectId: 'skee-ball:gold', slot: '1-2' }, owned);
    editor = editorApply(editor, { type: 'rotate', objectId: 'skee-ball:bronze' }, owned);
    expect(editor.history).toHaveLength(2);
    editor = editorUndo(editor);
    expect(editor.current.placements[0].rotation).toBe(0);
    editor = editorUndo(editor);
    expect(editor.current).toBe(EMPTY_ROOM);
    expect(editorUndo(editor)).toBe(editor);
  });

  it('clears the room in one undoable step and caps the history', () => {
    let editor = editorFor(EMPTY_ROOM);
    expect(editorReset(editor)).toBe(editor);
    for (let i = 0; i < ROOM_HISTORY_MAX + 5; i += 1) {
      editor = editorApply(
        editor,
        { type: 'place', objectId: 'starter:rug', slot: ROOM_SLOTS[i % 12].id },
        owned,
      );
    }
    expect(editor.history).toHaveLength(ROOM_HISTORY_MAX);
    const before = editor.current;
    editor = editorReset(editor);
    expect(editor.current).toEqual(EMPTY_ROOM);
    expect(editorUndo(editor).current).toBe(before);
  });
});

describe('saving the room', () => {
  it('reloads a saved layout from its own key and leaves scores alone', () => {
    const storage = memoryStorage();
    createScoreBoard(storage).record('skee-ball', 70);
    const scoreKeys = [...storage.items.keys()];
    const savedScores = [...storage.items.values()];
    const store = createRoomStore(storage);
    const layout: RoomLayout = {
      backdrop: 'starry-night',
      placements: [{ objectId: 'starter:fern', slot: '2-3', rotation: 270 }],
    };
    expect(store.save(layout)).toBe(true);
    expect(scoreKeys).not.toContain(ROOM_KEY);
    expect(scoreKeys.map((key) => storage.getItem(key))).toEqual(savedScores);
    expect(createScoreBoard(storage).best('skee-ball')).toBe(70);
    expect(createRoomStore(storage).load()).toEqual(layout);
  });

  it('ignores broken saves and survives a storage that throws', () => {
    expect(parseRoom('nope')).toBeUndefined();
    expect(parseRoom('{"backdrop":"moon","placements":[]}')).toBeUndefined();
    expect(
      parseRoom(
        '{"backdrop":"striped-tent","placements":[{"objectId":"a","slot":"0-0","rotation":45},null]}',
      ),
    ).toEqual({ backdrop: 'striped-tent', placements: [] });
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
    };
    expect(createRoomStore(throwing).load()).toBeUndefined();
    expect(createRoomStore(throwing).save(EMPTY_ROOM)).toBe(false);
    expect(createRoomStore(undefined).save(EMPTY_ROOM)).toBe(false);
  });
});

describe('inspecting the room in words', () => {
  it('describes each slot and the whole room', () => {
    const objects = roomObjects(games, () => 300);
    const layout: RoomLayout = {
      backdrop: 'sunset-pier',
      placements: [{ objectId: 'ring-toss:gold', slot: '0-1', rotation: 90 }],
    };
    expect(describeSlot(layout, objects, ROOM_SLOTS[1])).toBe(
      'Top shelf, spot 2: Golden Ferris Wheel Trophy (Ring Toss, Gold), turned right.',
    );
    expect(describeSlot(layout, objects, ROOM_SLOTS[8])).toBe('Floor, spot 1: empty.');
    expect(describeRoom(layout)).toBe('Sunset pier backdrop, 1 object placed of 12 spots.');
  });

  it("keeps the walking description in step with every edit at the visitor's spot", () => {
    const owned = ownedIds({});
    const objects = roomObjects(games, () => undefined);
    const spot = ROOM_SLOTS[9];
    const look = (editor: { current: RoomLayout }) =>
      describeLook(editor.current, objects, spot, true);
    expect(describeLook(EMPTY_ROOM, objects, spot, false)).toBe('');

    let editor = editorFor(EMPTY_ROOM);
    expect(look(editor)).toBe('You look at: Floor, spot 2: empty.');
    editor = editorApply(editor, { type: 'place', objectId: 'starter:fern', slot: spot.id }, owned);
    const placed = look(editor);
    expect(placed).toBe('You look at: Floor, spot 2: Potted Fern (Starter decor), facing front.');
    editor = editorApply(editor, { type: 'rotate', objectId: 'starter:fern' }, owned);
    expect(look(editor)).toBe(
      'You look at: Floor, spot 2: Potted Fern (Starter decor), turned right.',
    );
    editor = editorApply(editor, { type: 'remove', objectId: 'starter:fern' }, owned);
    expect(look(editor)).toBe('You look at: Floor, spot 2: empty.');
    editor = editorUndo(editorUndo(editor));
    expect(look(editor)).toBe(placed);
    editor = editorReset(editor);
    expect(look(editor)).toBe('You look at: Floor, spot 2: empty.');
    editor = editorUndo(editor);
    expect(look(editor)).toBe(placed);
  });
});
