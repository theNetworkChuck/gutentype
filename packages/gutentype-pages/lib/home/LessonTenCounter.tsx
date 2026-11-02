import { countOnce } from "@gutentype/content";
import { useResults } from "@keybr/result";
import { useEffect, useRef } from "react";
import { crossesLessonTen } from "./helpers.ts";

/** Sends the anonymous `lesson-ten` count the first time this browser's result count reaches ten (CONTRACTS § 4). */
export function LessonTenCounter() {
  const { results } = useResults();
  const count = results.length;
  const before = useRef(count);
  useEffect(() => {
    if (crossesLessonTen(before.current, count)) {
      countOnce("lesson-ten");
    }
    before.current = count;
  }, [count]);
  return null;
}
