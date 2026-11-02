// ISC-10: from the first lesson on, every lesson carries a run of three or more consecutive words of a verse.
import { test } from "node:test";
import { loadBook, loadLearn, Pack } from "@gutentype/content";
import { scriptureLesson } from "@gutentype/tools/lib/learn-sim.ts";
import { LCG } from "@keybr/rand";
import { makeKeyStatsMap } from "@keybr/result";
import { equal, isTrue } from "rich-assert";
import { lessonWords, stageStats } from "./learn-helpers.ts";

for (const pack of [Pack.BSB, Pack.KJV]) {
  test(`${pack.id}: every learn.json fragment is 3 to 5 consecutive words of a real verse`, async () => {
    const { fragments } = await loadLearn(pack);
    isTrue(fragments.length > 1000, `${fragments.length} fragments`);
    const wanted = new Set<string>();
    for (const f of fragments) {
      isTrue(f.length >= 3 && f.length <= 5, f.join(" "));
      for (const w of f) isTrue(/^[a-z]+$/.test(w), f.join(" "));
      wanted.add(f.join(" "));
    }
    // An independent tokenizer: every letter run of every verse, windows of 3 to 5.
    for (const book of pack.info.books) {
      const text = await loadBook(pack, book.id);
      for (const chapter of text.chapters) {
        for (const verse of chapter) {
          const ws = verse.toLowerCase().match(/[a-z]+/g) ?? [];
          for (let n = 3; n <= 5; n++)
            for (let i = 0; i + n <= ws.length; i++)
              wanted.delete(ws.slice(i, i + n).join(" "));
        }
      }
    }
    equal([...wanted].slice(0, 5).join(" | "), "");
  });

  test(`${pack.id}: the first lesson and 100 lessons at every stage each carry a verse fragment`, async () => {
    const lesson = await scriptureLesson(pack);
    const { fragments } = await loadLearn(pack);
    const set = new Set(fragments.map((f) => f.join(" ")));
    const hasFragment = (text: string) => {
      const ws = lessonWords(text);
      for (let n = 3; n <= 5; n++)
        for (let i = 0; i + n <= ws.length; i++)
          if (set.has(ws.slice(i, i + n).join(" "))) return true;
      return false;
    };
    const rng = LCG(10);
    const firstKeys = lesson.update(makeKeyStatsMap(lesson.letters, []));
    isTrue(
      hasFragment(String(lesson.generate(firstKeys, rng))),
      "first lesson",
    );
    let missing = 0;
    for (let k = 6; k <= lesson.letters.length; k++) {
      const keys = lesson.update(stageStats(lesson, k));
      for (let i = 0; i < 100; i++)
        if (!hasFragment(String(lesson.generate(keys, rng)))) missing++;
    }
    equal(missing, 0);
  });
}
