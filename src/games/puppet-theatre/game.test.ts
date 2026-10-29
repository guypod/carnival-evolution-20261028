import { describe, expect, it } from 'vitest';
import {
  CENTRE,
  HOLD_CAPTION,
  PRACTICE_BUTTON,
  REHEARSE_BUTTON,
  UNDO_BUTTON,
  UNDO_HOLD_CAPTION,
  DISCARD_BUTTON,
  RETRY_BUTTON,
  ENDINGS,
  PATIENT_CAPTION,
  REACTIONS,
  react,
  patientAudience,
  finalTableau,
  act,
  buttonAction,
  createStage,
  createTheatre,
  itemAt,
  keyAction,
  parseSavedTheatre,
  parseStage,
  perform,
  recordFinalScore,
  rewinds,
  stageSaveSlot,
  takeFinalScore,
  type Action,
  type Gift,
  type Theatre,
} from './game';

const run = (theatre: Theatre, ...actions: Action[]) => actions.reduce(act, theatre);

const toSceneTwo = (): Theatre =>
  run(
    createTheatre(),
    { type: 'move', id: 'knight', x: 580 },
    { type: 'pose', id: 'knight', pose: 'wave' },
  );

const toSceneThree = (gift: Gift): Theatre =>
  run(toSceneTwo(), { type: 'move', id: gift, x: 620 }, { type: 'drop', id: gift });

const toCentre: Action[] = [
  { type: 'move', id: 'knight', x: CENTRE - 40 },
  { type: 'move', id: 'dragon', x: CENTRE + 40 },
  { type: 'pose', id: 'knight', pose: 'bow' },
];
const bothBow: Action[] = [...toCentre, { type: 'pose', id: 'dragon', pose: 'bow' }];

const toCurtain = (gift: Gift): Theatre => run(toSceneThree(gift), ...bothBow);

describe('scene transitions', () => {
  it('starts in scene 1 with its goal as the caption', () => {
    const { stage } = createTheatre();
    expect(stage.scene).toBe(1);
    expect(stage.caption).toMatch(/Scene 1/);
  });

  it('needs the knight near the dragon, not just a wave, to finish scene 1', () => {
    const far = act(createTheatre(), { type: 'pose', id: 'knight', pose: 'wave' });
    expect(far.stage.scene).toBe(1);
    expect(toSceneTwo().stage.scene).toBe(2);
  });

  it('needs both puppets bowing at centre stage to finish scene 3', () => {
    const offCentre = run(
      toSceneThree('cake'),
      { type: 'pose', id: 'knight', pose: 'bow' },
      { type: 'pose', id: 'dragon', pose: 'bow' },
    );
    expect(offCentre.stage.scene).toBe(3);
    expect(toCurtain('cake').stage.scene).toBe('curtain');
  });

  it('ends two different ways depending on the gift', () => {
    const cake = toCurtain('cake').stage;
    const umbrella = toCurtain('umbrella').stage;
    expect(cake.caption).toBe(ENDINGS.cake);
    expect(umbrella.caption).toBe(ENDINGS.umbrella);
    expect(cake.caption).not.toBe(umbrella.caption);
  });

  it('shows a different, fixed final tableau for each ending', () => {
    const cake = finalTableau(toCurtain('cake').stage);
    const umbrella = finalTableau(toCurtain('umbrella').stage);
    expect(cake?.frosting.length).toBeGreaterThan(0);
    expect(cake?.invertedUmbrella).toBe(false);
    expect(umbrella?.frosting).toEqual([]);
    expect(umbrella?.invertedUmbrella).toBe(true);
    expect(finalTableau(toCurtain('cake').stage)).toEqual(cake);
    expect(finalTableau(toSceneThree('cake').stage)).toBeNull();
  });
});

describe('prop interactions', () => {
  it('keeps props on the shelf outside the gift scene', () => {
    const theatre = act(createTheatre(), { type: 'move', id: 'cake', x: 600 });
    expect(theatre.stage.positions.cake).toBe(createStage().positions.cake);
    expect(theatre.stage.caption).toMatch(/shelf/);
  });

  it('ignores a prop dropped away from the dragon', () => {
    const theatre = act(toSceneTwo(), { type: 'drop', id: 'cake' });
    expect(theatre.stage.scene).toBe(2);
    expect(theatre.stage.gift).toBeNull();
  });

  it('refuses the bell as a gift', () => {
    const theatre = run(
      toSceneTwo(),
      { type: 'move', id: 'bell', x: 620 },
      { type: 'drop', id: 'bell' },
    );
    expect(theatre.stage.scene).toBe(2);
    expect(theatre.stage.caption).toMatch(/no present/);
  });

  it('takes the cake or umbrella dropped at the dragon as the gift', () => {
    expect(toSceneThree('umbrella').stage).toMatchObject({ scene: 3, gift: 'umbrella' });
  });

  it('keeps puppets inside the stage', () => {
    const theatre = act(createTheatre(), { type: 'move', id: 'knight', x: -500 });
    expect(theatre.stage.positions.knight).toBeGreaterThan(0);
  });
});

