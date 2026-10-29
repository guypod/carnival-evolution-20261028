import type { LandmarkId } from './midway/discovery';
import type { LandmarkDetail } from './midway/render';

/**
 * The missing finale ticket: an optional mystery across the three discovery
 * landmarks. At each landmark the player picks one of two ways to look into
 * it, and what they learn decides which theories they can put to Mara and
 * Otto, and which endings are open. Walking up to a landmark and pressing a
 * button in the Guide both go through `mysteryStep`, so the map and the text
 * route share one state machine. Progress is kept under its own key and never
 * touches scores, stamps or discovery finds. There is no timer, and a wrong
 * guess only sends the player back to look again.
 */
export type MysteryNpc = 'mara' | 'otto';
export type Approach = 'tin' | 'ledger' | 'star' | 'otto' | 'top' | 'log';
export type Evidence = 'paint' | 'lamp' | 'bridle';
export type Theory = 'stencil' | 'rescue' | 'wind';
export type MysteryEnding = 'returned' | 'gifted' | 'shared';

export interface MysteryState {
  started: boolean;
  /** How the player looked into each landmark, once they chose. */
  approaches: Partial<Record<LandmarkId, Approach>>;
  /** The theory Mara and Otto both accepted. */
  theory?: Theory;
  /** The last theory the evidence did not support, for the hint. */
  misread?: Theory;
  ending?: MysteryEnding;
}

export const NEW_MYSTERY: MysteryState = { started: false, approaches: {} };

export type MysteryAction =
  | { type: 'start' }
  | { type: 'investigate'; at: LandmarkId; approach: Approach }
  | { type: 'look-again'; at: LandmarkId }
  | { type: 'theorize'; theory: Theory }
  | { type: 'resolve'; ending: MysteryEnding }
  | { type: 'restart' };

export const LANDMARK_ORDER: LandmarkId[] = ['entrance', 'carousel', 'ferris-wheel'];

export const NPC_NAMES: Record<MysteryNpc, string> = {
  mara: 'Mara, the ticket seller',
  otto: 'Otto, the carousel keeper',
};

export interface ApproachInfo {
  at: LandmarkId;
  label: string;
  title: string;
  text: string;
  evidence: Evidence[];
}

export const APPROACHES: Record<Approach, ApproachInfo> = {
  tin: {
    at: 'entrance',
    label: 'Examine the empty tin',
    title: 'The painted tin',
    text: 'The finale ticket tin is empty. A thumbprint of wet gold paint is on the lid.',
    evidence: ['paint'],
  },
  ledger: {
    at: 'entrance',
    label: 'Ask Mara about last night',
    title: 'Mara’s confession',
    text: 'Mara admits her booth lamp went out at nine, and she left the counter to find oil.',
    evidence: ['lamp'],
  },
  star: {
    at: 'carousel',
    label: 'Look closely at the star horse',
    title: 'The fresh star',
    text: 'The gold star on the lead horse is still tacky. Beside it is a ticket-shaped patch with no paint at all.',
    evidence: ['paint'],
  },
  otto: {
    at: 'carousel',
    label: 'Ask Otto what he saw',
    title: 'Otto’s story',
    text: 'Otto says he saw the booth go dark and walked over with his oil can. A ticket was on the step.',
    evidence: ['lamp'],
  },
  top: {
    at: 'ferris-wheel',
    label: 'Ride to the top car',
    title: 'The view from the top',
    text: 'From the top car you can see a gold paper tucked into the lead horse’s bridle, not blowing about anywhere.',
    evidence: ['bridle'],
  },
  log: {
    at: 'ferris-wheel',
    label: 'Read the operator’s log',
    title: 'The operator’s log',
    text: 'The log says: “9 pm, Ticket booth lamp out. Otto went over with oil.”',
    evidence: ['lamp'],
  },
};

/** The two ways to look into each landmark. */
export function approachesAt(at: LandmarkId): Approach[] {
  return (Object.keys(APPROACHES) as Approach[]).filter((a) => APPROACHES[a].at === at);
}

