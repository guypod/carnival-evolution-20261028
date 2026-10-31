// How tall the waterside stack (the way back, the chime stones, the ferry and,
// on narrow screens, the walk line) may grow: from the bottom inset up to just
// under the top controls, so Help, Guide, Photo and the map view stay
// reachable. Anything taller scrolls inside the stack instead of covering them.
export function watersideMaxHeight(
  containerHeight: number,
  controlsBottom: number,
  bottomInset: number,
  gap = 8,
): number {
  return Math.max(0, Math.floor(containerHeight - controlsBottom - bottomInset - gap));
}

// Whether the stack needs its own scrolling, given its content's full height.
export function watersideOverflows(contentHeight: number, maxHeight: number): boolean {
  return contentHeight > maxHeight;
}
