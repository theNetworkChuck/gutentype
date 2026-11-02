/*
 * Read progress rules from CONTRACTS § 2, supporting ISC-16 (resume at the next untyped verse), ISC-17 (chapter
 * done), ISC-20 (Read position persists signed out) and ISC-22/42 (the signed-in merge).
 *
 * Cursor: the first verse that is not omitted and has no row. Chapter done: every non-omitted verse has a row.
 * Book done: every chapter done. Merge: union by (pack, book, chapter, verse), newest ts wins. Signed out: IndexedDB
 * `gutentype-read`, store `rows`, and nothing ever leaves the browser. Signed in: GET then PUT only the new rows.
 */
import { afterEach, beforeEach, test } from "node:test";
import { Pack } from "@gutentype/content";
import { deepEqual, equal, isNull, isTrue } from "rich-assert";
import { read, type RemoteReadRows, type VerseRow } from "./read-lane.ts";

const {
  chapterCursor,
  chapterProgress,
  HttpReadRows,
  IdbReadRows,
  isBookDone,
  isChapterDone,
  mergeRows,
  nextUntypedVerse,
  ReadProgressStore,
  summarize,
  syncReadProgress,
} = read;

const row = (
  book: string,
  chapter: number,
  verse: number,
  { pack = "bsb", ts = 1, speed = 200, accuracy = 0.95 } = {},
): VerseRow => ({ pack, book, chapter, verse, speed, accuracy, ts });

/** Every non-omitted verse of a chapter of a pack, as rows. */
const chapterRows = (pack: Pack, book: string, chapter: number, ts = 1) => {
  const count = pack.book(book)!.chapters[chapter - 1];
  const rows: VerseRow[] = [];
  for (let v = 1; v <= count; v++) {
    if (!pack.isOmitted(book, chapter, v)) {
      rows.push(row(book, chapter, v, { pack: pack.id, ts }));
    }
  }
  return rows;
};

const bookRows = (pack: Pack, book: string) =>
  pack.book(book)!.chapters.flatMap((_, i) => chapterRows(pack, book, i + 1));

type FetchCall = { url: string; init: RequestInit | undefined };

function spyFetch(respond: (url: string, init?: RequestInit) => Response) {
  const calls: FetchCall[] = [];
  const saved = globalThis.fetch;
  globalThis.fetch = (async (input: any, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    return respond(url, init);
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = saved) };
}

let restoreFetch = () => {};

beforeEach(async () => {
  await new IdbReadRows().clear();
  delete (globalThis as any).__PAGE_DATA__;
});

afterEach(() => {
  restoreFetch();
  restoreFetch = () => {};
  delete (globalThis as any).__PAGE_DATA__;
});

test("cursor: the first verse with no row", () => {
  deepEqual(nextUntypedVerse([], Pack.BSB, "john"), { chapter: 1, verse: 1 });
  const typed = [row("john", 1, 1), row("john", 1, 2), row("john", 1, 3)];
  deepEqual(nextUntypedVerse(typed, Pack.BSB, "john"), {
    chapter: 1,
    verse: 4,
  });
  // A gap left behind is the cursor, not the furthest verse.
  deepEqual(
    nextUntypedVerse([row("john", 1, 1), row("john", 1, 3)], Pack.BSB, "john"),
    { chapter: 1, verse: 2 },
  );
  // A finished chapter moves the cursor to the next chapter.
  deepEqual(
    nextUntypedVerse(chapterRows(Pack.BSB, "john", 1), Pack.BSB, "john"),
    { chapter: 2, verse: 1 },
  );
  equal(chapterCursor(typed, Pack.BSB, "john", 1), 4);
  equal(chapterCursor([], Pack.BSB, "john", 2), 1);
});

test("cursor: rows of another pack, another book or a bad book do not count", () => {
  const kjv = [row("john", 1, 1, { pack: "kjv" })];
  deepEqual(nextUntypedVerse(kjv, Pack.BSB, "john"), { chapter: 1, verse: 1 });
  const luke = [row("luke", 1, 1)];
  deepEqual(nextUntypedVerse(luke, Pack.BSB, "john"), { chapter: 1, verse: 1 });
  isNull(nextUntypedVerse([], Pack.BSB, "no-such-book"));
});

