// ISC-11: Keybr's per-key speed and confidence stats and its lessons-remaining prediction run unchanged on the
// pack corpus (Keybr's own suite: `bun --cwd packages/keybr-lesson run test`).
import { test } from "node:test";
import { Pack } from "@gutentype/content";
import { packModel } from "@gutentype/lesson";
import { englishModel } from "@gutentype/tools/lib/learn-model.ts";
import {
  practiceTypist,
  scriptureLesson,
  simulate,
} from "@gutentype/tools/lib/learn-sim.ts";
import { Layout, loadKeyboard } from "@keybr/keyboard";
import { GuidedLesson, LearningRate, Target } from "@keybr/lesson";
import { MutableKeyStatsMap } from "@keybr/result";
import { deepEqual, isTrue } from "rich-assert";

test("ScriptureLesson.update is Keybr's GuidedLesson.update, key for key", async () => {
  const lesson = await scriptureLesson(Pack.BSB);
  const stock = new GuidedLesson(
    lesson.settings,
    loadKeyboard(Layout.EN_US),
    packModel(englishModel(), Pack.BSB),
    [],
  );
  const { results } = simulate(lesson, practiceTypist, {
    seed: 5,
    maxLessons: 120,
  });
  isTrue(results.length >= 100, `${results.length} results`);
  const a = new MutableKeyStatsMap(lesson.letters);
  const b = new MutableKeyStatsMap(stock.letters);
  const show = (keys: ReturnType<GuidedLesson["update"]>) =>
    [...keys].map((k) => [
      k.letter.codePoint,
      k.isIncluded,
      k.isFocused,
      k.isForced,
      k.confidence,
      k.bestConfidence,
    ]);
  for (const r of results) {
    a.append(r);
    b.append(r);
    deepEqual(show(lesson.update(a)), show(stock.update(b)));
  }
});

test("lessons-remaining prediction runs on pack-corpus results", async () => {
  const lesson = await scriptureLesson(Pack.BSB);
  const { results } = simulate(lesson, practiceTypist, {
    seed: 6,
    maxLessons: 60,
  });
  const map = new MutableKeyStatsMap(lesson.letters);
  for (const r of results) map.append(r);
  const target = new Target(lesson.settings);
  let predicted = 0;
  for (const keyStats of map) {
    const rate = LearningRate.from(keyStats.samples, target);
    if (rate != null) {
      isTrue(
        Number.isFinite(rate.learningRate) || Number.isNaN(rate.learningRate),
      );
      predicted++;
    }
  }
  isTrue(predicted >= 6, `${predicted} keys with a learning-rate prediction`);
});
