// ISC-73: the Typing Test types only scripture. Every word of a test is consecutive verse text from the active
// pack (BSB by default, KJV when the pack setting says so), whatever text source a saved profile holds, and the
// test's settings offer no common-words, pseudo-words or novel source.
// These tests import Gutentype's modules directly: tstest runs plain node, so webpack's module swap (ISC-74) is
// not in play here. replacements-check.sh proves the built bundle carries the same modules.
// The DOM this file renders into, set up here so the package test script (server and bundler envs only) runs it too.
import "@keybr/test-env-browser";
import { test } from "node:test";
import { activePack, gutentypeProps, loadBook, Pack } from "@gutentype/content";
import { typingTestBookProp } from "@gutentype/typing-test/lib/settings.ts";
import { TextGeneratorLoader } from "@gutentype/typing-test/lib/TextGeneratorLoader.tsx";
import { TextGeneratorSettings } from "@gutentype/typing-test/lib/TextGeneratorSettings.tsx";
import { Book } from "@keybr/content";
import { FakeIntlProvider } from "@keybr/intl";
import { Language } from "@keybr/keyboard";
import { type TextGenerator } from "@keybr/page-typing-test/lib/generators/types.ts";
import {
  TextSourceType,
  typingTestProps,
  useCompositeSettings,
} from "@keybr/page-typing-test/lib/settings.ts";
import { FakePhoneticModel } from "@keybr/phonetic-model";
import { PhoneticModelLoader } from "@keybr/phonetic-model-loader";
import { FakeSettingsContext, Settings, useSettings } from "@keybr/settings";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { createElement as h, type ReactNode } from "react";
import { deepEqual, equal, isNotNull, isNull, isTrue } from "rich-assert";

/** Every word of a pack in canonical order, with the index of each verse's first word and that verse's book. */
type Stream = {
  readonly words: readonly string[];
  /** first word -> indexes in `words` where a verse starts with it */
  readonly verseStarts: ReadonlyMap<string, readonly number[]>;
  /** index in `words` of a verse start -> that verse's book id */
  readonly bookAt: ReadonlyMap<number, string>;
};

const streams = new Map<Pack, Promise<Stream>>();

function streamOf(pack: Pack): Promise<Stream> {
  let s = streams.get(pack);
  if (s == null) {
    s = buildStream(pack);
    streams.set(pack, s);
  }
  return s;
}

async function buildStream(pack: Pack): Promise<Stream> {
  const words: string[] = [];
  const verseStarts = new Map<string, number[]>();
  const bookAt = new Map<number, string>();
  for (const { id } of pack.info.books) {
    const book = await loadBook(pack, id);
    for (const chapter of book.chapters) {
      for (const verse of chapter) {
        const vw = verse.split(/\s+/).filter((w) => w.length > 0);
        if (vw.length === 0) continue; // an omitted verse ("") holds no words
        const at = words.length;
        bookAt.set(at, id);
        let list = verseStarts.get(vw[0]);
        if (list == null) verseStarts.set(vw[0], (list = []));
        list.push(at);
        words.push(...vw);
      }
    }
  }
  return { words, verseStarts, bookAt };
}

/**
 * The verse-start index where `drawn` runs as consecutive pack words (the pack read as a loop, Revelation
 * running on into Genesis), or null when no verse start in the pack begins that run.
 */
