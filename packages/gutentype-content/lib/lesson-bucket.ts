/**
 * The speed-and-accuracy count (ISC-75, ISC-76, CONTRACTS § 4). After each finished Learn lesson the browser sends
 * one anonymous ping whose counter name is the lesson's speed bucket and accuracy bucket, for example
 * `lesson-s40-a96`: 40 to 44 words per minute at 96% accuracy. The server keeps a daily total per name; Profile
 * compares a person against the last 90 days of those totals. The name is the only thing the ping carries.
 */

/** Width of one speed bucket, in words per minute. */
export const speedStepWpm = 5;

/** The top speed bucket: every lesson at or above it counts here (Keybr's own histogram ends at 150 wpm). */
export const speedTopWpm = 150;

/** Number of speed buckets: 0, 5, …, 150. */
export const speedBuckets = speedTopWpm / speedStepWpm + 1;

/** Number of accuracy buckets: 0%, 1%, …, 100%. */
export const accuracyBuckets = 101;

/** Keybr measures speed in characters per minute; a word is five characters (`SpeedUnit.WPM`). */
export const charsPerWord = 5;

/** Below this many lessons in the window, Profile says there is not enough data yet instead of a percentage. */
export const minComparisonLessons = 100;

export type LessonBucketName = `lesson-s${number}-a${number}`;

export type LessonBucket = {
  /** Lower edge of the speed bucket, words per minute, a multiple of `speedStepWpm`. */
  readonly speedWpm: number;
  /** Accuracy rounded down to a whole percent, 0 to 100. */
  readonly accuracyPercent: number;
};

/** Index of the speed bucket for a speed in characters per minute. */
export function speedBucketIndex(speedCpm: number): number {
  const wpm = speedCpm / charsPerWord;
  return Math.min(speedBuckets - 1, Math.floor(wpm / speedStepWpm));
}

/** Whole percent, rounded down, for an accuracy in [0, 1]. Rounds to 1/100 of a percent first so 0.29 is 29. */
export function accuracyBucketIndex(accuracy: number): number {
  return Math.min(
    accuracyBuckets - 1,
    Math.floor(Math.round(accuracy * 10_000) / 100),
  );
}

/**
 * The counter name for a lesson's speed (characters per minute, Keybr's `Result.speed`) and accuracy (0 to 1,
 * `Result.accuracy`). Returns null for a value that is not a finite number in range, so a broken result sends
 * nothing.
 */
export function lessonBucketName(
  speedCpm: number,
  accuracy: number,
): LessonBucketName | null {
  if (!Number.isFinite(speedCpm) || speedCpm < 0) return null;
  if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 1) return null;
  const speedWpm = speedBucketIndex(speedCpm) * speedStepWpm;
  return `lesson-s${speedWpm}-a${accuracyBucketIndex(accuracy)}`;
}

const bucketPattern = /^lesson-s(0|[1-9][0-9]{0,2})-a(0|[1-9][0-9]{0,2})$/;

/**
 * The bucket a counter name stands for, or null when the name is not exactly one the browser would send: no
 * leading zeros, a speed that is a multiple of the step and not above the top bucket, an accuracy from 0 to 100.
 */
export function parseLessonBucket(name: unknown): LessonBucket | null {
  if (typeof name !== "string") return null;
  const match = bucketPattern.exec(name);
  if (match == null) return null;
  const speedWpm = Number(match[1]);
  const accuracyPercent = Number(match[2]);
  if (speedWpm % speedStepWpm !== 0 || speedWpm > speedTopWpm) return null;
  if (accuracyPercent > accuracyBuckets - 1) return null;
  return { speedWpm, accuracyPercent };
}

/** `GET` it for the 90-day speed and accuracy histograms Profile compares against (`LessonPopulation`). */
export const populationPath = "/_/gutentype/population";

/** The prefix every bucket name starts with, for a database `LIKE` that narrows rows before `parseLessonBucket`. */
export const lessonBucketPrefix = "lesson-s";
