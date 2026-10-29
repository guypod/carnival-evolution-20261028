import {
  browserSaveStorage,
  canvasFont,
  createSaveSlot,
  recordScore,
  theme,
  type CarnivalGame,
  type SaveStorage,
} from '../../carnival';

const { width: WIDTH, height: HEIGHT } = theme.canvas;

export const FLOOR_Y = 360;
export const STAGE_LEFT = 60;
export const STAGE_RIGHT = WIDTH - 60;
/** How close two things must be to meet, take a gift or stand together. */
export const NEAR = 90;
/** The centre of the stage, where the finale bow happens. */
export const CENTRE = WIDTH / 2;
const UNDO_LIMIT = 50;

export type ActorId = 'knight' | 'dragon';
export type PropId = 'cake' | 'umbrella' | 'bell';
export type ItemId = ActorId | PropId;
export type Pose = 'stand' | 'wave' | 'bow' | 'hide';
export type Gift = 'cake' | 'umbrella';
export type Scene = 1 | 2 | 3 | 'curtain';

export const ACTORS: readonly ActorId[] = ['knight', 'dragon'];
export const PROPS: readonly PropId[] = ['cake', 'umbrella', 'bell'];
export const ITEMS: readonly ItemId[] = [...ACTORS, ...PROPS];
export const POSES: readonly Pose[] = ['stand', 'wave', 'bow', 'hide'];

export const SCENE_GOALS: Record<Exclude<Scene, 'curtain'>, string> = {
  1: 'Scene 1, The Meeting: walk the knight up to the dragon and have the knight wave.',
  2: 'Scene 2, The Gift: drop a present at the dragon. Something it can use.',
  3: 'Scene 3, The Finale: bring both puppets to centre stage and bow together.',
};

export const ENDINGS: Record<Gift, string> = {
  cake: 'The dragon gobbles the cake, sneezes sprinkles, and the knight is frosted head to toe.',
  umbrella:
    'The dragon opens the umbrella, a fiery sneeze turns it inside out, and it rains confetti.',
};

export interface StageState {
  scene: Scene;
  positions: Record<ItemId, number>;
  poses: Record<ActorId, Pose>;
  gift: Gift | null;
  selected: ItemId;
  caption: string;
  /** Endings this player has performed, kept between visits. */
  endingsSeen: Gift[];
}

export interface Theatre {
  stage: StageState;
  /** Earlier stages with their scene starts, newest last, for undo. */
  history: { stage: StageState; sceneStart: StageState }[];
  /** The stage as each scene began, for rehearsing a scene again. */
  sceneStart: StageState;
  /** True once the finished performance's score has been handed out. */
  scoreTaken: boolean;
}

export type Action =
  | { type: 'select'; id: ItemId }
  | { type: 'move'; id: ItemId; x: number; record?: boolean }
  | { type: 'nudge'; id: ItemId; dx: number }
  | { type: 'pose'; id: ActorId; pose: Pose }
  | { type: 'drop'; id: PropId; record?: boolean }
  | { type: 'grab'; id: ItemId }
  | { type: 'undo' }
  | { type: 'rehearse' }
  | { type: 'replay' };

const isActor = (id: ItemId): id is ActorId => (ACTORS as readonly string[]).includes(id);
const isProp = (id: ItemId): id is PropId => (PROPS as readonly string[]).includes(id);

function cloneStage(stage: StageState): StageState {
  return {
    ...stage,
    positions: { ...stage.positions },
    poses: { ...stage.poses },
    endingsSeen: [...stage.endingsSeen],
  };
}

/** The opening stage: knight on the left, dragon on the right, props on the shelf. */
export function createStage(endingsSeen: Gift[] = []): StageState {
  return {
    scene: 1,
    positions: { knight: 140, dragon: 640, cake: 260, umbrella: 340, bell: 420 },
    poses: { knight: 'stand', dragon: 'stand' },
    gift: null,
    selected: 'knight',
    caption: SCENE_GOALS[1],
    endingsSeen: [...endingsSeen],
  };
}

