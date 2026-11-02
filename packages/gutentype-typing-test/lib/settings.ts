import { activePack, type Pack } from "@gutentype/content";
// eslint-disable-next-line n/no-extraneous-import -- dependency line listed for the integrator
import { Language } from "@keybr/keyboard";
import {
  TextSourceType,
  typingTestProps,
} from "@keybr/page-typing-test/lib/settings.ts";
import { type Settings, stringProp } from "@keybr/settings";

/** The book the Typing Test draws passages from; "" means any book of the active pack. */
export const typingTestBookProp = stringProp("gutentype.typingTest.book", "", {
  maxLength: 64,
});

/** The chosen book's id, or null for any book (also when the saved id is not a book of `pack`). */
export function typingTestBook(settings: Settings, pack: Pack): string | null {
  const id = settings.get(typingTestBookProp);
  return id !== "" && pack.book(id) != null ? id : null;
}

/**
 * `settings` as the Typing Test reads them under Gutentype: the saved text source, whatever Keybr stored there
 * (common words, pseudo words, a novel, in any language), is replaced by the active pack's language, so Keybr's
 * display settings lay the verses out in that language's direction. Gutentype's loader ignores the source type.
 */
export function scriptureSettings(settings: Settings): Settings {
  const pack = activePack(settings);
  const language =
    Language.ALL.find((l) => l.id === pack.info.language) ?? Language.EN;
  return settings
    .set(typingTestProps.type, TextSourceType.CommonWords)
    .set(typingTestProps.language, language);
}
