import {
  type BookInfo,
  type BookText,
  GutentypePaths,
  type Pack,
  readBookPath,
  readChapterPath,
  translationLabel,
} from "@gutentype/content";
import { LoadingProgress } from "@keybr/pages-shared";
import { useSettings } from "@keybr/settings";
import { toTextDisplaySettings, toTextInputSettings } from "@keybr/textinput";
import { type IInputEvent } from "@keybr/textinput-events";
import { TextArea } from "@keybr/textinput-ui";
import { type Focusable, Header, Para } from "@keybr/widget";
import { clsx } from "clsx";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useParams } from "react-router";
import { readCopy } from "../copy.ts";
import { keepVisible, useKeepVisible } from "../keep-visible.ts";
import {
  chapterProgress,
  rowsOf,
  summarize,
  type VerseRow,
} from "../progress/rows.ts";
import { readProgress, useReadProgress } from "../progress/store.ts";
import * as styles from "../Read.module.less";
import { finishVerse, shareCardFor } from "../share/card.ts";
import { ShareCardView } from "../share/ShareCardView.tsx";
import {
  type ChapterVerse,
  chapterVerses,
  VerseSession,
} from "../verse-session.ts";
import {
  Mark,
  PackLabel,
  Page,
  Stat,
  Stats,
  useBookText,
  usePack,
} from "./parts.tsx";

/**
 * `/read/:book/:chapter`: the chapter is the page (ISC-14). Its verses with their numbers, one verse typed at a time
 * on Keybr's TextInput + TextArea with live error marks, no timer, a row the moment each verse is finished (ISC-15),
 * per-verse and chapter speed and accuracy (ISC-59), and on return the cursor on the next untyped verse (ISC-16).
 */
export function ReadChapterPage(): ReactNode {
  const { book: bookId = "", chapter: chapterParam = "" } = useParams();
  const pack = usePack();
  const info = pack.book(bookId);
  if (info == null) {
    return (
      <Page>
        <Para>{readCopy.noSuchBook(bookId, translationLabel(pack))}</Para>
        <Link to={GutentypePaths.read}>{readCopy.allBooks}</Link>
      </Page>
    );
  }
  const chapter = /^[1-9][0-9]*$/.test(chapterParam) ? Number(chapterParam) : 0;
  if (chapter < 1 || chapter > info.chapters.length) {
    return (
      <Page>
        <Para>{readCopy.noSuchChapter(info.name, chapterParam)}</Para>
        <Link to={readBookPath(info.id)}>{readCopy.backToBook(info.name)}</Link>
      </Page>
    );
  }
  return (
    <ChapterLoader
      key={`${pack.id}/${info.id}/${chapter}`}
      pack={pack}
      info={info}
      chapter={chapter}
    />
  );
}

function ChapterLoader({
  pack,
  info,
  chapter,
}: {
  readonly pack: Pack;
  readonly info: BookInfo;
  readonly chapter: number;
}): ReactNode {
  const text = useBookText(pack, info.id);
  const { loading } = useReadProgress(pack);
  if (text.state === "failed") {
    return (
      <Page>
        <Para>{readCopy.loadFailed}</Para>
      </Page>
    );
  }
  if (text.state === "loading" || loading) {
    return (
      <Page>
        <LoadingProgress />
      </Page>
    );
  }
  return <Chapter pack={pack} info={info} book={text.book} chapter={chapter} />;
}

/** The first untyped, non-omitted verse after `from` (wrapping to the chapter's start), or null when all are typed. */
function nextVerse(
  verses: readonly ChapterVerse[],
  typed: { has(verse: number): boolean },
  from: number,
): number | null {
  const open = verses.filter((v) => !v.omitted && !typed.has(v.verse));
  return (open.find((v) => v.verse > from) ?? open[0])?.verse ?? null;
}

function typedVerses(rows: readonly VerseRow[]): Map<number, VerseRow> {
  return new Map(rows.map((row) => [row.verse, row]));
}

const finePointer = () => {
  try {
    return globalThis.matchMedia?.("(pointer: fine)").matches ?? false;
  } catch {
    return false;
  }
};