describe('undo and rehearse', () => {
  it('undoes the last change, including a scene change', () => {
    const theatre = act(toSceneTwo(), { type: 'undo' });
    expect(theatre.stage.scene).toBe(1);
    expect(theatre.stage.poses.knight).toBe('stand');
  });

  it('says so when there is nothing to undo', () => {
    expect(act(createTheatre(), { type: 'undo' }).stage.caption).toMatch(/Nothing to undo/);
  });

  it('does not record drag moves, only the grab that began them', () => {
    const theatre = run(
      createTheatre(),
      { type: 'grab', id: 'knight' },
      { type: 'move', id: 'knight', x: 200, record: false },
      { type: 'move', id: 'knight', x: 260, record: false },
      { type: 'undo' },
    );
    expect(theatre.stage.positions.knight).toBe(createStage().positions.knight);
  });

  it('undoes a whole prop drag, drop and scene change in one step', () => {
    const dragged = run(
      toSceneTwo(),
      { type: 'grab', id: 'cake' },
      { type: 'move', id: 'cake', x: 620, record: false },
      { type: 'drop', id: 'cake', record: false },
    );
    expect(dragged.stage.scene).toBe(3);
    const undone = act(dragged, { type: 'undo' });
    expect(undone.stage.scene).toBe(2);
    expect(undone.stage.positions.cake).toBe(createStage().positions.cake);
  });

  it('counts undo, rehearse and replay as rewinds that end a drag', () => {
    expect(rewinds({ type: 'undo' })).toBe(true);
    expect(rewinds({ type: 'rehearse' })).toBe(true);
    expect(rewinds({ type: 'replay' })).toBe(true);
    expect(rewinds({ type: 'askReset' })).toBe(true);
    expect(rewinds({ type: 'move', id: 'knight', x: 200, record: false })).toBe(false);
  });

  it('rehearse puts the current scene back to how it began, and can be undone', () => {
    const moved = act(toSceneTwo(), { type: 'move', id: 'cake', x: 500 });
    const rehearsed = act(moved, { type: 'rehearse' });
    expect(rehearsed.stage.scene).toBe(2);
    expect(rehearsed.stage.positions.cake).toBe(createStage().positions.cake);
    expect(act(rehearsed, { type: 'undo' }).stage.positions.cake).toBe(500);
  });
});