export const THEORIES: Record<Theory, { label: string; needs?: Evidence }> = {
  stencil: { label: 'Otto borrowed the ticket as a stencil for his star', needs: 'paint' },
  rescue: { label: 'Otto picked it up to keep it safe while the lamp was out', needs: 'lamp' },
  wind: { label: 'The wind blew it away' },
};

export const ENDINGS: Record<MysteryEnding, { title: string; label: string; text: string }> = {
  returned: {
    title: 'Back in the tin',
    label: 'Put the ticket back in Mara’s tin',
    text: 'You fetch the ticket from the bridle and Mara sets it in the tin. Her booth lamp burns for the last visitor through the gate.',
  },
  gifted: {
    title: 'The star horse ride',
    label: 'Leave it in the bridle for the last rider',
    text: 'The ticket stays in the bridle and Otto ties a red ribbon on the star horse. Whoever comes last rides it, no queue.',
  },
  shared: {
    title: 'The lamp-lit finale',
    label: 'Hang Mara’s lamp at the carousel with the ticket',
    text: 'Mara carries her lamp to the carousel and Otto hangs the ticket beneath it. The finale starts where both of them can see it.',
  },
};

/** Everything the player has learned so far. */
export function evidenceOf(state: MysteryState): Evidence[] {
  const found = new Set<Evidence>();
  for (const id of LANDMARK_ORDER) {
    const approach = state.approaches[id];
    if (approach) APPROACHES[approach].evidence.forEach((e) => found.add(e));
  }
  return (['paint', 'lamp', 'bridle'] as Evidence[]).filter((e) => found.has(e));
}

export function supports(state: MysteryState, theory: Theory): boolean {
  const needs = THEORIES[theory].needs;
  return needs !== undefined && evidenceOf(state).includes(needs);
}

export function investigated(state: MysteryState): boolean {
  return LANDMARK_ORDER.every((id) => state.approaches[id] !== undefined);
}

/** The theory can be put once every landmark has been looked into. */
export function canTheorize(state: MysteryState): boolean {
  return state.started && !state.theory && investigated(state);
}

/** The endings open for this theory. The shared one needs both paint and lamp. */
export function openEndings(state: MysteryState): MysteryEnding[] {
  if (!state.theory || state.ending) return [];
  const evidence = evidenceOf(state);
  const endings: MysteryEnding[] = ['returned', 'gifted'];
  if (evidence.includes('paint') && evidence.includes('lamp')) endings.push('shared');
  return endings;
}

/** One step of the mystery. Anything that does not fit the current state changes nothing. */
export function mysteryStep(state: MysteryState, action: MysteryAction): MysteryState {
  switch (action.type) {
    case 'start':
      return state.started ? state : { ...state, started: true };
    case 'investigate': {
      const info = APPROACHES[action.approach];
      if (!info || info.at !== action.at) return state;
      if (!state.started || state.theory || state.approaches[action.at]) return state;
      return { ...state, approaches: { ...state.approaches, [action.at]: action.approach } };
    }
    case 'look-again': {
      if (!state.started || state.theory || !state.approaches[action.at]) return state;
      const approaches = { ...state.approaches };
      delete approaches[action.at];
      return { ...state, approaches };
    }
    case 'theorize':
      if (!canTheorize(state)) return state;
      if (!supports(state, action.theory)) {
        return state.misread === action.theory ? state : { ...state, misread: action.theory };
      }
      return { started: true, approaches: state.approaches, theory: action.theory };
    case 'resolve':
      return openEndings(state).includes(action.ending)
        ? { ...state, ending: action.ending }
        : state;
    case 'restart':
      return NEW_MYSTERY;
  }
}

