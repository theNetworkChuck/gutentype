// ISC-52: no verse is altered on the way in. Every verse of every pack diffs clean against its canonical source
// file, read here by an independent parser, except the documented substitutions below; small-caps LORD (written
// "LORD" in both sources) is kept. Neither source file carries translator italics or poetry line breaks inside a
// verse: BSB is one line per verse, and Gutenberg #10 is plain text whose only line breaks are its hard wraps.
//
// Documented substitutions (the whole list):
//   1. Line endings CRLF -> LF and the byte-order mark removed (both files).
//   2. Surrounding whitespace of a verse trimmed (allowed by build-packs.ts; the test counts it, zero today).
//   3. KJV's hard line wraps joined with one space (a wrapped verse is one line in the pack).
// Curly quotes, dashes and every other character stay as the source has them.
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadBook, Pack } from "@gutentype/content";
import { equal, isTrue } from "rich-assert";

const source = (file: string) =>
  readFileSync(
    fileURLToPath(import.meta.resolve(`@gutentype/tools/sources/${file}`)),
    "utf8",
  )
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n");

async function packVerses(pack: Pack) {
  const out: {
    book: string;
    name: string;
    c: number;
    v: number;
    text: string;
  }[] = [];
  for (const book of pack.info.books) {
    const { chapters } = await loadBook(pack, book.id);
    chapters.forEach((ch, c) =>
      ch.forEach((text, v) =>
        out.push({ book: book.id, name: book.name, c: c + 1, v: v + 1, text }),
      ),
    );
  }
  return out;
}

test("bsb: every verse equals its line in bsb.txt", async () => {
  const lines = source("bsb.txt")
    .split("\n")
    .slice(3)
    .filter((l) => l !== "");
  const src = new Map<string, string>();
  for (const line of lines) {
    const tab = line.indexOf("\t");
    const ref = line.slice(0, tab).replace(/^Psalm /, "Psalms ");
    src.set(ref, line.slice(tab + 1));
  }
  let trimmed = 0;
  let differ: string[] = [];
  let seen = 0;
  for (const { name, c, v, text } of await packVerses(Pack.BSB)) {
    const ref = `${name} ${c}:${v}`;
    const raw = src.get(ref);
    if (raw == null) {
      equal(
        text,
        "",
        `${ref} is not in the source, so the pack leaves it empty`,
      );
      continue;
    }
    seen++;
    if (raw === text) continue;
    if (raw.trim() === text) {
      trimmed++;
      continue;
    }
    differ.push(ref);
  }
  equal(differ.slice(0, 5).join(", "), "");
  equal(seen, src.size, "every source line is a pack verse");
  console.log(
    `bsb: ${seen} verses identical, ${trimmed} with surrounding whitespace trimmed`,
  );
  const count = (s: string) => s.split("LORD").length - 1;
  equal(
    count((await packVerses(Pack.BSB)).map((x) => x.text).join("\n")),
    count(lines.join("\n")),
  );
});

test("kjv: the Gutenberg text is exactly its headings and the pack's verses, in order", async () => {
  const raw = source("pg10.txt");
  const start = raw.indexOf("\n", raw.indexOf("*** START")) + 1;
  const body = raw.slice(start, raw.indexOf("*** END")).replace(/\s+/g, " ");
  const verses = await packVerses(Pack.KJV);
  let cursor = 0;
  const gaps = new Set<string>();
  const missing: string[] = [];
  for (const { name, c, v, text } of verses) {
    const needle = ` ${c}:${v} ${text}`;
    const at = body.indexOf(needle, cursor);
    if (at < 0) {
      missing.push(`${name} ${c}:${v}`);
      continue;
    }
    const gap = body.slice(cursor, at).trim();
    if (gap !== "") gaps.add(gap);
    cursor = at + needle.length;
    isTrue(
      cursor === body.length || body[cursor] === " ",
      `${name} ${c}:${v} ends where the source verse ends`,
    );
  }
  equal(missing.slice(0, 5).join(", "), "");
  const tail = body.slice(cursor).trim();
  if (tail !== "") gaps.add(tail);
  // What sits between verses is only the contents list (before Genesis 1:1), book headings and testament titles.
  const [contents, ...rest] = gaps;
  isTrue(
    contents.startsWith("The Old Testament of the King James Version"),
    contents.slice(0, 80),
  );
  for (const gap of gaps)
    isTrue(
      !/\d+:\d+/.test(gap),
      `unexpected text between verses: ${gap.slice(0, 120)}`,
    );
  for (const gap of rest)
    isTrue(
      gap.length < 200,
      `unexpected text between verses: ${gap.slice(0, 120)}`,
    );
  console.log(
    `kjv: ${verses.length} verses found in order; text between them: the contents list and ${rest.length} headings`,
  );
  equal(verses.length, 31102);
  const count = (s: string) => s.split("LORD").length - 1;
  equal(count(verses.map((x) => x.text).join(" ")), count(body));
});
