import { countLesson, markLessonsCounted } from "@gutentype/content";
import { type Result, useResults } from "@keybr/result";
import { useEffect, useRef } from "react";

/** The newest finish time among `results`, or 0 for none. */
export function newestTimeStamp(results: readonly Result[]): number {
  let newest = 0;
  for (const { timeStamp } of results) {
    if (timeStamp > newest) newest = timeStamp;
  }
  return newest;
}

/** The results finished after `since`, oldest first, so each is counted in the order it was typed. */
export function lessonsAfter(
  results: readonly Result[],
  since: number,
): Result[] {
  return results
    .filter(({ timeStamp }) => timeStamp > since)
    .sort((a, b) => a.timeStamp - b.timeStamp);
}

/**
 * Sends the anonymous speed-and-accuracy count once for each Learn lesson finished while the practice page is open
 * (ISC-76, CONTRACTS § 4). The results the page loads with (this browser's history, or an account's) are marked
 * counted on mount and never sent; `countLesson`'s local flag keeps a lesson from being sent twice across reloads
 * and tabs.
 */
export function LessonSpeedCounter(): null {
  const { results } = useResults();
  const seen = useRef<number | null>(null);
  useEffect(() => {
    const newest = newestTimeStamp(results);
    if (seen.current == null) {
      seen.current = newest;
      markLessonsCounted(newest);
      return;
    }
    for (const lesson of lessonsAfter(results, seen.current)) {
      countLesson(lesson);
    }
    seen.current = Math.max(seen.current, newest);
  }, [results]);
  return null;
}
