import { GutentypePaths } from "@gutentype/content";
import { Link } from "react-router";
import * as styles from "./pages.module.less";

/** What the browser shows for a Keybr page that is switched off in Gutentype (ISC-50); the server answers 404. */
export function NotFoundPage() {
  return (
    <article className={styles.page} data-gt="page">
      <h1 className={styles.title}>Page not found.</h1>
      <p>
        <Link to={GutentypePaths.home}>Go to typing practice</Link>
      </p>
    </article>
  );
}