describe('replay and scoring', () => {
  it('ignores stage actions after the curtain', () => {
    const curtain = toCurtain('cake');
    expect(act(curtain, { type: 'pose', id: 'knight', pose: 'wave' })).toBe(curtain);
  });

  it('replays from scene 1, remembering the endings found', () => {
    const again = act(toCurtain('cake'), { type: 'replay' });
    expect(again.stage.scene).toBe(1);
    expect(again.stage.endingsSeen).toEqual(['cake']);
  });

  it('scores one point per ending found, once per performance', () => {
    const first = toCurtain('cake');
    expect(takeFinalScore(first)).toBe(1);
    expect(takeFinalScore(first)).toBeNull();
    const second = run(
      act(first, { type: 'replay' }),
      { type: 'move', id: 'knight', x: 580 },
      { type: 'pose', id: 'knight', pose: 'wave' },
      { type: 'move', id: 'umbrella', x: 620 },
      { type: 'drop', id: 'umbrella' },
      { type: 'move', id: 'knight', x: CENTRE },
      { type: 'move', id: 'dragon', x: CENTRE },
      { type: 'pose', id: 'knight', pose: 'bow' },
      { type: 'pose', id: 'dragon', pose: 'bow' },
    );
    expect(takeFinalScore(second)).toBe(2);
  });

  it('keeps the score to retry when the write fails', () => {
    const curtain = toCurtain('cake');
    const failing = () => {
      throw new Error('storage full');
    };
    const quiet = console.error;
    console.error = () => {};
    try {
      expect(recordFinalScore(curtain, failing)).toBe(false);
    } finally {
      console.error = quiet;
    }
    const scores: number[] = [];
    expect(recordFinalScore(curtain, (score) => scores.push(score))).toBe(true);
    expect(recordFinalScore(curtain, (score) => scores.push(score))).toBe(true);
    expect(scores).toEqual([1]);
  });

  it('keeps the curtain and the failure shown while a replay retry fails, then records once', () => {
    const quiet = console.error;
    console.error = () => {};
    try {
      const failing = () => {
        throw new Error('storage full');
      };
      const saves: Theatre[] = [];
      const save = (next: Theatre) => saves.push(next);
      let theatre = perform(run(toSceneThree('cake'), ...toCentre), bothBow[3], failing, save);
      expect(theatre.stage.scene).toBe('curtain');
      expect(theatre.scoreFailed).toBe(true);
      expect(buttonAction(theatre.stage, 10, 10, true)).toBeUndefined();

      theatre = perform(theatre, { type: 'replay' }, failing, save);
      expect(theatre.stage.scene).toBe('curtain');
      expect(theatre.scoreFailed).toBe(true);
      expect(theatre.scoreTaken).toBe(false);

      const scores: number[] = [];
      const ok = (score: number) => scores.push(score);
      theatre = perform(theatre, { type: 'replay' }, ok, save);
      expect(scores).toEqual([1]);
      expect(theatre.stage.scene).toBe(1);
      expect(theatre.scoreFailed).toBe(false);
      expect(theatre.stage.endingsSeen).toEqual(['cake']);
    } finally {
      console.error = quiet;
    }
  });

  it('lets the player play on without saving a failed score, never recording it', () => {
    const quiet = console.error;
    console.error = () => {};
    try {
      const scores: number[] = [];
      const failing = () => {
        throw new Error('storage full');
      };
      const curtain = toCurtain('umbrella');
      expect(recordFinalScore(curtain, failing)).toBe(false);
      expect(keyAction(curtain.stage, 'KeyN', true)).toEqual({ type: 'discard' });
      expect(keyAction(curtain.stage, 'KeyN', false)).toBeUndefined();
      expect(buttonAction(curtain.stage, DISCARD_BUTTON.x + 5, DISCARD_BUTTON.y + 5, true)).toEqual(
        { type: 'discard' },
      );
      expect(buttonAction(curtain.stage, RETRY_BUTTON.x + 5, RETRY_BUTTON.y + 5, true)).toEqual({
        type: 'replay',
      });
      const next = perform(
        curtain,
        { type: 'discard' },
        (score) => scores.push(score),
        () => {},
      );
      expect(scores).toEqual([]);
      expect(next.stage.scene).toBe(1);
      expect(next.scoreFailed).toBe(false);
      expect(act(createTheatre(), { type: 'discard' }).stage.scene).toBe(1);
    } finally {
      console.error = quiet;
    }
  });

  it('has no score before the curtain', () => {
    expect(takeFinalScore(toSceneThree('cake'))).toBeNull();
  });
});

describe('controls', () => {
  it('selects with number keys, leaves Tab to the page, and moves and poses with arrows', () => {
    const stage = createStage();
    expect(keyAction(stage, 'Digit2')).toEqual({ type: 'select', id: 'dragon' });
    expect(keyAction(stage, 'Tab')).toBeUndefined();
    expect(keyAction(stage, 'ArrowRight')).toEqual({ type: 'nudge', id: 'knight', dx: 20 });
    expect(keyAction(stage, 'ArrowUp')).toEqual({ type: 'pose', id: 'knight', pose: 'wave' });
    expect(keyAction({ ...stage, selected: 'cake' }, 'Space')).toEqual({
      type: 'drop',
      id: 'cake',
    });
    expect(keyAction(stage, 'KeyZ')).toEqual({ type: 'undo' });
  });

  it('finds puppets and props under the pointer', () => {
    const stage = createStage();
    expect(itemAt(stage, stage.positions.dragon, 300)).toBe('dragon');
    expect(itemAt(stage, stage.positions.bell, 340)).toBe('bell');
    expect(itemAt(stage, 20, 20)).toBeUndefined();
  });

  it('skips the gift the dragon has taken, so it never hides a puppet', () => {
    const stage = toSceneThree('cake').stage;
    expect(itemAt(stage, stage.positions.cake, 340)).toBe('dragon');
  });

  it('replays on any click after the curtain', () => {
    expect(buttonAction(toCurtain('cake').stage, 10, 10)).toEqual({ type: 'replay' });
  });
});