/** Why a theory did not hold up, and where to look again. Never a dead end. */
export function misreadHint(state: MysteryState): string | undefined {
  if (!state.misread) return undefined;
  const evidence = evidenceOf(state);
  if (state.misread === 'wind')
    return evidence.includes('bridle')
      ? 'Otto laughs: “Blown away? You saw it yourself from the wheel, tucked in my bridle.” Try another theory.'
      : 'Mara shakes her head: “There was no wind last night.” Try another theory, or look again somewhere.';
  return state.misread === 'stencil'
    ? 'Otto frowns: “Paint? What paint?” You have no sign of paint yet. The tin or the star horse might show some, if you look again.'
    : 'Mara: “The lamp? Nobody said anything about my lamp.” Asking Mara, Otto or the wheel’s log might tell you more, if you look again.';
}

/** What each NPC says now. Their words follow how you investigated, what you think and how it ended. */
export function npcLine(state: MysteryState, npc: MysteryNpc): string {
  const a = state.approaches;
  if (npc === 'mara') {
    if (!state.started) return 'Mara keeps glancing at an empty tin behind the counter.';
    switch (state.ending) {
      case 'returned':
        return 'Mara: “Back in its tin, where the last visitor will look. And my lamp stays lit tonight.”';
      case 'gifted':
        return 'Mara: “A free ride instead of a ticket? Fine. I’ll point the last visitor to the star horse.”';
      case 'shared':
        return 'Mara: “My lamp looks better on the carousel anyway. Don’t tell Otto I said so.”';
    }
    if (state.theory === 'stencil')
      return 'Mara: “A stencil! He could have asked. Still, it’s a lovely star.”';
    if (state.theory === 'rescue')
      return 'Mara: “He kept it safe while I was off looking for oil? Then I owe Otto a thank you.”';
    if (a.entrance === 'ledger')
      return 'Mara: “I shouldn’t have left the counter. Please, find out where it went.”';
    if (a.entrance === 'tin')
      return 'Mara: “Gold paint on my tin? Somebody with painty fingers took it, I’m sure.”';
    return 'Mara: “The finale ticket is gone from my tin. Will you look around the midway for me?”';
  }
  if (!state.started || !a.carousel) return 'Otto hums to himself and oils a carousel pole.';
  switch (state.ending) {
    case 'returned':
      return state.theory === 'stencil'
        ? 'Otto: “Fair enough, it was Mara’s. I’ll paint the next star free-hand.”'
        : 'Otto: “Back where it belongs. I’m glad I picked it up off that step.”';
    case 'gifted':
      return 'Otto: “Red ribbon on, star horse ready. The last rider goes round for free.”';
    case 'shared':
      return 'Otto: “Her lamp, my horses, one ticket. Best finale we’ve had.”';
  }
  if (state.theory === 'stencil')
    return 'Otto: “Guilty. I traced round it for the star, then tucked it in the bridle. Is that so wrong?”';
  if (state.theory === 'rescue')
    return 'Otto: “It was on the step in the dark. I put it somewhere it wouldn’t blow off.”';
  if (a.carousel === 'otto') return 'Otto: “Ask anyone, I only went over to help with the lamp.”';
  return 'Otto: “Admiring my star? Took me all morning.” He doesn’t meet your eye.';
}

/** What the map shows at the landmarks, so the world and the text agree. */
export function landmarkDetail(state: MysteryState): LandmarkDetail {
  switch (state.ending) {
    case 'returned':
      return { tin: true, bridle: false, lamp: 'booth-lit', ribbon: false };
    case 'gifted':
      return { tin: false, bridle: true, lamp: 'booth-out', ribbon: true };
    case 'shared':
      return { tin: false, bridle: false, lamp: 'carousel', ribbon: false };
    default:
      return { tin: false, bridle: true, lamp: 'booth-out', ribbon: false };
  }
}

