/**
 * The midway's scene: plain day, or a lantern-lit evening. It only changes how
 * the map looks, never scores, and is kept in this browser under its own key.
 */
export type Scene = 'day' | 'evening';

export const SCENE_KEY = 'tessl-carnival:scene';

type SceneStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function createScenePreference(storage: SceneStorage | undefined) {
  /** The saved scene. Missing, unreadable or unknown values read as day. */
  function load(): Scene {
    try {
      return storage?.getItem(SCENE_KEY) === 'evening' ? 'evening' : 'day';
    } catch {
      return 'day';
    }
  }

  /** Saves the scene, and returns whether the write worked. */
  function save(scene: Scene): boolean {
    try {
      if (!storage) return false;
      storage.setItem(SCENE_KEY, scene);
      return true;
    } catch {
      return false;
    }
  }

  return { load, save };
}

export function nextScene(scene: Scene): Scene {
  return scene === 'day' ? 'evening' : 'day';
}

/**
 * The scene toggle's state. The name stays "Lantern evening" in both scenes,
 * and `pressed` says whether evening is on, so the two never disagree.
 */
export function sceneToggleState(scene: Scene): { label: string; pressed: boolean } {
  return { label: '🏮 Lantern evening', pressed: scene === 'evening' };
}

/**
 * How bright a lantern glows, from 0.85 to 1. It breathes slowly and gently,
 * never flashes, and holds steady in quiet mode.
 */
export function lanternGlow(t: number, seed: number, quiet: boolean): number {
  if (quiet) return 1;
  return 0.925 + 0.075 * Math.sin(t * 0.8 + seed);
}

function browserStorage(): SceneStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export const scenePreference = createScenePreference(
  typeof window === 'undefined' ? undefined : browserStorage(),
);
