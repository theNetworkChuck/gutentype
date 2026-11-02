import {
  activePack,
  type LearnData,
  loadLearn,
  loadWords,
  Pack,
} from "@gutentype/content";
import { type Settings } from "@keybr/settings";

/** Everything a scripture lesson draws from, for one pack. */
export type ScriptureCorpus = {
  readonly pack: Pack;
  /** Drill words: the pack's words of three letters or more, most frequent first, with no blocked word and no divine name. */
  readonly words: readonly string[];
  /** How often each drill word occurs in the pack; lessons pick common words more often (ISC-71). */
  readonly wordCounts: ReadonlyMap<string, number>;
  /** Words the pack only ever capitalizes; lessons pick them a fifth as often (ISC-71). */
  readonly names: ReadonlySet<string>;
  /** Verse fragments (3 to 5 consecutive words), none holding a blocked word, none starting or ending with a divine name. */
  readonly fragments: readonly (readonly string[])[];
  readonly blocklist: ReadonlySet<string>;
  readonly divineNames: ReadonlySet<string>;
};

/** ISC-9's floor: distinct real words a pack must offer at six letters and at every later stage to be a Learn corpus. */
export const learnFloor = 50;

/** Keybr's guided lessons start at six letters (`guided.ts` `minSize`). */
export const firstStage = 6;

export function makeCorpus(
  pack: Pack,
  words: readonly (readonly [string, number])[],
  learn: LearnData,
): ScriptureCorpus {
  const blocklist = new Set(learn.blocklist);
  const divineNames = new Set(learn.divineNames);
  return {
    pack,
    words: words
      .map(([word]) => word)
      .filter(
        (word) =>
          word.length > 2 && !blocklist.has(word) && !divineNames.has(word),
      ),
    wordCounts: new Map(words.map(([word, count]) => [word, count])),
    names: new Set(learn.names ?? []),
    // learn.json is built to these rules already; they are checked again here so a hand-edited file cannot break them.
    fragments: learn.fragments.filter(
      (fragment) =>
        fragment.length >= 3 &&
        !fragment.some((word) => blocklist.has(word)) &&
        !divineNames.has(fragment[0]) &&
        !divineNames.has(fragment[fragment.length - 1]),
    ),
    blocklist,
    divineNames,
  };
}

const corpora = new Map<Pack, Promise<ScriptureCorpus>>();

/** One pack's corpus, loaded once (its word list and `learn.json` are each their own chunk). */
export function loadCorpus(pack: Pack): Promise<ScriptureCorpus> {
  let p = corpora.get(pack);
  if (p == null) {
    p = Promise.all([loadWords(pack), loadLearn(pack)]).then(([words, learn]) =>
      makeCorpus(pack, words, learn),
    );
    corpora.set(pack, p);
    p.catch(() => corpora.delete(pack));
  }
  return p;
}

/**
 * For each stage size k (index k), how many drill words use only the first k letters of `order`.
 * Words with a letter outside `order` never count.
 */
export function wordsPerStage(
  words: readonly string[],
  order: readonly number[],
): number[] {
  const rank = new Map(order.map((codePoint, i) => [codePoint, i + 1]));
  const counts = new Array<number>(order.length + 1).fill(0);
  for (const word of words) {
    let top = 0;
    for (const ch of word) {
      const r = rank.get(ch.codePointAt(0)!);
      if (r == null) {
        top = Infinity;
        break;
      }
      top = Math.max(top, r);
    }
    if (top <= order.length) counts[top]++;
  }
  for (let k = 1; k <= order.length; k++) counts[k] += counts[k - 1];
  return counts;
}

/** True when the pack offers at least `learnFloor` words at six letters and at every later stage of its own order. */
export function meetsLearnFloor(corpus: ScriptureCorpus): boolean {
  const order = [...corpus.pack.letterOrder].map((ch) => ch.codePointAt(0)!);
  const counts = wordsPerStage(corpus.words, order);
  for (let k = firstStage; k <= order.length; k++) {
    if (counts[k] < learnFloor) return false;
  }
  return order.length >= firstStage;
}

/** The corpus Learn runs on: the active pack when it meets ISC-9's floor, otherwise BSB (the pack stays Read-only). */
export async function loadLearnCorpus(
  settings: Settings,
): Promise<ScriptureCorpus> {
  const pack = activePack(settings);
  const corpus = await loadCorpus(pack);
  if (pack === Pack.BSB || meetsLearnFloor(corpus)) {
    return corpus;
  }
  return loadCorpus(Pack.BSB);
}
