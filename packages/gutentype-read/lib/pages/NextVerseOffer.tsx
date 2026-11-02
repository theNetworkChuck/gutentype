import { readChapterPath } from "@gutentype/content";
import { type ReactNode } from "react";
import { Link } from "react-router";
import { readCopy } from "../copy.ts";
import { nextUntypedVerse } from "../progress/rows.ts";
import { useReadProgress } from "../progress/store.ts";
import * as styles from "../Read.module.less";
import { featuredBookId, usePack } from "./parts.tsx";

/**
 * One click from Learn to the next untyped verse of John in the active pack (ISC-38); nothing while progress loads
 * or once John is finished. The Shell lane places it on the practice screen.
 */
export function NextVerseOffer(): ReactNode {
  const pack = usePack();
  const { rows, loading } = useReadProgress(pack);
  const book = pack.book(featuredBookId);
  if (loading || book == null) return null;
  const next = nextUntypedVerse(rows, pack, book.id, book);
  if (next == null) return null;
  return (
    <Link
      className={styles.offer}
      to={readChapterPath(book.id, next.chapter)}
      data-gt="next-verse-offer"
    >
      {readCopy.nextVerse(book.name, next.chapter, next.verse)}
    </Link>
  );
}
