import { type BookInfo, type Pack, readBookPath } from "@gutentype/content";
import { Header, Para } from "@keybr/widget";
import { clsx } from "clsx";
import { type ReactNode } from "react";
import { Link } from "react-router";
import { readCopy } from "../copy.ts";
import { bookProgress, type VerseRow } from "../progress/rows.ts";
import { useReadProgress } from "../progress/store.ts";
import * as styles from "../Read.module.less";
import {
  featuredBookId,
  Mark,
  markState,
  PackLabel,
  Page,
  usePack,
} from "./parts.tsx";

/** Every book of the pack, the featured book first, then the pack's own order. */
export function readIndexBooks(pack: Pack): BookInfo[] {
  const books = [...pack.info.books];
  const featured = books.findIndex((b) => b.id === featuredBookId);
  if (featured > 0) {
    books.unshift(...books.splice(featured, 1));
  }
  return books;
}

/** `/read`: every book of the active pack with chapters done out of total, John first (ISC-13). */
export function ReadIndexPage(): ReactNode {
  const pack = usePack();
  const { rows } = useReadProgress(pack);
  return (
    <Page>
      <Header level={1}>{readCopy.indexTitle}</Header>
      <PackLabel pack={pack} />
      <Para className={styles.intro}>{readCopy.indexIntro}</Para>
      <ul className={styles.list} aria-label={readCopy.booksLabel}>
        {readIndexBooks(pack).map((book) => (
          <BookItem
            key={book.id}
            pack={pack}
            book={book}
            rows={rows}
            featured={book.id === featuredBookId}
          />
        ))}
      </ul>
    </Page>
  );
}

function BookItem({
  pack,
  book,
  rows,
  featured,
}: {
  readonly pack: Pack;
  readonly book: BookInfo;
  readonly rows: readonly VerseRow[];
  readonly featured: boolean;
}): ReactNode {
  const progress = bookProgress(rows, pack, book);
  const total = book.chapters.length;
  const state = markState(progress.chaptersDone, total);
  return (
    <li className={clsx(featured && styles.featured)} data-gt-book={book.id}>
      <Link
        className={clsx(styles.tile, progress.done && styles.tileDone)}
        to={readBookPath(book.id)}
      >
        {featured && (
          <span className={styles.featuredTag}>{readCopy.featured}</span>
        )}
        <span className={styles.tileName}>{book.name}</span>
        <Mark
          state={state}
          label={
            state === "done"
              ? `${readCopy.done}: ${readCopy.chaptersDone(total, total)}`
              : readCopy.chaptersDone(progress.chaptersDone, total)
          }
        />
      </Link>
    </li>
  );
}
