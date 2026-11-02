import { type LessonBucketName, lessonBucketName } from "./lesson-bucket.ts";

/**
 * The anonymous counters (ISC-6, ISC-65, ISC-76). The request carries no body, no cookie and no id: only the
 * counter's name in the path. A browser bumps each fixed counter once, and counts each finished Learn lesson once,
 * remembered by a local flag that never leaves it.
 */
export type CounterName = "book-finished" | "lesson-ten";

export const counterNames: readonly CounterName[] = [
  "book-finished",
  "lesson-ten",
];

export const counterPath = (name: CounterName | LessonBucketName) =>
  `/_/count/${name}`;

function ping(name: CounterName | LessonBucketName): void {
  void fetch(counterPath(name), {
    method: "POST",
    credentials: "omit",
    keepalive: true,
    cache: "no-store",
    referrerPolicy: "no-referrer",
  }).catch(() => {});
}

/** Bumps a counter once per browser; for `book-finished`, once per book (`key` names the book). */
export function countOnce(name: CounterName, key = ""): void {
  const flag = `gutentype.counted.${name}${key ? "." + key : ""}`;
  try {
    if (localStorage.getItem(flag) != null) return;
    localStorage.setItem(flag, "1");
  } catch {
    return;
  }
  ping(name);
}

/** What the speed-and-accuracy count reads from a finished lesson; Keybr's `Result` has all three. */
export type FinishedLesson = {
  /** When the lesson finished, epoch milliseconds: the lesson's identity for the once-flag. */
  readonly timeStamp: number;
  /** Characters per minute. */
  readonly speed: number;
  /** 0 to 1. */
  readonly accuracy: number;
};

/** One flag holds the finish time of the newest lesson counted, so the browser keeps one value, not one per lesson. */
export const lessonCountedFlag = "gutentype.counted.lesson";

function readLessonFlag(): number {
  const value = Number(localStorage.getItem(lessonCountedFlag));
  return Number.isFinite(value) ? value : 0;
}

/**
 * Records that every lesson finished at or before `timeStamp` is already counted, without sending anything. The
 * page calls it with the newest result it loads with, so lessons from before this visit (or synced from another
 * device) are never counted here.
 */
export function markLessonsCounted(timeStamp: number): void {
  try {
    if (timeStamp > readLessonFlag()) {
      localStorage.setItem(lessonCountedFlag, String(timeStamp));
    }
  } catch {
    // No storage: countLesson sends nothing either, so there is nothing to keep in step.
  }
}

/**
 * Sends one `lesson-s<wpm>-a<percent>` count for a finished Learn lesson (ISC-76), unless a lesson finished at the
 * same time or later was already counted in this browser. Sends nothing when local storage is unavailable, because
 * then "once per lesson" cannot be kept. Returns whether a ping was sent.
 */
export function countLesson(lesson: FinishedLesson): boolean {
  const name = lessonBucketName(lesson.speed, lesson.accuracy);
  if (name == null || !Number.isFinite(lesson.timeStamp)) return false;
  try {
    if (lesson.timeStamp <= readLessonFlag()) return false;
    localStorage.setItem(lessonCountedFlag, String(lesson.timeStamp));
  } catch {
    return false;
  }
  ping(name);
  return true;
}
