import { NextVerseOffer } from "@gutentype/read";
import { PracticePage } from "@keybr/page-practice";
import { ResultLoader } from "@keybr/result-loader";
import * as styles from "./Home.module.less";
import { LessonTenCounter } from "./LessonTenCounter.tsx";

/** Keybr's practice page as it runs on the homepage, with the next verse of John offered under it (ISC-38). */
export default function HomePractice() {
  return (
    <ResultLoader>
      <LessonTenCounter />
      <PracticePage />
      <div className={styles.offer}>
        <NextVerseOffer />
      </div>
    </ResultLoader>
  );
}