describe('saved stage', () => {
  const memory = () => {
    const data = new Map<string, string>();
    return {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    };
  };

  it('saves and loads a stage under its own key, apart from scores', () => {
    const storage = memory();
    const slot = stageSaveSlot(storage);
    const { stage, sceneStart } = toSceneThree('cake');
    expect(slot.save({ stage, sceneStart })).toBe(true);
    expect(storage.getItem('tessl-carnival:puppet-theatre:stage')).not.toBeNull();
    expect(slot.load()?.stage).toMatchObject({
      scene: 3,
      gift: 'cake',
      positions: stage.positions,
    });
  });

  it('rehearses from the real scene start after a restore', () => {
    const moved = act(toSceneTwo(), { type: 'move', id: 'cake', x: 500 });
    const storage = memory();
    stageSaveSlot(storage).save({ stage: moved.stage, sceneStart: moved.sceneStart });
    const saved = stageSaveSlot(storage).load();
    expect(saved).toBeDefined();
    const restored = createTheatre(saved?.stage, saved?.sceneStart);
    expect(restored.stage.positions.cake).toBe(500);
    const rehearsed = act(restored, { type: 'rehearse' });
    expect(rehearsed.stage.positions.cake).toBe(createStage().positions.cake);
  });

  it('rejects a saved scene start from another scene', () => {
    const stage = JSON.parse(JSON.stringify(toSceneTwo().stage));
    const start = JSON.parse(JSON.stringify(createStage()));
    expect(parseSavedTheatre({ stage, sceneStart: stage })).toBeDefined();
    expect(parseSavedTheatre({ stage, sceneStart: start })).toBeUndefined();
    expect(parseSavedTheatre(stage)).toBeUndefined();
  });

  it('rejects malformed saves', () => {
    const good = JSON.parse(JSON.stringify(createStage()));
    expect(parseStage(good)).toBeDefined();
    expect(parseStage(null)).toBeUndefined();
    expect(parseStage({ ...good, scene: 7 })).toBeUndefined();
    expect(parseStage({ ...good, poses: { knight: 'fly', dragon: 'stand' } })).toBeUndefined();
    expect(parseStage({ ...good, positions: { ...good.positions, cake: 'x' } })).toBeUndefined();
    expect(parseStage({ ...good, scene: 3, gift: null })).toBeUndefined();
    expect(parseStage({ ...good, gift: 'bell' })).toBeUndefined();
    expect(parseStage({ ...good, endingsSeen: ['crown'] })).toBeUndefined();
    expect(parseStage({ ...good, selected: 'ghost' })).toBeUndefined();
  });

  it('clamps saved positions onto the stage and rebuilds the caption', () => {
    const good = JSON.parse(JSON.stringify(createStage()));
    const stage = parseStage({
      ...good,
      caption: 'anything',
      positions: { ...good.positions, knight: 99999 },
    });
    expect(stage?.positions.knight).toBeLessThan(800);
    expect(stage?.caption).toMatch(/Scene 1/);
  });
});

describe('restored curtain', () => {
  it('does not score a restored finished performance again', () => {
    const theatre = createTheatre({ ...createStage(), scene: 'curtain' });
    const scores: number[] = [];
    recordFinalScore(theatre, (score) => scores.push(score));
    expect(scores).toEqual([]);
  });
});

