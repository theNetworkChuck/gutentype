import { type IncomingHeaders } from "@fastr/headers";
import {
  activePackFromJson,
  footerLinks,
  gitSha,
  homeLine,
  siteName,
  tagline,
  translationLabel,
} from "@gutentype/content";
import { FavIconAssets, ScriptAssets, StylesheetAssets } from "@keybr/assets";
import { getDir } from "@keybr/intl";
import {
  LoadingProgress,
  PageDataScript,
  type PageInfo,
  Pages,
  Root,
  usePageData,
} from "@keybr/pages-shared";
import { ThemePrefs, useTheme } from "@keybr/themes";
import { type ReactNode } from "react";
import { useIntl } from "react-intl";
import { isBot } from "./bot.ts";
import { AltLangLinks, favIcons, Metas } from "./meta.tsx";

// Gutentype: no third-party scripts in the head (ISC-4). A page may pass `body`, real server-rendered content
// that the browser app replaces when it mounts. Every page also carries the translation label and the footer
// as plain text, so the first paint and a crawler see them (ISC-30, ISC-32, ISC-66).
export function Shell({
  page,
  headers,
  body,
}: {
  readonly page: PageInfo;
  readonly headers: IncomingHeaders;
  readonly body?: ReactNode;
}) {
  return (
    <Html>
      <Head page={page} />
      <Body>
        {body ?? (
          <>
            <GutentypeIntro path={page.path} />
            {isBot(headers) ? <Content page={page} /> : <LoadingProgress />}
          </>
        )}
        <GutentypeFooter />
      </Body>
    </Html>
  );
}

function GutentypeIntro({ path }: { readonly path: string }) {
  const { settings } = usePageData();
  const pack = activePackFromJson(settings);
  return path === "/" ? (
    <p data-gt="intro">{homeLine(pack)}</p>
  ) : (
    <p data-gt="label">{translationLabel(pack)}</p>
  );
}

function GutentypeFooter() {
  const { settings } = usePageData();
  return (
    <footer data-gt="footer">
      <span data-gt="label">
        {translationLabel(activePackFromJson(settings))}
      </span>
      {footerLinks().map(({ label, href }) => (
        <a key={label} href={href}>
          {label}
        </a>
      ))}
    </footer>
  );
}

const ownMeta: Record<string, string> = {
  "og:url": "https://gutentype.app/",
  "og:site_name": siteName,
  "og:title": siteName,
  "og:description": tagline,
  "og:image": "https://gutentype.app/cover.png",
};

const droppedMeta = new Set(["fb:app_id", "twitter:site", "twitter:creator"]);

/** Keybr's Open Graph and Twitter metas name keybr.com; Gutentype states its own (plan check D13). */
function gutentypeMeta(page: PageInfo): PageInfo {
  return {
    ...page,
    meta: page.meta
      .filter(({ name, property }) => !droppedMeta.has(property ?? name ?? ""))
      .map((m) =>
        m.property != null &&
        m.property in ownMeta &&
        (typeof m.content !== "string" || /keybr/i.test(m.content))
          ? { ...m, content: ownMeta[m.property] }
          : m,
      ),
  };
}

function Html({ children }: { readonly children?: ReactNode }) {
  const { locale } = usePageData();
  const theme = useTheme();
  return (
    <html
      lang={locale}
      dir={getDir(locale)}
      prefix="og: http://ogp.me/ns#"
      {...ThemePrefs.dataAttributes(theme)}
    >
      {children}
    </html>
  );
}

function Head({
  page,
  children,
}: {
  readonly page: PageInfo;
  readonly children?: ReactNode;
}) {
  const { formatMessage } = useIntl();
  return (
    <head>
      <meta charSet="UTF-8" />
      <meta name="version" content={gitSha} />
      <title>{formatMessage(page.title).replace(/keybr\.com/gi, siteName)}</title>
      <StylesheetAssets entrypoint="browser" />
      <FavIconAssets links={favIcons} />
      <AltLangLinks page={page} />
      <Metas page={gutentypeMeta(page)} />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <PageDataScript />
      <ScriptAssets entrypoint="browser" />
      {children}
    </head>
  );
}

function Body({ children }: { readonly children?: ReactNode }) {
  return (
    <body>
      <Root>{children}</Root>
    </body>
  );
}

function Content({ page }: { readonly page: PageInfo }) {
  const { formatMessage, locale } = useIntl();
  return (
    <>
      <h1>{formatMessage(page.link.label)}</h1>
      {page.link.title && <p>{formatMessage(page.link.title)}</p>}
      <nav>
        <ul>
          {[
            Pages.practice,
            Pages.profile,
            Pages.typingTest,
            Pages.layouts,
            Pages.help,
          ].map(({ path, link }, index) => (
            <li key={index}>
              <a
                href={Pages.intlPath(path, locale)}
                title={link.title && formatMessage(link.title)}
              >
                {formatMessage(link.label)}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
