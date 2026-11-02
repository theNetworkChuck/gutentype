import {
  accuracyBuckets,
  charsPerWord,
  minComparisonLessons,
  populationPath,
  speedBuckets,
  speedStepWpm,
  speedTopWpm,
} from "@gutentype/content";
import { Distribution } from "@keybr/math";

/*
 * ISC-75: the people Profile compares a person against are Gutentype's own, read from the server's 90-day totals
 * of the anonymous speed-and-accuracy counts (`GET /_/gutentype/population`). This module has no React and does
 * not import `@keybr/chart`, because it also backs the swapped `@keybr/chart` distribution module (`dist.ts`).
 */

export { populationPath };

/** The server's answer, as `lessonPopulation` in `@gutentype/server` builds it. */
export type LessonPopulation = {
  readonly days: number;
  /** The first day counted, `YYYY-MM-DD`. */
  readonly since: string;
  readonly lessons: number;
  /** `speedBuckets` counts, one per `speedStepWpm`; null under `minComparisonLessons` lessons. */
  readonly speed: readonly number[] | null;
  /** `accuracyBuckets` counts, one per whole percent; null under `minComparisonLessons` lessons. */
  readonly accuracy: readonly number[] | null;
};

/** What Profile shows. */
export type Comparison =
  | { readonly kind: "loading" }
  | { readonly kind: "unavailable" }
  | { readonly kind: "not-enough"; readonly lessons: number }
  | {
      readonly kind: "ready";
      readonly lessons: number;
      readonly days: number;
      readonly speed: Distribution;
      readonly accuracy: Distribution;
    };

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

const isHistogram = (value: unknown, length: number): value is number[] =>
  Array.isArray(value) && value.length === length && value.every(isCount);

/** The server's JSON checked field by field; null for anything else, which Profile shows as unavailable. */
export function parsePopulation(json: unknown): LessonPopulation | null {
  if (json == null || typeof json !== "object") return null;
  const { days, since, lessons, speed, accuracy } = json as Record<
    string,
    unknown
  >;
  if (!isCount(days) || typeof since !== "string" || !isCount(lessons)) {
    return null;
  }
  if (speed == null && accuracy == null) {
    return { days, since, lessons, speed: null, accuracy: null };
  }
  if (!isHistogram(speed, speedBuckets)) return null;
  if (!isHistogram(accuracy, accuracyBuckets)) return null;
  return { days, since, lessons, speed, accuracy };
}

/** Keybr's speed histogram runs over characters per minute, 0 to 750 (`SpeedHistogram`, 751 samples). */
const speedTopCpm = speedTopWpm * charsPerWord;

/** Keybr's accuracy histogram runs over tenths of a percent, 0 to 1000 (`AccuracyHistogram`, 1001 samples). */
const accuracyTop = 1000;

/** Spreads each bucket's count evenly over the samples it covers; the last bucket is the single top sample. */
function spread(
  counts: readonly number[],
  width: number,
  top: number,
): number[] {
  const samples = new Array<number>(top + 1).fill(0);
  counts.forEach((count, bucket) => {
    const from = bucket * width;
    const to = Math.min(from + width, top + 1);
    for (let i = from; i < to; i++) {
      samples[i] += count / (to - from);
    }
  });
  return samples;
}

/** Gutentype's speed histogram on Keybr's character-per-minute axis, so Keybr's `SpeedHistogram` draws it. */
export function speedDistribution(counts: readonly number[]): Distribution {
  return new Distribution(
    spread(counts, speedStepWpm * charsPerWord, speedTopCpm),
  );
}

/** Gutentype's accuracy histogram on Keybr's tenth-of-a-percent axis, so Keybr's `AccuracyHistogram` draws it. */
export function accuracyDistribution(counts: readonly number[]): Distribution {
  return new Distribution(
    spread(counts, accuracyTop / (accuracyBuckets - 1), accuracyTop),
  );
}

/**
 * What Profile shows for a server answer: unavailable when there is none, not enough data under
 * `minComparisonLessons` lessons (whatever the server sent), otherwise the two distributions.
 */
export function comparisonOf(population: LessonPopulation | null): Comparison {
  if (population == null) return { kind: "unavailable" };
  const { lessons, speed, accuracy, days } = population;
  if (lessons < minComparisonLessons || speed == null || accuracy == null) {
    return { kind: "not-enough", lessons };
  }
  return {
    kind: "ready",
    lessons,
    days,
    speed: speedDistribution(speed),
    accuracy: accuracyDistribution(accuracy),
  };
}

/** How long Profile waits for the server before it says the comparison is unavailable. */
export const populationTimeoutMs = 10_000;

/** One GET, no cookie sent. Null on any failure: a network error, a timeout, a non-200 answer or a bad shape. */
export async function fetchPopulation(): Promise<LessonPopulation | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), populationTimeoutMs);
  try {
    const response = await fetch(populationPath, {
      method: "GET",
      credentials: "omit",
      signal: controller.signal,
    });
    if (response.status !== 200) return null;
    return parsePopulation(await response.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

let pending: Promise<Comparison> | null = null;
let loaded: Comparison | null = null;

/** The comparison for this page view, fetched once and shared by every section; a failure is retried next call. */
export function loadComparison(): Promise<Comparison> {
  pending ??= fetchPopulation().then((population) => {
    const comparison = comparisonOf(population);
    if (comparison.kind === "unavailable") {
      pending = null;
    } else {
      loaded = comparison;
    }
    return comparison;
  });
  return pending;
}

/** The comparison already loaded on this page, or null before `loadComparison` has finished once. */
export function loadedComparison(): Comparison | null {
  return loaded;
}
