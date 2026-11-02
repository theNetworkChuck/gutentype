/*
 * The server-rendered pages behind ISC-13 (`/read` lists every book with chapters done out of total, John first),
 * ISC-28 (`/translations` shows each pack's license and source URL), ISC-41 (`/privacy` says what is stored and for
 * how long), ISC-62 (no "surplus" sentence on `/donate` yet) and ISC-66 (every page names the active translation).
 * A curl, a crawler and the first paint all see this content before the browser app mounts.
 */
import { deepEqual, equal, match, ok } from "node:assert/strict";
import { test } from "node:test";
import { Application } from "@fastr/core";
import {
  donateCopy,
  Pack,
  privacyCopy,
  translationLabel,
} from "@gutentype/content";
import { load } from "cheerio";
import {
  findUser,
  kMain,
  startApp,
  TestContext,
  viaProxy,
} from "./server-harness.ts";

const context = new TestContext();

async function page(path: string, as: string | null = null) {
  const request = startApp(context.get(Application, kMain));
  if (as != null) {
    await request.become((await findUser(as)).id!);
  }
  let call = request.GET(path);
  for (const [k, v] of Object.entries(viaProxy)) {
    call = call.header(k, v);
  }
  const response = await call.send();
  return {
    request,
    status: response.status,
    type: response.headers.get("Content-Type"),
    $: load(await response.body.text()),
  };
}

const gutentypePages = [
  "/",
  "/read",
  "/read/john",
  "/read/john/1",
  "/translations",
  "/privacy",
  "/donate",
  "/account",
];

for (const path of gutentypePages) {
  test(`${path} renders Keybr's shell with a real body and the translation label`, async () => {
    const { status, type, $ } = await page(path);
    equal(status, 200);
    equal(type, "text/html; charset=UTF-8");
    equal($("script#page-data").length, 1);
    equal($("#root").length, 1);
    ok($("[data-gt=page]").length === 1, "no server-rendered body");
    match($("body").text(), /Berean Standard Bible \(BSB\)/);
    equal($('meta[name="version"]').length, 1);
  });

  test(`${path} also answers under a locale`, async () => {
    equal((await page(`/de${path === "/" ? "" : path}`)).status, 200);
  });
}

test("the homepage names the Bible and the translation in its first lines", async () => {
  const { $ } = await page("/");
  const first = $("[data-gt=page]").text();
  match(first, /Bible/);
  match(first, /Berean Standard Bible \(BSB\)/);
});

test("/read lists every BSB book with chapters done out of total, John first", async () => {
  const { $ } = await page("/read");
  const books = $("[data-gt=books] [data-gt=book]");
  equal(books.length, 66);
  equal(books.first().attr("data-book"), "john");
  match(books.first().text(), /John/);
  match(books.first().text(), /0 of 21 chapters/);
  equal(new Set(books.map((_, b) => $(b).attr("data-book")).get()).size, 66);
  const genesis = books.filter((_, b) => $(b).attr("data-book") === "genesis");
  match(genesis.text(), /0 of 50 chapters/);
  equal(genesis.find("a").attr("href"), "/read/genesis");
});

test("signed in, /read counts the chapters the person finished, in their pack", async () => {
  const request = startApp(context.get(Application, kMain));
  const user = await findUser("user1@keybr.com");
  await request.become(user.id!);
  await request.PUT("/_/sync/settings").send({ "gutentype.pack": "kjv" });
  const verses = Pack.KJV.book("jude")!.chapters[0];
  const rows = Array.from({ length: verses }, (_, i) => ({
    pack: "kjv",
    book: "jude",
    chapter: 1,
    verse: i + 1,
    speed: 200,
    accuracy: 1,
    ts: 1,
  }));
  equal((await request.PUT("/_/gutentype/read").send({ rows })).status, 204);

  const { $ } = await page("/read", "user1@keybr.com");
  match($("body").text(), /King James Version \(KJV\)/);
  const jude = $("[data-gt=books] [data-gt=book][data-book=jude]");
  match(jude.text(), /1 of 1 chapter/);
  equal(jude.attr("data-done"), "true");
});

test("a book page lists its chapters; a chapter page shows numbered verses", async () => {
  const book = await page("/read/john");
  equal(book.$("[data-gt=chapter]").length, 21);
  equal(book.$("[data-gt=chapter] a").first().attr("href"), "/read/john/1");

  const chapter = await page("/read/john/3");
  const verses = chapter.$("[data-gt=verse]");
  equal(verses.length, 36);
  const sixteen = verses.filter(
    (_, v) => chapter.$(v).attr("data-verse") === "16",
  );
  match(sixteen.text(), /^16/);
  match(sixteen.text(), /For God so loved the world/);
});

test("a chapter page skips the verses the pack omits", async () => {
  const { $ } = await page("/read/john/5");
  const numbers = $("[data-gt=verse]")
    .map((_, v) => $(v).attr("data-verse"))
    .get();
  ok(!numbers.includes("4"), "omitted verse 5:4 shown");
  ok(numbers.includes("3") && numbers.includes("5"));
});

for (const path of [
  "/read/hezekiah",
  "/read/john/22",
  "/read/john/0",
  "/read/john/x",
]) {
  test(`${path} is 404`, async () => {
    equal((await page(path)).status, 404);
  });
}

test("/translations shows every pack's license text and source URL", async () => {
  const { $ } = await page("/translations");
  const packs = $("[data-gt=packs] [data-gt=pack]");
  equal(packs.length, Pack.ALL.size);
  for (const pack of Pack.ALL) {
    const item = packs.filter((_, p) => $(p).attr("data-pack") === pack.id);
    match(
      item.text(),
      new RegExp(translationLabel(pack).replace(/[()]/g, "\\$&")),
    );
    ok(item.text().includes(pack.info.license), `${pack.id} license missing`);
    equal(item.find(`a[href="${pack.info.sourceUrl}"]`).length, 1);
  }
});

test("/privacy says what is stored and for how long", async () => {
  const { $ } = await page("/privacy");
  const text = $("[data-gt=page]").text();
  for (const section of privacyCopy.sections) {
    ok(text.includes(section.heading));
    for (const p of section.paragraphs) {
      ok(text.includes(p), `missing: ${p}`);
    }
  }
  match(text, /email/);
  match(text, /anonymous count/);
  match(text, /14 days/);
  match(text, /15 minutes/);
});

test("/donate carries the page copy and no surplus sentence", async () => {
  const { $ } = await page("/donate");
  const text = $("[data-gt=page]").text();
  for (const p of donateCopy.paragraphs) {
    ok(text.includes(p));
  }
  ok(!/surplus/i.test($("body").text()));
});

test("Gutentype pages carry their own titles and metas, never keybr.com", async () => {
  for (const path of gutentypePages) {
    const { $ } = await page(path);
    ok(
      !/keybr/i.test($("head").html() ?? ""),
      `${path} names keybr in its head`,
    );
    match($("title").text(), /Gutentype/);
  }
});
