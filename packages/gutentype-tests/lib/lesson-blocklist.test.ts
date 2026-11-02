// ISC-53: no Learn lesson contains a word from the pack's reviewed blocklist, and no lesson places a flagged word
// next to a divine name: 100,000 generated lessons per pack, zero hits.
import { test } from "node:test";
import { loadLearn, loadWords, Pack } from "@gutentype/content";
import {
  blocklist,
  divineNames,
} from "@gutentype/tools/lib/learn-blocklist.ts";
import { scriptureLesson } from "@gutentype/tools/lib/learn-sim.ts";
import { lessonProps } from "@keybr/lesson";
import { LCG } from "@keybr/rand";
import { makeKeyStatsMap } from "@keybr/result";
import { Settings } from "@keybr/settings";
import { equal, isTrue } from "rich-assert";
import { lessonWords, stageStats } from "./learn-helpers.ts";

const reasons = new Map(blocklist.map(([w, why]) => [w, why]));

test("every blocklist entry carries a one-line reason, no duplicates", () => {
  equal(reasons.size, blocklist.length);
  for (const [w, why] of blocklist) {
    isTrue(/^[a-z]+$/.test(w), w);
    isTrue(why.length > 3 && !why.includes("\n"), w);
  }
});

for (const pack of [Pack.BSB, Pack.KJV]) {
  test(`${pack.id}: learn.json carries the reviewed blocklist and divine names for this pack`, async () => {
    const learn = await loadLearn(pack);
    const words = new Set((await loadWords(pack)).map(([w]) => w));
    const expected = blocklist
      .map(([w]) => w)
      .filter((w) => words.has(w))
      .sort();
    equal(learn.blocklist.join(" "), expected.join(" "));
    isTrue(learn.blocklist.length >= 40, `${learn.blocklist.length} entries`);
    for (const w of learn.blocklist) isTrue(reasons.has(w), w);
    equal(
      learn.divineNames.join(" "),
      divineNames
        .filter((w) => words.has(w))
        .sort()
        .join(" "),
    );
    for (const w of ["god", "lord", "jesus", "christ"])
      isTrue(learn.divineNames.includes(w), w);
    if (pack === Pack.KJV)
      for (const w of ["ass", "piss", "pisseth", "whore", "bastard"])
        isTrue(learn.blocklist.includes(w), w);
    if (pack === Pack.BSB)
      for (const w of ["prostitute", "sexual"])
        isTrue(learn.blocklist.includes(w), w);
    const blocked = new Set(learn.blocklist);
    const divine = new Set(learn.divineNames);
    for (const f of learn.fragments) {
      isTrue(!f.some((w) => blocked.has(w)), f.join(" "));
      isTrue(!divine.has(f[0]) && !divine.has(f.at(-1)!), f.join(" "));
    }
  });

  test(`${pack.id}: 100,000 lessons, no blocklisted word, no flagged word beside a divine name`, async () => {
    const learn = await loadLearn(pack);
    const blocked = new Set(learn.blocklist);
    const divine = new Set(learn.divineNames);
    // Every three-word window around a divine name that a verse fragment holds.
    const trigrams = new Set<string>();
    for (const f of learn.fragments)
      for (let i = 1; i + 1 < f.length; i++)
        if (divine.has(f[i])) trigrams.add(f.slice(i - 1, i + 2).join(" "));
    const lessons = [
      await scriptureLesson(pack),
      await scriptureLesson(
        pack,
        new Settings()
          .set(lessonProps.punctuators, 1)
          .set(lessonProps.capitals, 1)
          .set(lessonProps.repeatWords, 2),
      ),
    ];
    const rng = LCG(53);
    let n = 0;
    let blockedHits = 0;
    let divineHits = 0;
    let divineSeen = 0;
    while (n < 100_000) {
      for (const lesson of lessons) {
        for (let k = 5; k <= lesson.letters.length && n < 100_000; k++) {
          const keys = lesson.update(
            k === 5
              ? makeKeyStatsMap(lesson.letters, [])
              : stageStats(lesson, k),
          );
          for (let i = 0; i < 50 && n < 100_000; i++, n++) {
            const ws = lessonWords(String(lesson.generate(keys, rng)));
            ws.forEach((w, j) => {
              if (blocked.has(w)) blockedHits++;
              if (divine.has(w)) {
                divineSeen++;
                const prev = ws[j - 1];
                const next = ws[j + 1];
                if (
                  prev == null ||
                  next == null ||
                  blocked.has(prev) ||
                  blocked.has(next) ||
                  !trigrams.has(`${prev} ${w} ${next}`)
                ) {
                  divineHits++;
                }
              }
            });
          }
        }
      }
    }
    equal(n, 100_000);
    equal(blockedHits, 0);
    equal(divineHits, 0);
    isTrue(divineSeen > 0, "divine names do appear, inside their verses");
  });
}
