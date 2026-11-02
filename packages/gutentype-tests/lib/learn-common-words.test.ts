// ISC-71: Learn drills lean on the Bible's everyday words, not its rarest names. The pack word list holds every
// word of the Bible, names included, and the early stages have few words, so picking uniformly (as Keybr does from
// its everyday-English dictionary) fills a lesson with names like "ethnan" and "aiah". Over 200 lessons per stage
// at six and seven letters (with at least 30 different words), words that never appear in lowercase anywhere in
// the pack stay under 15% of the words.
import { test } from "node:test";
import { loadBook, Pack } from "@gutentype/content";
import { scriptureLesson } from "@gutentype/tools/lib/learn-sim.ts";
import { LCG } from "@keybr/rand";
import { Settings } from "@keybr/settings";
import { isTrue } from "rich-assert";
import { lessonWords, stageStats } from "./learn-helpers.ts";

/** Words that appear in the pack only with a capital first letter: names, in practice. */
async function namesOnly(pack: Pack): Promise<Set<string>> {
  const lower = new Set<string>();
  const any = new Set<string>();
  for (const { id } of pack.info.books) {
    const book = await loadBook(pack, id);
    for (const chapter of book.chapters) {
      for (const verse of chapter ?? []) {
        for (const [w] of (verse ?? "").matchAll(/[A-Za-z]+/g)) {
          const l = w.toLowerCase();
          any.add(l);
          if (w[0] === l[0]) lower.add(l);
        }
      }
    }
  }
  return new Set([...any].filter((w) => !lower.has(w)));
}

for (const pack of [Pack.BSB, Pack.KJV]) {
  test(`${pack.id}: names stay under 15% of Learn words at six and seven letters`, async () => {
    const names = await namesOnly(pack);
    isTrue(names.size > 1000, `name set looks wrong: ${names.size}`);
    const lesson = await scriptureLesson(pack, new Settings());
    const rng = LCG(71);
    for (const k of [6, 7]) {
      const lessonKeys = lesson.update(stageStats(lesson, k));
      let total = 0;
      let named = 0;
      const distinct = new Set<string>();
      for (let i = 0; i < 200; i++) {
        for (const word of lessonWords(
          String(lesson.generate(lessonKeys, rng)),
        )) {
          total++;
          distinct.add(word);
          if (names.has(word)) named++;
        }
      }
      const share = named / total;
      // Variety floor: weighting must not collapse lessons onto a handful of words.
      isTrue(
        distinct.size >= 30,
        `${pack.id} at ${k} letters: only ${distinct.size} distinct words`,
      );
      isTrue(
        share < 0.15,
        `${pack.id} at ${k} letters: names are ${(share * 100).toFixed(1)}% of ${total} words`,
      );
    }
  });
}
