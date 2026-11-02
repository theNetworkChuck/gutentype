import {
  activePack,
  gutentypeProps,
  Pack,
  translationLabel,
  translationsCopy,
} from "@gutentype/content";
import { useSettings } from "@keybr/settings";
import * as styles from "./pages.module.less";

/** `/translations`: every installed pack with its license and source (ISC-28); picking one switches Learn and Read (ISC-27). */
export function TranslationsPage() {
  const { settings, updateSettings } = useSettings();
  const active = activePack(settings);
  const copy = translationsCopy();
  return (
    <article className={styles.page} data-gt="page">
      <h1 className={styles.title}>{copy.title}</h1>
      <p>{copy.intro}</p>
      <ul className={styles.packs} aria-label="Packs">
        {copy.packs.map(({ id, license, sourceUrl }) => {
          const pack = Pack.ALL.get(id);
          const inUse = pack === active;
          return (
            <li key={id} className={styles.pack} data-in-use={inUse}>
              <h2 className={styles.packName}>{translationLabel(pack)}</h2>
              <p>{license}</p>
              <p>
                Source: <a href={sourceUrl}>{sourceUrl}</a>
              </p>
              {inUse ? (
                <p className={styles.inUse}>
                  <span aria-hidden="true">✓ </span>In use
                </p>
              ) : (
                <button
                  className={styles.action}
                  type="button"
                  onClick={() => {
                    updateSettings(settings.set(gutentypeProps.pack, pack));
                  }}
                >
                  Use the {pack.info.label}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </article>
  );
}
