import { type BookInfo, type Pack } from "@gutentype/content";

/** One finished verse (CONTRACTS § 2). */
export type VerseRow = {
  readonly pack: string;
  readonly book: string;
  readonly chapter: number;
  readonly verse: number;
  /** Characters per minute, as Keybr's makeStats reports speed. */
  readonly speed: number;
  /** 0..1 */
  readonly accuracy: number;
  readonly ts: number;
};

export type VerseRef = {
  readonly pack: string;
  readonly book: string;
  readonly chapter: number;
  readonly verse: number;
};

export const rowKey = ({ pack, book, chapter, verse }: VerseRef): string =>
  `${pack}/${book}/${chapter}/${verse}`;

/** True for a well-formed row; anything else read from storage or the network is dropped. */
export function isVerseRow(value: unknown): value is VerseRow {
  if (value == null || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.pack === "string" &&
    typeof v.book === "string" &&
    Number.isInteger(v.chapter) &&
    (v.chapter as number) > 0 &&
    Number.isInteger(v.verse) &&
    (v.verse as number) > 0 &&
    typeof v.speed === "number" &&
    Number.isFinite(v.speed) &&
    v.speed >= 0 &&
    typeof v.accuracy === "number" &&
    Number.isFinite(v.accuracy) &&
    v.accuracy >= 0 &&
    v.accuracy <= 1 &&
    typeof v.ts === "number" &&
    Number.isFinite(v.ts)
  );
}

/** Exactly the contract's fields, so nothing else is ever stored or sent. */
export const toVerseRow = ({
  pack,
  book,
  chapter,
  verse,
  speed,
  accuracy,
  ts,
}: VerseRow): VerseRow => ({ pack, book, chapter, verse, speed, accuracy, ts });

/** Union by (pack, book, chapter, verse); the newest `ts` wins. */
export function mergeRows(
  a: readonly VerseRow[],
  b: readonly VerseRow[],
): VerseRow[] {
  const map = new Map<string, VerseRow>();
  for (const row of [...a, ...b]) {
    const key = rowKey(row);
    const have = map.get(key);
    if (have == null || row.ts > have.ts) {
      map.set(key, row);
    }
  }
  return [...map.values()];
}

/** The verse keys typed in one book of one pack. */
function typedIn(
  rows: readonly VerseRow[],
  pack: Pack,
  bookId: string,
): Set<string> {
  const keys = new Set<string>();
  for (const row of rows) {
    if (row.pack === pack.id && row.book === bookId) {
      keys.add(`${row.chapter}:${row.verse}`);
    }
  }
  return keys;
}

function chapterCursorIn(
  typed: Set<string>,
  pack: Pack,
  book: BookInfo,
  chapter: number,
): number | null {
  const count = book.chapters[chapter - 1] ?? 0;
  for (let verse = 1; verse <= count; verse++) {
    if (
      !pack.isOmitted(book.id, chapter, verse) &&
      !typed.has(`${chapter}:${verse}`)
    ) {
      return verse;
    }
  }
  return null;
}

/** The cursor: the first verse of the book that is not omitted and has no row; null when the book is done. */
export function nextUntypedVerse(
  rows: readonly VerseRow[],
  pack: Pack,
  bookId: string,
  bookInfo: BookInfo | null = pack.book(bookId),
): { readonly chapter: number; readonly verse: number } | null {
  if (bookInfo == null) return null;
  const typed = typedIn(rows, pack, bookId);
  for (let chapter = 1; chapter <= bookInfo.chapters.length; chapter++) {
    const verse = chapterCursorIn(typed, pack, bookInfo, chapter);
    if (verse != null) return { chapter, verse };
  }
  return null;
}

/** The first untyped verse of one chapter; null when the chapter is done (or does not exist). */
export function chapterCursor(
  rows: readonly VerseRow[],
  pack: Pack,
  bookId: string,
  chapter: number,
  bookInfo: BookInfo | null = pack.book(bookId),
): number | null {
  if (bookInfo == null) return null;
  return chapterCursorIn(typedIn(rows, pack, bookId), pack, bookInfo, chapter);
}

