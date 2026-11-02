import {
  activePack,
  type BookText,
  loadBook,
  type Pack,
  translationLabel,
} from "@gutentype/content";
import { useSettings } from "@keybr/settings";
import { Para } from "@keybr/widget";
import { type ReactNode, useEffect, useState } from "react";
import { readCopy, summaryText } from "../copy.ts";
import { type Summary } from "../progress/rows.ts";
import * as styles from "../Read.module.less";

/** The book featured first on /read and offered from Learn (ISC-13, ISC-38). */
export const featuredBookId = "john";

export function usePack(): Pack {
  const { settings } = useSettings();
  return activePack(settings);
}

/** The active translation, named on every Read page (ISC-66). */
export function PackLabel({ pack }: { readonly pack: Pack }): ReactNode {
  return <Para className={styles.label}>{translationLabel(pack)}</Para>;
}

export type MarkState = "done" | "partial" | "none";

/** A status as a glyph plus a word, never color alone (ISC-5, ISC-17). */
export function Mark({
  state,
  label,
}: {
  readonly state: MarkState;
  /** The word beside the glyph; defaults to Done / Not started. */
  readonly label?: string;
}): ReactNode {
  const glyph = state === "done" ? "✓" : state === "partial" ? "◐" : "○";
  const word =
    label ?? (state === "done" ? readCopy.done : readCopy.notStarted);
  return (
    <span className={styles.mark} data-gt-mark={state}>
      <span className={styles.glyph} aria-hidden="true">
        {glyph}
      </span>
      <span>{word}</span>
    </span>
  );
}

export function markState(typed: number, total: number): MarkState {
  return typed >= total && total > 0 ? "done" : typed > 0 ? "partial" : "none";
}

export function Stat({
  name,
  value,
}: {
  readonly name: string;
  readonly value: ReactNode;
}): ReactNode {
  return (
    <div className={styles.stat}>
      <dt className={styles.statName}>{name}</dt>
      <dd className={styles.statValue}>{value}</dd>
    </div>
  );
}

/** Speed and accuracy rolled up over a set of verses, plus any extra counts (ISC-59). */
export function Stats({
  summary,
  children,
}: {
  readonly summary: Summary | null;
  readonly children?: ReactNode;
}): ReactNode {
  const { speed, accuracy } = summaryText(summary);
  return (
    <dl className={styles.stats}>
      <Stat name={readCopy.speed} value={speed} />
      <Stat name={readCopy.accuracy} value={accuracy} />
      {children}
    </dl>
  );
}

export function Page({
  children,
}: {
  readonly children: ReactNode;
}): ReactNode {
  return (
    <div className={styles.page} data-gt="read">
      {children}
    </div>
  );
}

export type BookState =
  | { readonly state: "loading" }
  | { readonly state: "failed" }
  | { readonly state: "ready"; readonly book: BookText };

/** One book's text, loaded as its own chunk. */
export function useBookText(pack: Pack, bookId: string): BookState {
  const [state, setState] = useState<BookState & { key: string }>({
    state: "loading",
    key: "",
  });
  const key = `${pack.id}/${bookId}`;
  useEffect(() => {
    let live = true;
    loadBook(pack, bookId).then(
      (book) => {
        if (live) setState({ state: "ready", book, key });
      },
      () => {
        if (live) setState({ state: "failed", key });
      },
    );
    return () => {
      live = false;
    };
  }, [pack, bookId, key]);
  return state.key === key ? state : { state: "loading" };
}
