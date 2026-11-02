/*
 * ISC-61 (the logic half): at 390 px with the on-screen keyboard open, the verse being typed stays above the
 * keyboard. The visual viewport is the part of the screen the keyboard leaves; keepVisible scrolls the page so the
 * typing box sits inside it. The pixel check on a real phone viewport is owed at integration.
 */
import { test } from "node:test";
import { equal } from "rich-assert";
import { keepVisible } from "./keep-visible.ts";

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
