/** Shared helpers for the Learn lane's tests (ISC-8, 9, 10, 12, 39, 53). */
import { type LessonKeys } from "@keybr/lesson";
import { type Lesson, lessonProps } from "@keybr/lesson";
import { Letter } from "@keybr/phonetic-model";
import { type KeyStats, type KeyStatsMap, speedToTime } from "@keybr/result";

/**
 * Key stats under which Keybr's guided `update()` includes exactly `k` letters (k >= 6): the first k - 1 letters
 * of the unlock order were once above the target speed, the rest were never typed.
 */
export function stageStats(lesson: Lesson, k: number): KeyStatsMap {
  const order = unlockOrder(lesson);
  const targetTime = speedToTime(lesson.settings.get(lessonProps.targetSpeed));
  const map = new Map<Letter, KeyStats>();
  order.forEach((letter, i) => {
    const t = i < k - 1 && k > 6 ? targetTime : null;
    map.set(letter, {
      letter,
      samples: [],
      timeToType: t,
      bestTimeToType: t,
    } as KeyStats);
  });
  const letters = [...lesson.letters];
  return {
    letters,
    results: [],
    get: (letter: Letter) => map.get(letter)!,
    [Symbol.iterator]: () => letters.map((l) => map.get(l)!)[Symbol.iterator](),
  } as KeyStatsMap;
}

/** The order the lesson unlocks letters in, by the same rule `guided.ts` uses. */
export function unlockOrder(lesson: Lesson): Letter[] {
  if (lesson.settings.get(lessonProps.guided.keyboardOrder)) {
    return Letter.weightedFrequencyOrder(lesson.letters, ({ codePoint }) =>
      lesson.codePoints.weight(codePoint),
    );
  }
  return Letter.frequencyOrder(lesson.letters);
}

export function included(lessonKeys: LessonKeys): string {
  return lessonKeys
    .findIncludedKeys()
    .map(({ letter }) => String.fromCodePoint(letter.codePoint))
    .join("");
}

/** The words of a lesson text: split on spaces and hyphens, punctuation stripped, lowercased. */
export function lessonWords(text: string): string[] {
  return text
    .split(/[\s-]+/)
    .map((t) => t.replace(/[^\p{L}]/gu, "").toLowerCase())
    .filter((t) => t !== "");
}
