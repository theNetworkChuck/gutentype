import { existsSync } from "node:fs";
import { resolve } from "node:path";

/*
 * ISC-6 and ISC-40: the two 90-day numbers from the two anonymous counters, read from the sqlite database file.
 * The same query as `counterTotals` in `@gutentype/server` (the counter-stats test checks they agree), written out
 * here because that package loads Keybr's knex client, which needs `node:sqlite`, and bun has only `bun:sqlite`.
 */

export const counterNames = ["book-finished", "lesson-ten"] as const;
export const windowDays = 90;

const dayOf = (time: number) => new Date(time).toISOString().slice(0, 10);

type Query = (
  sql: string,
  ...params: unknown[]
) => { name: string; total: number }[];

async function openDatabase(
  file: string,
): Promise<{ query: Query; close: () => void }> {
  if (process.versions.bun != null) {
    const name = "bun:sqlite";
    const { Database } = await import(name);
    const db = new Database(file); // Read-write open: a WAL database cannot be opened read-only once its -shm file is gone. Only SELECTs run.
    return {
      query: (sql, ...params) => db.query(sql).all(...params),
      close: () => db.close(),
    };
  }
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(file);
  return {
    query: (sql, ...params) =>
      db.prepare(sql).all(...(params as string[])) as any,
    close: () => db.close(),
  };
}

export async function readStats(file: string, now = Date.now()) {
  const since = dayOf(now - (windowDays - 1) * 86_400_000);
  if (!existsSync(file)) {
    throw new Error(`No database at ${file}`); // Opening it would create an empty one.
  }
  const db = await openDatabase(file);
  try {
    const rows = db.query(
      "SELECT name, SUM(count) AS total FROM gutentype_counter WHERE day >= ? GROUP BY name",
      since,
    );
    const totals = Object.fromEntries(
      counterNames.map((n) => [n, 0]),
    ) as Record<(typeof counterNames)[number], number>;
    for (const row of rows) {
      if ((counterNames as readonly string[]).includes(row.name)) {
        totals[row.name as (typeof counterNames)[number]] = Number(
          row.total ?? 0,
        );
      }
    }
    return { days: windowDays, since, ...totals };
  } finally {
    db.close();
  }
}

/** `--db <file>`, else `DATABASE_FILENAME` (bun loads `.env` by itself; under node `./.env` is read here). */
export function databaseFile(argv: readonly string[]): string {
  const i = argv.indexOf("--db");
  if (i !== -1 && argv[i + 1]) return resolve(argv[i + 1]);
  if (process.env.DATABASE_FILENAME == null && existsSync(".env")) {
    process.loadEnvFile(".env");
  }
  const file = process.env.DATABASE_FILENAME;
  if (!file || file === ":memory:") {
    throw new Error("Name the database: --db <file> or DATABASE_FILENAME");
  }
  return resolve(file);
}

export async function main(argv: readonly string[]): Promise<number> {
  try {
    const stats = await readStats(databaseFile(argv));
    if (argv.includes("--json")) {
      console.log(JSON.stringify(stats));
    } else {
      console.log(`Last ${stats.days} days (since ${stats.since}):`);
      console.log(`  books finished:     ${stats["book-finished"]}`);
      console.log(`  lesson ten passed:  ${stats["lesson-ten"]}`);
    }
    return 0;
  } catch (err: any) {
    console.error(String(err?.message ?? err));
    return 1;
  }
}
