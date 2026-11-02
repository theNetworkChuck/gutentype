// ISC-73, the passage underneath each Typing Test: a random starting verse that is never an omitted one, a run
// that crosses chapter and book ends and skips omitted verses, and Keybr's generator contract (mark and reset).
/* eslint-disable n/no-extraneous-import -- dependency line for @gutentype/typing-test listed for the integrator */
import { test } from "node:test";
import { type BookText, loadBook, Pack } from "@gutentype/content";
import {
  collectPassage,
  PassageGenerator,
  passageMinWords,
  pickStart,
  verseWords,
} from "@gutentype/typing-test/lib/passage.ts";
import { deepEqual, equal, isTrue, throws } from "rich-assert";

async function verse(
  pack: Pack,
  book: string,
  c: number,
  v: number,
): Promise<string[]> {
  return verseWords((await loadBook(pack, book)).chapters[c - 1][v - 1]);
}

test("verse words are the stored text split on whitespace; an omitted verse has none", () => {
  deepEqual(verseWords("“Come,” He said—“follow Me.”"), [
    "“Come,”",
    "He",
    "said—“follow",
    "Me.”",
  ]);
  deepEqual(verseWords(""), []);
  deepEqual(verseWords("  a \n b  "), ["a", "b"]);
});

test("pickStart covers every verse of a book with text exactly once, and never an omitted verse", () => {
  // Matthew holds three of BSB's omitted verses (17:21, 18:11, 23:14).
  const pack = Pack.BSB;
  const book = pack.book("matthew")!;
  const total = book.chapters.reduce((a, b) => a + b, 0);
  const candidates = total - 3;
  const seen = new Set<string>();
  for (let i = 0; i < candidates; i++) {
    const ref = pickStart(pack, "matthew", () => (i + 0.5) / candidates);
    equal(ref.book, "matthew");
    isTrue(
      !pack.isOmitted(ref.book, ref.chapter, ref.verse),
      `picked omitted ${ref.chapter}:${ref.verse}`,
    );
    seen.add(`${ref.chapter}:${ref.verse}`);
  }
  equal(seen.size, candidates);
  for (const omitted of ["17:21", "18:11", "23:14"]) isTrue(!seen.has(omitted));
});

test("pickStart over the whole pack reaches its first and last verse", () => {
  deepEqual(
    pickStart(Pack.KJV, null, () => 0),
    { book: "genesis", chapter: 1, verse: 1 },
  );
  deepEqual(
    pickStart(Pack.KJV, null, () => 0.999999999),
    { book: "revelation", chapter: 22, verse: 21 },
  );
  deepEqual(
    pickStart(Pack.BSB, null, () => 0.999999999),
    { book: "revelation", chapter: 22, verse: 21 },
  );
});

test("pickStart refuses a book the pack does not have", () => {
  throws(() => pickStart(Pack.BSB, "alice", () => 0.5));
});

test("a passage skips an omitted verse: Matthew 17:20 runs straight on to 17:22", async () => {
  const pack = Pack.BSB;
  const v20 = await verse(pack, "matthew", 17, 20);
  const v22 = await verse(pack, "matthew", 17, 22);
  const p = await collectPassage(
    pack,
    { book: "matthew", chapter: 17, verse: 20 },
    v20.length + 1,
  );
  deepEqual(p.words, [...v20, ...v22]);
});

test("a passage crosses a chapter end and a book end: Malachi 4:6 runs on to Matthew 1:1", async () => {
  for (const pack of [Pack.BSB, Pack.KJV]) {
    const last = await verse(pack, "malachi", 4, 6);
    const next = await verse(pack, "matthew", 1, 1);
    const p = await collectPassage(
      pack,
      { book: "malachi", chapter: 4, verse: 6 },
      last.length + 1,
    );
    deepEqual(p.words, [...last, ...next]);
    const c3 = await verse(pack, "malachi", 3, 18);
    const c4 = await verse(pack, "malachi", 4, 1);
    deepEqual(
      (
        await collectPassage(
          pack,
          { book: "malachi", chapter: 3, verse: 18 },
          c3.length + 1,
        )
      ).words,
      [...c3, ...c4],
    );
  }
});

test("a passage after Revelation 22:21 continues at Genesis 1:1", async () => {
  const pack = Pack.KJV;
  const last = await verse(pack, "revelation", 22, 21);
  const first = await verse(pack, "genesis", 1, 1);
  const p = await collectPassage(
    pack,
    { book: "revelation", chapter: 22, verse: 21 },
    last.length + 1,
  );
  deepEqual(p.words, [...last, ...first]);
});

test("a passage ends on a verse end with at least the minimum words", async () => {
  const p = await collectPassage(Pack.BSB, {
    book: "john",
    chapter: 1,
    verse: 1,
  });
  isTrue(p.words.length >= passageMinWords);
  isTrue(
    p.words.length < passageMinWords + 200,
    "a passage overshoots by more than one verse",
  );
});

test("a pack smaller than the minimum yields each verse once and stops at the start", async () => {
  // A two-book pack: the passage runs from the second book through the first and stops before repeating.
  const tiny: BookText[] = [
    { id: "genesis", name: "Genesis", chapters: [["a b", ""], ["c"]] },
    { id: "exodus", name: "Exodus", chapters: [["d e"]] },
  ];
  const pack = {
    id: "tiny",
    info: {
      books: tiny.map((b) => ({
        id: b.id,
        name: b.name,
        chapters: b.chapters.map((c) => c.length),
      })),
    },
  } as unknown as Pack;
  const load = async (_: Pack, id: string) => tiny.find((b) => b.id === id)!;
  const p = await collectPassage(
    pack,
    { book: "genesis", chapter: 2, verse: 1 },
    1000,
    load,
  );
  deepEqual(p.words, ["c", "d", "e", "a", "b"]);
});

test("a book that loads as the wrong shape fails loudly", async () => {
  const load = async () =>
    ({ id: "exodus", name: "Exodus", chapters: [] }) as BookText;
  let failed = false;
  try {
    await collectPassage(
      Pack.BSB,
      { book: "genesis", chapter: 1, verse: 1 },
      10,
      load,
    );
  } catch (err) {
    failed = String(err).includes("did not load as BookText");
  }
  isTrue(failed);
});

test("the generator follows Keybr's contract: mark, reset, and a start-over past the passage end", () => {
  const g = new PassageGenerator({
    pack: Pack.BSB,
    start: { book: "john", chapter: 11, verse: 35 },
    words: ["Jesus", "wept."],
  });
  equal(g.nextWord(), "Jesus");
  const m = g.mark();
  equal(g.nextWord(), "wept.");
  equal(g.nextWord(), "Jesus");
  g.reset(m);
  equal(g.nextWord(), "wept.");
  throws(
    () =>
      new PassageGenerator({
        pack: Pack.BSB,
        start: { book: "john", chapter: 1, verse: 1 },
        words: [],
      }),
  );
});
