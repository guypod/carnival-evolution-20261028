/** Elements that take keys themselves: links, buttons, form fields and the like. */
export const CONTROL_SELECTOR = 'a, button, input, textarea, select, summary, [contenteditable]';

/**
 * Whether a key event's target is a control, so the midway leaves its keys
 * alone: no walking or playing while someone types in a field or tabs
 * through the guide.
 */
export function isControl(target: EventTarget | null): boolean {
  const closest = (target as { closest?: (selector: string) => unknown } | null)?.closest;
  return typeof closest === 'function' && closest.call(target, CONTROL_SELECTOR) != null;
}
