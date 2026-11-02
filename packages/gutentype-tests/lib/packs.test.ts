// ISC-25: BSB and KJV ship as content packages, each with the verse text by book, chapter and verse, a derived
// word list and the letter-unlock order, and each stores its source URL and the source file's SHA-256.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadBook, loadLearn, loadWords, Pack } from "@gutentype/content";
import { equal, isTrue } from "rich-assert";

const sources: Record<string, [file: string, url: string]> = {
  bsb: ["bsb.txt", "https://bereanbible.com/bsb.txt"],
  kjv: ["pg10.txt", "https://www.gutenberg.org/cache/epub/10/pg10.txt"],
};

test("both packs are registered", () => {
  equal(Pack.ALL.map(String).join(" "), "bsb kjv");
});

for (const pack of [Pack.BSB, Pack.KJV]) {
  test(`${pack.id}: 66 books, 31102 verses, word list, unlock order, pinned source`, async () => {
    const { info } = pack;
    equal(info.books.length, 66);
    equal(info.verses, 31102);
    let verses = 0;
    let empty = 0;
    for (const book of info.books) {
      const text = await loadBook(pack, book.id);
      equal(text.id, book.id);
      equal(text.chapters.length, book.chapters.length, book.id);
      text.chapters.forEach((ch, c) => {
        equal(ch.length, book.chapters[c], `${book.id} ${c + 1}`);
        ch.forEach((v, i) => {
          verses++;
          if (v === "") {
            empty++;
            isTrue(
              pack.isOmitted(book.id, c + 1, i + 1),
              `${book.id} ${c + 1}:${i + 1}`,
            );
          }
        });
      });
    }
    equal(verses, 31102);
    equal(empty, info.omitted.length);
    equal(empty, pack === Pack.BSB ? 16 : 0);
    const words = await loadWords(pack);
    isTrue(words.length > 10000);
    for (let i = 1; i < words.length; i++)
      isTrue(words[i - 1][1] >= words[i][1]);
    equal([...pack.letterOrder].sort().join(""), "abcdefghijklmnopqrstuvwxyz");
    const [file, url] = sources[pack.id];
    equal(info.sourceUrl, url);
    const path = fileURLToPath(
      import.meta.resolve(`@gutentype/tools/sources/${file}`),
    );
    equal(
      createHash("sha256").update(readFileSync(path)).digest("hex"),
      info.sourceSha256,
    );
    const learn = await loadLearn(pack);
    isTrue(
      learn.fragments.length > 0 &&
        learn.blocklist.length > 0 &&
        learn.divineNames.length > 0,
      "learn.json built",
    );
  });
}
