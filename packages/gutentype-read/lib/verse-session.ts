import { type BookText, type Pack } from "@gutentype/content";
import {
  type Feedback,
  type LineList,
  makeStats,
  TextInput,
  type TextInputSettings,
  textInputSettings,
} from "@keybr/textinput";
import { type IInputEvent } from "@keybr/textinput-events";
import { type VerseRef, type VerseRow } from "./progress/rows.ts";

export type ChapterVerse = {
  readonly verse: number;
  /** The pack's stored text, unchanged; `""` for an omitted verse. */
  readonly text: string;
  /** The translation leaves this verse out (BSB has 16): shown as such and never offered for typing. */
  readonly omitted: boolean;
};

/** Every verse of a chapter in order, exactly as the pack stores it (ISC-19). Empty for a chapter that does not exist. */
export function chapterVerses(
  book: BookText,
  pack: Pack,
  chapter: number,
): ChapterVerse[] {
  const verses = book.chapters[chapter - 1];
  if (verses == null) return [];
  return verses.map((text, index) => ({
    verse: index + 1,
    text,
    omitted: text === "" || pack.isOmitted(book.id, chapter, index + 1),
  }));
}

/**
 * One verse on Keybr's TextInput: the stored text is handed over unchanged (TextInput normalizes only when it
 * compares a keystroke, so curly quotes are typed as straight ones), and the moment the last character lands the
 * verse's row is made from Keybr's makeStats (ISC-15). There is no clock: speed comes from the keystroke times.
 */
export class VerseSession {
  readonly ref: VerseRef;
  readonly text: string;
  readonly textInput: TextInput;
  #row: VerseRow | null = null;

  constructor(
    ref: VerseRef,
    text: string,
    settings: TextInputSettings = textInputSettings,
  ) {
    if (text === "") {
      throw new Error("An omitted verse is never offered for typing");
    }
    this.ref = ref;
    this.text = text;
    this.textInput = new TextInput(text, settings);
  }

  get lines(): LineList {
    return this.textInput.lines;
  }

  get completed(): boolean {
    return this.textInput.completed;
  }

  /** The finished verse's row, once. */
  get row(): VerseRow | null {
    return this.#row;
  }

  onInput(event: IInputEvent): {
    readonly feedback: Feedback | null;
    readonly row: VerseRow | null;
  } {
    if (this.textInput.completed) {
      return { feedback: null, row: null };
    }
    const feedback = this.textInput.onInput(event);
    if (this.textInput.completed && this.#row == null) {
      const { speed, accuracy } = makeStats(this.textInput.steps);
      this.#row = {
        ...this.ref,
        speed,
        accuracy,
        ts: Date.now(),
      };
      return { feedback, row: this.#row };
    }
    return { feedback, row: null };
  }
}
