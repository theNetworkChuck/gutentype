import { activePack, type Pack } from "@gutentype/content";
import {
  collectPassage,
  type Passage,
  PassageGenerator,
  pickStart,
} from "@gutentype/typing-test/lib/passage.ts";
import {
  scriptureSettings,
  typingTestBook,
} from "@gutentype/typing-test/lib/settings.ts";
// eslint-disable-next-line n/no-extraneous-import -- dependency line listed for the integrator
import { catchError } from "@keybr/debug";
import { type TextGenerator } from "@keybr/page-typing-test/lib/generators/types.ts";
import { SettingsContext, useSettings } from "@keybr/settings";
import { Para } from "@keybr/widget";
import { type ReactNode, useEffect, useMemo, useState } from "react";

/*
 * ISC-73, swapped in for Keybr's `page-typing-test/lib/generators/TextGeneratorLoader.tsx` by webpack (ISC-74,
 * `keybr-replacements.json`). Same export, same props. Every test types a passage of the active pack: verse after
 * verse from a random starting verse, in the chosen book or any book. The saved text source (common words, pseudo
 * words, a novel) is never read; the subtree sees settings with that source replaced (`scriptureSettings`), so
 * Keybr's test screen lays the verses out in the pack's language.
 * Imports name packages, never `./`: in the bundle this module's imports resolve from the Keybr file's folder.
 */
export function TextGeneratorLoader({
  children,
}: {
  children: (generator: TextGenerator) => ReactNode;
}): ReactNode {
  const { settings, updateSettings } = useSettings();
  const pack = activePack(settings);
  const bookId = typingTestBook(settings, pack);
  const context = useMemo(
    () => ({ settings: scriptureSettings(settings), updateSettings }),
    [settings, updateSettings],
  );
  return (
    <SettingsContext.Provider value={context}>
      <PassageLoader
        key={`${pack.id}/${bookId ?? ""}`}
        pack={pack}
        bookId={bookId}
      >
        {children}
      </PassageLoader>
    </SettingsContext.Provider>
  );
}

// The bundle check (replacements-check.sh) looks for this name: a property assignment survives minification.
TextGeneratorLoader.displayName = "GutentypeScriptureTextLoader";

type LoadState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly passage: Passage }
  | { readonly kind: "failed" };

function PassageLoader({
  pack,
  bookId,
  children,
}: {
  readonly pack: Pack;
  readonly bookId: string | null;
  readonly children: (generator: TextGenerator) => ReactNode;
}): ReactNode {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  useEffect(() => {
    let didCancel = false;
    // Book chunks are a few hundred kilobytes and cached by `loadBook`; a failed fetch rejects rather than hangs,
    // so this waits on the browser's own request timeout.
    Promise.resolve()
      .then(() => collectPassage(pack, pickStart(pack, bookId, Math.random)))
      .then((passage) => {
        if (!didCancel) setState({ kind: "ready", passage });
      })
      .catch((err: unknown) => {
        catchError(err);
        if (!didCancel) setState({ kind: "failed" });
      });
    return () => {
      didCancel = true;
    };
  }, [pack, bookId]);
  switch (state.kind) {
    case "loading":
      return null;
    case "failed":
      return (
        <Para>The passage did not load. Reload the page to try again.</Para>
      );
    case "ready":
      // A fresh generator on every render, as Keybr's loader makes one: the test screen takes `generator.mark()`
      // as it renders, so a reused generator would restart a test mid-verse after a settings change.
      return children(new PassageGenerator(state.passage));
  }
}
