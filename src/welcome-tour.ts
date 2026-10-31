/**
 * The optional welcome tour: three short steps that point at the ordinary
 * midway controls. It never opens by itself and never takes the keys. Whether
 * a visitor finished or skipped it is kept in this browser only, under its own
 * key, so it never touches scores or stamps.
 */
type TourStorage = Pick<Storage, 'getItem' | 'setItem'>;

export const WELCOME_TOUR_KEY = 'tessl-carnival:welcome-tour';

export interface TourStep {
  title: string;
  text: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    title: 'Walk the midway',
    text: 'Click the map, then walk with WASD or the arrow keys. Or click where you want to go and you find your own way there.',
  },
  {
    title: 'Open the Guide',
    text: 'The 🗺️ Guide button lists every booth, the Discovery trail, your Passport and the guide pages. Esc closes it again.',
  },
  {
    title: 'Play a booth',
    text: 'Walk up to a booth and its card opens. Press E, Enter or Space, or click Play. Esc brings you back to the midway.',
  },
];

/** Where the tour is: closed, or open at a step. */
export interface TourState {
  open: boolean;
  step: number;
}

export const CLOSED_TOUR: TourState = { open: false, step: 0 };

/** The tour from its first step, from the Start tour button or Help. */
export function startTour(): TourState {
  return { open: true, step: 0 };
}

/** The next step, or closed after the last one. */
export function nextStep(state: TourState): TourState {
  if (!state.open) return state;
  return state.step >= TOUR_STEPS.length - 1 ? CLOSED_TOUR : { open: true, step: state.step + 1 };
}

/** The step before, staying on the first. */
export function previousStep(state: TourState): TourState {
  if (!state.open) return state;
  return { open: true, step: Math.max(0, state.step - 1) };
}

export function isLastStep(state: TourState): boolean {
  return state.step >= TOUR_STEPS.length - 1;
}

/** The step's position, such as "Step 2 of 3". */
export function stepLabel(state: TourState): string {
  return `Step ${state.step + 1} of ${TOUR_STEPS.length}`;
}

export function createTourMemory(storage: TourStorage | undefined) {
  /**
   * Whether the visitor finished or skipped the tour. Missing, unreadable or
   * unexpected storage reads as not yet, so the small Start tour button shows.
   */
  function dismissed(): boolean {
    try {
      return storage?.getItem(WELCOME_TOUR_KEY) === 'dismissed';
    } catch {
      return false;
    }
  }

  /** Remembers the tour as done. A failed write is ignored: the button just stays. */
  function dismiss(): void {
    try {
      storage?.setItem(WELCOME_TOUR_KEY, 'dismissed');
    } catch {
      // Storage is full or blocked: nothing else depends on this.
    }
  }

  return { dismissed, dismiss };
}

function browserStorage(): TourStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export const tourMemory = createTourMemory(browserStorage());
