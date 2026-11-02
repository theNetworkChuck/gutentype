import { helpCopy } from "@gutentype/content";
import * as styles from "./pages.module.less";

/** `/help`: how Learn and Read work, in place of Keybr's help. */
export function HelpPage() {
  return (
    <article className={styles.page} data-gt="page">
      <h1 className={styles.title}>{helpCopy.title}</h1>
      {helpCopy.sections.map(({ heading, paragraphs }) => (
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
