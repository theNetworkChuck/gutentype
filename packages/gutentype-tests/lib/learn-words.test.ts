// ISC-8: every word of every Learn lesson, at every unlocked-letter count, is a word of the active pack; no
// pseudo-word and no "?" placeholder, whatever the naturalWords setting says.
import { test } from "node:test";
import { loadWords, Pack } from "@gutentype/content";
import { ScriptureLesson } from "@gutentype/lesson";
import { scriptureLesson } from "@gutentype/tools/lib/learn-sim.ts";
import { lessonProps } from "@keybr/lesson";
import { LCG } from "@keybr/rand";
import { Settings } from "@keybr/settings";
import { equal, isTrue } from "rich-assert";
import { lessonWords, stageStats } from "./learn-helpers.ts";

const variants: [string, Settings][] = [
  [
    "naturalWords on",
    new Settings().set(lessonProps.guided.naturalWords, true),
  ],
  [
    "naturalWords off",
    new Settings().set(lessonProps.guided.naturalWords, false),
  ],
  [
    "capitals, punctuation and repeats on",
    new Settings()
      .set(lessonProps.guided.naturalWords, false)
      .set(lessonProps.capitals, 1)
      .set(lessonProps.punctuators, 1)
      .set(lessonProps.repeatWords, 3),
  ],
];

for (const pack of [Pack.BSB, Pack.KJV]) {
  for (const [name, settings] of variants) {
    test(`${pack.id}, ${name}: 100 lessons per stage, every word in the pack word list`, async () => {
      const words = new Set((await loadWords(pack)).map(([w]) => w));
      const lesson = await scriptureLesson(pack, settings);
      isTrue(lesson instanceof ScriptureLesson);
      const rng = LCG(8);
      let outside = 0;
      let placeholders = 0;
      for (let k = 6; k <= lesson.letters.length; k++) {
        const lessonKeys = lesson.update(stageStats(lesson, k));
        equal(lessonKeys.findIncludedKeys().length, k);
        for (let i = 0; i < 100; i++) {
          const text = String(lesson.generate(lessonKeys, rng));
          if (
            lesson.settings.get(lessonProps.punctuators) === 0 &&
            text.includes("?")
          )
            placeholders++;
          if (text.split(/\s+/).some((t) => t === "?")) placeholders++;
          for (const w of lessonWords(text)) if (!words.has(w)) outside++;
        }
      }
      equal(outside, 0);
      equal(placeholders, 0);
    });
  }
}