/** The same details in words, one line per landmark, for the Guide. */
export function landmarkScene(state: MysteryState): Record<LandmarkId, string> {
  const d = landmarkDetail(state);
  return {
    entrance: `Ticket booth: the tin on the counter is ${d.tin ? 'holding the gold finale ticket' : 'empty'}, and the booth lamp is ${d.lamp === 'booth-lit' ? 'lit' : d.lamp === 'carousel' ? 'gone from its hook' : 'out'}.`,
    carousel: `Carousel: the lead horse has a gold star${d.bridle ? ' and a gold ticket in its bridle' : ''}${d.ribbon ? ', with a red ribbon tied on' : ''}${d.lamp === 'carousel' ? '. Mara’s lamp hangs at the front, lit, with the ticket beneath it' : ''}.`,
    'ferris-wheel':
      'Ferris wheel: from the top car you can see the whole midway, down to the carousel.',
  };
}

/** One line for the Guide: where the mystery stands. */
export function mysteryStatus(state: MysteryState): string {
  if (!state.started) return 'Not started. Mara at the Ticket booth needs a hand.';
  if (state.ending) return `Solved: ${ENDINGS[state.ending].title}.`;
  if (state.theory) return 'Mara and Otto agree on what happened. How should it end?';
  if (state.misread) return 'That theory didn’t hold up. Try another, or look again.';
  if (investigated(state)) return 'All three landmarks looked into. What do you think happened?';
  const done = LANDMARK_ORDER.filter((id) => state.approaches[id]).length;
  return `${done} of ${LANDMARK_ORDER.length} landmarks looked into.`;
}

export const MYSTERY_KEY = 'tessl-carnival:finale-mystery';

/** Reads saved progress. Anything malformed or impossible reads as safely as it can. */
export function parseMystery(raw: string | null): MysteryState {
  if (!raw) return NEW_MYSTERY;
  try {
    const value = JSON.parse(raw) as Record<string, unknown> | null;
    if (!value || typeof value !== 'object' || value.started !== true) return NEW_MYSTERY;
    const saved = (
      value.approaches && typeof value.approaches === 'object' ? value.approaches : {}
    ) as Record<string, unknown>;
    // Replay the save through the state machine, so only reachable states load.
    let state = mysteryStep(NEW_MYSTERY, { type: 'start' });
    for (const at of LANDMARK_ORDER) {
      const approach = saved[at];
      if (typeof approach === 'string' && approach in APPROACHES)
        state = mysteryStep(state, { type: 'investigate', at, approach: approach as Approach });
    }
    for (const key of ['misread', 'theory'] as const) {
      const theory = value[key];
      if (typeof theory === 'string' && theory in THEORIES)
        state = mysteryStep(state, { type: 'theorize', theory: theory as Theory });
    }
    const ending = value.ending;
    if (typeof ending === 'string' && ending in ENDINGS)
      state = mysteryStep(state, { type: 'resolve', ending: ending as MysteryEnding });
    return state;
  } catch {
    return NEW_MYSTERY;
  }
}

type MysteryStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Whether two states are the same progress, even when they are different objects. */
export function sameMystery(a: MysteryState, b: MysteryState): boolean {
  return (
    a.started === b.started &&
    a.theory === b.theory &&
    a.misread === b.misread &&
    a.ending === b.ending &&
    LANDMARK_ORDER.every((id) => a.approaches[id] === b.approaches[id])
  );
}

/**
 * Saved progress, with this tab's latest state kept in memory. When storage is
 * missing, cannot be read, or the last save failed, `load` returns the state in
 * memory, so a broken storage never loses progress made in this session.
 */
export function createMysteryStore(storage: MysteryStorage | undefined) {
  let current = NEW_MYSTERY;
  let unsaved = false;
  return {
    load(): MysteryState {
      if (!storage || unsaved) return current;
      try {
        current = parseMystery(storage.getItem(MYSTERY_KEY));
      } catch {
        // Keep the state in memory.
      }
      return current;
    },
    save(state: MysteryState): boolean {
      current = state;
      try {
        if (!storage) return false;
        storage.setItem(MYSTERY_KEY, JSON.stringify(state));
        unsaved = false;
        return true;
      } catch {
        unsaved = true;
        return false;
      }
    },
  };
}

function browserStorage(): MysteryStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export const mysteryStore = createMysteryStore(
  typeof window === 'undefined' ? undefined : browserStorage(),
);
