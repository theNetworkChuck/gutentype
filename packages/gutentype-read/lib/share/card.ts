import {
  countOnce,
  GutentypePaths,
  Pack,
  siteName,
  translationLabel,
} from "@gutentype/content";
import {
  isBookDone,
  isChapterDone,
  rowsOf,
  summarize,
  type VerseRow,
} from "../progress/rows.ts";
import { type ReadProgressStore } from "../progress/store.ts";

/**
 * The finished-book card (ISC-18). Exactly these five fields, all public: no name, email or id ever (ISC-55). The
 * share URL carries them itself, so nothing is stored for anyone.
 */
export type ShareCard = {
  /** Pack id, e.g. `bsb`. */
  readonly pack: string;
  /** Book id, e.g. `john`. */
  readonly book: string;
  /** Average speed in words per minute (Keybr's five characters per word), rounded. */
  readonly wpm: number;
  /** Average accuracy in whole percent, rounded down so 100 means no mistakes. */
  readonly acc: number;
  /** The day the last verse was typed, `YYYY-MM-DD` in the reader's time zone. */
  readonly date: string;
};

/** The query fields of `/share` and `/share.png`, in order (CONTRACTS § 3). */
export const shareCardFields = ["pack", "book", "wpm", "acc", "date"] as const;

/** Card speed bounds; anything outside is not a real card. */
const maxWpm = 400;

function localDate(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The card for a finished book, or null while any verse is left. */
export function shareCardFor(
  rows: readonly VerseRow[],
  pack: Pack,
  bookId: string,
): ShareCard | null {
  const info = pack.book(bookId);
  if (info == null || !isBookDone(rows, pack, bookId, info)) return null;
  const bookRows = rowsOf(rows, pack, bookId);
  const summary = summarize(bookRows)!;
  const last = Math.max(...bookRows.map((r) => r.ts));
  return {
    pack: pack.id,
    book: bookId,
    wpm: Math.min(maxWpm, Math.round(summary.speed / 5)),
    acc: Math.max(0, Math.min(100, Math.floor(summary.accuracy * 100 + 1e-9))),
    date: localDate(last),
  };
}

export function shareQuery(card: ShareCard): string {
  const query = new URLSearchParams();
  for (const field of shareCardFields) {
    query.set(field, String(card[field]));
  }
  return query.toString();
}

/** `/share?pack=…&book=…&wpm=…&acc=…&date=…` */
export function sharePath(card: ShareCard): string {
  return `${GutentypePaths.share}?${shareQuery(card)}`;
}

/** `/share.png?…`, the same card as an image (rendered by the server for Open Graph). */
export function sharePngPath(card: ShareCard): string {
  return `${GutentypePaths.sharePng}?${shareQuery(card)}`;
}

export function shareUrl(
  card: ShareCard,
  origin: string = globalThis.location?.origin ?? "",
): string {
  return `${origin.replace(/\/+$/, "")}${sharePath(card)}`;
}

function validDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (m == null) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 2000 || y > 2999) return false;
  const date = new Date(Date.UTC(y, mo - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === mo - 1 &&
    date.getUTCDate() === d
  );
}

function wholeNumber(value: string | null, max: number): number | null {
  if (value == null || !/^\d{1,4}$/.test(value)) return null;
  const n = Number(value);
  return n <= max ? n : null;
}

/** Reads a card from a share URL's query; null unless every field is present and real. Extra fields are dropped. */
export function parseShareCard(
  search: string | URLSearchParams,
): ShareCard | null {
  const query =
    typeof search === "string"
      ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
      : search;
  const pack = Pack.ALL.find((p) => p.id === query.get("pack"));
  if (pack == null) return null;
  const book = query.get("book");
  if (book == null || pack.book(book) == null) return null;
  const wpm = wholeNumber(query.get("wpm"), maxWpm);
  const acc = wholeNumber(query.get("acc"), 100);
  const date = query.get("date");
  if (wpm == null || acc == null || date == null || !validDate(date)) {
    return null;
  }
  return { pack: pack.id, book, wpm, acc, date };
}

const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export type ShareCardText = {
  readonly site: string;
  readonly heading: string;
  readonly book: string;
  readonly translation: string;
  readonly speed: string;
  readonly accuracy: string;
  readonly date: string;
};

/** The words on the card. Plain facts; the book and the translation are the only scripture framing. */
export function shareCardText(card: ShareCard): ShareCardText | null {
  const pack = Pack.ALL.find((p) => p.id === card.pack);
  const book = pack?.book(card.book);
  if (pack == null || book == null || !validDate(card.date)) return null;
  const [y, m, d] = card.date.split("-").map(Number);
  return {
    site: siteName,
    heading: "Book finished",
    book: book.name,
    translation: translationLabel(pack),
    speed: `${card.wpm} wpm`,
    accuracy: `${card.acc}% accuracy`,
    date: `${months[m - 1]} ${d}, ${y}`,
  };
}

export type FinishedVerse = {
  /** The verse's chapter is now done. */
  readonly chapterDone: boolean;
  /** This verse was the last one left in the book. */
  readonly bookFinished: boolean;
  /** The book's card whenever the book is done (also on a retyped verse of a finished book). */
  readonly card: ShareCard | null;
};

/**
 * Records a finished verse and says what it completed. Finishing a book bumps the anonymous `book-finished` counter
 * once for that book (CONTRACTS § 4); retyping verses of a finished book never counts again.
 */
export function finishVerse(
  store: ReadProgressStore,
  row: VerseRow,
  pack: Pack,
): FinishedVerse {
  const wasDone = isBookDone(store.rows(pack.id), pack, row.book);
  store.record(row);
  const rows = store.rows(pack.id);
  const chapterDone = isChapterDone(rows, pack, row.book, row.chapter);
  const bookDone = isBookDone(rows, pack, row.book);
  const bookFinished = bookDone && !wasDone;
  if (bookFinished) {
    countOnce("book-finished", row.book);
  }
  return {
    chapterDone,
    bookFinished,
    card: bookDone ? shareCardFor(rows, pack, row.book) : null,
  };
}