/** Verses typed and verses to type in a chapter; omitted verses count in neither. */
export function chapterProgress(
  rows: readonly VerseRow[],
  pack: Pack,
  bookId: string,
  chapter: number,
  bookInfo: BookInfo | null = pack.book(bookId),
): { readonly typed: number; readonly total: number } {
  if (bookInfo == null) return { typed: 0, total: 0 };
  const typed = typedIn(rows, pack, bookId);
  const count = bookInfo.chapters[chapter - 1] ?? 0;
  let done = 0;
  let total = 0;
  for (let verse = 1; verse <= count; verse++) {
    if (pack.isOmitted(bookId, chapter, verse)) continue;
    total += 1;
    if (typed.has(`${chapter}:${verse}`)) done += 1;
  }
  return { typed: done, total };
}

/** Every non-omitted verse of the chapter has a row. */
export function isChapterDone(
  rows: readonly VerseRow[],
  pack: Pack,
  bookId: string,
  chapter: number,
  bookInfo: BookInfo | null = pack.book(bookId),
): boolean {
  if (bookInfo == null || chapter < 1 || chapter > bookInfo.chapters.length) {
    return false;
  }
  return chapterCursor(rows, pack, bookId, chapter, bookInfo) == null;
}

/** Every chapter of the book is done. */
export function isBookDone(
  rows: readonly VerseRow[],
  pack: Pack,
  bookId: string,
  bookInfo: BookInfo | null = pack.book(bookId),
): boolean {
  return (
    bookInfo != null && nextUntypedVerse(rows, pack, bookId, bookInfo) == null
  );
}

export type Summary = {
  readonly verses: number;
  /** Mean characters per minute. */
  readonly speed: number;
  /** Mean accuracy, 0..1. */
  readonly accuracy: number;
};

/** Mean speed and accuracy over a set of verse rows; null when there are none. */
export function summarize(rows: readonly VerseRow[]): Summary | null {
  if (rows.length === 0) return null;
  let speed = 0;
  let accuracy = 0;
  for (const row of rows) {
    speed += row.speed;
    accuracy += row.accuracy;
  }
  return {
    verses: rows.length,
    speed: speed / rows.length,
    accuracy: accuracy / rows.length,
  };
}

export type ChapterState = {
  readonly chapter: number;
  readonly typed: number;
  readonly total: number;
  readonly done: boolean;
};

export type BookProgress = {
  readonly chapters: readonly ChapterState[];
  readonly chaptersDone: number;
  readonly typed: number;
  readonly total: number;
  readonly done: boolean;
};

/** Every chapter's progress in one pass over the rows (the index and book pages list many at once). */
export function bookProgress(
  rows: readonly VerseRow[],
  pack: Pack,
  book: BookInfo,
): BookProgress {
  const typed = typedIn(rows, pack, book.id);
  const chapters: ChapterState[] = [];
  let chaptersDone = 0;
  let typedAll = 0;
  let totalAll = 0;
  book.chapters.forEach((count, index) => {
    const chapter = index + 1;
    let n = 0;
    let total = 0;
    for (let verse = 1; verse <= count; verse++) {
      if (pack.isOmitted(book.id, chapter, verse)) continue;
      total += 1;
      if (typed.has(`${chapter}:${verse}`)) n += 1;
    }
    const done = n === total;
    if (done) chaptersDone += 1;
    typedAll += n;
    totalAll += total;
    chapters.push({ chapter, typed: n, total, done });
  });
  return {
    chapters,
    chaptersDone,
    typed: typedAll,
    total: totalAll,
    done: chaptersDone === book.chapters.length,
  };
}

/** The rows of one book (and optionally one chapter) of one pack. */
export function rowsOf(
  rows: readonly VerseRow[],
  pack: Pack,
  bookId: string,
  chapter?: number,
): VerseRow[] {
  return rows.filter(
    (row) =>
      row.pack === pack.id &&
      row.book === bookId &&
      (chapter == null || row.chapter === chapter),
  );
}
