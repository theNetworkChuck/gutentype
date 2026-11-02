/*
 * The Read track (CONTRACTS § 2): a chapter is the page, typed verse by verse. Every name the contract fixes is
 * exported here with its signature; the rest are additions the tests and other lanes may use.
 */
export { readCopy } from "./copy.ts";
export { keepVisible, useKeepVisible } from "./keep-visible.ts";
export { NextVerseOffer } from "./pages/NextVerseOffer.tsx";
export { featuredBookId } from "./pages/parts.tsx";
export { ReadBookPage } from "./pages/ReadBookPage.tsx";
export { ReadChapterPage } from "./pages/ReadChapterPage.tsx";
export { readIndexBooks, ReadIndexPage } from "./pages/ReadIndexPage.tsx";
export { SharePage } from "./pages/SharePage.tsx";
export {
  IdbReadRows,
  type LocalReadRows,
  readDbName,
  readStoreName,
} from "./progress/local.ts";
export {
  HttpReadRows,
  readSyncPath,
  type RemoteReadRows,
} from "./progress/remote.ts";
export {
  type BookProgress,
  bookProgress,
  chapterCursor,
  chapterProgress,
  type ChapterState,
  isBookDone,
  isChapterDone,
  isVerseRow,
  mergeRows,
  nextUntypedVerse,
  rowKey,
  rowsOf,
  summarize,
  type Summary,
  type VerseRef,
  type VerseRow,
} from "./progress/rows.ts";
export {
  isSignedIn,
  readProgress,
  type ReadProgressOptions,
  ReadProgressStore,
  type ReadProgressView,
  syncReadProgress,
  useReadProgress,
} from "./progress/store.ts";
export {
  type FinishedVerse,
  finishVerse,
  parseShareCard,
  type ShareCard,
  shareCardFields,
  shareCardFor,
  type ShareCardText,
  shareCardText,
  sharePath,
  sharePngPath,
  shareQuery,
  shareUrl,
} from "./share/card.ts";
export {
  downloadShareCard,
  drawShareCard,
  shareCardFileName,
  shareCardPng,
  shareCardSize,
} from "./share/draw.ts";
export { ShareCardView } from "./share/ShareCardView.tsx";
export {
  type ChapterVerse,
  chapterVerses,
  VerseSession,
} from "./verse-session.ts";
