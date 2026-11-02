import { footerLinks, translationLabel } from "@gutentype/content";
import { Link } from "react-router";
import { useActivePack } from "../pack.ts";
import * as styles from "./chrome.module.less";

/** The footer on every page: the active translation's label (ISC-66), then Source, Privacy, Translations, Donate (ISC-32). */
export function GutentypeFooter() {
  const pack = useActivePack();
  return (
    <footer className={styles.footer} data-gt="footer">
      <span className={styles.translation} data-gt="translation">
        {translationLabel(pack)}
      </span>
      <ul className={styles.footerLinks}>
        {footerLinks().map(({ label, href }) => (
          <li key={label}>
            {href.startsWith("/") ? (
              <Link to={href}>{label}</Link>
            ) : (
              <a href={href} rel="noopener">
                {label}
              </a>
            )}
          </li>
        ))}
      </ul>
    </footer>
  );
}
