/**
 * ISC-5: the selectors `gutentype.less` uses to give Keybr's textinput error marks a shape. They match the inline
 * style Keybr's `textinput-ui/lib/styles.ts` puts on each character (`Miss` sets only the miss color, `Garbage`
 * sets the miss color as a background), so Keybr's own chars test keeps its pinned styles.
 */
export const errorMarkSelectors = {
  /** A character typed wrong: wavy underline. */
  miss: 'span[style*="--textinput--miss__color"]:not([style*="background"])',
  /** A stray character typed past the text: struck through. */
  garbage: 'span[style*="--textinput--miss__color"][style*="background"]',
} as const;
