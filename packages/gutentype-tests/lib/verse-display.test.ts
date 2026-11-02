/*
 * ISC-19: verse text shown for typing is byte-identical to the pack's stored text, for a 50-verse random sample per
 * pack. "Stored" is read straight off disk (the pack's book JSON), not through the loader the page uses, so a
 * loader or page that altered text would be caught. "Shown for typing" is the text the chapter page lists
 * (`chapterVerses`) and the exact characters Keybr's TextInput is given (`VerseSession`).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { loadBook, Pack } from "@gutentype/content";
import { flattenStyledText, textInputSettings } from "@keybr/textinput";
import { equal, isTrue } from "rich-assert";
import { read } from "./read-lane.ts";

const { chapterVerses, VerseSession } = read;

const packsDir = resolve(
  import.meta.dirname,
  "../../gutentype-content/lib/packs",
);

function storedBook(pack: Pack, bookId: string): string[][] {
  const file = resolve(packsDir, pack.id, "books", `${bookId}.json`);
  return JSON.parse(readFileSync(file, "utf-8")).chapters;
}

/** A small deterministic generator, so a failure names the same verses every run. */
function lcg(seed: number) {
  let state = seed >>> 0;
  return (n: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state % n;
  };
}

function sample(pack: Pack, count: number, seed: number) {
  const next = lcg(seed);
  const picks: { book: string; chapter: number; verse: number }[] = [];
  const seen = new Set<string>();
  while (picks.length < count) {
    const book = pack.info.books[next(pack.info.books.length)];
    const chapter = next(book.chapters.length) + 1;
    const verse = next(book.chapters[chapter - 1]) + 1;
    const key = `${book.id} ${chapter}:${verse}`;
    if (seen.has(key) || pack.isOmitted(book.id, chapter, verse)) continue;
    seen.add(key);
    picks.push({ book: book.id, chapter, verse });
  }
  return picks;
}

const utf8 = (s: string) => Buffer.from(s, "utf-8");

for (const pack of [Pack.BSB, Pack.KJV]) {
  test(`${pack.id}: 50 sampled verses are offered for typing byte for byte as stored`, async () => {
    const picks = sample(pack, 50, 20261102);
    let identical = 0;
    for (const { book, chapter, verse } of picks) {
      const stored = storedBook(pack, book)[chapter - 1][verse - 1];
      isTrue(stored.length > 0);
      const text = await loadBook(pack, book);
      const shown = chapterVerses(text, pack, chapter).find(
        (v) => v.verse === verse,
      )!;
      equal(shown.omitted, false);
      equal(Buffer.compare(utf8(shown.text), utf8(stored)), 0);

      const session = new VerseSession(
        { pack: pack.id, book, chapter, verse },
        shown.text,
        textInputSettings,
      );
      const offered = flattenStyledText(session.textInput.text);
      const typedChars = Array.from(
        { length: session.textInput.length },
        (_, i) => String.fromCodePoint(session.textInput.at(i).codePoint),
      ).join("");
      equal(Buffer.compare(utf8(offered), utf8(stored)), 0);
      equal(Buffer.compare(utf8(typedChars), utf8(stored)), 0);
      identical += 1;
    }
    equal(identical, 50);
  });
}

test("every verse of a chapter is listed in order with its number; omitted verses are marked, never offered", async () => {
  const john = await loadBook(Pack.BSB, "john");
  const verses = chapterVerses(john, Pack.BSB, 5);
  equal(verses.length, Pack.BSB.book("john")!.chapters[4]);
  verses.forEach((v, i) => equal(v.verse, i + 1));
  const omitted = verses.filter((v) => v.omitted);
  equal(omitted.length, 1);
  equal(omitted[0].verse, 4);
  equal(omitted[0].text, "");

  const kjv = chapterVerses(await loadBook(Pack.KJV, "john"), Pack.KJV, 5);
  equal(kjv.filter((v) => v.omitted).length, 0);
  equal(chapterVerses(john, Pack.BSB, 99).length, 0);
});
