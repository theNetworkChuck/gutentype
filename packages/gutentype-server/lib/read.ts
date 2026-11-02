import { BadRequestError } from "@fastr/errors";
import { Pack } from "@gutentype/content";
import { type Knex } from "knex";
import { Model } from "objection";
import { ensureDatabase, readProgressTable } from "./schema.ts";

/**
 * One typed verse (CONTRACTS § 2): speed in characters per minute as Keybr's `makeStats` gives it, accuracy 0..1,
 * `ts` epoch milliseconds.
 */
export type VerseRow = {
  readonly pack: string;
  readonly book: string;
  readonly chapter: number;
  readonly verse: number;
  readonly speed: number;
  readonly accuracy: number;
  readonly ts: number;
};

/** More rows than the longest pack has verses is not a real upload. */
export const maxRowsPerPut = 40_000;

const isNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

/** A row the server accepts: a real verse of an installed pack, a sane speed, accuracy in 0..1, a time. */
export function parseVerseRow(value: unknown): VerseRow {
  const v = (value ?? {}) as Record<string, unknown>;
  const pack =
    typeof v.pack === "string" ? Pack.ALL.find((p) => p.id === v.pack) : null;
  const book =
    pack != null && typeof v.book === "string" ? pack.book(v.book) : null;
  const { chapter, verse, speed, accuracy, ts } = v;
  if (
    pack == null ||
    book == null ||
    !Number.isInteger(chapter) ||
    !Number.isInteger(verse) ||
    (chapter as number) < 1 ||
    (chapter as number) > book.chapters.length ||
    (verse as number) < 1 ||
    (verse as number) > book.chapters[(chapter as number) - 1] ||
    !isNumber(speed) ||
    speed < 0 ||
    speed > 10_000 ||
    !isNumber(accuracy) ||
    accuracy < 0 ||
    accuracy > 1 ||
    !Number.isSafeInteger(ts) ||
    (ts as number) < 0
  ) {
    throw new BadRequestError("Invalid verse row");
  }
  return {
    pack: pack.id,
    book: book.id,
    chapter: chapter as number,
    verse: verse as number,
    speed,
    accuracy,
    ts: ts as number,
  };
}

export function parseVerseRows(body: unknown): VerseRow[] {
  const rows = (body as { rows?: unknown } | null)?.rows;
  if (!Array.isArray(rows) || rows.length > maxRowsPerPut) {
    throw new BadRequestError("Invalid verse rows");
  }
  return rows.map(parseVerseRow);
}

export function parsePackId(value: string | null): Pack {
  const pack = value != null ? Pack.ALL.find((p) => p.id === value) : null;
  if (pack == null) {
    throw new BadRequestError("Unknown pack");
  }
  return pack;
}

/** The person's rows for one pack. */
export async function loadReadProgress(
  userId: number,
  pack: Pack,
  knex: Knex = Model.knex(),
): Promise<VerseRow[]> {
  await ensureDatabase(knex);
  const rows = await knex(readProgressTable)
    .where({ user_id: userId, pack: pack.id })
    .select("pack", "book", "chapter", "verse", "speed", "accuracy", "ts");
  return rows.map((r: any) => ({
    pack: String(r.pack),
    book: String(r.book),
    chapter: Number(r.chapter),
    verse: Number(r.verse),
    speed: Number(r.speed),
    accuracy: Number(r.accuracy),
    ts: Number(r.ts),
  }));
}

/** Merges rows into the person's progress: union by verse, the newest `ts` wins. */
export async function saveReadProgress(
  userId: number,
  rows: readonly VerseRow[],
  knex: Knex = Model.knex(),
): Promise<void> {
  await ensureDatabase(knex);
  // Within one upload the newest row per verse wins too.
  const byVerse = new Map<string, VerseRow>();
  for (const row of rows) {
    const key = `${row.pack}/${row.book}/${row.chapter}/${row.verse}`;
    const seen = byVerse.get(key);
    if (seen == null || row.ts > seen.ts) {
      byVerse.set(key, row);
    }
  }
  const all = [...byVerse.values()].map((row) => ({ user_id: userId, ...row }));
  await knex.transaction(async (trx) => {
    for (let i = 0; i < all.length; i += 100) {
      const batch = all.slice(i, i + 100);
      await trx(readProgressTable)
        .insert(batch)
        .onConflict(["user_id", "pack", "book", "chapter", "verse"])
        .merge()
        .where(`${readProgressTable}.ts`, "<", trx.raw("excluded.ts"));
    }
  });
}
