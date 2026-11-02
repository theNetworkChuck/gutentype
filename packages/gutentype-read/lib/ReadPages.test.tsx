/*
 * The Read pages rendered in jsdom on Keybr's own providers: the book list (ISC-13), a chapter typed verse by verse
 * through Keybr's TextArea with the row recorded on the last key (ISC-14, ISC-15), resume on the next untyped verse
 * (ISC-16), omitted verses (ISC-14), done marks as a glyph plus a word (ISC-17, ISC-5), rolled-up stats (ISC-59),
 * the share page (ISC-18) and the Learn offer (ISC-38). Real-browser checks still follow at integration.
 */
import { afterEach, beforeEach, test } from "node:test";
import { loadBook, Pack } from "@gutentype/content";
import { FakeIntlProvider } from "@keybr/intl";
import { FakeSettingsContext } from "@keybr/settings";
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { equal, includes, isNotNull, isNull, isTrue } from "rich-assert";
import { NextVerseOffer } from "./pages/NextVerseOffer.tsx";
import { ReadBookPage } from "./pages/ReadBookPage.tsx";
import { ReadChapterPage } from "./pages/ReadChapterPage.tsx";
import { ReadIndexPage } from "./pages/ReadIndexPage.tsx";
import { SharePage } from "./pages/SharePage.tsx";
import { IdbReadRows } from "./progress/local.ts";
import { type VerseRow } from "./progress/rows.ts";
import { readProgress } from "./progress/store.ts";

function app(path: string): ReturnType<typeof render> {
  return render(
    <FakeIntlProvider>
      <FakeSettingsContext>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/" element={<NextVerseOffer />} />
            <Route path="/read" element={<ReadIndexPage />} />
            <Route path="/read/:book" element={<ReadBookPage />} />
            <Route path="/read/:book/:chapter" element={<ReadChapterPage />} />
            <Route path="/share" element={<SharePage />} />
          </Routes>
        </MemoryRouter>
      </FakeSettingsContext>
    </FakeIntlProvider>,
  );
}

const row = (chapter: number, verse: number, speed = 250): VerseRow => ({
  pack: "bsb",
  book: "john",
  chapter,
  verse,
  speed,
  accuracy: 0.98,
  ts: Date.now(),
});

let saved: typeof fetch;

test.before(async () => {
  await new IdbReadRows().clear();
});

beforeEach(async () => {
  await readProgress.load("bsb");
  saved = globalThis.fetch;
  globalThis.fetch = (async () => new Response(null, { status: 204 })) as any;
});

afterEach(async () => {
  cleanup();
  await readProgress.settled();
  globalThis.fetch = saved;
});

test("/read lists every book with chapters done, John first", async () => {
  const r = app("/read");
  const list = r.getByRole("list", { name: "Books" });
  const items = within(list).getAllByRole("listitem");
  equal(items.length, Pack.BSB.info.books.length);
  equal(items.length, 66);
  includes(items[0].textContent!, "John");
  includes(items[0].textContent!, "Featured");
  includes(items[0].textContent!, "of 21 chapters done");
  includes(items[1].textContent!, "Genesis");
  includes(r.container.textContent!, "Berean Standard Bible (BSB)");
});