export function createTheatre(
  stage: StageState = createStage(),
  sceneStart: StageState = stage,
): Theatre {
  return {
    stage: cloneStage(stage),
    history: [],
    sceneStart: cloneStage(sceneStart),
    // A restored finished performance was scored before it was saved.
    scoreTaken: stage.scene === 'curtain',
  };
}

export const clampX = (x: number) => Math.min(STAGE_RIGHT, Math.max(STAGE_LEFT, x));

const near = (stage: StageState, a: ItemId, b: ItemId) =>
  Math.abs(stage.positions[a] - stage.positions[b]) <= NEAR;

/** Moves the stage on to the next scene when the current scene's goal is met. */
export function checkScene(stage: StageState): StageState {
  if (stage.scene === 1 && near(stage, 'knight', 'dragon') && stage.poses.knight === 'wave') {
    return { ...stage, scene: 2, caption: `The dragon waves back! ${SCENE_GOALS[2]}` };
  }
  if (
    stage.scene === 3 &&
    stage.gift &&
    stage.poses.knight === 'bow' &&
    stage.poses.dragon === 'bow' &&
    Math.abs(stage.positions.knight - CENTRE) <= NEAR &&
    Math.abs(stage.positions.dragon - CENTRE) <= NEAR
  ) {
    const endingsSeen = stage.endingsSeen.includes(stage.gift)
      ? stage.endingsSeen
      : [...stage.endingsSeen, stage.gift];
    return { ...stage, scene: 'curtain', caption: ENDINGS[stage.gift], endingsSeen };
  }
  return stage;
}

/** Drops a prop where it stands. In scene 2, a useful prop dropped at the dragon is the gift. */
export function dropProp(stage: StageState, id: PropId): StageState {
  if (stage.scene !== 2) {
    return { ...stage, caption: 'The props wait on the shelf until the gift scene.' };
  }
  if (!near(stage, id, 'dragon')) {
    return { ...stage, caption: `The ${id} lands on the boards. Drop it at the dragon.` };
  }
  if (id === 'bell') {
    return { ...stage, caption: 'Ding! The dragon covers its ears. That is no present.' };
  }
  return { ...stage, scene: 3, gift: id, caption: `The dragon hugs the ${id}. ${SCENE_GOALS[3]}` };
}

function apply(stage: StageState, action: Action): StageState {
  const next = cloneStage(stage);
  switch (action.type) {
    case 'select':
    case 'grab':
      next.selected = action.id;
      return next;
    case 'move':
    case 'nudge': {
      const x = action.type === 'move' ? action.x : stage.positions[action.id] + action.dx;
      if (isProp(action.id) && stage.scene !== 2) {
        next.caption = 'The props wait on the shelf until the gift scene.';
        return next;
      }
      next.selected = action.id;
      next.positions[action.id] = clampX(x);
      return checkScene(next);
    }
    case 'pose':
      next.selected = action.id;
      next.poses[action.id] = action.pose;
      return checkScene(next);
    case 'drop':
      return dropProp(next, action.id);
    default:
      return next;
  }
}

/** Applies one action to the theatre. Undo, rehearse and replay rewind; the rest change the stage. */
export function act(theatre: Theatre, action: Action): Theatre {
  const { stage } = theatre;
  if (action.type === 'undo') {
    const previous = theatre.history.at(-1);
    if (!previous) return { ...theatre, stage: { ...stage, caption: 'Nothing to undo.' } };
    return { ...theatre, ...previous, history: theatre.history.slice(0, -1) };
  }
  if (action.type === 'rehearse') {
    if (stage.scene === 'curtain') return theatre;
    return {
      ...theatre,
      history: [...theatre.history, { stage, sceneStart: theatre.sceneStart }].slice(-UNDO_LIMIT),
      stage: { ...cloneStage(theatre.sceneStart), endingsSeen: [...stage.endingsSeen] },
    };
  }
  if (action.type === 'replay') {
    if (stage.scene !== 'curtain') return theatre;
    return createTheatre(createStage(stage.endingsSeen));
  }
  if (stage.scene === 'curtain') return theatre;
  const next = apply(stage, action);
  const record =
    action.type === 'move' || action.type === 'drop'
      ? action.record !== false
      : action.type !== 'select';
  return {
    ...theatre,
    stage: next,
    history: record
      ? [...theatre.history, { stage, sceneStart: theatre.sceneStart }].slice(-UNDO_LIMIT)
      : theatre.history,
    sceneStart: next.scene !== stage.scene ? cloneStage(next) : theatre.sceneStart,
  };
}

