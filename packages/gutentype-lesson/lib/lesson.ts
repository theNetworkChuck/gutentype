import { type Keyboard } from "@keybr/keyboard";
import {
  GuidedLesson,
  type LessonKey,
  type LessonKeys,
  lessonProps,
} from "@keybr/lesson";
import { Filter, Letter, type PhoneticModel } from "@keybr/phonetic-model";
import { type RNGStream } from "@keybr/rand";
import { type Settings } from "@keybr/settings";
import { type CodePoint } from "@keybr/unicode";
import {
  firstStage,
  learnFloor,
  type ScriptureCorpus,
  wordsPerStage,
} from "./corpus.ts";
import { mangledWords, uniqueWords, weightedWords } from "./text.ts";

type Fragment = {
  readonly words: readonly string[];
  /** Distinct code points of the fragment's letters. */
  readonly letters: readonly CodePoint[];
  /** Letters typed, spaces excluded, as Keybr counts lesson length. */
  readonly size: number;
};

type Fits = {
  readonly all: readonly Fragment[];
  readonly byFocus: Map<CodePoint, readonly Fragment[]>;
};

/**
 * Keybr's guided lesson on a scripture pack. `update()` is Keybr's, untouched: the unlock order, per-key
 * confidence and focus logic all run as upstream wrote them, on a model whose letter frequencies are the pack's
 * (see `packModel`). `generate()` is replaced: every word is a pack word (never a phonetic pseudo-word, whatever
 * `naturalWords` says, and never a `?` placeholder), and every lesson carries at least one verse fragment.
 *
 * Divine names are never drawn as loose drill words; they only appear inside a verse fragment, between words of
 * their own verse, so no lesson sets a divine name beside an unrelated word. Blocked words never appear at all.
 */
export class ScriptureLesson extends GuidedLesson {
  readonly corpus: ScriptureCorpus;
  readonly #fragments: readonly Fragment[];
  readonly #fits = new Map<string, Fits>();

  constructor(
    settings: Settings,
    keyboard: Keyboard,
    model: PhoneticModel,
    corpus: ScriptureCorpus,
  ) {
    super(
      scriptureSettings(settings, keyboard, model, corpus),
      keyboard,
      model,
      corpus.words,
    );
    this.corpus = corpus;
    this.#fragments = corpus.fragments.map(toFragment);
  }

