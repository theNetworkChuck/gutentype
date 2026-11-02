/*
 * ISC-15: speed and accuracy are recorded per verse the moment a verse is finished.
 *
 * Types John 11:35 through the Read track's verse session (Keybr's TextInput underneath, with one wrong key on the
 * way), then checks that the finished verse produced exactly one row carrying Keybr's makeStats speed and accuracy,
 * that the row is in the progress store synchronously (before any await), and that it reached IndexedDB.
 */
import { test } from "node:test";
import { Pack } from "@gutentype/content";
import { makeStats, textInputSettings } from "@keybr/textinput";
import { equal, isNotNull, isNull, isTrue } from "rich-assert";
import { read, type VerseRow } from "./read-lane.ts";

const { IdbReadRows, ReadProgressStore, VerseSession } = read;
type VerseSession = InstanceType<typeof VerseSession>;

const ref = { pack: "bsb", book: "john", chapter: 11, verse: 35 } as const;

function typeVerse(
  session: VerseSession,
  { typoAt = -1, step = 120 }: { typoAt?: number; step?: number } = {},
): { rows: VerseRow[]; time: number } {
  const rows: VerseRow[] = [];
  let time = 1000;
  const text = session.text;
  const input = (codePoint: number) => {
    time += step;
    const { row } = session.onInput({
      type: "input",
      timeStamp: time,
      inputType: "appendChar",
      codePoint,
      timeToType: step,
    });
    if (row != null) rows.push(row);
  };
  [...text].forEach((char, index) => {
    if (index === typoAt) input(0x0071 /* q */);
    input(char.codePointAt(0)!);
  });
  return { rows, time };
}

test("a finished verse yields one row with makeStats speed and accuracy", async () => {
  await new IdbReadRows().clear();
  const session = new VerseSession(ref, "Jesus wept.", textInputSettings);
  const { rows } = typeVerse(session, { typoAt: 3 });

  equal(rows.length, 1);
  const [row] = rows;
  const stats = makeStats(session.textInput.steps);
  equal(row.pack, "bsb");
  equal(row.book, "john");
  equal(row.chapter, 11);
  equal(row.verse, 35);
  equal(row.speed, stats.speed);
  equal(row.accuracy, stats.accuracy);
  equal(stats.errors, 1);
  isTrue(row.speed > 0);
  isTrue(row.accuracy < 1 && row.accuracy > 0.85);
  isTrue(Math.abs(Date.now() - row.ts) < 5000);
});

test("no row exists before the last character is typed", () => {
  const session = new VerseSession(ref, "Jesus wept.", textInputSettings);
  const text = [..."Jesus wept"];
  let time = 0;
  for (const char of text) {
    time += 100;
    const { row } = session.onInput({
      type: "input",
      timeStamp: time,
      inputType: "appendChar",
      codePoint: char.codePointAt(0)!,
      timeToType: 100,
    });
    isNull(row);
  }
  const { row } = session.onInput({
    type: "input",
    timeStamp: time + 100,
    inputType: "appendChar",
    codePoint: 0x002e /* . */,
    timeToType: 100,
  });
  isNotNull(row);
});

test("the row is in the progress store the moment the verse is finished, and in IndexedDB after", async () => {
  await new IdbReadRows().clear();
  const store = new ReadProgressStore({ signedIn: () => false });
  await store.load(Pack.BSB.id);
  equal(store.rows("bsb").length, 0);

  const session = new VerseSession(ref, "Jesus wept.", textInputSettings);
  const { rows } = typeVerse(session);
  store.record(rows[0]);

  // Synchronous: no await between finishing the verse and reading the store.
  equal(store.rows("bsb").length, 1);
  equal(store.rows("bsb")[0].verse, 35);

  await store.settled();
  const persisted = await new IdbReadRows().read("bsb");
  equal(persisted.length, 1);
  equal(persisted[0].speed, rows[0].speed);
  equal(persisted[0].accuracy, rows[0].accuracy);
});
