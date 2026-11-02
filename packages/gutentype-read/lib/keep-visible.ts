import { type RefObject, useEffect } from "react";

type ViewportLike = Pick<VisualViewport, "offsetTop" | "height">;

/**
 * Scrolls the page so `element` sits inside the visual viewport, which on a phone is the part of the screen above
 * the on-screen keyboard (ISC-61). Returns the distance scrolled (0 when it already fits).
 */
export function keepVisible(
  element: Element | null,
  viewport: ViewportLike | null = globalThis.visualViewport ?? null,
  scrollBy: (dy: number) => void = (dy) => window.scrollBy(0, dy),
  margin = 12,
): number {
  if (element == null || viewport == null) return 0;
  const rect = element.getBoundingClientRect();
  const top = viewport.offsetTop + margin;
  const bottom = viewport.offsetTop + viewport.height - margin;
  if (rect.top >= top && rect.bottom <= bottom) return 0;
  // Short enough to fit: line its bottom up with the visible bottom (or its top with the visible top when it is
  // above). Taller than the visible area: show its top, where the typing starts.
  const fits = rect.height <= bottom - top;
  const dy =
    fits && rect.bottom > bottom ? rect.bottom - bottom : rect.top - top;
  if (dy !== 0) scrollBy(dy);
  return dy;
}

/** Keeps the element visible whenever the visual viewport changes size (the keyboard opening or closing). */
export function useKeepVisible(
  ref: RefObject<Element | null>,
  enabled: boolean,
): void {
  useEffect(() => {
    const viewport = globalThis.visualViewport;
    if (!enabled || viewport == null) return;
    const handleResize = () => {
      keepVisible(ref.current, viewport);
    };
    viewport.addEventListener("resize", handleResize);
    return () => {
      viewport.removeEventListener("resize", handleResize);
    };
  }, [ref, enabled]);
}
