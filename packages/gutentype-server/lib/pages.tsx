import { readFile } from "node:fs/promises";
import { type Context, type Middleware } from "@fastr/core";
import { NotFoundError } from "@fastr/errors";
import { type RouteOptions, type RouterState } from "@fastr/middleware-router";
import {
  activePackFromJson,
  donateCopy,
  helpCopy,
  homeLine,
  loadBook,
  type Pack,
  privacyCopy,
  readBookPath,
  readChapterPath,
  siteName,
  tagline,
  translationLabel,
  translationsCopy,
} from "@gutentype/content";
import { DataDir } from "@keybr/config";
import { type User } from "@keybr/database";
import {
  allLocales,
  defaultLocale,
  loadIntl,
  type LocaleId,
  PreferredLocaleContext,
  selectLocale,
} from "@keybr/intl";
import { Shell, View } from "@keybr/pages-server";
import {
  type AnyUser,
  type Meta,
  type PageData,
  PageDataContext,
  type PageInfo,
} from "@keybr/pages-shared";
import { staticTheme, ThemeContext, ThemePrefs } from "@keybr/themes";
import { type ReactNode } from "react";
import {
  createIntl,
  createIntlCache,
  type IntlShape,
  RawIntlProvider,
} from "react-intl";
import { loadReadProgress, type VerseRow } from "./read.ts";
import {
  parseShareCard,
  type ShareCard,
  shareLines,
  sharePng,
} from "./share.ts";

/*
 * Server-rendered Gutentype pages (CONTRACTS § 3): Keybr's Shell with a real `body` built from pack metadata and the
 * shared page copy, so curl checks, crawlers and the first paint see the content before the browser app mounts.
 * Copied from Keybr's `renderPage`/`pageData` (server/lib/app/page/controller.tsx) rather than imported.
 */

type AuthState = { readonly user: User | null; readonly publicUser: AnyUser };
type Ctx = Context<RouterState & AuthState>;

/** Keybr's own locale pattern, built the same way, so `/{locale}` here and in Keybr is one route node. */
export const localePattern = `(${allLocales.filter((locale) => locale !== defaultLocale).join("|")})`;

const intlCache = createIntlCache();

/** Keybr's intl for the locale, plus this page's title, so formatting it never reports a missing message. */
async function pageIntl(
  locale: LocaleId,
  id: string,
  title: string,
): Promise<IntlShape> {
  const base = await loadIntl(locale);
  return createIntl(
    {
      locale: base.locale,
      defaultLocale: base.defaultLocale,
      defaultRichTextElements: base.defaultRichTextElements,
      messages: { ...(base.messages as Record<string, string>), [id]: title },
      onError: base.onError,
      onWarn: base.onWarn,
    },
    intlCache,
  );
}

function preferredLocale(ctx: Ctx): LocaleId {
  return selectLocale((...locales) =>
    ctx.request.negotiateLanguage(...locales),
  );
}

function themePrefs(ctx: Ctx): ThemePrefs {
  let cookie = ctx.cookies.get(ThemePrefs.cookieKey) || null;
  if (cookie) {
    try {
      cookie = decodeURIComponent(cookie);
    } catch {
      cookie = null;
    }
  }
  return ThemePrefs.deserialize(cookie);
}

/** The signed-in person's settings, read from Keybr's settings file (null when signed out or never saved). */
async function userSettings(ctx: Ctx): Promise<unknown> {
  const { user } = ctx.state;
  if (user == null) return null;
  try {
    return JSON.parse(
      await readFile(
        ctx.container.get(DataDir).userSettingsFile(user.id!),
        "utf8",
      ),
    );
  } catch {
    return null;
  }
}

type Rendered = {
  readonly title: string;
  readonly body: ReactNode;
  readonly meta?: readonly Meta[];
  readonly noindex?: boolean;
};

type Page = {
  readonly path: string;
  readonly render: (ctx: Ctx, pack: Pack) => Promise<Rendered> | Rendered;
};

