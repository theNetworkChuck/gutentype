// ISC-12: switching the pack (BSB to KJV) changes the lesson corpus when the new pack meets ISC-9's floor
// (otherwise Learn stays on BSB) and keeps per-key progress.
import { test } from "node:test";
import {
  activePack,
  gutentypeProps,
  loadWords,
  Pack,
} from "@gutentype/content";
import {
  loadLearnCorpus,
  makeCorpus,
  meetsLearnFloor,
} from "@gutentype/lesson";
import {
  fixedTypist,
  scriptureLesson,
  simulate,
} from "@gutentype/tools/lib/learn-sim.ts";
import { LCG } from "@keybr/rand";
import { MutableKeyStatsMap } from "@keybr/result";
import { Settings } from "@keybr/settings";
import { deepEqual, equal, isFalse, isTrue } from "rich-assert";
import { lessonWords, stageStats } from "./learn-helpers.ts";

test("the Learn corpus follows the chosen pack when it meets the floor", async () => {
  const bsb = await loadLearnCorpus(new Settings());
  equal(bsb.pack, Pack.BSB);
  const kjvSettings = new Settings().set(gutentypeProps.pack, Pack.KJV);
  equal(activePack(kjvSettings), Pack.KJV);
  const kjv = await loadLearnCorpus(kjvSettings);
  equal(kjv.pack, Pack.KJV);
  isTrue(meetsLearnFloor(bsb));
  isTrue(meetsLearnFloor(kjv));
  // A pack too thin for Learn (fewer than 50 words at six letters) is Read-only: Learn stays on BSB.
  const thin = makeCorpus(
    Pack.KJV,
    [
      ["the", 1],
      ["that", 1],
      ["then", 1],
    ],
    { fragments: [], blocklist: [], divineNames: [] },
  );
  isFalse(meetsLearnFloor(thin));
});

test("switching BSB to KJV changes the lesson words", async () => {
  const bsbWords = new Set((await loadWords(Pack.BSB)).map(([w]) => w));
  const kjvWords = new Set((await loadWords(Pack.KJV)).map(([w]) => w));
  const kjvOnly = new Set([...kjvWords].filter((w) => !bsbWords.has(w)));
  const bsbOnly = new Set([...bsbWords].filter((w) => !kjvWords.has(w)));
  const rng = LCG(12);
  const tally = async (pack: Pack, own: Set<string>, other: Set<string>) => {
    const lesson = await scriptureLesson(pack);
    const keys = lesson.update(stageStats(lesson, 26));
    let ownOnly = 0;
    let outside = 0;
    for (let i = 0; i < 300; i++) {
      for (const w of lessonWords(String(lesson.generate(keys, rng)))) {
        if (own.has(w)) ownOnly++;
        if (other.has(w)) outside++;
      }
    }
    return { ownOnly, outside };
  };
  const kjv = await tally(Pack.KJV, kjvOnly, bsbOnly);
  const bsb = await tally(Pack.BSB, bsbOnly, kjvOnly);
  isTrue(kjv.ownOnly > 50, `KJV-only words in KJV lessons: ${kjv.ownOnly}`);
  isTrue(bsb.ownOnly > 50, `BSB-only words in BSB lessons: ${bsb.ownOnly}`);
  equal(kjv.outside, 0);
  equal(bsb.outside, 0);
});

test("per-key progress is identical before and after the switch", async () => {
  const bsb = await scriptureLesson(Pack.BSB);
  const kjv = await scriptureLesson(Pack.KJV);
  const { results } = simulate(bsb, fixedTypist, { seed: 3, maxLessons: 15 });
  isTrue(results.length >= 10);
  const before = new MutableKeyStatsMap(bsb.letters);
  const after = new MutableKeyStatsMap(kjv.letters);
  for (const r of results) {
    before.append(r);
    after.append(r);
  }
  const dump = (m: MutableKeyStatsMap) =>
    [...m]
      .map(({ letter, timeToType, bestTimeToType, samples }) => ({
        cp: letter.codePoint,
        timeToType,
        bestTimeToType,
        samples: samples.length,
      }))
      .sort((a, b) => a.cp - b.cp);
  deepEqual(dump(after), dump(before));
  equal(dump(before).length, 26);
});