test("a chapter is typed verse by verse; the last key records the row and moves on", async () => {
  const r = app("/read/john/1");
  const box = await r.findByRole("textbox", { name: "Verse" });
  const active = r.container.querySelector("[data-gt-active-verse]")!;
  equal(active.getAttribute("data-gt-active-verse"), "1");

  // The other verses are listed with their numbers, as stored.
  const john = await loadBook(Pack.BSB, "john");
  const v2 = r.container.querySelector('[data-gt-verse="2"]')!;
  includes(v2.textContent!, "2");
  includes(v2.textContent!, john.chapters[0][1]);

  // No clock anywhere on the page.
  isNull(r.container.querySelector('[role="timer"]'));
  equal(
    /\d+:\d{2}(?!\d)/.test(
      r.container.textContent!.replace(/John \d+:\d+/g, ""),
    ),
    false,
  );

  const text = john.chapters[0][0];
  let t = 1000;
  for (const char of text) {
    t += 90;
    act(() => {
      fireEvent(
        box,
        new InputEvent("input", { inputType: "insertText", data: char }),
      );
    });
  }
  const rows = readProgress.rows("bsb").filter((x) => x.book === "john");
  equal(rows.length, 1);
  equal(rows[0].verse, 1);
  isTrue(rows[0].accuracy === 1);

  // Verse 1 now shows as typed (a glyph and a word) and verse 2 is being typed.
  await waitFor(() => {
    equal(
      r.container
        .querySelector("[data-gt-active-verse]")!
        .getAttribute("data-gt-active-verse"),
      "2",
    );
  });
  const v1 = r.container.querySelector('[data-gt-verse="1"]')!;
  equal(v1.getAttribute("data-gt-state"), "typed");
  includes(v1.textContent!, "✓");
  includes(v1.textContent!, "Typed");
  includes(v1.textContent!, "wpm");
  includes(r.container.textContent!, "1 of 51 verses typed");
});

test("returning to a chapter puts the cursor on the next untyped verse", async () => {
  for (const v of [2, 3]) readProgress.record(row(1, v));
  const r = app("/read/john/1");
  await r.findByRole("textbox", { name: "Verse" });
  equal(
    r.container
      .querySelector("[data-gt-active-verse]")!
      .getAttribute("data-gt-active-verse"),
    "4",
  );
});

test("an omitted verse is shown as not in this translation and skipped", async () => {
  for (const v of [1, 2, 3]) readProgress.record(row(5, v));
  const r = app("/read/john/5");
  await r.findByRole("textbox", { name: "Verse" });
  const v4 = r.container.querySelector('[data-gt-verse="4"]')!;
  equal(v4.getAttribute("data-gt-state"), "omitted");
  includes(v4.textContent!, "Not in this translation");
  isNull(v4.querySelector("button"));
  equal(
    r.container
      .querySelector("[data-gt-active-verse]")!
      .getAttribute("data-gt-active-verse"),
    "5",
  );
});

test("a completed chapter shows as done on the book page, with the book's speed and accuracy", async () => {
  const count = Pack.BSB.book("john")!.chapters[0];
  for (let v = 1; v <= count; v++) readProgress.record(row(1, v, 300));
  const r = app("/read/john");
  const chapters = r.getByRole("list", { name: "Chapters" });
  const first = within(chapters).getAllByRole("listitem")[0];
  equal(first.getAttribute("data-gt-done"), "true");
  includes(first.textContent!, "✓");
  includes(first.textContent!, "Done");
  const second = within(chapters).getAllByRole("listitem")[1];
  includes(second.textContent!, "Not started");
  includes(r.container.textContent!, "1 of 21 chapters done");
  includes(r.container.textContent!, "Speed");
  includes(r.container.textContent!, "wpm");
  includes(r.container.textContent!, "Accuracy");

  // The chapter page agrees, and offers the next chapter.
  cleanup();
  const c = app("/read/john/1");
  await waitFor(() => isNotNull(c.queryByRole("status")));
  includes(c.getByRole("status").textContent!, "John 1 is done.");
  isNull(c.container.querySelector("[data-gt-active-verse]"));
});

test("the share page shows the card from the URL's fields, or says the link is incomplete", () => {
  const r = app("/share?pack=bsb&book=john&wpm=61&acc=97&date=2026-11-02");
  const card = r.getByRole("region", { name: "Book finished" });
  includes(card.textContent!, "John");
  includes(card.textContent!, "Berean Standard Bible (BSB)");
  includes(card.textContent!, "61 wpm");
  includes(card.textContent!, "97% accuracy");
  includes(card.textContent!, "November 2, 2026");
  cleanup();
  const bad = app("/share?pack=bsb&book=john");
  includes(bad.container.textContent!, "missing something");
});

test("Learn's offer links to the next untyped verse of John", async () => {
  const r = app("/");
  const link = await r.findByRole("link");
  includes(link.textContent!, "Next verse to type: John 2:1");
  equal(link.getAttribute("href"), "/read/john/2");
});

test.after(async () => {
  await readProgress.settled();
  await new IdbReadRows().clear();
});
