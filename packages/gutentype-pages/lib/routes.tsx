import { GutentypePaths } from "@gutentype/content";
import {
  ReadBookPage,
  ReadChapterPage,
  ReadIndexPage,
  SharePage,
} from "@gutentype/read";
import { LoadingProgress, type PageInfo } from "@keybr/pages-shared";
import { type ComponentType, type ReactNode, Suspense } from "react";
import { Navigate, Route } from "react-router";
import { DonatePage } from "./pages/DonatePage.tsx";
import { HelpPage } from "./pages/HelpPage.tsx";
import { NotFoundPage } from "./pages/NotFoundPage.tsx";
import { PrivacyPage } from "./pages/PrivacyPage.tsx";
import { TranslationsPage } from "./pages/TranslationsPage.tsx";

export type TemplateComponent = ComponentType<{
  readonly path: string;
  readonly children: ReactNode;
}>;

export type TitleComponent = ComponentType<{ readonly page: PageInfo }>;

function page(path: string, id: string, title: string): PageInfo {
  return {
    path,
    title: { id: `gutentype.page.${id}`, defaultMessage: title },
    link: { label: { id: `gutentype.page.${id}`, defaultMessage: title } },
    meta: [],
  };
}

export type GutentypeRoute = {
  readonly path: string;
  readonly page: PageInfo;
  readonly element: () => ReactNode;
};

/** Every browser route Gutentype adds, in CONTRACTS § 3 order. Read's pages come from `@gutentype/read`. */
export const gutentypeRouteTable: readonly GutentypeRoute[] = [
  {
    path: GutentypePaths.read,
    page: page(GutentypePaths.read, "read", "Read"),
    element: () => <ReadIndexPage />,
  },
  {
    path: GutentypePaths.readBook,
    page: page(GutentypePaths.readBook, "readBook", "Read"),
    element: () => <ReadBookPage />,
  },
  {
    path: GutentypePaths.readChapter,
    page: page(GutentypePaths.readChapter, "readChapter", "Read"),
    element: () => <ReadChapterPage />,
  },
  {
    path: GutentypePaths.share,
    page: page(GutentypePaths.share, "share", "Finished book"),
    element: () => <SharePage />,
  },
  {
    path: GutentypePaths.translations,
    page: page(GutentypePaths.translations, "translations", "Translations"),
    element: () => <TranslationsPage />,
  },
  {
    path: GutentypePaths.privacy,
    page: page(GutentypePaths.privacy, "privacy", "Privacy"),
    element: () => <PrivacyPage />,
  },
  {
    path: GutentypePaths.donate,
    page: page(GutentypePaths.donate, "donate", "Donate"),
    element: () => <DonatePage />,
  },
  {
    path: GutentypePaths.help,
    page: page(GutentypePaths.help, "help", "Help"),
    element: () => <HelpPage />,
  },
];

/** Gutentype paths App.tsx serves through its own Keybr routes: `/` is GutentypeHome, `/account` the Gutentype account page. */
export const appOwnedPaths: readonly string[] = [
  GutentypePaths.home,
  GutentypePaths.account,
];

/** Gutentype paths that only redirect: `/learn` goes to `/`, where Learn lives. */
export const redirectPaths: readonly string[] = [GutentypePaths.learn];

/** Gutentype paths only the server answers (the share card's PNG). */
export const serverOnlyPaths: readonly string[] = [GutentypePaths.sharePng];

/**
 * Keybr pages that are off in Gutentype: multiplayer and high scores (ISC-50, the browser twin of the server's
 * `GUTENTYPE_MULTIPLAYER` and `GUTENTYPE_HIGHSCORES` flags, both off in v1), and Keybr's own legal pages, which
 * describe keybr.com and embed a third-party cookie script (ISC-4). The code stays; only the route answers not found.
 */
export const keybrPagesEnabled = {
  multiplayer: false,
  highScores: false,
} as const;

export const switchedOffPaths: readonly string[] = [
  ...(keybrPagesEnabled.multiplayer ? [] : ["/multiplayer"]),
  ...(keybrPagesEnabled.highScores ? [] : ["/high-scores"]),
  "/privacy-policy",
  "/terms-of-service",
];

const notFound = page("*", "notFound", "Page not found");

/**
 * The Gutentype routes, as a Fragment of `<Route>` elements (a function call, not a component: react-router asserts
 * on element type). App.tsx renders it first inside `<Routes>`, so a switched-off Keybr page of equal rank loses the
 * tie to the not-found route here.
 */
export function gutentypeRoutes(
  Template: TemplateComponent,
  Title: TitleComponent,
) {
  return (
    <>
      {gutentypeRouteTable.map(({ path, page, element }) => (
        <Route
          key={path}
          path={path}
          element={
            <Template path={path}>
              <Title page={page} />
              <Suspense fallback={<LoadingProgress />}>{element()}</Suspense>
            </Template>
          }
        />
      ))}
      <Route
        key={GutentypePaths.learn}
        path={GutentypePaths.learn}
        element={<Navigate to={GutentypePaths.home} replace={true} />}
      />
      {switchedOffPaths.map((path) => (
        <Route
          key={path}
          path={path}
          element={
            <Template path={path}>
              <Title page={notFound} />
              <NotFoundPage />
            </Template>
          }
        />
      ))}
    </>
  );
}
