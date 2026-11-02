import { donateCopy } from "@gutentype/content";
import * as styles from "./pages.module.less";

/**
 * `/donate`: only what is true today. The line about where money beyond the server goes waits until the receiving
 * entity and the deductibility line are confirmed (ISC-31, ISC-54, ISC-62); there is no button until a processor
 * is picked (ISC-60).
 */
export function DonatePage() {
  return (
    <article className={styles.page} data-gt="page">
      <h1 className={styles.title}>{donateCopy.title}</h1>
      {donateCopy.paragraphs.map((text) => (
        <p key={text}>{text}</p>
      ))}
    </article>
  );
}
