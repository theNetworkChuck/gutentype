/*
 * Every interface string the Read track shows, in one place for the ISC-46 string audit. Plain product copy: the
 * book, chapter and translation labels are the only scripture framing, nothing devotional, no nudges.
 */
import { type Summary } from "./progress/rows.ts";

export const readCopy = {
  indexTitle: "Read",
  indexIntro:
    "Type a book of the Bible verse by verse. There is no timer; stop whenever you like and pick up at the next verse.",
  booksLabel: "Books",
  featured: "Featured",
  chaptersLabel: "Chapters",
  versesLabel: "Verses",
  allBooks: "All books",
  punctuationHint:
    "Type a plain ' or \" for curly quotes and a plain - for any dash.",
  continueAt: (book: string, chapter: number, verse: number) =>
    `Continue at ${book} ${chapter}:${verse}`,
  startAt: (book: string) => `Start ${book}`,
  chaptersDone: (done: number, total: number) =>
    `${done} of ${total} chapters done`,
  versesTyped: (typed: number, total: number) =>
    `${typed} of ${total} verses typed`,
  done: "Done",
  notStarted: "Not started",
  inProgress: (typed: number, total: number) => `${typed} of ${total} verses`,
  chapterTitle: (book: string, chapter: number) => `${book} ${chapter}`,
  chapterLink: (chapter: number) => `Chapter ${chapter}`,
  previousChapter: "Previous chapter",
  nextChapter: "Next chapter",
  backToBook: (book: string) => `${book}: all chapters`,
  chapterDone: (book: string, chapter: number) => `${book} ${chapter} is done.`,
  verseLabel: "Verse",
  verseNumber: (verse: number) => `Verse ${verse}`,
  typeVerse: (verse: number) => `Type verse ${verse}`,
  typed: "Typed",
  notInTranslation: "Not in this translation",
  speed: "Speed",
  accuracy: "Accuracy",
  noStatsYet: "No verses typed yet",
  wpm: (cpm: number) => `${Math.round(cpm / 5)} wpm`,
  percent: (accuracy: number) => `${(accuracy * 100).toFixed(1)}%`,
  verseStats: (cpm: number, accuracy: number) =>
    `${Math.round(cpm / 5)} wpm, ${(accuracy * 100).toFixed(1)}%`,
  loading: "Loading…",
  loadFailed: "This book could not be loaded. Reload the page to try again.",
  noSuchBook: (book: string, translation: string) =>
    `There is no book "${book}" in the ${translation}.`,
  noSuchChapter: (book: string, chapter: string) =>
    `${book} has no chapter ${chapter}.`,
  nextVerse: (book: string, chapter: number, verse: number) =>
    `Next verse to type: ${book} ${chapter}:${verse}`,
  shareTitle: "Book finished",
  downloadPng: "Download image",
  downloading: "Drawing…",
  downloadFailed: "The image could not be made in this browser.",
  copyLink: "Copy link",
  linkCopied: "Link copied",
  copyFailed: "Copy the link below",
  shareLink: "Share link",
  shareLinkNote: "The link holds only what the card shows: no name, no email.",
  shareInvalid:
    "This share link is missing something, so there is no card to show.",
  typeABook: "Type a book",
} as const;

export function summaryText(summary: Summary | null): {
  readonly speed: string;
  readonly accuracy: string;
} {
  if (summary == null) {
    return { speed: "–", accuracy: "–" };
  }
  return {
    speed: readCopy.wpm(summary.speed),
    accuracy: readCopy.percent(summary.accuracy),
  };
}