async function renderPage(
  ctx: Ctx,
  page: Page,
  locale: LocaleId,
): Promise<void> {
  const view = ctx.container.get(View);
  const canonicalUrl = ctx.container.get<string>("canonicalUrl");
  const settings = await userSettings(ctx);
  const pack = activePackFromJson(settings);
  const rendered = await page.render(ctx, pack);
  const title =
    rendered.title === siteName ? siteName : `${rendered.title} · ${siteName}`;
  const titleId = `gutentype.title.${page.path}`;
  const intl = await pageIntl(locale, titleId, title);
  const url = String(new URL(ctx.request.path, canonicalUrl));
  const info: PageInfo = {
    path: page.path,
    title: { id: titleId, defaultMessage: title },
    link: { label: { id: titleId, defaultMessage: title } },
    meta: [
      ...(rendered.noindex ? [{ name: "robots", content: "noindex" }] : []),
      { property: "og:type", content: "website" },
      { property: "og:url", content: url },
      { property: "og:site_name", content: siteName },
      { property: "og:title", content: title },
      { property: "og:description", content: tagline },
      {
        property: "og:image",
        content: String(new URL("/cover.png", canonicalUrl)),
      },
      { name: "twitter:card", content: "summary" },
      ...(rendered.meta ?? []),
    ].filter(
      (m, i, all) =>
        // A page's own meta replaces the default of the same name.
        all.findLastIndex(
          (n) =>
            (n.property ?? n.name) ===
            ((m as Meta).property ?? (m as Meta).name),
        ) === i,
    ),
  };
  const { user, publicUser } = ctx.state;
  const pageData: PageData = {
    base: canonicalUrl,
    locale,
    user: user?.toDetails() ?? null,
    publicUser,
    settings: (settings as PageData["settings"]) ?? null,
  };
  ctx.response.type = "text/html";
  ctx.response.headers.append("Link", view.preloadHeaders);
  if (ctx.state.user != null) {
    ctx.response.headers.set("Cache-Control", "private, no-cache");
  }
  ctx.response.body = view.renderPage(
    <RawIntlProvider value={intl}>
      <PreferredLocaleContext.Provider value={preferredLocale(ctx)}>
        <PageDataContext.Provider value={pageData}>
          <ThemeContext.Provider value={staticTheme(themePrefs(ctx))}>
            <Shell
              page={info}
              headers={ctx.request.headers}
              body={
                <main data-gt="page">
                  <p data-gt="label">{translationLabel(pack)}</p>
                  {rendered.body}
                </main>
              }
            />
          </ThemeContext.Provider>
        </PageDataContext.Provider>
      </PreferredLocaleContext.Provider>
    </RawIntlProvider>,
  );
}

// Progress, for the signed-in person's own counts on `/read` and the book page.

type Progress = (book: string, chapter: number) => boolean;

