import { describe, expect, it } from 'vitest';
import {
  CLOSED_STORY,
  closeStory,
  escapeStory,
  LANDMARK_STORIES,
  openStory,
  storyStatus,
  unlockedStory,
} from './landmark-stories';
import type { LandmarkId } from './midway/discovery';

const IDS: LandmarkId[] = ['entrance', 'carousel', 'ferris-wheel'];

describe('landmark stories', () => {
  it('has a short story with a badge and a revisit nudge for every landmark', () => {
    for (const id of IDS) {
      const story = LANDMARK_STORIES[id];
      expect(story.id).toBe(id);
      expect(story.badge).not.toBe('');
      expect(story.title).not.toBe('');
      expect(story.lines.length).toBeGreaterThan(0);
      expect(story.lines.length).toBeLessThanOrEqual(4);
      expect(story.revisit).not.toBe('');
    }
  });

  it('keeps the words plain text, with no markup tags', () => {
    for (const story of Object.values(LANDMARK_STORIES)) {
      for (const text of [story.title, ...story.lines, story.revisit]) {
        expect(text).not.toMatch(/[<>]/);
      }
    }
  });

  it('keeps the copy short and free of typographic dashes', () => {
    for (const story of Object.values(LANDMARK_STORIES)) {
      for (const text of [story.title, ...story.lines, story.revisit]) {
        expect(text).not.toMatch(/[–—]/);
        expect(text.length).toBeLessThan(140);
      }
    }
  });

  it('unlocks a story only once its landmark is found', () => {
    expect(unlockedStory('carousel', [])).toBeUndefined();
    expect(unlockedStory('carousel', ['entrance'])).toBeUndefined();
    expect(unlockedStory('carousel', ['entrance', 'carousel'])).toBe(LANDMARK_STORIES.carousel);
  });

  it('invites discovery for unfound landmarks without claiming a find', () => {
    expect(storyStatus('Carousel', 'carousel', [])).toBe('Find the Carousel to unlock its story.');
    expect(storyStatus('Carousel', 'carousel', ['carousel'])).toBe('Read the Carousel story');
  });

  it('opens only found landmarks, and leaves finds alone', () => {
    const found: LandmarkId[] = ['entrance'];
    expect(openStory(CLOSED_STORY, 'ferris-wheel', found)).toBe(CLOSED_STORY);
    expect(openStory(CLOSED_STORY, 'entrance', found)).toEqual({ open: 'entrance' });
    expect(found).toEqual(['entrance']);
  });

  it('opens and closes again and again', () => {
    const found: LandmarkId[] = ['entrance', 'carousel'];
    let state = CLOSED_STORY;
    for (let i = 0; i < 3; i++) {
      state = openStory(state, 'carousel', found);
      expect(state.open).toBe('carousel');
      state = openStory(state, 'entrance', found);
      expect(state.open).toBe('entrance');
      state = closeStory();
      expect(state.open).toBeUndefined();
    }
  });

  it('closes on Escape, and restores focus only from inside the card', () => {
    const open = openStory(CLOSED_STORY, 'carousel', ['carousel']);
    expect(escapeStory(open, true)).toEqual({
      state: CLOSED_STORY,
      handled: true,
      restoreFocus: true,
    });
    expect(escapeStory(open, false)).toEqual({
      state: CLOSED_STORY,
      handled: true,
      restoreFocus: false,
    });
  });

  it('leaves Escape alone when no card is open', () => {
    expect(escapeStory(CLOSED_STORY, false)).toEqual({
      state: CLOSED_STORY,
      handled: false,
      restoreFocus: false,
    });
  });
});
