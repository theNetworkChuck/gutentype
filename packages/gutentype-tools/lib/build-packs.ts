#!/usr/bin/env bun
/**
 * Builds the BSB and KJV packs in packages/gutentype-content/packs from their canonical source files.
 *
 *   bun packages/gutentype-tools/lib/build-packs.ts <sources-dir>
 *
 * <sources-dir> holds bsb.txt (https://bereanbible.com/bsb.txt) and pg10.txt
 * (https://www.gutenberg.org/cache/epub/10/pg10.txt). Each file's SHA-256 must match the pin below, so a
 * changed upstream text is a deliberate re-pin, never a silent change. Verse text is stored exactly as the
 * source has it; the only changes are line endings, the byte-order mark, and KJV's hard line wraps joined
 * with one space (ISC-52). Keybr's text input already accepts a straight quote or hyphen for the curly
 * quotes and dashes, so the text needs no typing substitutions.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

type Book = { id: string; name: string; chapters: string[][] };

type Source = {
  id: string;
  label: string;
  short: string;
  language: string;
  file: string;
  sourceUrl: string;
  sha256: string;
  license: string;
  parse: (text: string) => Book[];
};

const BOOK_NAMES = [
  "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua", "Judges", "Ruth", "1 Samuel",
  "2 Samuel", "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles", "Ezra", "Nehemiah", "Esther", "Job",
  "Psalms", "Proverbs", "Ecclesiastes", "Song of Solomon", "Isaiah", "Jeremiah", "Lamentations", "Ezekiel",
  "Daniel", "Hosea", "Joel", "Amos", "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah",
  "Haggai", "Zechariah", "Malachi", "Matthew", "Mark", "Luke", "John", "Acts", "Romans", "1 Corinthians",
  "2 Corinthians", "Galatians", "Ephesians", "Philippians", "Colossians", "1 Thessalonians",
  "2 Thessalonians", "1 Timothy", "2 Timothy", "Titus", "Philemon", "Hebrews", "James", "1 Peter",
  "2 Peter", "1 John", "2 John", "3 John", "Jude", "Revelation",
];

export const bookId = (name: string) => name.toLowerCase().replace(/ /g, "-");

function clean(text: string): string {
  return text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
}

function parseBsb(text: string): Book[] {
  const books = new Map<string, Book>();
  const lines = clean(text).split("\n").slice(3).filter((l) => l.length > 0);
  for (const line of lines) {
    const m = /^(.+) (\d+):(\d+)\t(.*)$/.exec(line);
    if (!m) throw new Error(`bsb: bad line ${JSON.stringify(line)}`);
    const [, rawName, c, v, verse] = m;
    const name = rawName === "Psalm" ? "Psalms" : rawName; // the BSB file labels each psalm "Psalm N:V"
    let book = books.get(name);
    if (!book) {
      book = { id: bookId(name), name, chapters: [] };
      books.set(name, book);
    }
    const ci = Number(c) - 1;
    const vi = Number(v) - 1;
    (book.chapters[ci] ??= [])[vi] = verse.trim();
  }
  return [...books.values()];
}

/** Gutenberg #10: the 66 book headings repeat after the contents list; verses start with `c:v `. */
function parseKjv(text: string): Book[] {
  const body = clean(text);
  const start = body.indexOf("*** START");
  const end = body.indexOf("*** END");
  const lines = body.slice(start, end).split("\n").slice(1);
  const headings: string[] = [];
  let i = 0;
  // The contents list: 66 headings between the testament titles.
  for (; i < lines.length && headings.length < 66; i++) {
    const l = lines[i].trim();
    if (l === "" || /^The (Old|New) Testament/.test(l)) continue;
    headings.push(l);
  }
  // Collect each book's lines, then join them: a `c:v` marker can sit at the end of a wrapped line.
  const bodies: string[][] = [];
  let next = 0;
  for (; i < lines.length; i++) {
    const l = lines[i].trim();
    if (next < 66 && l === headings[next]) {
      bodies.push([]);
      next++;
      continue;
    }
    if (bodies.length === 0 || l === "" || /^The (Old|New) Testament/.test(l)) continue;
    bodies[bodies.length - 1].push(l);
  }
  if (bodies.length !== 66) throw new Error(`kjv: ${bodies.length} books`);
  return bodies.map((ls, n) => {
    const book: Book = { id: bookId(BOOK_NAMES[n]), name: BOOK_NAMES[n], chapters: [] };
    const text = " " + ls.join(" ");
    const marker = /\s(\d+):(\d+)\s/g;
    const hits = [...text.matchAll(marker)];
    hits.forEach((m, k) => {
      const from = m.index! + m[0].length;
      const to = k + 1 < hits.length ? hits[k + 1].index! : text.length;
      (book.chapters[Number(m[1]) - 1] ??= [])[Number(m[2]) - 1] = text.slice(from, to).trim();
    });
    return book;
  });
}

const SOURCES: Source[] = [
  {
    id: "bsb",
    label: "Berean Standard Bible",
    short: "BSB",
    language: "en",
    file: "bsb.txt",
    sourceUrl: "https://bereanbible.com/bsb.txt",
    sha256: "2ac3af1de52d4e68261cba91d85c320b7eadc6560e830d99e591767b8ff5ca96",
    license:
      "The Holy Bible, Berean Standard Bible, BSB. This text of God's Word has been dedicated to the public domain.",
    parse: parseBsb,
  },
  {
    id: "kjv",
    label: "King James Version",
    short: "KJV",
    language: "en",
    file: "pg10.txt",
    sourceUrl: "https://www.gutenberg.org/cache/epub/10/pg10.txt",
    sha256: "0204adaed1f25700aa854218cae63c7172228c41088f335e99167a071eed83c0",
    license:
      "The King James Version is in the public domain in most of the world. In the United Kingdom its rights are vested in the Crown. Text from Project Gutenberg eBook #10.",
    parse: parseKjv,
  },
];

