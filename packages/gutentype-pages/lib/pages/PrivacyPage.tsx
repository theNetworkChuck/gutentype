import { privacyCopy } from "@gutentype/content";
import * as styles from "./pages.module.less";

/** `/privacy`: what is stored, where, and for how long (ISC-41, ISC-57). */
export function PrivacyPage() {
  return (
    <article className={styles.page}>
      <h1 className={styles.title}>{privacyCopy.title}</h1>
      {privacyCopy.sections.map(({ heading, paragraphs }) => (
        <section key={heading}>
          <h2 className={styles.heading}>{heading}</h2>
          {paragraphs.map((text) => (
            <p key={text}>{text}</p>
          ))}
        </section>
      ))}
    </article>
  );
}
