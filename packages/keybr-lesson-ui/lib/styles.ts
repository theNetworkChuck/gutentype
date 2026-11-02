import { mixColors, parseColor } from "@keybr/color";
import { useComputedStyles } from "@keybr/themes";
import { type CSSProperties, useMemo } from "react";

export function useKeyStyles() {
  const { getPropertyValue } = useComputedStyles();
  const slow = getPropertyValue("--slow-key-color") || "#cc0000";
  const fast = getPropertyValue("--fast-key-color") || "#60d788";

  return useMemo(() => {
    const min = parseColor(slow);
    const max = parseColor(fast);

    function confidenceColor(confidence: number) {
      return mixColors(min, max, confidence);
    }

    function keyStyles(
      isIncluded: boolean,
      confidence: number | null,
    ): CSSProperties {
      if (isIncluded && confidence != null) {
        return {
          backgroundColor: String(confidenceColor(confidence)),
          ...confidenceBar(confidence), // Gutentype: a shape, not color alone.
        };
      } else {
        return {};
      }
    }

    return { confidenceColor, keyStyles };
  }, [slow, fast]);
}

/**
 * Gutentype (ISC-5): a bar along the key's bottom edge as long as the confidence, so a slow key and a fast key
 * differ in shape as well as in color.
 */
function confidenceBar(confidence: number): CSSProperties {
  const percent = Math.round(Math.min(Math.max(confidence, 0), 1) * 100);
  return {
    backgroundImage: "linear-gradient(currentColor, currentColor)",
    backgroundSize: `${percent}% 0.2em`,
    backgroundPosition: "left bottom",
    backgroundRepeat: "no-repeat",
  };
}
