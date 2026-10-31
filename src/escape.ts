/**
 * Calls `onEscape` when Escape is pressed on `target`, and returns a function
 * that removes the listener again.
 */
export function onEscapeKey(target: EventTarget, onEscape: () => void): () => void {
  const onKeyDown = (event: Event) => {
    if ((event as KeyboardEvent).key === 'Escape') onEscape();
  };
  target.addEventListener('keydown', onKeyDown);
  return () => target.removeEventListener('keydown', onKeyDown);
}
