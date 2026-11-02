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
  caret: Element | null = null,
): number {
  if (element == null || viewport == null) return 0;
  const rect = element.getBoundingClientRect();
  const top = viewport.offsetTop + margin;
  const bottom = viewport.offsetTop + viewport.height - margin;
  if (rect.top >= top && rect.bottom <= bottom) return 0;
  // Short enough to fit: line its bottom up with the visible bottom (or its top with the visible top when it is
  // above). Taller than the visible area: keep the caret's line visible (a long verse on a phone), or show the
  // top, where typing starts, when no character is typed yet.
  const fits = rect.height <= bottom - top;
  let dy: number;
  if (fits) {
    dy = rect.bottom > bottom ? rect.bottom - bottom : rect.top - top;
  } else if (caret != null) {
    const c = caret.getBoundingClientRect();
    dy = c.bottom > bottom ? c.bottom - bottom : c.top < top ? c.top - top : 0;
  } else {
    dy = rect.top - top;
  }
  if (dy !== 0) scrollBy(dy);
  return dy;
}

/**
 * The last character typed so far in a Keybr text area: Keybr colors each typed character inline with its hit or
 * miss variable (the same inline styles gutentype-pages' error-mark shapes select on). Null before the first key.
 */
export function lastTypedChar(root: Element | null): Element | null {
  if (root == null) return null;
  let last: Element | null = null;
  for (const span of root.querySelectorAll("span")) {
    const style = span.getAttribute("style") ?? "";
    if (
      style.includes("--textinput--hit__color") ||
      style.includes("--textinput--miss__color")
    )
      last = span;
  }
  return last;
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
      keepVisible(
        ref.current,
        viewport,
        undefined,
        undefined,
        lastTypedChar(ref.current),
      );
    };
    viewport.addEventListener("resize", handleResize);
    return () => {
      viewport.removeEventListener("resize", handleResize);
    };
  }, [ref, enabled]);
}
