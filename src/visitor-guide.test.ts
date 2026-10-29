import { describe, expect, it } from 'vitest';
import {
  CLOSED_GUIDE,
  escapeGuide,
  GUIDE_SECTIONS,
  guideContentsLinkId,
  guideSectionHeadingId,
  guideToggleLabel,
  jumpToSection,
  returnToContents,
  toggleGuide,
} from './visitor-guide';

describe('visitor guide', () => {
  it('starts closed and opens and closes with its toggle', () => {
    expect(CLOSED_GUIDE.open).toBe(false);
    const open = toggleGuide(CLOSED_GUIDE);
    expect(open.open).toBe(true);
    expect(toggleGuide(open).open).toBe(false);
  });

  it('closes on Escape and restores focus only from inside the guide', () => {
    const open = toggleGuide(CLOSED_GUIDE);
    expect(escapeGuide(open, true)).toEqual({
      state: { open: false },
      handled: true,
      restoreFocus: true,
    });
    expect(escapeGuide(open, false)).toEqual({
      state: { open: false },
      handled: true,
      restoreFocus: false,
    });
  });

  it('leaves Escape alone when the guide is closed', () => {
    expect(escapeGuide(CLOSED_GUIDE, false)).toEqual({
      state: CLOSED_GUIDE,
      handled: false,
      restoreFocus: false,
    });
  });

  it('labels the toggle for what pressing it does', () => {
    expect(guideToggleLabel(CLOSED_GUIDE)).toBe('Open the visitor guide');
    expect(guideToggleLabel(toggleGuide(CLOSED_GUIDE))).toBe('Close the visitor guide');
  });
});

describe('visitor guide contents', () => {
  it('lists every section once, destinations first', () => {
    expect(GUIDE_SECTIONS.map((section) => section.label)).toEqual([
      'Destinations',
      'Visit',
      'Discovery',
      'Passport',
      'Settings',
    ]);
  });

  it('jumps to a section, opening the guide and focusing its heading', () => {
    const state = jumpToSection(CLOSED_GUIDE, 'discovery');
    expect(state).toEqual({ open: true, section: 'discovery' });
    expect(guideSectionHeadingId('discovery')).toBe('guide-discovery-title');
  });

  it('returns focus to the contents link the player came from', () => {
    const state = jumpToSection(toggleGuide(CLOSED_GUIDE), 'passport');
    expect(returnToContents(state)).toEqual({
      state: { open: true },
      focusId: guideContentsLinkId('passport'),
    });
  });

  it('returns to the first contents link when no section was chosen', () => {
    expect(returnToContents(toggleGuide(CLOSED_GUIDE)).focusId).toBe(
      guideContentsLinkId('destinations'),
    );
  });

  it('forgets the section when Escape closes the guide', () => {
    const state = jumpToSection(CLOSED_GUIDE, 'settings');
    expect(escapeGuide(state, true).state).toEqual(CLOSED_GUIDE);
  });
});