async function progress(ctx: Ctx, pack: Pack): Promise<Progress> {
  const { user } = ctx.state;
  if (user == null) return () => false;
  const typed = new Set(
    (await loadReadProgress(user.id!, pack)).map(
      (r: VerseRow) => `${r.book}/${r.chapter}/${r.verse}`,
    ),
  );
  return (bookId, chapter) => {
    const book = pack.book(bookId);
    if (book == null) return false;
    const verses = book.chapters[chapter - 1] ?? 0;
    for (let v = 1; v <= verses; v++) {
      if (
        !pack.isOmitted(bookId, chapter, v) &&
        !typed.has(`${bookId}/${chapter}/${v}`)
      ) {
        return false;
      }
    }
    return true;
  };
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** "Done" is a word, not a color (ISC-5). */
const DoneMark = ({ done }: { readonly done: boolean }) =>
  done ? <span data-gt="done"> · done</span> : null;

// The pages.

const home: Page = {
  path: "/",
  render: (ctx, pack) => ({
    title: siteName,
    body: (
      <>
        <h1>{siteName}</h1>
        <p data-gt="intro">{homeLine(pack)}</p>
        <p>
          <a href="/read">Read</a>
        </p>
      </>
    ),
  }),
};

const featured = "john";

const readIndex: Page = {
  path: "/read",
  render: async (ctx, pack) => {
    const isDone = await progress(ctx, pack);
    const books = [
      ...pack.info.books.filter((b) => b.id === featured),
      ...pack.info.books.filter((b) => b.id !== featured),
    ];
    return {
      title: "Read",
      body: (
        <>
          <h1>Read</h1>
          <ul data-gt="books">
            {books.map((book) => {
              const total = book.chapters.length;
              const done = book.chapters.filter((_, i) =>
                isDone(book.id, i + 1),
              ).length;
              return (
                <li
                  key={book.id}
                  data-gt="book"
                  data-book={book.id}
                  data-done={String(done === total)}
                >
                  <a href={readBookPath(book.id)}>{book.name}</a>{" "}
                  <span>
                    {done} of {plural(total, "chapter", "chapters")}
                  </span>
                  <DoneMark done={done === total} />
                </li>
              );
            })}
          </ul>
        </>
      ),
    };
  },
};

function bookParam(ctx: Ctx, pack: Pack) {
  const book = pack.book(String(ctx.state.params?.book ?? ""));
  if (book == null) throw new NotFoundError();
  return book;
}

function chapterParam(ctx: Ctx, chapters: number) {
  const value = String(ctx.state.params?.chapter ?? "");
  const chapter = /^\d{1,3}$/.test(value) ? Number(value) : 0;
  if (chapter < 1 || chapter > chapters) throw new NotFoundError();
  return chapter;
}

const readBook: Page = {
  path: "/read/{book}",
  render: async (ctx, pack) => {
    const book = bookParam(ctx, pack);
    const isDone = await progress(ctx, pack);
    return {
      title: book.name,
      body: (
        <>
          <h1>{book.name}</h1>
          <ol data-gt="chapters">
            {book.chapters.map((verses, i) => {
              const done = isDone(book.id, i + 1);
              return (
                <li
                  key={i}
                  data-gt="chapter"
                  data-chapter={i + 1}
                  data-done={String(done)}
                >
                  <a href={readChapterPath(book.id, i + 1)}>Chapter {i + 1}</a>{" "}
                  <span>{plural(verses, "verse", "verses")}</span>
                  <DoneMark done={done} />
                </li>
              );
            })}
          </ol>
        </>
      ),
    };
  },
};

const readChapter: Page = {
  path: "/read/{book}/{chapter}",
  render: async (ctx, pack) => {
    const info = bookParam(ctx, pack);
    const chapter = chapterParam(ctx, info.chapters.length);
    const text = await loadBook(pack, info.id);
    const verses = text.chapters[chapter - 1] ?? [];
    return {
      title: `${info.name} ${chapter}`,
      body: (
        <>
          <h1>
            {info.name} {chapter}
          </h1>
          <div data-gt="verses">
            {verses.map((verse, i) =>
              verse === "" || pack.isOmitted(info.id, chapter, i + 1) ? null : (
                <p key={i} data-gt="verse" data-verse={i + 1}>
                  <span data-gt="verse-number">{i + 1}</span> {verse}
                </p>
              ),
            )}
          </div>
        </>
      ),
    };
  },
};

function shareCard(ctx: Ctx): ShareCard {
  const card = parseShareCard(ctx.request.query);
  if (card == null) throw new NotFoundError();
  return card;
}

const share: Page = {
  path: "/share",
  render: (ctx) => {
    const card = shareCard(ctx);
    const lines = shareLines(card);
    const canonicalUrl = ctx.container.get<string>("canonicalUrl");
    const image = `${String(new URL("/share.png", canonicalUrl))}?${card.query}`;
    return {
      title: `${lines.book} finished`,
      noindex: true,
      meta: [
        { property: "og:title", content: `${lines.book}, finished` },
        {
          property: "og:description",
          content: `${lines.translation}. ${lines.speed}, ${lines.accuracy}, ${lines.date}.`,
        },
        // Each card is its own object for social previews: og:url keeps the card's fields (review, 2026-11-02).
        {
          property: "og:url",
          content: `${String(new URL(ctx.request.path, canonicalUrl))}?${card.query}`,
        },
        { property: "og:image", content: image },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      body: (
        <section data-gt="share">
          <h1>{lines.book}</h1>
          <p>Finished</p>
          <p>{lines.translation}</p>
          <p>
            {lines.speed} · {lines.accuracy}
          </p>
          <p>{lines.date}</p>
          <img
            src={image}
            alt={`${lines.book}, finished: ${lines.speed}, ${lines.accuracy}`}
            width={600}
            height={315}
          />
        </section>
      ),
    };
  },
};

const translations: Page = {
  path: "/translations",
  render: (ctx, active) => {
    const copy = translationsCopy();
    return {
      title: copy.title,
      body: (
        <>
          <h1>{copy.title}</h1>
          <p>{copy.intro}</p>
          <ul data-gt="packs">
            {copy.packs.map((p) => (
              <li
                key={p.id}
                data-gt="pack"
                data-pack={p.id}
                data-active={String(p.id === active.id)}
              >
                <h2>
                  {p.label} ({p.short})
                </h2>
                <p>{p.license}</p>
                <p>
                  Source: <a href={p.sourceUrl}>{p.sourceUrl}</a>
                </p>
              </li>
            ))}
          </ul>
        </>
      ),
    };
  },
};

const privacy: Page = {
  path: "/privacy",
  render: () => ({
    title: privacyCopy.title,
    body: (
      <>
        <h1>{privacyCopy.title}</h1>
        {privacyCopy.sections.map((s) => (
          <section key={s.heading}>
            <h2>{s.heading}</h2>
            {s.paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </section>
        ))}
      </>
    ),
  }),
};

const help: Page = {
  path: "/help",
  render: () => ({
    title: helpCopy.title,
    body: (
      <>
        <h1>{helpCopy.title}</h1>
        {helpCopy.sections.map((s) => (
          <section key={s.heading}>
            <h2>{s.heading}</h2>
            {s.paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </section>
        ))}
      </>
    ),
  }),
};

const donate: Page = {
  path: "/donate",
  render: () => ({
    title: donateCopy.title,
    body: (
      <>
        <h1>{donateCopy.title}</h1>
        {donateCopy.paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </>
    ),
  }),
};

const account: Page = {
  path: "/account",
  render: () => ({
    title: "Account",
    noindex: true,
    body: <h1>Account</h1>,
  }),
};

export const gutentypePages: readonly Page[] = [
  home,
  readIndex,
  readBook,
  readChapter,
  share,
  translations,
  privacy,
  donate,
  help,
  account,
];

function localized(path: string) {
  return `/{locale:${localePattern}}${path === "/" ? "" : path}`;
}

const sharePngRoute: Middleware<RouterState & AuthState> = async (ctx) => {
  const png = await sharePng(shareCard(ctx as Ctx));
  ctx.response.type = "image/png";
  ctx.response.headers.set(
    "Cache-Control",
    "public, max-age=31536000, immutable",
  );
  ctx.response.body = png;
};

/** GET routes for every Gutentype page, each also under `/{locale}`, plus `/share.png`. */
export function pageRoutes(): RouteOptions[] {
  const routes: RouteOptions[] = [];
  for (const page of gutentypePages) {
    routes.push({
      path: page.path,
      method: "GET",
      middleware: (ctx: any) => renderPage(ctx, page, defaultLocale),
    });
    routes.push({
      path: localized(page.path),
      method: "GET",
      middleware: async (ctx: any) => {
        const locale = String(ctx.state.params.locale) as LocaleId;
        if (!allLocales.includes(locale)) throw new NotFoundError();
        await renderPage(ctx, page, locale);
      },
    });
  }
  // Learn lives at /; a visitor who guesses /learn lands there (acceptance, 2026-11-02).
  routes.push({
    path: "/learn",
    method: "GET",
    middleware: (ctx: any) => {
      ctx.response.redirect("/");
    },
  });
  routes.push({
    path: "/share.png",
    method: "GET",
    middleware: sharePngRoute as any,
  });
  routes.push({
    path: localized("/share.png"),
    method: "GET",
    middleware: sharePngRoute as any,
  });
  return routes;
}