describe('audience', () => {
  it('waits patiently however long the player takes', () => {
    const theatre = run(
      createTheatre(),
      { type: 'move', id: 'knight', x: 200 },
      { type: 'pose', id: 'knight', pose: 'bow' },
      { type: 'move', id: 'knight', x: 300 },
    );
    expect(theatre.stage.audience.mood).toBe('patient');
    expect(theatre.stage.audience.caption).toBe(PATIENT_CAPTION);
  });

  it('reacts differently to a reunion, a gift handoff and a comic fall', () => {
    const reunion = toSceneTwo().stage.audience;
    expect(reunion.mood).toBe('surprised');
    expect(reunion.caption).toBe(REACTIONS.reunion.caption);
    const handoff = toSceneThree('cake').stage.audience;
    expect(handoff.mood).toBe('amused');
    expect(handoff.caption).toBe(REACTIONS.handoff.caption);
    const fall = act(createTheatre(), { type: 'pose', id: 'dragon', pose: 'hide' }).stage.audience;
    expect(fall.mood).toBe('amused');
    expect(fall.caption).toBe(REACTIONS.fall.caption);
    expect(new Set([reunion.caption, handoff.caption, fall.caption]).size).toBe(3);
  });

  it('does not react to a refused gift or a prop dropped away from the dragon', () => {
    const bell = run(
      toSceneTwo(),
      { type: 'move', id: 'bell', x: 620 },
      { type: 'drop', id: 'bell' },
    );
    expect(bell.stage.audience).toEqual(toSceneTwo().stage.audience);
    const missed = run(
      toSceneTwo(),
      { type: 'move', id: 'cake', x: 300 },
      { type: 'drop', id: 'cake' },
    );
    expect(missed.stage.audience).toEqual(toSceneTwo().stage.audience);
  });

  it('reacts to each event once per performance', () => {
    const twice = run(
      createTheatre(),
      { type: 'pose', id: 'knight', pose: 'hide' },
      { type: 'move', id: 'knight', x: 580 },
      { type: 'pose', id: 'knight', pose: 'wave' },
      { type: 'pose', id: 'dragon', pose: 'hide' },
    );
    expect(twice.stage.audience.caption).toBe(REACTIONS.reunion.caption);
    expect(twice.stage.audience.reacted).toEqual(['fall', 'reunion']);
    expect(react(twice.stage.audience, 'fall')).toBe(twice.stage.audience);
    expect(react(patientAudience(), null)).toEqual(patientAudience());
  });

  it('forgets a reaction when undo takes back the event that earned it', () => {
    const undone = act(toSceneTwo(), { type: 'undo' });
    expect(undone.stage.audience.mood).toBe('patient');
  });

  it('starts each new performance patient', () => {
    const replayed = act(toCurtain('umbrella'), { type: 'replay' });
    expect(replayed.stage.audience).toEqual(patientAudience());
  });

  it('restores the audience from a save, and accepts saves from before it existed', () => {
    const { stage } = toSceneThree('cake');
    const saved = JSON.parse(JSON.stringify(stage));
    expect(parseStage(saved)?.audience).toEqual(stage.audience);
    const older = { ...saved };
    delete older.audience;
    expect(parseStage(older)?.audience).toEqual(patientAudience());
    expect(parseStage({ ...saved, audience: { reacted: ['boo'] } })).toBeUndefined();
  });
});

