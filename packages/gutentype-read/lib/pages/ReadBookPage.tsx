import {
  GutentypePaths,
  readChapterPath,
  translationLabel,
} from "@gutentype/content";
import { Header, Para } from "@keybr/widget";
import { clsx } from "clsx";
import { type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { readCopy } from "../copy.ts";
import {
  bookProgress,
  nextUntypedVerse,
  rowsOf,
  summarize,
} from "../progress/rows.ts";
import { useReadProgress } from "../progress/store.ts";
import * as styles from "../Read.module.less";
import { shareCardFor } from "../share/card.ts";
import { ShareCardView } from "../share/ShareCardView.tsx";
import {
  Mark,
  markState,
  PackLabel,
  Page,
  Stat,
  Stats,
  usePack,
} from "./parts.tsx";

/** `/read/:book`: the book's chapters with a done mark each, and the book's speed and accuracy (ISC-17, ISC-59). */
export function ReadBookPage(): ReactNode {
  const { book: bookId = "" } = useParams();
  const pack = usePack();
  const info = pack.book(bookId);
  const { rows, loading } = useReadProgress(pack);
  if (info == null) {
    return (
      <Page>
        <Para>{readCopy.noSuchBook(bookId, translationLabel(pack))}</Para>
        <Link to={GutentypePaths.read}>{readCopy.allBooks}</Link>
      </Page>
    );
  }
  const progress = bookProgress(rows, pack, info);
  const summary = summarize(rowsOf(rows, pack, info.id));
  const next = nextUntypedVerse(rows, pack, info.id, info);
  const card = progress.done ? shareCardFor(rows, pack, info.id) : null;
  return (
    <Page>
      <nav className={styles.crumbs}>
        <Link to={GutentypePaths.read}>{readCopy.allBooks}</Link>
      </nav>
      <Header level={1}>{info.name}</Header>
      <PackLabel pack={pack} />
      <Stats summary={summary}>
        <Stat
          name={readCopy.chaptersLabel}
          value={readCopy.chaptersDone(
            progress.chaptersDone,
            info.chapters.length,
          )}
        />
        <Stat
          name={readCopy.versesLabel}
          value={readCopy.versesTyped(progress.typed, progress.total)}
        />
      </Stats>
      {!loading && next != null && (
        <Link
          className={styles.resume}
          to={readChapterPath(info.id, next.chapter)}
        >
          {progress.typed > 0
            ? readCopy.continueAt(info.name, next.chapter, next.verse)
            : readCopy.startAt(info.name)}
        </Link>
      )}
      {card != null && <ShareCardView card={card} />}
      <ol
        className={clsx(styles.list, styles.chapterList)}
        aria-label={readCopy.chaptersLabel}
      >
        {progress.chapters.map(({ chapter, typed, total, done }) => {
          const state = markState(typed, total);
          return (
            <li key={chapter} data-gt-chapter={chapter} data-gt-done={done}>
              <Link
                className={clsx(styles.tile, done && styles.tileDone)}
                to={readChapterPath(info.id, chapter)}
              >
                <span className={styles.tileName}>
                  {readCopy.chapterLink(chapter)}
                </span>
                <Mark
                  state={state}
                  label={
                    state === "partial"
                      ? readCopy.inProgress(typed, total)
                      : undefined
                  }
                />
              </Link>
            </li>
          );
        })}
      </ol>
    </Page>
  );
}
