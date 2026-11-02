import { activePack, translationLabel } from "@gutentype/content";
import {
  typingTestBook,
  typingTestBookProp,
} from "@gutentype/typing-test/lib/settings.ts";
import { useSettings } from "@keybr/settings";
import { Field, FieldList, FieldSet, OptionList, Para } from "@keybr/widget";
import { type ReactNode, useMemo } from "react";

/** The option value for "any book"; book ids are lowercase letters, digits and dashes, so none is "*". */
const anyBook = "*";

/*
 * ISC-73, swapped in for Keybr's `page-typing-test/lib/components/settings/TextGeneratorSettings.tsx` by webpack
 * (ISC-74). Same export. The Typing Test's "Text" tab offers scripture only: a choice of book of the active pack,
 * or any book. Keybr's common-words, pseudo-words and book-paragraph sources are not offered; the "Typing" tab
 * (Keybr's display and input settings) and the toolbar's durations are untouched.
 * Imports name packages, never `./`: in the bundle this module's imports resolve from the Keybr file's folder.
 */
export function TextGeneratorSettings(): ReactNode {
  const { settings, updateSettings } = useSettings();
  const pack = activePack(settings);
  const bookId = typingTestBook(settings, pack);
  const options = useMemo(
    () => [
      { value: anyBook, name: "Any book" },
      ...pack.info.books.map((book) => ({ value: book.id, name: book.name })),
    ],
    [pack],
  );
  return (
    <FieldSet legend="Text Settings">
      <Para>
        Each test is a passage from the {translationLabel(pack)}, verse after
        verse, starting at a random verse.
      </Para>

      <FieldList>
        <Field>Book:</Field>
        <Field>
          <OptionList
            options={options}
            value={bookId ?? anyBook}
            onSelect={(value) => {
              updateSettings(
                settings.set(
                  typingTestBookProp,
                  value === anyBook ? "" : value,
                ),
              );
            }}
          />
        </Field>
      </FieldList>
    </FieldSet>
  );
}

// The bundle check (replacements-check.sh) looks for this name: a property assignment survives minification.
TextGeneratorSettings.displayName = "GutentypeScriptureTextSettings";
