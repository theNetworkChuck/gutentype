/*
 * ISC-18, browser half: typing the last verse of a book renders a share card (book, translation, average speed,
 * accuracy, date) that downloads as a PNG drawn in the browser, and a share URL that carries the card's fields
 * itself (CONTRACTS § 3: `/share?pack&book&wpm&acc&date`, nothing else). Finishing a book bumps the anonymous
 * `book-finished` counter once (CONTRACTS § 4). The server half (/share og:image, /share.png) is share-png.test.ts.
 *
 * ISC-55 is checked here too: the URL's query holds exactly the five card fields.
 */
import { afterEach, beforeEach, test } from "node:test";
import { counterPath, Pack } from "@gutentype/content";
import {
  deepEqual,
  equal,
  includes,
  isNotNull,
  isNull,
  isTrue,
} from "rich-assert";
import { read, type ShareCard, type VerseRow } from "./read-lane.ts";

const {
  drawShareCard,
  finishVerse,
  IdbReadRows,
  parseShareCard,
  ReadProgressStore,
  shareCardFor,
  shareCardPng,
  shareCardSize,
  shareCardText,
  sharePath,
  shareUrl,
} = read;

const at = (iso: string) => new Date(iso).getTime();

function judeRows({
  speed = 250,
  accuracy = 0.96,
  ts = at("2026-11-02T15:00:00"),
} = {}) {
  const rows: VerseRow[] = [];
  const count = Pack.BSB.book("jude")!.chapters[0];
  for (let v = 1; v <= count; v++) {
    rows.push({
      pack: "bsb",
      book: "jude",
      chapter: 1,
      verse: v,
      speed,
      accuracy,
      ts,
    });
  }
  return rows;
}

/** Records every call made on a 2D context, so the drawn text can be read back. */
function recordingContext() {
  const texts: string[] = [];
  const calls: string[] = [];
  const target: any = {};
  const ctx = new Proxy(target, {
    get(obj, prop) {
      if (prop in obj) return obj[prop];
      return (...args: any[]) => {
        calls.push(String(prop));
        if (prop === "fillText" || prop === "strokeText")
          texts.push(String(args[0]));
        if (prop === "measureText")
          return { width: String(args[0]).length * 10 };
        return undefined;
      };
    },
    set(obj, prop, value) {
      obj[prop] = value;
      return true;
    },
  });
  return { ctx: ctx as CanvasRenderingContext2D, texts, calls };
}

let saved: typeof fetch;
let posts: { url: string; init?: RequestInit }[] = [];