/** True for the actions that rewind the stage, which end any drag in progress. */
export const rewinds = (action: Action) =>
  action.type === 'undo' || action.type === 'rehearse' || action.type === 'replay';

/** The performance's score once the curtain falls: one point per ending seen so far. */
export function takeFinalScore(theatre: Theatre): number | null {
  if (theatre.stage.scene !== 'curtain' || theatre.scoreTaken) return null;
  theatre.scoreTaken = true;
  return theatre.stage.endingsSeen.length;
}

/**
 * Hands a finished performance's score to `record`. When the write fails, the
 * score stays untaken so the next action tries again.
 */
export function recordFinalScore(theatre: Theatre, record: (score: number) => void): boolean {
  const score = takeFinalScore(theatre);
  if (score === null) return true;
  try {
    record(score);
    return true;
  } catch (error) {
    theatre.scoreTaken = false;
    console.error('Puppet Theatre could not save the score', error);
    return false;
  }
}

/** What the save slot keeps: the stage, and the stage as its scene began. */
export interface SavedTheatre {
  stage: StageState;
  sceneStart: StageState;
}

/** Turns a saved value back into a stage and its scene start, or undefined when either is off. */
export function parseSavedTheatre(value: unknown): SavedTheatre | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const v = value as Record<string, unknown>;
  const stage = parseStage(v.stage);
  const sceneStart = parseStage(v.sceneStart);
  if (!stage || !sceneStart || sceneStart.scene !== stage.scene) return undefined;
  if (sceneStart.gift !== stage.gift) return undefined;
  return { stage, sceneStart };
}

/** Turns a saved value back into a stage, or undefined when anything about it is off. */
export function parseStage(value: unknown): StageState | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const v = value as Record<string, unknown>;
  const scene = v.scene;
  if (scene !== 1 && scene !== 2 && scene !== 3 && scene !== 'curtain') return undefined;
  const positions = v.positions as Record<string, unknown> | undefined;
  const poses = v.poses as Record<string, unknown> | undefined;
  if (typeof positions !== 'object' || positions === null) return undefined;
  if (typeof poses !== 'object' || poses === null) return undefined;
  const parsedPositions = {} as Record<ItemId, number>;
  for (const id of ITEMS) {
    const x = positions[id];
    if (typeof x !== 'number' || !Number.isFinite(x)) return undefined;
    parsedPositions[id] = clampX(x);
  }
  const parsedPoses = {} as Record<ActorId, Pose>;
  for (const id of ACTORS) {
    const pose = poses[id];
    if (!(POSES as readonly unknown[]).includes(pose)) return undefined;
    parsedPoses[id] = pose as Pose;
  }
  const gift = v.gift;
  if (gift !== null && gift !== 'cake' && gift !== 'umbrella') return undefined;
  if ((scene === 3 || scene === 'curtain') && gift === null) return undefined;
  if ((scene === 1 || scene === 2) && gift !== null) return undefined;
  const selected = v.selected;
  if (!(ITEMS as readonly unknown[]).includes(selected)) return undefined;
  const seen = v.endingsSeen;
  if (!Array.isArray(seen) || seen.some((g) => g !== 'cake' && g !== 'umbrella')) return undefined;
  const endingsSeen = [...new Set(seen as Gift[])];
  const caption =
    scene === 'curtain' ? ENDINGS[gift as Gift] : SCENE_GOALS[scene as Exclude<Scene, 'curtain'>];
  return {
    scene,
    positions: parsedPositions,
    poses: parsedPoses,
    gift: gift as Gift | null,
    selected: selected as ItemId,
    caption,
    endingsSeen,
  };
}

export function stageSaveSlot(storage: SaveStorage | undefined) {
  return createSaveSlot(storage, {
    key: 'tessl-carnival:puppet-theatre:stage',
    maxLength: 2000,
    parse: parseSavedTheatre,
  });
}

