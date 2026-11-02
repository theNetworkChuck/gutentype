import { Enum, type EnumItem } from "@keybr/lang";
import {
  importBook,
  importLearn,
  importWords,
  packInfos,
} from "./generated.ts";

/** One book's verse counts, as `pack.json` lists it. */
export type BookInfo = {
  readonly id: string;
  readonly name: string;
  /** Verse count per chapter; chapter n is index n - 1. */
  readonly chapters: readonly number[];
};

/** `pack.json` exactly as `build-packs.ts` writes it. */
export type PackInfo = {
  readonly id: string;
  readonly label: string;
  readonly short: string;
  readonly language: string;
  readonly license: string;
  readonly sourceUrl: string;
  readonly sourceSha256: string;
  readonly verses: number;
  /** `<bookId> <chapter>:<verse>` for every verse the source leaves empty. */
  readonly omitted: readonly string[];
  /** `[letter, count]`, most frequent first: the pack's unlock order. */
  readonly letters: readonly (readonly [string, number])[];
  readonly books: readonly BookInfo[];
};

/** A book's text: `chapters[c][v]` is verse v + 1 of chapter c + 1; `""` is a verse the source omits. */
export type BookText = {
  readonly id: string;
  readonly name: string;
  readonly chapters: readonly (readonly string[])[];
};

/** Derived Learn data (`learn.json`), written by `gutentype-tools/lib/build-learn.ts`. */
export type LearnData = {
  /** Lowercased, punctuation-stripped runs of 3 to 5 consecutive words from verses. */
  readonly fragments: readonly (readonly string[])[];
  /** Words never placed in a Learn lesson. */
  readonly blocklist: readonly string[];
  /** Lowercased divine names a flagged word may never sit beside. */
  readonly divineNames: readonly string[];
};

export class Pack implements EnumItem {
  static readonly ALL = new Enum<Pack>(
    ...(packInfos as unknown as PackInfo[]).map((info) => new Pack(info)),
  );
  static readonly BSB = Pack.ALL.get("bsb");
  static readonly KJV = Pack.ALL.get("kjv");

  readonly id: string;

  private constructor(readonly info: PackInfo) {
    this.id = info.id;
    Object.freeze(this);
  }

  /** The unlock order: letters by corpus frequency, most frequent first. */
  get letterOrder(): string {
    return this.info.letters.map(([letter]) => letter).join("");
  }

  /** Corpus count per code point, for the Learn letter model. */
  letterCounts(): Map<number, number> {
    return new Map(
      this.info.letters.map(([letter, n]) => [letter.codePointAt(0)!, n]),
    );
  }

  book(bookId: string): BookInfo | null {
    return this.info.books.find((b) => b.id === bookId) ?? null;
  }

  isOmitted(bookId: string, chapter: number, verse: number): boolean {
    return this.info.omitted.includes(`${bookId} ${chapter}:${verse}`);
  }

  toString() {
    return this.id;
  }

  toJSON() {
    return this.id;
  }
}

const books = new Map<string, Promise<BookText>>();

/** One book of a pack, fetched as its own chunk and cached. */
export function loadBook(pack: Pack, bookId: string): Promise<BookText> {
  const key = `${pack.id}/${bookId}`;
  let p = books.get(key);
  if (p == null) {
    p = importBook(pack.id, bookId) as Promise<BookText>;
    books.set(key, p);
    p.catch(() => books.delete(key));
  }
  return p;
}

/** `[word, count]` for every distinct lowercase word, most frequent first. */
export async function loadWords(
  pack: Pack,
): Promise<readonly (readonly [string, number])[]> {
  return (await importWords(pack.id)) as (readonly [string, number])[];
}

export async function loadLearn(pack: Pack): Promise<LearnData> {
  return (await importLearn(pack.id)) as LearnData;
}

/** The pack Learn runs on: the chosen pack when it has at least 50 three-letter-plus words at six letters (ISC-9), else BSB. */
export function learnPackFor(pack: Pack, wordsAtSix: number): Pack {
  return wordsAtSix >= 50 ? pack : Pack.BSB;
}
