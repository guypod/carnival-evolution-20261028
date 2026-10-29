/** Where the Visitor Guide is: closed by default, so the map has the room. */
export interface GuideState {
  open: boolean;
  /** The section the contents last jumped to, when there is one. */
  section?: GuideSectionId;
}

export const CLOSED_GUIDE: GuideState = { open: false };

/** The guide after its toggle button is pressed. */
export function toggleGuide(state: GuideState): GuideState {
  return { open: !state.open };
}

/**
 * What Escape does on the midway: it closes an open guide, and says whether it
 * handled the key so nothing else acts on it. A closed guide leaves Escape alone.
 * Focus goes back to the toggle only when it was inside the guide, so a player
 * walking the map keeps walking.
 */
export function escapeGuide(
  state: GuideState,
  focusInGuide: boolean,
): { state: GuideState; handled: boolean; restoreFocus: boolean } {
  if (!state.open) return { state, handled: false, restoreFocus: false };
  return { state: CLOSED_GUIDE, handled: true, restoreFocus: focusInGuide };
}

/** The toggle's accessible label for the guide's state. */
export function guideToggleLabel(state: GuideState): string {
  return state.open ? 'Close the visitor guide' : 'Open the visitor guide';
}

/** The guide's sections, in the order its contents list them. */
export const GUIDE_SECTIONS = [
  { id: 'destinations', label: 'Destinations' },
  { id: 'visit', label: 'Visit' },
  { id: 'discovery', label: 'Discovery' },
  { id: 'passport', label: 'Passport' },
  { id: 'settings', label: 'Settings' },
] as const;

export type GuideSectionId = (typeof GUIDE_SECTIONS)[number]['id'];

/** The element id of a section's heading, where a jump puts focus. */
export function guideSectionHeadingId(section: GuideSectionId): string {
  return `guide-${section}-title`;
}

/** The element id of a section's link in the contents. */
export function guideContentsLinkId(section: GuideSectionId): string {
  return `guide-contents-${section}`;
}

/** The guide after a contents link is pressed: open, at that section. */
export function jumpToSection(_state: GuideState, section: GuideSectionId): GuideState {
  return { open: true, section };
}

/**
 * The guide after a section's "Contents" button is pressed. Focus goes back to
 * the contents link the player came from, or the first one.
 */
export function returnToContents(state: GuideState): { state: GuideState; focusId: string } {
  const from = state.section ?? GUIDE_SECTIONS[0].id;
  return { state: { open: state.open }, focusId: guideContentsLinkId(from) };
}