function runStart(stream: Stream, drawn: readonly string[]): number | null {
  const { words } = stream;
  for (const k of stream.verseStarts.get(drawn[0]) ?? []) {
    let ok = true;
    for (let i = 0; i < drawn.length; i++) {
      if (words[(k + i) % words.length] !== drawn[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return k;
  }
  return null;
}

/** Enough words for Keybr's longest offered test (1000 characters) with the five lines it lays out ahead. */
const wordsPerTest = 400;

function draw(generator: TextGenerator, n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(generator.nextWord());
  return out;
}

function wrap(settings: Settings, child: ReactNode) {
  return h(FakeIntlProvider, {
    children: h(FakeSettingsContext, {
      initialSettings: settings,
      children: child,
    }),
  });
}

/** Renders the Typing Test's text loader on `settings` and returns the words of one test. */
async function oneTest(settings: Settings): Promise<string[]> {
  let generator: TextGenerator | null = null;
  const r = render(
    wrap(
      settings,
      h(TextGeneratorLoader, {
        children: (g: TextGenerator) => {
          generator = g;
          return h("span", { title: "test" }, "ready");
        },
      }),
    ),
  );
  try {
    await r.findByTitle("test", {}, { timeout: 10_000 });
    isNotNull(generator);
    return draw(generator!, wordsPerTest);
  } finally {
    r.unmount();
  }
}

/** The text sources a saved profile can hold, each as Keybr would have stored it. */
const savedSources: readonly {
  readonly name: string;
  readonly apply: (s: Settings) => Settings;
}[] = [
  {
    name: "CommonWords",
    apply: (s) =>
      s
        .set(typingTestProps.type, TextSourceType.CommonWords)
        .set(typingTestProps.language, Language.EN)
        .set(typingTestProps.wordList.wordListSize, 100),
  },
  {
    name: "PseudoWords",
    apply: (s) =>
      s
        .set(typingTestProps.type, TextSourceType.PseudoWords)
        .set(typingTestProps.language, Language.EN),
  },
  {
    name: "Book",
    apply: (s) =>
      s
        .set(typingTestProps.type, TextSourceType.Book)
        .set(typingTestProps.book, Book.EN_ALICE_WONDERLAND)
        .set(typingTestProps.bookParagraphIndex, 5),
  },
];

const testsPerCase = 50;

for (const pack of [Pack.BSB, Pack.KJV]) {
  for (const source of savedSources) {
    test(`${pack.id}, saved source ${source.name}: ${testsPerCase} tests, every word is consecutive verse text`, async () => {
      // Keybr's own loaders, should they ever run, need a phonetic model in node.
      PhoneticModelLoader.loader = FakePhoneticModel.loader;
      const stream = await streamOf(pack);
      const settings = source.apply(
        new Settings().set(gutentypeProps.pack, pack),
      );
      equal(activePack(settings), pack);
      const starts = new Set<number>();
      for (let t = 0; t < testsPerCase; t++) {
        const drawn = await oneTest(settings);
        equal(drawn.length, wordsPerTest);
        const k = runStart(stream, drawn);
        isNotNull(
          k,
          `test ${t + 1} is not a run of consecutive ${pack.id} verse words: ${drawn.slice(0, 12).join(" ")}`,
        );
        starts.add(k!);
      }
      // A random starting verse: 50 tests do not all begin at the same place.
      isTrue(
        starts.size > testsPerCase / 2,
        `only ${starts.size} distinct starts in ${testsPerCase} tests`,
      );
    });
  }
}

test("BSB is the pack when the pack setting is unset", async () => {
  const stream = await streamOf(Pack.BSB);
  const kjv = await streamOf(Pack.KJV);
  // John 3:16 differs between the two packs, so a BSB run is told apart from a KJV run by its words.
  let bsbOnly = 0;
  for (let t = 0; t < 10; t++) {
    const drawn = await oneTest(new Settings());
    isNotNull(runStart(stream, drawn));
    if (runStart(kjv, drawn) == null) bsbOnly++;
  }
  equal(bsbOnly, 10);
});

for (const pack of [Pack.BSB, Pack.KJV]) {
  test(`${pack.id}: with a book chosen, ${testsPerCase} tests each start in that book`, async () => {
    const stream = await streamOf(pack);
    const settings = new Settings()
      .set(gutentypeProps.pack, pack)
      .set(typingTestBookProp, "ruth");
    for (let t = 0; t < testsPerCase; t++) {
      const drawn = await oneTest(settings);
      const k = runStart(stream, drawn);
      isNotNull(k, `test ${t + 1} is not consecutive verse text`);
      // A run that begins in Ruth may run on into 1 Samuel; its first verse is in Ruth.
      const books = [...stream.bookAt.entries()].filter(([at]) => at <= k!);
      equal(
        stream.bookAt.get(k!),
        "ruth",
        `test ${t + 1} starts in ${books.at(-1)?.[1]}`,
      );
    }
  });
}

test("a saved book id the pack does not have falls back to any book", async () => {
  const stream = await streamOf(Pack.BSB);
  const settings = new Settings().set(
    typingTestBookProp,
    "alice-in-wonderland",
  );
  for (let t = 0; t < 5; t++) {
    isNotNull(runStart(stream, await oneTest(settings)));
  }
});

test("changing the duration restarts the same passage at its first verse, not mid-verse", async () => {
  // Keybr's test screen takes `generator.mark()` on every render; a settings change re-renders it after the
  // first test already drew its lines. The new test must begin where the passage begins.
  const stream = await streamOf(Pack.BSB);
  const generators: TextGenerator[] = [];
  let update: ((s: Settings) => void) | null = null;
  let current: Settings | null = null;
  function Probe({ generator }: { generator: TextGenerator }) {
    const ctx = useSettings();
    update = ctx.updateSettings;
    current = ctx.settings;
    if (generators.at(-1) !== generator) generators.push(generator);
    return h("span", { title: "probe" }, String(generators.length));
  }
  const r = render(
    wrap(
      new Settings(),
      h(TextGeneratorLoader, {
        children: (g: TextGenerator) => h(Probe, { generator: g }),
      }),
    ),
  );
  try {
    await r.findByTitle("probe", {}, { timeout: 10_000 });
    const first = generators[0];
    const mark = first.mark();
    const firstWords = draw(first, 60); // a test lays out its lines
    first.reset(mark);
    draw(first, 60);
    update!(current!.set(typingTestProps.duration.value, 100));
    await waitFor(() => isTrue(generators.length > 1));
    const again = generators.at(-1)!;
    const restarted = draw(again, 60);
    deepEqual(restarted, firstWords);
    isNotNull(runStart(stream, restarted));
  } finally {
    r.unmount();
  }
});

test("a saved right-to-left common-words profile still lays the verses out left to right", async () => {
  let direction: string | null = null;
  function Probe() {
    direction = useCompositeSettings().textDisplay.language.direction;
    return h("span", { title: "probe" }, "probe");
  }
  const saved = new Settings()
    .set(typingTestProps.type, TextSourceType.CommonWords)
    .set(typingTestProps.language, Language.AR);
  const r = render(
    wrap(saved, h(TextGeneratorLoader, { children: () => h(Probe) })),
  );
  try {
    await r.findByTitle("probe", {}, { timeout: 10_000 });
    equal(direction, "ltr");
  } finally {
    r.unmount();
  }
});

for (const pack of [Pack.BSB, Pack.KJV]) {
  test(`${pack.id}: the text settings list scripture only, with a choice of book`, async () => {
    PhoneticModelLoader.loader = FakePhoneticModel.loader;
    const r = render(
      wrap(
        new Settings().set(gutentypeProps.pack, pack),
        h(TextGeneratorSettings),
      ),
    );
    try {
      await waitFor(() => isNotNull(r.queryByText("Any book")), {
        timeout: 10_000,
      });
      for (const hidden of [
        "Common words",
        "Pseudo words",
        "Book paragraphs",
        "Type the common words.",
        "Type the content of a book.",
      ]) {
        isNull(r.queryByText(hidden), `the settings show "${hidden}"`);
      }
      const text = r.container.textContent ?? "";
      for (const novel of [
        "Alice",
        "Jekyll",
        "Call of the Wild",
        "Marianela",
        "pseudo",
        "common words",
      ]) {
        isTrue(
          !text.toLowerCase().includes(novel.toLowerCase()),
          `the settings mention "${novel}"`,
        );
      }
      isTrue(
        text.includes(pack.info.short),
        `the settings do not name ${pack.info.short}`,
      );
    } finally {
      r.unmount();
    }
  });
}

test("choosing a book in the text settings saves it, and the next test starts there", async () => {
  let saved: Settings | null = null;
  function Spy() {
    saved = useSettings().settings;
    return null;
  }
  const r = render(
    wrap(new Settings(), h("div", null, h(TextGeneratorSettings), h(Spy))),
  );
  try {
    fireEvent.click(await r.findByText("Any book", {}, { timeout: 10_000 }));
    fireEvent.click(await r.findByText("Ruth"));
    await waitFor(() => equal(saved?.get(typingTestBookProp), "ruth"));
    isNotNull(r.queryByText("Ruth"));
  } finally {
    r.unmount();
  }
  const stream = await streamOf(Pack.BSB);
  equal(stream.bookAt.get(runStart(stream, await oneTest(saved!))!), "ruth");
});

test("the text settings name the chosen book", async () => {
  const r = render(
    wrap(
      new Settings().set(typingTestBookProp, "ruth"),
      h(TextGeneratorSettings),
    ),
  );
  try {
    await waitFor(() => isNotNull(r.queryByText("Ruth")), { timeout: 10_000 });
    isNull(r.queryByText("Any book"));
  } finally {
    r.unmount();
  }
});