/** The item under the pointer, nearest first, or undefined. */
export function itemAt(stage: StageState, x: number, y: number): ItemId | undefined {
  let best: { id: ItemId; d: number } | undefined;
  for (const id of ITEMS) {
    if (id === stage.gift) continue;
    const top = isActor(id) ? FLOOR_Y - 150 : FLOOR_Y - 50;
    if (y < top || y > FLOOR_Y + 10) continue;
    const d = Math.abs(stage.positions[id] - x);
    if (d <= (isActor(id) ? 45 : 30) && (!best || d < best.d)) best = { id, d };
  }
  return best?.id;
}

/** Pose buttons along the bottom, for the selected puppet. */
export const POSE_BUTTONS = POSES.map((pose, i) => ({
  pose,
  x: 140 + i * 110,
  y: 440,
  w: 100,
  h: 34,
}));
export const UNDO_BUTTON = { x: 600, y: 440, w: 80, h: 34 };
export const REHEARSE_BUTTON = { x: 690, y: 440, w: 100, h: 34 };

type Box = { x: number; y: number; w: number; h: number };
const inBox = (b: Box, x: number, y: number) =>
  x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;

/** The button action at a canvas point, if a button is there. */
export function buttonAction(stage: StageState, x: number, y: number): Action | undefined {
  if (stage.scene === 'curtain') return { type: 'replay' };
  if (inBox(UNDO_BUTTON, x, y)) return { type: 'undo' };
  if (inBox(REHEARSE_BUTTON, x, y)) return { type: 'rehearse' };
  const button = POSE_BUTTONS.find((b) => inBox(b, x, y));
  if (!button) return undefined;
  const actor = isActor(stage.selected) ? stage.selected : 'knight';
  return { type: 'pose', id: actor, pose: button.pose };
}

/** The action for a key press, or undefined when the theatre ignores the key. */
export function keyAction(stage: StageState, code: string): Action | undefined {
  if (stage.scene === 'curtain') {
    return code === 'Enter' || code === 'Space' ? { type: 'replay' } : undefined;
  }
  const digit = /^Digit([1-5])$/.exec(code);
  if (digit) return { type: 'select', id: ITEMS[Number(digit[1]) - 1] };
  const id = stage.selected;
  switch (code) {
    case 'ArrowLeft':
      return { type: 'nudge', id, dx: -20 };
    case 'ArrowRight':
      return { type: 'nudge', id, dx: 20 };
    case 'ArrowUp':
    case 'ArrowDown': {
      if (!isActor(id)) return undefined;
      const delta = code === 'ArrowUp' ? 1 : -1;
      const pose = POSES[(POSES.indexOf(stage.poses[id]) + delta + POSES.length) % POSES.length];
      return { type: 'pose', id, pose };
    }
    case 'Space':
    case 'Enter':
      return isProp(id) ? { type: 'drop', id } : undefined;
    case 'KeyZ':
      return { type: 'undo' };
    case 'KeyR':
      return { type: 'rehearse' };
    default:
      return undefined;
  }
}

function drawButton(ctx: CanvasRenderingContext2D, b: Box, label: string, lit: boolean) {
  const { colors } = theme;
  ctx.fillStyle = lit ? colors.accent : colors.surface;
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.fillStyle = lit ? colors.background : colors.text;
  ctx.font = canvasFont('small', 'bold');
  ctx.textAlign = 'center';
  ctx.fillText(label, b.x + b.w / 2, b.y + 22);
}