test("cursor: omitted verses (BSB John 5:4) are skipped and never block a chapter", () => {
  isTrue(Pack.BSB.isOmitted("john", 5, 4));
  const typed = [row("john", 5, 1), row("john", 5, 2), row("john", 5, 3)];
  equal(chapterCursor(typed, Pack.BSB, "john", 5), 5);
  const all = chapterRows(Pack.BSB, "john", 5);
  equal(all.length, Pack.BSB.book("john")!.chapters[4] - 1);
  isTrue(isChapterDone(all, Pack.BSB, "john", 5));
  isNull(chapterCursor(all, Pack.BSB, "john", 5));
  // KJV keeps John 5:4, so the same rows leave the KJV chapter open.
  const kjvRows = all.map((r) => ({ ...r, pack: "kjv" }));
  equal(chapterCursor(kjvRows, Pack.KJV, "john", 5), 4);
  equal(isChapterDone(kjvRows, Pack.KJV, "john", 5), false);
});

test("chapter done and chapter progress", () => {
  const all = chapterRows(Pack.BSB, "john", 1);
  isTrue(isChapterDone(all, Pack.BSB, "john", 1));
  equal(isChapterDone(all.slice(1), Pack.BSB, "john", 1), false);
  equal(isChapterDone([], Pack.BSB, "john", 2), false);
  deepEqual(chapterProgress(all.slice(0, 10), Pack.BSB, "john", 1), {
    typed: 10,
    total: 51,
  });
  // Omitted verses are not counted in the total.
  deepEqual(chapterProgress([], Pack.BSB, "john", 5), { typed: 0, total: 46 });
});

test("book done: every chapter done", () => {
  const jude = bookRows(Pack.BSB, "jude");
  isTrue(isBookDone(jude, Pack.BSB, "jude"));
  isNull(nextUntypedVerse(jude, Pack.BSB, "jude"));
  equal(isBookDone(jude.slice(0, -1), Pack.BSB, "jude"), false);
  const john = bookRows(Pack.BSB, "john");
  isTrue(isBookDone(john, Pack.BSB, "john"));
  equal(
    isBookDone(
      john.filter((r) => r.chapter !== 21),
      Pack.BSB,
      "john",
    ),
    false,
  );
});

test("merge: union by verse, newest ts wins", () => {
  const a = [row("john", 1, 1, { ts: 5, speed: 100 }), row("john", 1, 2)];
  const b = [row("john", 1, 1, { ts: 9, speed: 300 }), row("john", 1, 3)];
  const merged = mergeRows(a, b);
  equal(merged.length, 3);
  equal(merged.find((r) => r.verse === 1)!.speed, 300);
  const reversed = mergeRows(b, a);
  equal(reversed.find((r) => r.verse === 1)!.speed, 300);
  // A different pack is a different key.
  equal(mergeRows(a, [row("john", 1, 1, { pack: "kjv", ts: 99 })]).length, 3);
});

test("summarize: mean speed and accuracy over verse rows", () => {
  isNull(summarize([]));
  deepEqual(
    summarize([
      row("john", 1, 1, { speed: 100, accuracy: 1 }),
      row("john", 1, 2, { speed: 300, accuracy: 0.9 }),
    ]),
    { verses: 2, speed: 200, accuracy: 0.95 },
  );
});

test("IndexedDB: rows persist across store instances (a reload), keyed per verse", async () => {
  const local = new IdbReadRows();
  await local.put([row("john", 1, 1), row("john", 1, 2)]);
  await local.put([row("john", 1, 1, { pack: "kjv" })]);
  const reloaded = new IdbReadRows();
  equal((await reloaded.read("bsb")).length, 2);
  equal((await reloaded.read("kjv")).length, 1);

  // Same key: the newer row replaces, an older one never does.
  await reloaded.put([row("john", 1, 1, { ts: 10, speed: 400 })]);
  await reloaded.put([row("john", 1, 1, { ts: 3, speed: 50 })]);
  const rows = await new IdbReadRows().read("bsb");
  equal(rows.length, 2);
  equal(rows.find((r) => r.verse === 1)!.speed, 400);

  // A store built after the "reload" puts the cursor on the next untyped verse.
  const store = new ReadProgressStore({ signedIn: () => false });
  await store.load("bsb");
  deepEqual(nextUntypedVerse(store.rows("bsb"), Pack.BSB, "john"), {
    chapter: 1,
    verse: 3,
  });
});

test("signed out: nothing leaves the browser", async () => {
  const spy = spyFetch(() => new Response(null, { status: 500 }));
  restoreFetch = spy.restore;
  const store = new ReadProgressStore(); // default remote and default signed-in check
  await store.load("bsb");
  store.record(row("john", 1, 1, { ts: Date.now() }));
  await store.settled();
  await store.sync("bsb");
  await syncReadProgress();
  equal(spy.calls.length, 0);
  equal(store.rows("bsb").length, 1);
});