/** Lowercase letter runs: the words Learn can draw from. */
export function wordsOf(verse: string): string[] {
  return verse.toLowerCase().match(/[a-z]+/g) ?? [];
}

function build(sourcesDir: string, outRoot: string) {
  const summary: Record<string, unknown> = {};
  for (const src of SOURCES) {
    const raw = readFileSync(join(sourcesDir, src.file));
    const sha = createHash("sha256").update(raw).digest("hex");
    if (sha !== src.sha256) throw new Error(`${src.id}: sha256 ${sha} != pinned ${src.sha256}`);
    const books = src.parse(raw.toString("utf8"));
    const names = books.map((b) => b.name);
    if (names.join("|") !== BOOK_NAMES.join("|")) throw new Error(`${src.id}: book order differs`);

    const dir = join(outRoot, src.id);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(join(dir, "books"), { recursive: true });

    const wordCount = new Map<string, number>();
    const letterCount = new Map<string, number>();
    let verses = 0;
    const omitted: string[] = [];
    for (const book of books) {
      for (let c = 0; c < book.chapters.length; c++) {
        const chapter = book.chapters[c];
        if (!chapter) throw new Error(`${src.id}: ${book.name} missing chapter ${c + 1}`);
        for (let v = 0; v < chapter.length; v++) {
          const verse = chapter[v];
          if (verse === undefined) throw new Error(`${src.id}: ${book.name} ${c + 1}:${v + 1} missing`);
          verses++;
          if (verse === "") omitted.push(`${book.id} ${c + 1}:${v + 1}`);
          for (const w of wordsOf(verse)) {
            wordCount.set(w, (wordCount.get(w) ?? 0) + 1);
            for (const ch of w) letterCount.set(ch, (letterCount.get(ch) ?? 0) + 1);
          }
        }
      }
      writeFileSync(join(dir, "books", `${book.id}.json`), JSON.stringify({ id: book.id, name: book.name, chapters: book.chapters }));
    }
    const words = [...wordCount].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    const letters = [...letterCount].sort((a, b) => b[1] - a[1]);
    const pack = {
      id: src.id,
      label: src.label,
      short: src.short,
      language: src.language,
      license: src.license,
      sourceUrl: src.sourceUrl,
      sourceSha256: src.sha256,
      verses,
      omitted,
      letters: letters.map(([ch, n]) => [ch, n]),
      books: books.map((b) => ({ id: b.id, name: b.name, chapters: b.chapters.map((ch) => ch.length) })),
    };
    writeFileSync(join(dir, "pack.json"), JSON.stringify(pack, null, 1));
    writeFileSync(join(dir, "words.json"), JSON.stringify(words));
    // Placeholder; build-learn.ts derives the real fragments, blocklist and divine names from this pack.
    writeFileSync(join(dir, "learn.json"), JSON.stringify({ fragments: [], blocklist: [], divineNames: [] }));
    summary[src.id] = { verses, omitted: omitted.length, distinctWords: words.length, order: letters.map((l) => l[0]).join("") };
  }
  return summary;
}

/** Writes lib/generated.ts: static imports of every pack.json and one dynamic-import chunk per book, so webpack splits and compresses each book and a new pack touches only this package. */
function writeGenerated(contentLib: string, ids: string[]) {
  const lines: string[] = [
    "// Generated by packages/gutentype-tools/lib/build-packs.ts. Do not edit.",
    ...ids.map((id) => `import ${id} from "./packs/${id}/pack.json" with { type: "json" };`),
    "",
    "export const packInfos = [" + ids.join(", ") + "];",
    "",
    "export async function importBook(pack: string, book: string): Promise<unknown> {",
    "  switch (`${pack}/${book}`) {",
  ];
  for (const id of ids) {
    for (const name of BOOK_NAMES) {
      const b = bookId(name);
      lines.push(`    case "${id}/${b}":`, `      return (await import(/* webpackChunkName: "gt-${id}-${b}" */ "./packs/${id}/books/${b}.json", { with: { type: "json" } })).default;`);
    }
  }
  lines.push("  }", "  throw new Error(`unknown book ${pack}/${book}`);", "}", "");
  for (const kind of ["words", "learn"]) {
    const fn = kind === "words" ? "importWords" : "importLearn";
    lines.push(`export async function ${fn}(pack: string): Promise<unknown> {`, "  switch (pack) {");
    for (const id of ids) lines.push(`    case "${id}":`, `      return (await import(/* webpackChunkName: "gt-${id}-${kind}" */ "./packs/${id}/${kind}.json", { with: { type: "json" } })).default;`);
    lines.push("  }", "  throw new Error(`unknown pack ${pack}`);", "}", "");
  }
  writeFileSync(join(contentLib, "generated.ts"), lines.join("\n"));
}

if (import.meta.main) {
  const sourcesDir = resolve(process.argv[2] ?? join(dirname(new URL(import.meta.url).pathname), "../sources"));
  const contentLib = resolve(dirname(new URL(import.meta.url).pathname), "../../gutentype-content/lib");
  const summary = build(sourcesDir, join(contentLib, "packs"));
  writeGenerated(contentLib, SOURCES.map((s) => s.id));
  console.log(JSON.stringify(summary, null, 1));
}