function drawPuppet(ctx: CanvasRenderingContext2D, stage: StageState, id: ActorId) {
  const { colors } = theme;
  const x = stage.positions[id];
  const pose = stage.poses[id];
  const body = id === 'knight' ? colors.water : colors.stripeA;
  const lean = pose === 'bow' ? 0.5 : 0;
  const drop = pose === 'hide' ? 60 : 0;
  const facing =
    stage.positions[id] < stage.positions[id === 'knight' ? 'dragon' : 'knight'] ? 1 : -1;

  // Strings up to the control bar.
  ctx.strokeStyle = colors.muted;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, 40);
  ctx.lineTo(x, FLOOR_Y - 140 + drop);
  ctx.moveTo(x + 24 * facing, 40);
  ctx.lineTo(x + 30 * facing, FLOOR_Y - 90 + drop);
  ctx.stroke();
  ctx.fillStyle = colors.wood;
  ctx.fillRect(x - 30, 34, 60, 8);

  ctx.save();
  ctx.translate(x, FLOOR_Y + drop);
  ctx.rotate(lean * facing);
  ctx.fillStyle = body;
  ctx.fillRect(-20, -100, 40, 80);
  ctx.fillRect(-18, -20, 12, 20);
  ctx.fillRect(6, -20, 12, 20);
  // Arm: raised to wave, otherwise at the side.
  ctx.save();
  ctx.translate(14 * facing, -90);
  ctx.rotate(pose === 'wave' ? -2.4 * facing : 0.2 * facing);
  ctx.fillRect(-5, 0, 10, 50);
  ctx.restore();
  ctx.fillStyle = id === 'knight' ? colors.text : colors.danger;
  ctx.beginPath();
  ctx.arc(0, -120, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colors.background;
  ctx.beginPath();
  ctx.arc(8 * facing, -124, 4, 0, Math.PI * 2);
  ctx.fill();
  if (id === 'knight') {
    ctx.fillStyle = colors.accent;
    ctx.fillRect(-22, -146, 44, 10);
  } else {
    ctx.fillStyle = colors.accent;
    ctx.beginPath();
    ctx.moveTo(-14, -138);
    ctx.lineTo(-6, -160);
    ctx.lineTo(2, -140);
    ctx.lineTo(10, -160);
    ctx.lineTo(16, -136);
    ctx.fill();
  }
  ctx.restore();

  if (stage.selected === id) {
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 3;
    ctx.strokeRect(x - 36, FLOOR_Y - 170 + drop, 72, 180 - drop);
  }
}

function drawProp(ctx: CanvasRenderingContext2D, stage: StageState, id: PropId) {
  const { colors } = theme;
  if (stage.gift === id) return;
  const x = stage.positions[id];
  const y = FLOOR_Y;
  if (id === 'cake') {
    ctx.fillStyle = colors.stripeB;
    ctx.fillRect(x - 20, y - 26, 40, 26);
    ctx.fillStyle = colors.stripeA;
    ctx.fillRect(x - 20, y - 30, 40, 6);
    ctx.fillStyle = colors.accent;
    ctx.fillRect(x - 2, y - 42, 4, 12);
  } else if (id === 'umbrella') {
    ctx.fillStyle = colors.water;
    ctx.beginPath();
    ctx.arc(x, y - 30, 24, Math.PI, 0);
    ctx.fill();
    ctx.strokeStyle = colors.wood;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y - 30);
    ctx.lineTo(x, y);
    ctx.stroke();
  } else {
    ctx.fillStyle = colors.accent;
    ctx.beginPath();
    ctx.moveTo(x - 16, y - 4);
    ctx.quadraticCurveTo(x - 14, y - 40, x, y - 40);
    ctx.quadraticCurveTo(x + 14, y - 40, x + 16, y - 4);
    ctx.fill();
  }
  if (stage.selected === id) {
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 28, y - 50, 56, 56);
  }
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, max: number) {
  const words = text.split(' ');
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > max && line) {
      ctx.fillText(line, x, y);
      line = word;
      y += 22;
    } else line = test;
  }
  ctx.fillText(line, x, y);
}

