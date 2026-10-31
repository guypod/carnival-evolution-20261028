/**
 * A shared, bounded save slot for creative tools that want their work to
 * survive a reload. A tool never touches local storage itself: it hands this
 * module a key, a validator and a size limit, and gets back load and save.
 */

export type SaveStorage = Pick<Storage, 'getItem' | 'setItem'>;

export interface SaveSlotOptions<T> {
  /** The storage key. Every slot's key starts with `tessl-carnival:`. */
  key: string;
  /** The longest saved string this slot reads or writes. */
  maxLength: number;
  /** Turns parsed JSON back into a value, or undefined when it is not a valid one. */
  parse: (value: unknown) => T | undefined;
}

export interface SaveSlot<T> {
  /** The saved value. Missing, unreadable, oversized or malformed saves read as none. */
  load(): T | undefined;
  /** Saves the value, and returns whether the write worked. It never throws. */
  save(value: T): boolean;
}

export function createSaveSlot<T>(
  storage: SaveStorage | undefined,
  { key, maxLength, parse }: SaveSlotOptions<T>,
): SaveSlot<T> {
  if (!key.startsWith('tessl-carnival:')) throw new Error(`Save keys start with tessl-carnival:`);
  return {
    load() {
      try {
        const raw = storage?.getItem(key);
        if (typeof raw !== 'string' || raw.length > maxLength) return undefined;
        return parse(JSON.parse(raw));
      } catch {
        return undefined;
      }
    },
    save(value) {
      try {
        if (!storage) return false;
        const raw = JSON.stringify(value);
        if (typeof raw !== 'string' || raw.length > maxLength) return false;
        storage.setItem(key, raw);
        return true;
      } catch {
        return false;
      }
    },
  };
}

/** The browser's local storage, or undefined when there is none or it is blocked. */
export function browserSaveStorage(): SaveStorage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}
