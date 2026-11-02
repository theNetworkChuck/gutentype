/*
 * Keybr's Shell.test.tsx, moved here because Gutentype rewrote Shell.tsx (fork.json lists the deleted original).
 * The same three renders, with Keybr's "the page carries Google and Cloudflare scripts" assertion inverted for
 * ISC-4, plus the Gutentype parts of the shell: version meta, title, translation label and footer links.
 */
import { test } from "node:test";
import { type IncomingHeaders } from "@fastr/headers";
import { Manifest, ManifestContext } from "@keybr/assets";
import { FakeIntlProvider } from "@keybr/intl";
import { Shell } from "@keybr/pages-server";
import { type PageData, PageDataContext, Pages } from "@keybr/pages-shared";
import { load } from "cheerio";
import { renderToStaticMarkup } from "react-dom/server";
import { equal, isFalse, isTrue, like } from "rich-assert";

const signedOut: PageData = {
  base: "https://gutentype.app/",
  locale: "en",
  user: null,
  publicUser: { id: null, name: "name", imageUrl: null },
  settings: null,
};

const premium: PageData = {
  ...signedOut,
  publicUser: { id: "abc", name: "name", imageUrl: null, premium: true },
};

function render(
  pageData: PageData,
  headers: IncomingHeaders,
  path = Pages.practice,
) {
  return renderToStaticMarkup(
    <ManifestContext.Provider value={Manifest.fake}>
      <PageDataContext.Provider value={pageData}>
        <FakeIntlProvider>
          <Shell page={path} headers={headers} />
        </FakeIntlProvider>
      </PageDataContext.Provider>
    </ManifestContext.Provider>,
  );
}

function assertHtmlAttrs(html: string) {
  like(load(html)("html").attr(), {
    "prefix": "og: http://ogp.me/ns#",
    "lang": "en",
    "dir": "ltr",
    "data-color": "system",
    "data-font": "open-sans",
  });
}

function assertNoThirdParty(html: string) {
  for (const host of [
    "google",
    "cloudflare",
    "doubleclick",
    "paddle",
    "facebook",
  ]) {
    isFalse(html.toLowerCase().includes(host), host);
  }
}

test("render", () => {
  const html = render(signedOut, fakeHeaders());
  const $ = load(html);
  assertHtmlAttrs(html);
  assertNoThirdParty(html);
  equal($("nav").length, 0);
  equal($('meta[name="version"]').length, 1);
  isFalse(/keybr/i.test($("title").text()));
  isTrue(
    $('[data-gt="footer"]').text().includes("Berean Standard Bible (BSB)"),
  );
  for (const label of ["Source", "Privacy", "Translations", "Donate"]) {
    equal($(`[data-gt="footer"] a:contains("${label}")`).length, 1, label);
  }
});

test("render alt", () => {
  const html = render(premium, fakeHeaders());
  assertHtmlAttrs(html);
  assertNoThirdParty(html);
  equal(load(html)("nav").length, 0);
});

test("render for a bot", () => {
  const html = render(signedOut, fakeHeaders({ useragent: "Googlebot" }));
  const $ = load(html);
  assertHtmlAttrs(html);
  equal($("nav").length, 1);
  isFalse(/multiplayer/i.test($("nav").html() ?? ""));
});

function fakeHeaders(entries: Record<string, string> = {}) {
  const map = new Map(Object.entries(entries));
  return {
    get(name) {
      return map.get(name.toLowerCase()) ?? null;
    },
  } as IncomingHeaders;
}