describe('rehearsal curtain and scene reset', () => {
  const toMeeting = (theatre: Theatre) =>
    act(act(theatre, { type: 'move', id: 'knight', x: 600 }), {
      type: 'pose',
      id: 'knight',
      pose: 'wave',
    });

  it('practises without the audience reacting or the scene ending', () => {
    const practising = act(createTheatre(), { type: 'practice' });
    expect(practising.live).not.toBeNull();
    const tried = toMeeting(practising);
    expect(tried.stage.scene).toBe(1);
    expect(tried.stage.audience).toEqual(patientAudience());
    expect(tried.stage.caption).toBe(HOLD_CAPTION);
    const hidden = act(practising, { type: 'pose', id: 'dragon', pose: 'hide' });
    expect(hidden.stage.poses.dragon).toBe('hide');
    expect(hidden.stage.audience.reacted).toEqual([]);
  });

  it('going live puts the live performance back exactly as it was', () => {
    const live = act(createTheatre(), { type: 'move', id: 'knight', x: 300 });
    const practised = act(act(live, { type: 'practice' }), {
      type: 'move',
      id: 'knight',
      x: 500,
    });
    expect(practised.stage.positions.knight).toBe(500);
    const back = act(practised, { type: 'practice' });
    expect(back.live).toBeNull();
    expect(back.stage).toEqual(live.stage);
    expect(back.history).toEqual(live.history);
    expect(toMeeting(back).stage.scene).toBe(2);
  });

  it('resets only after confirmation, and cancel keeps the scene', () => {
    const moved = act(createTheatre(), { type: 'move', id: 'knight', x: 300 });
    const asking = act(moved, { type: 'askReset' });
    expect(asking.confirmReset).toBe(true);
    expect(asking.stage.positions.knight).toBe(300);
    const cancelled = act(asking, { type: 'cancel' });
    expect(cancelled.confirmReset).toBe(false);
    expect(cancelled.stage.positions.knight).toBe(300);
    const reset = act(asking, { type: 'rehearse' });
    expect(reset.confirmReset).toBe(false);
    expect(reset.stage.positions.knight).toBe(createStage().positions.knight);
  });

  it('a reset keeps the endings found', () => {
    const stage = {
      ...createStage(['cake']),
      positions: { ...createStage().positions, knight: 300 },
    };
    const reset = act(act(createTheatre(stage, createStage(['cake'])), { type: 'askReset' }), {
      type: 'rehearse',
    });
    expect(reset.stage.endingsSeen).toEqual(['cake']);
  });

  it('resets the rehearsal scene without touching the live one', () => {
    const live = act(createTheatre(), { type: 'move', id: 'knight', x: 300 });
    const practised = act(act(live, { type: 'practice' }), { type: 'move', id: 'knight', x: 500 });
    const reset = act(act(practised, { type: 'askReset' }), { type: 'rehearse' });
    expect(reset.stage.positions.knight).toBe(createStage().positions.knight);
    expect(act(reset, { type: 'practice' }).stage.positions.knight).toBe(300);
  });

  it('maps keys: P switches, R asks, Enter or Y confirms, N cancels', () => {
    const stage = createStage();
    expect(keyAction(stage, 'KeyP')).toEqual({ type: 'practice' });
    expect(keyAction(stage, 'KeyR')).toEqual({ type: 'askReset' });
    expect(keyAction(stage, 'Enter', false, true)).toEqual({ type: 'rehearse' });
    expect(keyAction(stage, 'KeyY', false, true)).toEqual({ type: 'rehearse' });
    expect(keyAction(stage, 'KeyN', false, true)).toEqual({ type: 'cancel' });
    expect(keyAction(stage, 'ArrowLeft', false, true)).toBeUndefined();
    expect(keyAction(stage, 'Escape')).toBeUndefined();
  });

  it('the switch and reset buttons map to their actions', () => {
    const stage = createStage();
    const at = (b: { x: number; y: number }) => buttonAction(stage, b.x + 5, b.y + 5);
    expect(at(PRACTICE_BUTTON)).toEqual({ type: 'practice' });
    expect(at(REHEARSE_BUTTON)).toEqual({ type: 'askReset' });
  });

  it('ignores drag events while the reset question is open', () => {
    const holding = act(toSceneTwo(), { type: 'move', id: 'cake', x: 620, record: false });
    const asking = act(holding, { type: 'askReset' });
    const released = run(
      asking,
      { type: 'move', id: 'cake', x: 630, record: false },
      { type: 'drop', id: 'cake', record: false },
      { type: 'practice' },
    );
    expect(released).toBe(asking);
    expect(released.confirmReset).toBe(true);
    expect(released.stage.scene).toBe(2);
    expect(act(released, { type: 'rehearse' }).stage.positions.cake).toBe(
      createStage().positions.cake,
    );
  });

  it('confirms or cancels the reset with the pointer', () => {
    const stage = createStage();
    const at = (b: { x: number; y: number }) => buttonAction(stage, b.x + 5, b.y + 5, false, true);
    expect(at(REHEARSE_BUTTON)).toEqual({ type: 'rehearse' });
    expect(at(UNDO_BUTTON)).toEqual({ type: 'cancel' });
    expect(at(PRACTICE_BUTTON)).toBeUndefined();
  });

  it('rehearsal undo stops at the scene start and keeps the earlier history', () => {
    const live = toSceneTwo();
    const practising = act(live, { type: 'practice' });
    const held = act(act(practising, { type: 'undo' }), { type: 'undo' });
    expect(held.stage.scene).toBe(2);
    expect(held.stage.caption).toBe(UNDO_HOLD_CAPTION);
    expect(held.history).toEqual(live.history);
    const moved = act(practising, { type: 'move', id: 'cake', x: 500 });
    expect(act(moved, { type: 'undo' }).stage.positions.cake).toBe(createStage().positions.cake);
  });

  it('keyboard play in live mode still ends a scene with an audience reaction', () => {
    let theatre = createTheatre();
    for (let i = 0; i < 23; i++) theatre = act(theatre, keyAction(theatre.stage, 'ArrowRight')!);
    theatre = act(theatre, keyAction(theatre.stage, 'ArrowUp')!);
    expect(theatre.stage.scene).toBe(2);
    expect(theatre.stage.audience.reacted).toEqual(['reunion']);
  });
});
