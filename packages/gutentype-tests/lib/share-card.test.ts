/*
 * ISC-55 (anti): the share card and its share URL carry no name, email or account identifier. A signed-in person's
 * details sit in the page data while the card is built, drawn and turned into a URL; none of them may appear in the
 * card payload, the URL or the drawn PNG text.
 */
import { afterEach, beforeEach, test } from "node:test";
import { Pack } from "@gutentype/content";
import { deepEqual, doesNotInclude, isNotNull } from "rich-assert";
import { read, type VerseRow } from "./read-lane.ts";

const { drawShareCard, shareCardFor, shareCardText, shareUrl } = read;

const user = {
  id: "u7Kq2xZ",
  email: "reader@example.com",
  name: "Reader McReaderson",
  anonymized: false,
  externalId: [{ provider: "google", id: "1029384756", name: "Reader G" }],
};

beforeEach(() => {
  (globalThis as any).__PAGE_DATA__ = {
    base: "https://gutentype.app/",
    locale: "en",
    user,
    publicUser: { id: user.id, name: user.name },
    settings: null,
  };
});

afterEach(() => {
  delete (globalThis as any).__PAGE_DATA__;
});

function finished(): VerseRow[] {
  const count = Pack.BSB.book("3-john")!.chapters[0];
  return Array.from({ length: count }, (_, i) => ({
    pack: "bsb",
    book: "3-john",
    chapter: 1,
    verse: i + 1,
    speed: 240,
    accuracy: 0.97,
    ts: new Date("2026-11-02T10:00:00").getTime(),
  }));
}

const secrets = [
  user.id,
  user.email,
  user.name,
  "Reader",
  "example.com",
  "1029384756",
  "google",
];

test("the card payload holds only the five public fields", () => {
  const card = shareCardFor(finished(), Pack.BSB, "3-john");
  isNotNull(card);
  deepEqual(Object.keys(card!).sort(), ["acc", "book", "date", "pack", "wpm"]);
  const json = JSON.stringify(card);
  for (const s of secrets) doesNotInclude(json, s);
});

test("the share URL carries no identifier", () => {
  const url = shareUrl(
    shareCardFor(finished(), Pack.BSB, "3-john")!,
    "https://gutentype.app",
  );
  for (const s of secrets) doesNotInclude(url, s);
  for (const key of ["name", "email", "id", "user", "uid"]) {
    doesNotInclude(new URL(url).search, `${key}=`);
  }
});

test("the drawn PNG text carries no identifier", () => {
  const card = shareCardFor(finished(), Pack.BSB, "3-john")!;
  const texts: string[] = [];
  const ctx = new Proxy({} as any, {
    get(obj, prop) {
      if (prop in obj) return obj[prop];
      return (...args: any[]) => {
        if (prop === "fillText") texts.push(String(args[0]));
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
  drawShareCard(ctx, card);
  const drawn = texts.join("\n") + JSON.stringify(shareCardText(card));
  for (const s of secrets) doesNotInclude(drawn, s);
});