  override generate(lessonKeys: LessonKeys, rng: RNGStream): string {
    const includedKeys = lessonKeys.findIncludedKeys();
    const focusedKey = lessonKeys.findFocusedKey();
    const words = this.#drillWords(includedKeys, focusedKey);
    const nextWord = mangledWords(
      uniqueWords(weightedWords(words, this.#wordWeight, rng)),
      this.model.language,
      Letter.restrict(Letter.punctuators, this.codePoints),
      {
        withCapitals: this.settings.get(lessonProps.capitals),
        withPunctuators: this.settings.get(lessonProps.punctuators),
      },
      rng,
    );
    const length =
      100 + Math.round(this.settings.get(lessonProps.length) * 100);
    const repeatWords = this.settings.get(lessonProps.repeatWords);

    // One verse fragment per lesson, two in the longer lessons.
    const fragments: Fragment[] = [];
    const first = this.#pickFragment(includedKeys, focusedKey, rng);
    if (first != null) {
      fragments.push(first);
      if (length >= 150) {
        const second = this.#pickFragment(includedKeys, focusedKey, rng);
        if (second != null) fragments.push(second);
      }
    }

    // Drill words, as Keybr's generateFragment lays them out, until the lesson is long enough.
    const groups: string[][] = [];
    let size = fragments.reduce((sum, f) => sum + f.size, 0);
    while (size < length && words.length > 0) {
      const word = nextWord() || words[0];
      const group: string[] = [];
      for (let i = 1; i <= repeatWords && size < length; i++) {
        group.push(word);
        size += word.length;
      }
      groups.push(group);
    }
    for (const fragment of fragments) {
      const at = Math.floor(rng() * (groups.length + 1));
      groups.splice(at, 0, [...fragment.words]);
    }
    return groups.flat().join(" ");
  }

  /**
   * ISC-71: how likely a drill word is to be picked. Keybr samples its everyday-English dictionary uniformly; a
   * pack's list holds every word of the Bible, names included, and the early stages have few words, so uniform
   * picks fill a lesson with rare names. Weight by log2(count + 1), and a name counts a fifth. Names stay in play,
   * so the stage floor (ISC-9) is unchanged.
   */
  readonly #wordWeight = (word: string): number =>
    Math.log2((this.corpus.wordCounts.get(word) ?? 1) + 1) *
    (this.corpus.names.has(word) ? 0.2 : 1);

  /** Pack words that use only the included letters, the focused letter first, as Keybr's natural-words branch picks them. */
  #drillWords(
    includedKeys: readonly LessonKey[],
    focusedKey: LessonKey | null,
  ): readonly string[] {
    const words = this.dictionary
      .find(new Filter(includedKeys, focusedKey))
      .slice(0, 1000);
    if (words.length < 15) {
      // Keybr pads with phonetic pseudo-words here; Gutentype pads with real pack words on the same letters.
      const seen = new Set(words);
      for (const word of this.dictionary.find(new Filter(includedKeys))) {
        if (words.length >= 15) break;
        if (!seen.has(word)) {
          seen.add(word);
          words.push(word);
        }
      }
    }
    if (words.length === 0) {
      // No pack word fits these letters (not the case for any shipped pack, see ISC-9): use the commonest pack words.
      words.push(...[...this.dictionary].slice(0, 15));
    }
    if (words.length === 0) {
      words.push(...this.#fragments.flatMap((f) => f.words).slice(0, 15));
    }
    return words;
  }

  #pickFragment(
    includedKeys: readonly LessonKey[],
    focusedKey: LessonKey | null,
    rng: RNGStream,
  ): Fragment | null {
    const fits = this.#fitsFor(includedKeys);
    if (fits.all.length === 0) return null;
    let list = fits.all;
    if (focusedKey != null) {
      const { codePoint } = focusedKey.letter;
      let withFocus = fits.byFocus.get(codePoint);
      if (withFocus == null) {
        withFocus = fits.all.filter((f) => f.letters.includes(codePoint));
        fits.byFocus.set(codePoint, withFocus);
      }
      if (withFocus.length > 0) list = withFocus;
    }
    return list[Math.floor(rng() * list.length)];
  }

  /** The fragments typeable with the included letters (cached per letter set). */
  #fitsFor(includedKeys: readonly LessonKey[]): Fits {
    const codePoints = includedKeys.map(({ letter }) => letter.codePoint);
    const key = [...codePoints].sort((a, b) => a - b).join(",");
    let fits = this.#fits.get(key);
    if (fits == null) {
      const set = new Set(codePoints);
      const outside = (f: Fragment) =>
        f.letters.reduce((n, cp) => (set.has(cp) ? n : n + 1), 0);
      let all = this.#fragments.filter((f) => outside(f) === 0);
      if (all.length === 0 && this.#fragments.length > 0) {
        // Only reachable on a keyboard or model without the pack's first six letters: take the closest fragments.
        const least = Math.min(...this.#fragments.map(outside));
        all = this.#fragments.filter((f) => outside(f) === least);
      }
      if (this.#fits.size > 64) this.#fits.clear();
      this.#fits.set(key, (fits = { all, byFocus: new Map() }));
    }
    return fits;
  }
}

function toFragment(words: readonly string[]): Fragment {
  const letters = new Set<CodePoint>();
  let size = 0;
  for (const word of words) {
    size += word.length;
    for (const ch of word) letters.add(ch.codePointAt(0)!);
  }
  return { words, letters: [...letters], size };
}

/**
 * The person's settings, except that Keybr's "keyboard order" option is honored only when that order still meets
 * ISC-9's floor on this pack (at least 50 words at six letters and every later stage, and a verse fragment from the
 * first lesson); otherwise the pack's frequency order is used.
 */
export function scriptureSettings(
  settings: Settings,
  keyboard: Keyboard,
  model: PhoneticModel,
  corpus: ScriptureCorpus,
): Settings {
  if (!settings.get(lessonProps.guided.keyboardOrder)) {
    return settings;
  }
  const codePoints = keyboard.getCodePoints();
  const order = Letter.weightedFrequencyOrder(
    Letter.restrict(model.letters, codePoints),
    ({ codePoint }) => codePoints.weight(codePoint),
  ).map(({ codePoint }) => codePoint);
  const counts = wordsPerStage(corpus.words, order);
  let ok = order.length >= firstStage;
  for (let k = firstStage; ok && k <= order.length; k++) {
    if (counts[k] < learnFloor) ok = false;
  }
  if (ok) {
    const firstSix = new Set(order.slice(0, firstStage));
    ok = corpus.fragments.some((f) =>
      f.every((w) => [...w].every((ch) => firstSix.has(ch.codePointAt(0)!))),
    );
  }
  return ok ? settings : settings.set(lessonProps.guided.keyboardOrder, false);
}