function draw(ctx: CanvasRenderingContext2D, stage: StageState) {
  const { colors } = theme;
  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  // Curtains and boards.
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = i % 2 ? colors.stripeA : colors.danger;
    ctx.fillRect(i * 8, 0, 8, FLOOR_Y + 20);
    ctx.fillRect(WIDTH - 48 + i * 8, 0, 8, FLOOR_Y + 20);
  }
  ctx.fillStyle = colors.wood;
  ctx.fillRect(0, FLOOR_Y, WIDTH, 20);
  ctx.fillStyle = colors.surface;
  ctx.fillRect(CENTRE - NEAR, FLOOR_Y + 4, NEAR * 2, 4);

  for (const id of PROPS) drawProp(ctx, stage, id);
  for (const id of ACTORS) drawPuppet(ctx, stage, id);

  if (stage.gift && stage.scene !== 1) {
    ctx.fillStyle = colors.text;
    ctx.font = canvasFont('small');
    ctx.textAlign = 'center';
    ctx.fillText(`(holding the ${stage.gift})`, stage.positions.dragon, FLOOR_Y + 40);
  }

  // Silent caption.
  ctx.fillStyle = colors.surface;
  ctx.fillRect(60, 56, WIDTH - 120, 60);
  ctx.fillStyle = colors.text;
  ctx.font = canvasFont('body', 'bold');
  ctx.textAlign = 'center';
  wrap(ctx, stage.caption, CENTRE, 80, WIDTH - 140);

  ctx.font = canvasFont('small');
  ctx.fillStyle = colors.muted;
  ctx.textAlign = 'left';
  const label = stage.scene === 'curtain' ? 'Curtain' : `Scene ${stage.scene} of 3`;
  ctx.fillText(`${label}  ·  Endings found ${stage.endingsSeen.length}/2`, 16, 24);

  if (stage.scene === 'curtain') {
    ctx.fillStyle = colors.accent;
    ctx.font = canvasFont('title', 'bold');
    ctx.textAlign = 'center';
    ctx.fillText('The End!', CENTRE, 180);
    ctx.fillStyle = colors.text;
    ctx.font = canvasFont('body');
    ctx.fillText('Click or press Enter to perform it again', CENTRE, 460);
    return;
  }
  const actor = isActor(stage.selected) ? stage.selected : 'knight';
  for (const b of POSE_BUTTONS) drawButton(ctx, b, b.pose, stage.poses[actor] === b.pose);
  drawButton(ctx, UNDO_BUTTON, 'Undo', false);
  drawButton(ctx, REHEARSE_BUTTON, 'Rehearse', false);
  ctx.fillStyle = colors.muted;
  ctx.font = canvasFont('small');
  ctx.textAlign = 'left';
  ctx.fillText(`Posing: ${actor}`, 16, 462);
}

export const puppetTheatre: CarnivalGame = {
  id: 'puppet-theatre',
  name: 'Puppet Theatre',
  description:
    'Pull the strings on a knight and a dragon and act out a three-scene tale with two endings.',

  start(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;

    const slot = stageSaveSlot(browserSaveStorage());
    const saved = slot.load();
    let theatre = saved ? createTheatre(saved.stage, saved.sceneStart) : createTheatre();
    let dragging: ItemId | undefined;

    const record = (score: number) => recordScore(puppetTheatre.id, score);
    const run = (action: Action) => {
      if (rewinds(action)) dragging = undefined;
      // Retries a score whose write failed, before a replay starts a fresh performance.
      recordFinalScore(theatre, record);
      theatre = act(theatre, action);
      slot.save({ stage: theatre.stage, sceneStart: theatre.sceneStart });
      recordFinalScore(theatre, record);
    };
    const toCanvas = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((event.clientX - rect.left) / rect.width) * WIDTH,
        y: ((event.clientY - rect.top) / rect.height) * HEIGHT,
      };
    };
    const onDown = (event: PointerEvent) => {
      const { x, y } = toCanvas(event);
      const button = buttonAction(theatre.stage, x, y);
      if (button) return run(button);
      const id = itemAt(theatre.stage, x, y);
      if (!id) return;
      dragging = id;
      run({ type: 'grab', id });
      canvas.setPointerCapture?.(event.pointerId);
    };
    const onMove = (event: PointerEvent) => {
      if (!dragging) return;
      run({ type: 'move', id: dragging, x: toCanvas(event).x, record: false });
    };
    const onUp = () => {
      if (dragging && isProp(dragging)) run({ type: 'drop', id: dragging, record: false });
      dragging = undefined;
    };
    // A cancelled touch ends the drag without dropping, so it never hands over a gift.
    const onCancel = () => {
      dragging = undefined;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target instanceof HTMLElement ? event.target : undefined;
      if (
        target?.isContentEditable ||
        target?.closest('a, button, select, summary, [role="button"]') ||
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA'
      )
        return;
      const action = keyAction(theatre.stage, event.code);
      if (!action) return;
      event.preventDefault();
      run(action);
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKeyDown);

    let frame = 0;
    const loop = () => {
      draw(ctx, theatre.stage);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKeyDown);
    };
  },
};
