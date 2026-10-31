import type { LandmarkId } from './midway/discovery';

/**
 * A short story card for each landmark on the discovery trail. A card opens
 * from the Guide only once its landmark is found; it never touches finds,
 * scores or stamps. The words are plain text, kept here, and always set with
 * textContent.
 */
export interface LandmarkStory {
  id: LandmarkId;
  /** A small badge for the card's corner. */
  badge: string;
  title: string;
  lines: string[];
  /** A gentle nudge to come back and look again. */
  revisit: string;
}

export const LANDMARK_STORIES: Record<LandmarkId, LandmarkStory> = {
  entrance: {
    id: 'entrance',
    badge: '🎟️',
    title: 'The ticket that waited',
    lines: [
      'Every evening, the ticket seller keeps one ticket back in a little tin.',
      'It is for whoever walks through the gate last, so nobody arrives to find the booth bare.',
      'Some nights the tin is empty by closing. Some nights the ticket is still there in the morning, ready again.',
    ],
    revisit: 'Come back at evening and see if the booth lamp is lit for the last visitor.',
  },
  carousel: {
    id: 'carousel',
    badge: '🎠',
    title: 'The horse with the painted star',
    lines: [
      'One carousel horse has a small gold star on its saddle that nobody remembers painting.',
      'Children say it goes round a little slower, so its rider can wave twice.',
      'The ride keeper just smiles, and oils its pole first every morning.',
    ],
    revisit: 'Walk past again later: the music always seems to start just as someone arrives.',
  },
  'ferris-wheel': {
    id: 'ferris-wheel',
    badge: '🎡',
    title: 'The view from the top car',
    lines: [
      'From the very top of the Ferris wheel you can see every tent, every booth and the gate where you came in.',
      'People who ride it often say the midway looks smaller from up there, and somehow friendlier.',
      'The wheel turns slowly on purpose, so everyone gets a moment at the top.',
    ],
    revisit: 'Try the lantern evening and picture the whole midway glowing from the top car.',
  },
};

/** The story for a landmark, only once it has been found. */
export function unlockedStory(
  id: LandmarkId,
  found: readonly LandmarkId[],
): LandmarkStory | undefined {
  return found.includes(id) ? LANDMARK_STORIES[id] : undefined;
}

/** What the Guide's trail list says about a landmark's story. */
export function storyStatus(name: string, id: LandmarkId, found: readonly LandmarkId[]): string {
  return unlockedStory(id, found)
    ? `Read the ${name} story`
    : `Find the ${name} to unlock its story.`;
}

/** Which story card is open, if any: closed by default. */
export interface StoryState {
  open?: LandmarkId;
}

export const CLOSED_STORY: StoryState = {};

/** Opens a found landmark's card. An unfound landmark leaves the state alone. */
export function openStory(
  state: StoryState,
  id: LandmarkId,
  found: readonly LandmarkId[],
): StoryState {
  return unlockedStory(id, found) ? { open: id } : state;
}

export function closeStory(): StoryState {
  return CLOSED_STORY;
}

/**
 * What Escape does to the story card: it closes an open card and says whether
 * it handled the key, so the Guide stays open behind it. Focus goes back to
 * the card's button only when it was inside the card.
 */
export function escapeStory(
  state: StoryState,
  focusInCard: boolean,
): { state: StoryState; handled: boolean; restoreFocus: boolean } {
  if (state.open === undefined) return { state, handled: false, restoreFocus: false };
  return { state: CLOSED_STORY, handled: true, restoreFocus: focusInCard };
}