beforeEach(async () => {
  await new IdbReadRows().clear();
  localStorage.clear();
  saved = globalThis.fetch;
  posts = [];
  globalThis.fetch = (async (url: any, init?: RequestInit) => {
    posts.push({ url: String(url), init });
    return new Response(null, { status: 204 });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = saved;
});

test("a finished book yields a card with book, translation, average speed, accuracy and date", () => {
  const card = shareCardFor(judeRows(), Pack.BSB, "jude")!;
  isNotNull(card);
  deepEqual(card, {
    pack: "bsb",
    book: "jude",
    wpm: 50,
    acc: 96,
    date: "2026-11-02",
  });
  const text = shareCardText(card)!;
  equal(text.book, "Jude");
  equal(text.translation, "Berean Standard Bible (BSB)");
  equal(text.speed, "50 wpm");
  equal(text.accuracy, "96% accuracy");
  equal(text.date, "November 2, 2026");
  // Not finished: no card.
  isNull(shareCardFor(judeRows().slice(1), Pack.BSB, "jude"));
  isNull(shareCardFor([], Pack.BSB, "john"));
});

test("the card averages over every verse and dates the last verse typed", () => {
  const rows = judeRows().map((r, i) => ({
    ...r,
    speed: i % 2 === 0 ? 200 : 300,
    accuracy: i % 2 === 0 ? 1 : 0.9,
    ts: at("2026-10-30T12:00:00") + i * 60_000,
  }));
  rows[rows.length - 1] = {
    ...rows[rows.length - 1],
    ts: at("2026-11-01T09:30:00"),
  };
  const card = shareCardFor(rows, Pack.BSB, "jude")!;
  const meanCpm = rows.reduce((s, r) => s + r.speed, 0) / rows.length;
  const meanAcc = rows.reduce((s, r) => s + r.accuracy, 0) / rows.length;
  equal(card.wpm, Math.round(meanCpm / 5));
  // Accuracy rounds down, so the card only says 100% when no key was missed.
  equal(card.acc, Math.floor(meanAcc * 100 + 1e-9));
  equal(card.date, "2026-11-01");
});

test("the share URL carries exactly the card's five fields and parses back to the same card", () => {
  const card: ShareCard = {
    pack: "bsb",
    book: "john",
    wpm: 62,
    acc: 97,
    date: "2026-11-02",
  };
  const path = sharePath(card);
  equal(path, "/share?pack=bsb&book=john&wpm=62&acc=97&date=2026-11-02");
  const url = new URL(shareUrl(card, "https://gutentype.app"));
  equal(url.origin, "https://gutentype.app");
  equal(url.pathname, "/share");
  deepEqual([...url.searchParams.keys()].sort(), [
    "acc",
    "book",
    "date",
    "pack",
    "wpm",
  ]);
  deepEqual(parseShareCard(url.search), card);
  deepEqual(parseShareCard(url.searchParams), card);
});

test("parseShareCard refuses anything that is not a real card, and drops extra fields", () => {
  const ok = "pack=bsb&book=john&wpm=62&acc=97&date=2026-11-02";
  deepEqual(parseShareCard(`?${ok}&name=Chuck&email=a%40b.c`), {
    pack: "bsb",
    book: "john",
    wpm: 62,
    acc: 97,
    date: "2026-11-02",
  });
  for (const bad of [
    "",
    ok.replace("pack=bsb", "pack=esv"),
    ok.replace("book=john", "book=hezekiah"),
    ok.replace("wpm=62", "wpm=-1"),
    ok.replace("wpm=62", "wpm=abc"),
    ok.replace("wpm=62", "wpm=5000"),
    ok.replace("acc=97", "acc=101"),
    ok.replace("date=2026-11-02", "date=2026-13-40"),
    ok.replace("date=2026-11-02", "date=yesterday"),
    ok.replace("&date=2026-11-02", ""),
  ]) {
    isNull(parseShareCard(bad));
  }
});

test("the PNG is drawn in the browser with every card field and exported as image/png", async () => {
  const card: ShareCard = {
    pack: "kjv",
    book: "john",
    wpm: 48,
    acc: 99,
    date: "2026-11-02",
  };
  const { ctx, texts } = recordingContext();
  drawShareCard(ctx, card);
  includes(texts.join("\n"), "John");
  includes(texts.join("\n"), "King James Version (KJV)");
  includes(texts.join("\n"), "48 wpm");
  includes(texts.join("\n"), "99% accuracy");
  includes(texts.join("\n"), "November 2, 2026");

  let askedType = "";
  const canvas = {
    width: 0,
    height: 0,
    getContext: (kind: string) =>
      kind === "2d" ? recordingContext().ctx : null,
    toBlob: (done: (blob: Blob | null) => void, type: string) => {
      askedType = type;
      done(new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type }));
    },
  } as unknown as HTMLCanvasElement;
  const png = await shareCardPng(card, () => canvas);
  equal(askedType, "image/png");
  equal(png.type, "image/png");
  equal(canvas.width, shareCardSize.width);
  equal(canvas.height, shareCardSize.height);
  deepEqual(shareCardSize, { width: 1200, height: 630 });
});

test("typing the last verse of a book records it, shows the card and bumps book-finished once", async () => {
  const store = new ReadProgressStore({ signedIn: () => false });
  await store.load("bsb");
  const rows = judeRows();
  for (const r of rows.slice(0, -1)) {
    const outcome = finishVerse(store, r, Pack.BSB);
    equal(outcome.bookFinished, false);
    isNull(outcome.card);
  }
  equal(posts.length, 0);
  const last = finishVerse(store, rows.at(-1)!, Pack.BSB);
  isTrue(last.chapterDone);
  isTrue(last.bookFinished);
  isNotNull(last.card);
  equal(last.card!.book, "jude");
  equal(posts.length, 1);
  equal(posts[0].url, counterPath("book-finished"));
  equal(posts[0].init!.method, "POST");
  equal(posts[0].init!.credentials, "omit");
  equal(posts[0].init!.body, undefined);

  // Retyping a verse of a finished book shows the card again but never counts twice.
  const again = finishVerse(store, { ...rows[0], ts: Date.now() }, Pack.BSB);
  isNotNull(again.card);
  equal(again.bookFinished, false);
  equal(posts.length, 1);
});
