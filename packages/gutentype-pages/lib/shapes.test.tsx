/*
 * ISC-5 (what can be checked without a real browser): key confidence and textinput error marks carry a shape as
 * well as a color. Key confidence is a bar along the key's bottom edge as long as the confidence (an inline style
 * from keybr-lesson-ui/lib/styles.ts); a missed character is underlined wavy and a stray one is struck through
 * (selectors in the Gutentype stylesheet, matched here against the markup Keybr's text input really renders).
 */
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { KeyLegend } from "@keybr/lesson-ui";
import { Attr, type LineList } from "@keybr/textinput";
import { StaticText } from "@keybr/textinput-ui";
import { render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { equal, isFalse, isNotNull, isTrue } from "rich-assert";
import { errorMarkSelectors } from "./marks.ts";

function legendStyle(confidence: number | null) {
  const r = render(
    <KeyLegend
      confidence={confidence}
      isIncluded={true}
      isFocused={false}
      isForced={false}
    />,
  );
  const span = r.container.querySelector("span");
  isNotNull(span);
  const style = {
    size: span.style.backgroundSize,
    image: span.style.backgroundImage,
  };
  r.unmount();
  return style;
}

test("key confidence draws a bar whose length is the confidence", () => {
  const slow = legendStyle(0.25);
  const fast = legendStyle(1);
  isTrue(slow.image.includes("gradient"), slow.image);
  isTrue(slow.size.startsWith("25%"), slow.size);
  isTrue(fast.size.startsWith("100%"), fast.size);
});

test("an uncalibrated key draws no bar", () => {
  equal(legendStyle(null).size, "");
});

/** The first character span Keybr renders for one letter with the given attrs. */
function charSpan(attrs: number): Element {
  const lines: LineList = {
    text: "a",
    lines: [{ text: "a", chars: [{ codePoint: 0x61, attrs }] }],
  };
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(<StaticText lines={lines} />);
  const span = [...host.querySelectorAll("span[style]")].find(
    (s) => s.textContent === "a" && /textinput/.test(s.getAttribute("style")!),
  );
  if (span == null) {
    throw new Error("Keybr rendered no character span");
  }
  return span;
}

test("a missed character is matched by the underline rule only", () => {
  const span = charSpan(Attr.Miss);
  isTrue(span.matches(errorMarkSelectors.miss));
  isFalse(span.matches(errorMarkSelectors.garbage));
});

test("a stray character is matched by the strike-through rule only", () => {
  const span = charSpan(Attr.Garbage);
  isTrue(span.matches(errorMarkSelectors.garbage));
  isFalse(span.matches(errorMarkSelectors.miss));
});

test("a correct character carries no error mark", () => {
  const span = charSpan(Attr.Hit);
  isFalse(span.matches(errorMarkSelectors.miss));
  isFalse(span.matches(errorMarkSelectors.garbage));
});

test("the stylesheet gives each selector a shape", () => {
  const less = readFileSync(
    new URL("./gutentype.less", import.meta.url),
    "utf-8",
  ).replace(/\s+/g, " ");
  for (const [selector, shape] of [
    [errorMarkSelectors.miss, "underline wavy"],
    [errorMarkSelectors.garbage, "line-through"],
  ] as const) {
    const at = less.indexOf(`${selector} {`);
    isTrue(at >= 0, selector);
    const block = less.slice(at, less.indexOf("}", at));
    isTrue(block.includes(shape), `${selector} -> ${shape}`);
  }
});
