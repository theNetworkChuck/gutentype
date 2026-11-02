/*
 * Grep-style checks over the Shell lane's shipped source:
 * ISC-46 no interface string preaches; ISC-51 no password field; ISC-69 nothing references Keybr's practice tour;
 * ISC-45 nothing reaches the ads package or the Paddle checkout; ISC-4 no third-party host is named;
 * ISC-62 the donate page never mentions a surplus.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { test } from "node:test";
import {
  donateCopy,
  homeLine,
  Pack,
  privacyCopy,
  tagline,
  translationsCopy,
} from "@gutentype/content";
import { equal } from "rich-assert";

const pagesLib = new URL("../../gutentype-pages/lib/", import.meta.url);
const keybrEdits = [
  new URL("../../keybr-pages-browser/lib/App.tsx", import.meta.url),
  new URL("../../keybr-pages-browser/lib/Template.tsx", import.meta.url),
];

function listSources(dir: URL): URL[] {
  const out: URL[] = [];
  for (const name of readdirSync(dir)) {
    const url = new URL(name, dir);
    if (statSync(url).isDirectory()) {
      out.push(...listSources(new URL(`${name}/`, dir)));
    } else if (/\.(ts|tsx|less)$/.test(name) && !/\.test[.-]/.test(name)) {
      out.push(url);
    }
  }
  return out;
}

/** Source text with comments removed, so a comment that names a rule does not trip it. */
function code(url: URL): string {
  return readFileSync(url, "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

/** Every string literal and JSX text run in a source file. */
function strings(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(
    /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g,
  )) {
    out.push(m[1] ?? m[2] ?? m[3] ?? "");
  }
  for (const m of text.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)) {
    out.push(m[1]);
  }
  return out.map((s) => s.trim()).filter((s) => /[A-Za-z]{3}/.test(s));
}

const sources = listSources(pagesLib);

const preaching =
  /\b(pray\w*|devotion\w*|worship\w*|church\w*|sermon\w*|reading plan\w*|bless\w*|amen|salvation|saved|gospel|jesus|christ\w*|lord|god|holy|faith\w*|repent\w*|sin|sins|heaven\w*|ministr\w*|verse of the day|spiritual\w*)\b/i;

function preachingHits(texts: readonly string[]): string[] {
  return texts.filter((s) => preaching.test(s));
}

test("the Shell lane ships source to scan", () => {
  equal(sources.length > 5, true);
});

test("ISC-46: no interface string the Shell lane wrote preaches", () => {
  const hits: string[] = [];
  for (const url of sources) {
    for (const s of preachingHits(strings(code(url)))) {
      hits.push(`${url.pathname.split("/lib/")[1]}: ${s}`);
    }
  }
  equal(hits.join("\n"), "");
});

test("ISC-46: the shared copy the Shell renders does not preach either", () => {
  const rendered = [
    tagline,
    ...[...Pack.ALL].map((pack) => homeLine(pack)),
    privacyCopy.title,
    ...privacyCopy.sections.flatMap((s) => [s.heading, ...s.paragraphs]),
    donateCopy.title,
    ...donateCopy.paragraphs,
    translationsCopy().title,
    translationsCopy().intro,
  ];
  equal(preachingHits(rendered).join("\n"), "");
});

test("ISC-62: the donate copy never mentions a surplus or a ministry", () => {
  equal(/surplus|ministr/i.test(donateCopy.paragraphs.join(" ")), false);
  for (const url of sources) {
    if (/Donate/.test(url.pathname)) {
      equal(/surplus|ministr/i.test(code(url)), false, url.pathname);
    }
  }
});

test("ISC-51: no password field in the Shell lane's source or its Keybr edits", () => {
  for (const url of [...sources, ...keybrEdits]) {
    equal(/password/i.test(code(url)), false, url.pathname);
  }
});

test("ISC-69: no Gutentype source references Keybr's practice tour", () => {
  for (const url of sources) {
    equal(
      /m_tour|PracticeTour|practice\/lib\/practice/i.test(code(url)),
      false,
      url.pathname,
    );
  }
});

test("ISC-45: nothing in the shell reaches the ads package, the Paddle checkout or Keybr's account page", () => {
  for (const url of [...sources, ...keybrEdits]) {
    const text = code(url);
    equal(
      /paddle|checkout|AdBanner|@keybr\/thirdparties|@keybr\/page-account|pages\/account\.tsx|isPremiumUser/i.test(
        text,
      ),
      false,
      url.pathname,
    );
  }
});

test("ISC-4: the Shell lane names no outside host", () => {
  for (const url of [...sources, ...keybrEdits]) {
    equal(/https?:\/\//.test(code(url)), false, url.pathname);
  }
});
