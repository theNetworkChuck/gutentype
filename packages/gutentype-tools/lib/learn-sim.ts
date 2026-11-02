#!/usr/bin/env bun
/**
 * The learning-speed simulator (ISC-39): one simulated typist learns from zero on Keybr's stock English guided
 * lesson and on the scripture lesson, with the same code, and we count the lessons each needs to unlock every
 * letter.
 *
 *   bun packages/gutentype-tools/lib/learn-sim.ts
 *
 * The loop mirrors `page-practice/lib/practice/state/lesson-state.ts` and `progress.ts`: `lesson.update()` on the
 * key stats so far, `lesson.generate()`, the text typed into Keybr's `TextInput` with the person's settings,
 * `makeStats()` and `Result.fromStats()`, and the result appended to the key stats only when `result.validate()`
 * passes (as `PracticeScreen.tsx` does).
 */
import { Pack } from "@gutentype/content";
import { loadCorpus, packModel, ScriptureLesson } from "@gutentype/lesson";
import { loadWordList } from "@keybr/content-words";
import { keyboardProps, Language, Layout, loadKeyboard } from "@keybr/keyboard";
import { GuidedLesson, type Lesson, lessonProps } from "@keybr/lesson";
import { LCG, type RNGStream } from "@keybr/rand";
import { MutableKeyStatsMap, Result } from "@keybr/result";
import { Settings } from "@keybr/settings";
import { makeStats, TextInput, toTextInputSettings } from "@keybr/textinput";
import { englishModel } from "./learn-model.ts";

/** How long the typist takes for one key, given how many times they have typed it correctly before. */
export type Typist = {
  readonly name: string;
  readonly errorRate: number;
  msPerKey(codePoint: number, practiced: number): number;
};

/** Every key at one fixed speed, a little above Keybr's default target of 175 characters per minute. */
export const fixedTypist: Typist = {
  name: "fixed per-key speed, 3% errors",
  errorRate: 0.03,
  msPerKey: (codePoint) => 60000 / (230 + ((codePoint * 7) % 5) * 10),
};

/** Each key starts at half the target speed and gets faster the more it is typed (the same curve for every key). */
export const practiceTypist: Typist = {
  name: "per-key speed improving with practice, 3% errors",
  errorRate: 0.03,
  msPerKey: (codePoint, practiced) =>
    (60000 / 175) *
    (0.75 + 1.25 * Math.exp(-practiced / 60)) *
    (1 + (((codePoint * 7) % 5) - 2) * 0.03),
};

/** Types one lesson text, the way a person at this typist's speed and error rate would. */
export function typeLesson(
  text: string,
  settings: Settings,
  typist: Typist,
  practiced: Map<number, number>,
  rng: RNGStream,
  startedAt: number,
): Result {
  const textInput = new TextInput(text, toTextInputSettings(settings));
  let now = startedAt;
  while (!textInput.completed) {
    const { codePoint } = textInput.at(textInput.pos);
    const n = practiced.get(codePoint) ?? 0;
    const ms = Math.round(typist.msPerKey(codePoint, n));
    if (codePoint !== 0x0020 && rng() < typist.errorRate) {
      const wrong = codePoint === 0x0071 ? 0x0077 : 0x0071; // "q", or "w" when "q" is expected
      now += ms;
      textInput.onInput({
        timeStamp: now,
        inputType: "appendChar",
        codePoint: wrong,
        timeToType: ms,
      });
    }
    now += ms;
    textInput.onInput({
      timeStamp: now,
      inputType: "appendChar",
      codePoint,
      timeToType: ms,
    });
    practiced.set(codePoint, n + 1);
  }
  return Result.fromStats(
    settings.get(keyboardProps.layout),
    settings.get(lessonProps.type).textType,
    now,
    makeStats(textInput.steps),
  );
}