test("signed in: load merges the account's rows and PUTs only the new local rows", async () => {
  await new IdbReadRows().put([
    row("john", 1, 1, { ts: 10, speed: 111 }), // newer than the server's copy
    row("john", 1, 2, { ts: 1 }), // older than the server's copy
    row("john", 1, 3, { ts: 1 }), // local only
  ]);
  const server: VerseRow[] = [
    row("john", 1, 1, { ts: 5, speed: 999 }),
    row("john", 1, 2, { ts: 7, speed: 777 }),
    row("john", 1, 4, { ts: 7 }), // server only
  ];
  const puts: VerseRow[][] = [];
  const remote: RemoteReadRows = {
    get: async (pack) => server.filter((r) => r.pack === pack),
    put: async (rows) => {
      puts.push([...rows]);
      return true;
    },
  };
  const store = new ReadProgressStore({ remote, signedIn: () => true });
  await store.load("bsb");
  await store.settled();

  const rows = store.rows("bsb");
  equal(rows.length, 4);
  equal(rows.find((r) => r.verse === 1)!.speed, 111);
  equal(rows.find((r) => r.verse === 2)!.speed, 777);
  equal(puts.length, 1);
  deepEqual(puts[0].map((r) => r.verse).sort(), [1, 3]);

  // The server's rows reached this browser's IndexedDB too.
  const local = await new IdbReadRows().read("bsb");
  equal(local.length, 4);
  equal(local.find((r) => r.verse === 2)!.speed, 777);

  // A newly finished verse goes up on its own.
  store.record(row("john", 1, 5, { ts: 20 }));
  await store.settled();
  equal(puts.length, 2);
  deepEqual(
    puts[1].map((r) => r.verse),
    [5],
  );
});

test("signed in: a failing server is quiet and local progress still works", async () => {
  await new IdbReadRows().put([row("john", 1, 1)]);
  const remote: RemoteReadRows = {
    get: async () => {
      throw new Error("down");
    },
    put: async () => {
      throw new Error("down");
    },
  };
  const store = new ReadProgressStore({ remote, signedIn: () => true });
  await store.load("bsb");
  store.record(row("john", 1, 2, { ts: 5 }));
  await store.settled();
  equal(store.rows("bsb").length, 2);
  equal((await new IdbReadRows().read("bsb")).length, 2);
});

test("HTTP shape: GET ?pack=, PUT {rows} with only VerseRow fields, 403 is quiet", async () => {
  const spy = spyFetch((url, init) => {
    if ((init?.method ?? "GET") === "GET") {
      return Response.json({
        rows: [
          row("john", 1, 1),
          { junk: true },
          row("john", 1, 1, { pack: "kjv" }),
        ],
      });
    }
    return new Response(null, { status: 204 });
  });
  restoreFetch = spy.restore;
  const http = new HttpReadRows();
  const got = await http.get("bsb");
  equal(got!.length, 1);
  equal(spy.calls[0].url, "/_/gutentype/read?pack=bsb");

  const ok = await http.put([{ ...row("john", 1, 1), extra: "x" } as VerseRow]);
  isTrue(ok);
  const put = spy.calls[1];
  equal(put.url, "/_/gutentype/read");
  equal(put.init!.method, "PUT");
  deepEqual(JSON.parse(String(put.init!.body)), { rows: [row("john", 1, 1)] });

  spy.restore();
  const denied = spyFetch(() => new Response(null, { status: 403 }));
  restoreFetch = denied.restore;
  isNull(await http.get("bsb"));
  equal(await http.put([row("john", 1, 1)]), false);
  const refused = spyFetch(() => {
    throw new TypeError("offline");
  });
  restoreFetch = () => {
    refused.restore();
    denied.restore();
  };
  isNull(await http.get("bsb"));
  equal(await http.put([row("john", 1, 1)]), false);
});

test("syncReadProgress: signed in, it GETs every pack and PUTs only local-only rows", async () => {
  await new IdbReadRows().put([row("john", 1, 1, { ts: 3 })]);
  (globalThis as any).__PAGE_DATA__ = { user: { id: "u1" } };
  const spy = spyFetch((url, init) =>
    (init?.method ?? "GET") === "GET"
      ? Response.json({ rows: [] })
      : new Response(null, { status: 204 }),
  );
  restoreFetch = spy.restore;
  await syncReadProgress();
  const gets = spy.calls.filter((c) => (c.init?.method ?? "GET") === "GET");
  const puts = spy.calls.filter((c) => c.init?.method === "PUT");
  deepEqual(
    gets.map((c) => c.url).sort(),
    Pack.ALL.map((p) => `/_/gutentype/read?pack=${p.id}`).sort(),
  );
  equal(puts.length, 1);
  deepEqual(JSON.parse(String(puts[0].init!.body)).rows, [
    row("john", 1, 1, { ts: 3 }),
  ]);
});
