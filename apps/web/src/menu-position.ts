/** Viewport coordinates for a body-level popup, independent of scroll-container clipping. */
export function placeMenu(
  anchor: { top: number; bottom: number; right: number },
  menu: { width: number; height: number },
  viewport: { width: number; height: number },
) {
  const margin = 8,
    gap = 6;
  const preferred =
    anchor.bottom + gap + menu.height <= viewport.height - margin
      ? anchor.bottom + gap
      : anchor.top - gap - menu.height;
  return {
    top: Math.max(
      margin,
      Math.min(preferred, viewport.height - menu.height - margin),
    ),
    left: Math.max(
      margin,
      Math.min(anchor.right - menu.width, viewport.width - menu.width - margin),
    ),
  };
}
