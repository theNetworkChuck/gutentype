import {
  activePack,
  GutentypePaths,
  homeLine,
  siteName,
} from "@gutentype/content";
import { LoadingProgress } from "@keybr/pages-shared";
import { useSettings } from "@keybr/settings";
import {
  lazy,
  type ReactNode,
  Suspense,
  useEffect,
  useRef,
  useState,
} from "react";
import { Navigate, useLocation } from "react-router";
import { focusPracticeText, isPhoneWidth, withoutTour } from "./helpers.ts";
import * as styles from "./Home.module.less";

const HomePractice = lazy(() => import("./HomePractice.tsx"));

/** `/`: what the site is in one line, one button, and Keybr's practice right under it. */
export function GutentypeHome() {
  return <HomeView practice={<HomePractice />} />;
}

export function HomeView({ practice }: { readonly practice: ReactNode }) {
  const { settings, updateSettings } = useSettings();
  const location = useLocation();
  const [phone] = useState(
    () =>
      location.key === "default" &&
      typeof window !== "undefined" &&
      isPhoneWidth(window.innerWidth),
  );
  const practiceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (settings.isNew) {
      updateSettings(withoutTour(settings));
    }
  }, [settings, updateSettings]);

  useEffect(() => {
    document.title = `${siteName}: typing practice`;
  }, []);

  if (phone) {
    // A phone that lands here goes to Read; Learn stays desktop-first (ISC-43).
    return <Navigate to={GutentypePaths.read} replace={true} />;
  }

  return (
    <div className={styles.home} data-gt="home">
      <div className={styles.intro}>
        <h1 className={styles.line}>{homeLine(activePack(settings))}</h1>
        <button
          type="button"
          className={styles.start}
          onClick={() => {
            focusPracticeText(practiceRef.current);
          }}
        >
          Start typing
        </button>
      </div>
      <div ref={practiceRef} data-gt="practice">
        {settings.isNew ? null : (
          <Suspense fallback={<LoadingProgress />}>{practice}</Suspense>
        )}
      </div>
    </div>
  );
}
