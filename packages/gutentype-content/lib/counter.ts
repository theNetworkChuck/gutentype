/**
 * The two anonymous counters (ISC-6, ISC-65). The request carries no body, no cookie and no id: only the
 * counter's name in the path. A browser bumps each counter once, remembered by a local flag that never leaves it.
 */
export type CounterName = "book-finished" | "lesson-ten";

export const counterNames: readonly CounterName[] = [
  "book-finished",
  "lesson-ten",
];

export const counterPath = (name: CounterName) => `/_/count/${name}`;

/** Bumps a counter once per browser; for `book-finished`, once per book (`key` names the book). */
export function countOnce(name: CounterName, key = ""): void {
  const flag = `gutentype.counted.${name}${key ? "." + key : ""}`;
  try {
    if (localStorage.getItem(flag) != null) return;
    localStorage.setItem(flag, "1");
  } catch {
    return;
  }
  void fetch(counterPath(name), {
    method: "POST",
    credentials: "omit",
    keepalive: true,
    cache: "no-store",
    referrerPolicy: "no-referrer",
  }).catch(() => {});
}
