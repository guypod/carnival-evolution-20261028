import type { LandmarkId } from './midway/discovery';

/**
 * The missing finale ticket: a short, optional mystery across the three
 * discovery landmarks. Walking up to a landmark and pressing a button in the
 * Guide both go through `mysteryStep`, so the map and the text route share one
 * state machine. Progress is kept under its own key and never touches scores,
 * stamps or discovery finds. There is no timer and no wrong answer that ends it.
 */
export type MysteryClue = LandmarkId;
export type MysteryEnding = 'returned' | 'gifted';
export type MysteryNpc = 'mara' | 'otto';

export interface MysteryState {
  started: boolean;
  clues: MysteryClue[];
  /** Whom the player trusts, once they choose. */
  trusted?: MysteryNpc;
  /** Set after "I'm not sure yet": an extra hint, then back to choosing. */
  rethought: boolean;
}

export const NEW_MYSTERY: MysteryState = { started: false, clues: [], rethought: false };

export type MysteryAction =
  | { type: 'start' }
  | { type: 'inspect'; at: LandmarkId }
  | { type: 'trust'; npc: MysteryNpc }
  | { type: 'unsure' }
  | { type: 'restart' };

export const CLUE_ORDER: MysteryClue[] = ['entrance', 'carousel', 'ferris-wheel'];

export const NPC_NAMES: Record<MysteryNpc, string> = {
  mara: 'Mara, the ticket seller',
  otto: 'Otto, the carousel keeper',
};

export const CLUES: Record<MysteryClue, { title: string; text: string }> = {
  entrance: {
    title: 'The empty tin',
    text: 'The finale ticket tin at the Ticket booth is empty. A thumbprint of gold paint is on the lid.',
  },
  carousel: {
    title: 'The fresh star',
    text: 'The star on the carousel horse is still tacky. Beside it, a ticket-shaped patch of saddle has no paint at all.',
  },
  'ferris-wheel': {
    title: 'The view from the top car',
    text: 'From the top car you can see a paper rectangle tucked into the carousel horse’s bridle, not blowing about anywhere.',
  },
};

/** One step of the mystery. Anything that does not fit the current state changes nothing. */
export function mysteryStep(state: MysteryState, action: MysteryAction): MysteryState {
  switch (action.type) {
    case 'start':
      return state.started ? state : { ...state, started: true };
    case 'inspect':
      if (!state.started || state.trusted || state.clues.includes(action.at)) return state;
      return {
        ...state,
        clues: CLUE_ORDER.filter((c) => c === action.at || state.clues.includes(c)),
      };
    case 'trust':
      return canChoose(state) ? { ...state, trusted: action.npc } : state;
    case 'unsure':
      return canChoose(state) ? { ...state, rethought: true } : state;
    case 'restart':
      return NEW_MYSTERY;
  }
}

/** The choice opens once all three clues are seen, and stays open until made. */
export function canChoose(state: MysteryState): boolean {
  return state.started && !state.trusted && state.clues.length === CLUE_ORDER.length;
}

export function mysteryEnding(state: MysteryState): MysteryEnding | undefined {
  if (!state.trusted) return undefined;
  return state.trusted === 'mara' ? 'returned' : 'gifted';
}

/** What each NPC says now. Their words change with the clues and with whom you trusted. */
export function npcLine(state: MysteryState, npc: MysteryNpc): string {
  const ending = mysteryEnding(state);
  if (npc === 'mara') {
    if (!state.started) return 'Mara keeps glancing at an empty tin behind the counter.';
    if (ending === 'returned')
      return 'Mara: “Back in its tin, where the last visitor will look for it. Thank you for believing me.”';
    if (ending === 'gifted')
      return 'Mara: “A free ride for the last visitor instead of a ticket? Fine. I’ll leave my lamp lit so they find the carousel.”';
    if (state.clues.includes('carousel'))
      return 'Mara: “Gold paint on my tin and on that horse? Otto borrowed it, I’m sure. It belongs at the gate.”';
    return 'Mara: “The finale ticket is gone from my tin. Will you look around the midway for me?”';
  }
  if (!state.clues.includes('carousel')) return 'Otto hums to himself and oils a carousel pole.';
  if (ending === 'gifted')
    return 'Otto: “The ticket stays in the bridle. Whoever comes last rides the star horse, no queue.”';
  if (ending === 'returned')
    return 'Otto: “Fair enough, it was Mara’s. I’ll paint the star free-hand next time.”';
  return 'Otto: “I used it as a stencil for the star, then tucked it in the bridle so the last rider would find it. Is that so wrong?”';
}

/** The extra hint after "I'm not sure yet". */
export const RETHINK_HINT =
  'Both of them want the last visitor looked after. Mara wants the ticket where people expect it; Otto wants it where the ride is. Either is a kind ending.';

export const ENDINGS: Record<MysteryEnding, { title: string; text: string }> = {
  returned: {
    title: 'Ending: Back in the tin',
    text: 'You fetch the ticket from the bridle and Mara sets it in the tin. Tonight the booth lamp burns for the last visitor through the gate.',
  },
  gifted: {
    title: 'Ending: The star horse ride',
    text: 'The ticket stays tucked in the bridle. Otto slows the carousel for the last rider, and Mara points the way from her booth.',
  },
};

/** One line for the Guide: where the mystery stands. */
export function mysteryStatus(state: MysteryState): string {
  if (!state.started) return 'Not started. Mara at the Ticket booth needs a hand.';
  const ending = mysteryEnding(state);
  if (ending) return `Solved: ${ENDINGS[ending].title.replace('Ending: ', '')}.`;
  if (canChoose(state)) return 'All three clues found. Whom do you trust?';
  return `${state.clues.length} of ${CLUE_ORDER.length} clues found.`;
}

export const MYSTERY_KEY = 'tessl-carnival:finale-mystery';

/** Reads saved progress. Anything malformed reads as a new mystery. */
export function parseMystery(raw: string | null): MysteryState {
  if (!raw) return NEW_MYSTERY;
  try {
    const value = JSON.parse(raw) as Partial<MysteryState> | null;
    if (!value || typeof value !== 'object' || value.started !== true) return NEW_MYSTERY;
    const clues = Array.isArray(value.clues) ? value.clues : [];
    const state: MysteryState = {
      started: true,
      clues: CLUE_ORDER.filter((c) => clues.includes(c)),
      rethought: value.rethought === true,
    };
    if (value.trusted === 'mara' || value.trusted === 'otto') {
      if (state.clues.length === CLUE_ORDER.length) state.trusted = value.trusted;
    }
    return state;
  } catch {
    return NEW_MYSTERY;
  }
}

type MysteryStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function createMysteryStore(storage: MysteryStorage | undefined) {
  return {
    load(): MysteryState {
      try {
        return parseMystery(storage?.getItem(MYSTERY_KEY) ?? null);
      } catch {
        return NEW_MYSTERY;
      }
    },
    save(state: MysteryState): boolean {
      try {
        if (!storage) return false;
        storage.setItem(MYSTERY_KEY, JSON.stringify(state));
        return true;
      } catch {
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
