import { describe, expect, it } from 'vitest';
import {
  CLOSED_TOUR,
  TOUR_STEPS,
  WELCOME_TOUR_KEY,
  createTourMemory,
  isLastStep,
  nextStep,
  previousStep,
  startTour,
  stepLabel,
} from './welcome-tour';

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    items,
  };
}

describe('welcome tour', () => {
  it('has three steps: walking, the Guide and playing a booth', () => {
    expect(TOUR_STEPS.map((step) => step.title)).toEqual([
      'Walk the midway',
      'Open the Guide',
      'Play a booth',
    ]);
  });

  it('starts closed and opens at the first step', () => {
    expect(CLOSED_TOUR.open).toBe(false);
    expect(startTour()).toEqual({ open: true, step: 0 });
    expect(stepLabel(startTour())).toBe('Step 1 of 3');
  });

  it('goes forward and back, and closes after the last step', () => {
    const second = nextStep(startTour());
    expect(second).toEqual({ open: true, step: 1 });
    expect(previousStep(second)).toEqual({ open: true, step: 0 });
    expect(previousStep(startTour())).toEqual({ open: true, step: 0 });
    const last = nextStep(second);
    expect(isLastStep(last)).toBe(true);
    expect(stepLabel(last)).toBe('Step 3 of 3');
    expect(nextStep(last)).toEqual(CLOSED_TOUR);
  });

  it('leaves a closed tour closed', () => {
    expect(nextStep(CLOSED_TOUR)).toEqual(CLOSED_TOUR);
    expect(previousStep(CLOSED_TOUR)).toEqual(CLOSED_TOUR);
  });
});

describe('welcome tour memory', () => {
  it('is not dismissed until the visitor finishes or skips', () => {
    const storage = memoryStorage();
    const memory = createTourMemory(storage);
    expect(memory.dismissed()).toBe(false);
    memory.dismiss();
    expect(memory.dismissed()).toBe(true);
    expect([...storage.items.keys()]).toEqual([WELCOME_TOUR_KEY]);
  });

  it('reads unexpected values as not dismissed', () => {
    const storage = memoryStorage();
    storage.setItem(WELCOME_TOUR_KEY, '{"nope":1}');
    expect(createTourMemory(storage).dismissed()).toBe(false);
  });

  it('falls back quietly when storage is missing or throws', () => {
    const missing = createTourMemory(undefined);
    expect(missing.dismissed()).toBe(false);
    expect(() => missing.dismiss()).not.toThrow();

    const broken = createTourMemory({
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
    });
    expect(broken.dismissed()).toBe(false);
    expect(() => broken.dismiss()).not.toThrow();
  });
});
