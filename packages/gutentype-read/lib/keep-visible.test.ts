/*
 * ISC-61 (the logic half): at 390 px with the on-screen keyboard open, the verse being typed stays above the
 * keyboard. The visual viewport is the part of the screen the keyboard leaves; keepVisible scrolls the page so the
 * typing box sits inside it. The pixel check on a real phone viewport is owed at integration.
 */
import { test } from "node:test";
import { equal } from "rich-assert";
import { keepVisible, lastTypedChar } from "./keep-visible.ts";

function box(top: number, height: number): Element {
  return {
    getBoundingClientRect: () =>
      ({ top, bottom: top + height, height, left: 0, right: 390 }) as DOMRect,
  } as Element;
}

// An iPhone-sized layout viewport of 844 px with the keyboard open: 390 px of it still visible.
const keyboardOpen = { offsetTop: 0, height: 390 };

test("a typing box hidden under the keyboard is scrolled up until its bottom clears the keyboard", () => {
  const scrolled: number[] = [];
  const dy = keepVisible(box(500, 120), keyboardOpen, (d) => scrolled.push(d));
  // Visible bottom is 390 - 12 margin = 378; the box bottom 620 moves up by 242.
  equal(dy, 242);
  equal(scrolled.length, 1);
  equal(scrolled[0], 242);
  // After the scroll the box sits at 258..378, inside the visible part.
  const after = box(500 - dy, 120).getBoundingClientRect();
  equal(after.bottom <= keyboardOpen.height - 12, true);
  equal(after.top >= 12, true);
});

test("a box already above the keyboard does not move", () => {
  const scrolled: number[] = [];
  equal(
    keepVisible(box(100, 120), keyboardOpen, (d) => scrolled.push(d)),
    0,
  );
  equal(scrolled.length, 0);
});

test("a box scrolled off the top comes back down to the visible top", () => {
  const dy = keepVisible(box(-200, 120), keyboardOpen, () => {});
  equal(dy, -212);
});

test("a box taller than the visible part shows its top, where typing starts", () => {
  const dy = keepVisible(box(300, 500), keyboardOpen, () => {});
  equal(dy, 288);
});

test("the visual viewport's own offset is honoured (iOS pans it instead of the page)", () => {
  const dy = keepVisible(
    box(700, 100),
    { offsetTop: 300, height: 390 },
    () => {},
  );
  // Visible band is 312..678; the box bottom 800 rises by 122.
  equal(dy, 122);
});

test("no viewport (an old browser) or no element: nothing happens", () => {
  equal(
    keepVisible(null, keyboardOpen, () => {}),
    0,
  );
  equal(
    keepVisible(box(500, 100), null, () => {}),
    0,
  );
});

// Review finding (2026-11-02): a verse taller than the space above the keyboard (Esther 8:9 on a phone) was
// scrolled back to its top on every keystroke, hiding the line being typed. With the caret known, the caret's
// line is what stays visible.
test("a tall verse keeps the caret's line visible, not its top", () => {
  const scrolled: number[] = [];
  // Box from 12 to 912 (900 tall); caret line at 600..630, below the 378 visible bottom.
  const dy = keepVisible(
    box(12, 900),
    keyboardOpen,
    (d) => scrolled.push(d),
    12,
    box(600, 30),
  );
  equal(dy, 630 - 378);
  equal(scrolled.length, 1);
});

test("a tall verse whose caret is already visible does not move", () => {
  const scrolled: number[] = [];
  // Box top is far above the screen; the caret line sits at 200..230, inside the visible part.
  const dy = keepVisible(
    box(-500, 900),
    keyboardOpen,
    (d) => scrolled.push(d),
    12,
    box(200, 30),
  );
  equal(dy, 0);
  equal(scrolled.length, 0);
});

test("lastTypedChar finds the last character carrying Keybr's hit or miss color", () => {
  const spans = [
    { style: "color: var(--textinput--hit__color);", id: 1 },
    { style: "color: var(--textinput--miss__color);", id: 2 },
    { style: "", id: 3 },
  ].map(({ style, id }) => ({
    id,
    getAttribute: (n: string) => (n === "style" ? style : null),
  }));
  const root = { querySelectorAll: () => spans } as unknown as Element;
  equal((lastTypedChar(root) as unknown as { id: number }).id, 2);
  equal(lastTypedChar(null), null);
});
