/*
 * ISC-18, server side (and ISC-55's server half): `/share` carries an og:image pointing at `/share.png` with the
 * same card fields, and `/share.png` returns a PNG of the card. The URL carries the card itself (pack, book, wpm,
 * acc, date), so nothing is stored; any other query field (a name, an email) is dropped, never shown.
 * The card's text renders from a font shipped with the server, with system fonts off.
 */
import { deepEqual, equal, match, notDeepEqual, ok } from "node:assert/strict";
import { test } from "node:test";
import { Application } from "@fastr/core";
import { renderShareImage } from "@gutentype/server";
import { load } from "cheerio";
import { kMain, startApp, TestContext, viaProxy } from "./server-harness.ts";

const context = new TestContext();

const card = "pack=bsb&book=john&wpm=72&acc=0.98&date=2026-11-02";

async function get(path: string) {
  const request = startApp(context.get(Application, kMain));
  let call = request.GET(path);
  for (const [k, v] of Object.entries(viaProxy)) {
    call = call.header(k, v);
  }
  return await call.send();
}

function pngSize(png: Buffer) {
  equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  equal(png.subarray(12, 16).toString("ascii"), "IHDR");
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

test("/share names the card and points og:image at /share.png with the same fields", async () => {
  const response = await get(`/share?${card}`);
  equal(response.status, 200);
  const html = await response.body.text();
  const $ = load(html);

  const image = $('meta[property="og:image"]').attr("content")!;
  const url = new URL(image);
  equal(url.origin + url.pathname, "https://gutentype.app/share.png");
  deepEqual(
    Object.fromEntries(url.searchParams),
    Object.fromEntries(new URLSearchParams(card)),
  );
  match($('meta[property="og:title"]').attr("content")!, /John/);
  equal($('meta[name="twitter:card"]').attr("content"), "summary_large_image");

  const body = $("[data-gt=share]").text();
  match(body, /John/);
  match(body, /Berean Standard Bible \(BSB\)/);
  match(body, /72 WPM/);
  match(body, /98%/);
  match(body, /2026-11-02/);
});

test("/share.png returns a 1200 by 630 PNG that can be cached", async () => {
  const response = await get(`/share.png?${card}`);
  equal(response.status, 200);
  equal(response.headers.get("Content-Type"), "image/png");
  match(response.headers.get("Cache-Control")!, /public/);
  const png = await response.body.buffer();
  deepEqual(pngSize(png), { width: 1200, height: 630 });
});

test("the card's text is drawn from the shipped font (system fonts off)", async () => {
  const card = {
    pack: "bsb",
    book: "john",
    wpm: 72,
    acc: 0.98,
    date: "2026-11-02",
  };
  const john = await renderShareImage(card);
  const mark = await renderShareImage({ ...card, book: "mark" });
  const faster = await renderShareImage({ ...card, wpm: 99 });
  equal(john.width, 1200);
  ok(john.inkPixels > 5000, `only ${john.inkPixels} pixels of text`);
  notDeepEqual(john.pixels, mark.pixels);
  notDeepEqual(john.pixels, faster.pixels);
});

test("any other query field is dropped from the page and the image link", async () => {
  const extra = `${card}&name=Chuck%20Keith&email=chuck%40example.com&id=42`;
  const html = await (await get(`/share?${extra}`)).body.text();
  ok(
    !/Chuck Keith|chuck%40|example\.com|id=42/.test(html),
    "an identifier reached the page",
  );
  const image = load(html)('meta[property="og:image"]').attr("content")!;
  deepEqual(
    [...new URL(image).searchParams.keys()],
    ["pack", "book", "wpm", "acc", "date"],
  );

  const plain = await (await get(`/share.png?${card}`)).body.buffer();
  const withExtra = await (await get(`/share.png?${extra}`)).body.buffer();
  deepEqual(withExtra, plain);
});

test("accuracy given as a percent reads the same as a fraction", async () => {
  const html = await (
    await get("/share?pack=kjv&book=1-john&wpm=50&acc=91&date=2026-01-31")
  ).body.text();
  const body = load(html)("[data-gt=share]").text();
  match(body, /1 John/);
  match(body, /King James/);
  match(body, /91%/);
});

for (const query of [
  "",
  "pack=esv&book=john&wpm=72&acc=0.98&date=2026-11-02",
  "pack=bsb&book=hezekiah&wpm=72&acc=0.98&date=2026-11-02",
  "pack=bsb&book=john&wpm=-3&acc=0.98&date=2026-11-02",
  "pack=bsb&book=john&wpm=72&acc=1.5x&date=2026-11-02",
  "pack=bsb&book=john&wpm=72&acc=0.98&date=yesterday",
  "pack=bsb&book=john&wpm=72&acc=0.98",
]) {
  test(`a card with bad fields is 404: "${query}"`, async () => {
    equal((await get(`/share?${query}`)).status, 404);
    equal((await get(`/share.png?${query}`)).status, 404);
  });
}

test("the locale variant of /share works too", async () => {
  equal((await get(`/de/share?${card}`)).status, 200);
});