export type SimulationResult = {
  /** Lessons typed before every letter was in the lesson, or null if that never happened within the cap. */
  readonly lessonsToUnlockAll: number | null;
  readonly letters: number;
  /** Lesson number at which the n-th letter joined, n from 1. */
  readonly unlockedAt: readonly number[];
  readonly results: readonly Result[];
};

export function simulate(
  lesson: Lesson,
  typist: Typist,
  { seed = 1, maxLessons = 2000 }: { seed?: number; maxLessons?: number } = {},
): SimulationResult {
  const rng = LCG(seed);
  const typingRng = LCG(seed + 1);
  const keyStatsMap = new MutableKeyStatsMap(lesson.letters);
  const practiced = new Map<number, number>();
  const results: Result[] = [];
  const unlockedAt: number[] = [];
  let now = /* 2026-01-01 */ 1767225600000;
  for (let n = 0; n < maxLessons; n++) {
    const lessonKeys = lesson.update(keyStatsMap.copy());
    const included = lessonKeys.findIncludedKeys().length;
    while (unlockedAt.length < included) unlockedAt.push(n);
    if (included === lesson.letters.length) {
      return {
        lessonsToUnlockAll: n,
        letters: lesson.letters.length,
        unlockedAt,
        results,
      };
    }
    const text = String(lesson.generate(lessonKeys, rng));
    const result = typeLesson(
      text,
      lesson.settings,
      typist,
      practiced,
      typingRng,
      now,
    );
    now = result.timeStamp + 5000;
    if (result.validate()) {
      results.push(result);
      keyStatsMap.append(result);
    }
  }
  return {
    lessonsToUnlockAll: null,
    letters: lesson.letters.length,
    unlockedAt,
    results,
  };
}

/** Keybr's stock guided lesson on its English model and English word list, as `LessonLoader.tsx` built it. */
export async function stockEnglishLesson(
  settings = new Settings(),
): Promise<GuidedLesson> {
  const keyboard = loadKeyboard(Layout.EN_US);
  return new GuidedLesson(
    settings,
    keyboard,
    englishModel(),
    await loadWordList(Language.EN),
  );
}

/** The scripture lesson on a pack, on the same English model and keyboard. */
export async function scriptureLesson(
  pack: Pack,
  settings = new Settings(),
): Promise<ScriptureLesson> {
  const keyboard = loadKeyboard(Layout.EN_US);
  const corpus = await loadCorpus(pack);
  return new ScriptureLesson(
    settings,
    keyboard,
    packModel(englishModel(), pack),
    corpus,
  );
}

export async function compareLearningSpeed(typist: Typist, seeds = [1, 2, 3]) {
  const rows = [];
  for (const seed of seeds) {
    const stock = simulate(await stockEnglishLesson(), typist, { seed });
    const bsb = simulate(await scriptureLesson(Pack.BSB), typist, { seed });
    rows.push({
      seed,
      stock: stock.lessonsToUnlockAll,
      bsb: bsb.lessonsToUnlockAll,
      stockUnlocks: stock.unlockedAt,
      bsbUnlocks: bsb.unlockedAt,
    });
  }
  const sum = (xs: (number | null)[]) =>
    xs.reduce<number>((a, b) => a + (b ?? Infinity), 0);
  return {
    typist: typist.name,
    rows,
    stockTotal: sum(rows.map((r) => r.stock)),
    bsbTotal: sum(rows.map((r) => r.bsb)),
  };
}

if (import.meta.main) {
  for (const typist of [fixedTypist, practiceTypist]) {
    const { rows, stockTotal, bsbTotal } = await compareLearningSpeed(typist);
    console.log(typist.name);
    for (const r of rows) {
      console.log(
        `  seed ${r.seed}: stock English ${r.stock} lessons, BSB ${r.bsb} lessons`,
      );
    }
    console.log(
      `  total: stock ${stockTotal}, BSB ${bsbTotal}, ratio ${(bsbTotal / stockTotal).toFixed(3)}`,
    );
  }
}