export function Chapter({
  pack,
  info,
  book,
  chapter,
}: {
  readonly pack: Pack;
  readonly info: BookInfo;
  readonly book: BookText;
  readonly chapter: number;
}): ReactNode {
  const { settings } = useSettings();
  const textDisplay = useMemo(
    () => toTextDisplaySettings(settings),
    [settings],
  );
  const textInput = useMemo(() => toTextInputSettings(settings), [settings]);
  const { rows } = useReadProgress(pack);
  const chapterRows = rowsOf(rows, pack, info.id, chapter);
  const typed = typedVerses(chapterRows);
  const verses = useMemo(
    () => chapterVerses(book, pack, chapter),
    [book, pack, chapter],
  );

  const makeSession = useCallback(
    (verse: number | null) => {
      const entry = verse == null ? null : verses[verse - 1];
      return entry == null || entry.omitted
        ? null
        : new VerseSession(
            { pack: pack.id, book: info.id, chapter, verse: entry.verse },
            entry.text,
            textInput,
          );
    },
    [verses, pack, info, chapter, textInput],
  );

  // On arrival the cursor sits on the first untyped verse of the chapter (CONTRACTS § 2 cursor rule).
  const [session, setSession] = useState<VerseSession | null>(() =>
    makeSession(nextVerse(verses, typed, 0)),
  );
  const [lines, setLines] = useState(() => session?.lines ?? null);
  const active = session?.ref.verse ?? null;

  const start = useCallback(
    (verse: number | null) => {
      const next = makeSession(verse);
      setSession(next);
      setLines(next?.lines ?? null);
    },
    [makeSession],
  );

  const activeRef = useRef<HTMLElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const focusRef = useRef<Focusable>(null);
  useKeepVisible(activeRef, active != null);

  // The hidden textarea Keybr types into gets a name, so the verse is a labeled textbox.
  useEffect(() => {
    rootRef.current
      ?.querySelector("textarea")
      ?.setAttribute("aria-label", readCopy.verseLabel);
  }, [active]);

  useEffect(() => {
    if (active != null && finePointer()) {
      focusRef.current?.focus();
    }
  }, [active]);

  useEffect(() => {
    keepVisible(activeRef.current);
  }, [active]);

  const handleInput = (event: IInputEvent) => {
    if (session == null) return;
    const { row } = session.onInput(event);
    setLines(session.lines);
    if (row != null) {
      finishVerse(readProgress, row, pack);
      const done = typedVerses(
        rowsOf(readProgress.rows(pack.id), pack, info.id, chapter),
      );
      start(nextVerse(verses, done, row.verse));
    } else {
      keepVisible(activeRef.current);
    }
  };

  const handleFocus = () => {
    requestAnimationFrame(() => keepVisible(activeRef.current));
  };

  const progress = chapterProgress(rows, pack, info.id, chapter, info);
  const summary = summarize(chapterRows);
  const card = active == null ? shareCardFor(rows, pack, info.id) : null;
  const before = active == null ? verses : verses.slice(0, active - 1);
  const after = active == null ? [] : verses.slice(active);

  const renderVerse = (v: ChapterVerse) => (
    <VerseItem
      key={v.verse}
      verse={v}
      row={typed.get(v.verse) ?? null}
      onSelect={start}
    />
  );

  return (
    <Page>
      <div ref={rootRef}>
        <nav className={styles.crumbs}>
          <Link to={GutentypePaths.read}>{readCopy.allBooks}</Link>
          <Link to={readBookPath(info.id)}>
            {readCopy.backToBook(info.name)}
          </Link>
        </nav>
        <Header level={1}>{readCopy.chapterTitle(info.name, chapter)}</Header>
        <PackLabel pack={pack} />
        <Stats summary={summary}>
          <Stat
            name={readCopy.versesLabel}
            value={readCopy.versesTyped(progress.typed, progress.total)}
          />
        </Stats>
        {active == null && (
          <div className={styles.notice} role="status">
            <Mark
              state="done"
              label={readCopy.chapterDone(info.name, chapter)}
            />{" "}
            {chapter < info.chapters.length && (
              <Link to={readChapterPath(info.id, chapter + 1)}>
                {readCopy.nextChapter}
              </Link>
            )}
          </div>
        )}
        {card != null && <ShareCardView card={card} />}
        <ol className={styles.verses} aria-label={readCopy.versesLabel}>
          {before.map(renderVerse)}
        </ol>
        {session != null && lines != null && (
          <section
            ref={activeRef}
            className={styles.active}
            aria-label={readCopy.verseNumber(session.ref.verse)}
            data-gt-active-verse={session.ref.verse}
          >
            <div className={styles.activeLabel}>
              <span>{session.ref.verse}</span>
            </div>
            <div className={styles.typing}>
              <TextArea
                focusRef={focusRef}
                settings={textDisplay}
                lines={lines}
                wrap={true}
                onInput={handleInput}
                onFocus={handleFocus}
              />
            </div>
          </section>
        )}
        <ol className={styles.verses}>{after.map(renderVerse)}</ol>
        <nav className={styles.pager}>
          {chapter > 1 ? (
            <Link to={readChapterPath(info.id, chapter - 1)}>
              {readCopy.previousChapter}
            </Link>
          ) : (
            <span />
          )}
          {chapter < info.chapters.length && (
            <Link to={readChapterPath(info.id, chapter + 1)}>
              {readCopy.nextChapter}
            </Link>
          )}
        </nav>
      </div>
    </Page>
  );
}

function VerseItem({
  verse,
  row,
  onSelect,
}: {
  readonly verse: ChapterVerse;
  readonly row: VerseRow | null;
  readonly onSelect: (verse: number) => void;
}): ReactNode {
  const state = verse.omitted ? "omitted" : row != null ? "typed" : "upcoming";
  return (
    <li
      className={clsx(
        styles.verse,
        state === "omitted" && styles.omitted,
        state === "upcoming" && styles.upcoming,
      )}
      data-gt-verse={verse.verse}
      data-gt-state={state}
    >
      {verse.omitted ? (
        <span className={clsx(styles.number, styles.numberStatic)}>
          {verse.verse}
        </span>
      ) : (
        <button
          type="button"
          className={styles.number}
          aria-label={readCopy.typeVerse(verse.verse)}
          title={readCopy.typeVerse(verse.verse)}
          onClick={() => onSelect(verse.verse)}
        >
          {verse.verse}
        </button>
      )}
      <span className={styles.verseBody}>
        {verse.omitted ? (
          <span className={styles.verseText}>
            <span aria-hidden="true">— </span>
            {readCopy.notInTranslation}
          </span>
        ) : (
          <span className={styles.verseText}>{verse.text}</span>
        )}
        {row != null && (
          <span className={styles.verseStats}>
            <Mark
              state="done"
              label={`${readCopy.typed}: ${readCopy.verseStats(row.speed, row.accuracy)}`}
            />
          </span>
        )}
      </span>
    </li>
  );
}
