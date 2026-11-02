/** Every Gutentype route, one list for the browser routes, the server's SSR controller and the footer. */
export const GutentypePaths = {
  home: "/",
  read: "/read",
  readBook: "/read/:book",
  readChapter: "/read/:book/:chapter",
  share: "/share",
  sharePng: "/share.png",
  translations: "/translations",
  privacy: "/privacy",
  donate: "/donate",
  account: "/account",
  help: "/help",
  /** Not a page: redirects to `/`, where Learn lives (acceptance, 2026-11-02). */
  learn: "/learn",
} as const;

export const readBookPath = (book: string) => `/read/${book}`;
export const readChapterPath = (book: string, chapter: number) =>
  `/read/${book}/${chapter}`;

export const repoUrl = "https://github.com/theNetworkChuck/gutentype";

/** The deployed commit, defined at build time by the `@keybr/thirdparties` stub's webpack env. */
export const gitSha: string = process.env.GIT_SHA || "dev";

export const sourceUrl = (sha: string = gitSha) =>
  sha === "dev" ? repoUrl : `${repoUrl}/tree/${sha}`;

/** The footer on every page (ISC-32): label, then path or URL. */
export const footerLinks = (sha: string = gitSha) =>
  [
    { label: "Source", href: sourceUrl(sha) },
    { label: "Privacy", href: GutentypePaths.privacy },
    { label: "Translations", href: GutentypePaths.translations },
    { label: "Donate", href: GutentypePaths.donate },
  ] as const;

/** Keybr routes that answer 404 unless their env flag is on (ISC-50). */
export const flaggedRoutes = {
  GUTENTYPE_MULTIPLAYER: [
    /^(\/[a-z]{2}(-[a-z]+)?)?\/multiplayer$/i,
    /^\/_\/game(\/|$)/,
  ],
  GUTENTYPE_HIGHSCORES: [
    /^(\/[a-z]{2}(-[a-z]+)?)?\/high-scores$/i,
    /^\/_\/high-scores$/,
  ],
} as const;
