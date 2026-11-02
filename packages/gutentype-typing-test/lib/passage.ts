import { type BookText, loadBook, type Pack } from "@gutentype/content";
import { type TextGenerator } from "@keybr/page-typing-test/lib/generators/types.ts";
import { type RNG } from "@keybr/rand";

/** A verse of a pack; `chapter` and `verse` count from 1. */
export type VerseRef = {
  readonly book: string;
  readonly chapter: number;
  readonly verse: number;
};

/** The words of one typing test: consecutive verse text from `start`, verse after verse. */
export type Passage = {
  readonly pack: Pack;
  readonly start: VerseRef;
  readonly words: readonly string[];
};

/**
 * Words gathered per test. Keybr's longest offered test is 1000 characters or one minute (about 1500 characters
 * at 300 wpm), and it lays out five lines ahead; 2000 words is over 10,000 characters, five times that.
 */
export const passageMinWords = 2000;

/** A verse's words exactly as stored, split on whitespace; an omitted verse ("") has none. */
export function verseWords(text: string): string[] {
  const trimmed = text.trim();
  return trimmed.length === 0 ? [] : trimmed.split(/\s+/);
}

/**
 * A random starting verse, uniform over the verses the pack has text for: in book `bookId`, or in the whole pack
 * when `bookId` is null. Omitted verses are never chosen.
 */
export function pickStart(
  pack: Pack,
  bookId: string | null,
  random: RNG,
): VerseRef {
  const books =
    bookId == null
      ? pack.info.books
      : pack.info.books.filter((b) => b.id === bookId);
  if (books.length === 0) {
    throw new Error(`pack ${pack.id} has no book ${bookId}`);
  }
  let total = 0;
  for (const book of books) {
    for (const count of book.chapters) total += count;
  }
  const omitted = pack.info.omitted.filter(
    (ref) => bookId == null || ref.startsWith(`${bookId} `),
  ).length;
  const candidates = total - omitted;
  if (candidates <= 0) {
    throw new Error(
      `pack ${pack.id} has no verse text in ${bookId ?? "any book"}`,
    );
  }
  let n = Math.min(Math.floor(random() * candidates), candidates - 1);
  for (const book of books) {
    for (let c = 0; c < book.chapters.length; c++) {
      for (let v = 0; v < book.chapters[c]; v++) {
        if (pack.isOmitted(book.id, c + 1, v + 1)) continue;
        if (n === 0) return { book: book.id, chapter: c + 1, verse: v + 1 };
        n -= 1;
      }
    }
  }
  throw new Error("unreachable: the candidate count covers every verse");
}

/**
 * Consecutive verse words from `start` until at least `minWords` are gathered, ending on a verse end. The run
 * crosses chapter and book ends; after the pack's last book it continues with its first. Omitted verses are
 * skipped. A pack with fewer words than `minWords` in all yields every word once.
 */
export async function collectPassage(
  pack: Pack,
  start: VerseRef,
  minWords: number = passageMinWords,
  load: (pack: Pack, bookId: string) => Promise<BookText> = loadBook,
): Promise<Passage> {
  const { books } = pack.info;
  const first = books.findIndex((b) => b.id === start.book);
  if (first < 0) {
    throw new Error(`pack ${pack.id} has no book ${start.book}`);
  }
  const words: string[] = [];
  let chapter = start.chapter - 1;
  let verse = start.verse - 1;
  for (let i = 0; i <= books.length && words.length < minWords; i++) {
    const bookId = books[(first + i) % books.length].id;
    const text = await load(pack, bookId);
    if (text.id !== bookId || !Array.isArray(text.chapters)) {
      throw new Error(
        `pack ${pack.id} book ${bookId} did not load as BookText`,
      );
    }
    const lastBook = i === books.length; // back at the start book: stop at the starting verse
    for (
      ;
      chapter < text.chapters.length && words.length < minWords;
      chapter++
    ) {
      const verses = text.chapters[chapter];
      for (; verse < verses.length && words.length < minWords; verse++) {
        if (
          lastBook &&
          chapter === start.chapter - 1 &&
          verse === start.verse - 1
        ) {
          return { pack, start, words };
        }
        words.push(...verseWords(verses[verse]));
      }
      verse = 0;
    }
    chapter = 0;
  }
  return { pack, start, words };
}

export type PassageMark = { readonly index: number };

/**
 * Keybr's text generator over a passage. The passage holds five times the longest offered test, so it does not
 * run out; if a test ever outlasts it, the words start over at the passage's first verse, as Keybr's book
 * generator starts over at the book's first paragraph.
 */
export class PassageGenerator implements TextGenerator<PassageMark> {
  readonly #words: readonly string[];
  #index = 0;

  constructor(readonly passage: Passage) {
    if (passage.words.length === 0) {
      throw new Error(`a passage from ${passage.start.book} has no words`);
    }
    this.#words = passage.words;
  }

  nextWord(): string {
    if (this.#index >= this.#words.length) {
      this.#index = 0;
    }
    const word = this.#words[this.#index];
    this.#index += 1;
    return word;
  }

  mark(): PassageMark {
    return { index: this.#index };
  }

  reset({ index }: PassageMark): void {
    this.#index = index;
  }
}
