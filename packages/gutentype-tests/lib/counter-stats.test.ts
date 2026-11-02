/*
 * ISC-6: one query returns the two 90-day numbers from the two anonymous counters (books finished, lesson-ten
 * passes). `counterTotals` is the query; `packages/gutentype-tools/stats.ts --json` prints it for a database file.
 */
import "./server-env.ts";
import { deepEqual, equal } from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { counterTotals, initDatabase } from "@gutentype/server";
import { makeKnex } from "@keybr/config";

const day = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);

async function withCounters(fn: (file: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "gutentype-stats-"));
  const file = join(dir, "database.sqlite");
  process.env.DATABASE_FILENAME = file;
  const knex = makeKnex();
  try {
    await initDatabase(knex);
    await knex("gutentype_counter").insert([
      { name: "book-finished", day: day(0), count: 3 },
      { name: "book-finished", day: day(89), count: 4 },
      { name: "book-finished", day: day(90), count: 100 },
      { name: "lesson-ten", day: day(1), count: 7 },
      { name: "lesson-ten", day: day(200), count: 50 },
    ]);
    await fn(file);
  } finally {
    await knex.destroy();
    process.env.DATABASE_FILENAME = ":memory:";
    await rm(dir, { recursive: true, force: true });
  }
}

test("the query sums each counter over the last 90 days", async () => {
  await withCounters(async () => {
    const knex = makeKnex();
    try {
      deepEqual(await counterTotals(knex), {
        "days": 90,
        "since": day(89),
        "book-finished": 7,
        "lesson-ten": 7,
      });
    } finally {
      await knex.destroy();
    }
  });
});

test("stats.ts --json prints the two numbers for a database file", async () => {
  await withCounters(async (file) => {
    const stats = resolve(
      import.meta.dirname,
      "../../gutentype-tools/stats.ts",
    );
    for (const runtime of [
      [process.execPath, "--import", "@keybr/tsl"],
      ["bun"],
    ]) {
      const run = spawnSync(
        runtime[0],
        [...runtime.slice(1), stats, "--json", "--db", file],
        {
          encoding: "utf8",
        },
      );
      if (runtime[0] === "bun" && run.error != null) {
        continue; // bun is not on this machine's PATH
      }
      equal(run.status, 0, `${runtime[0]}: ${run.stderr}`);
      const json = JSON.parse(run.stdout);
      equal(json["book-finished"], 7);
      equal(json["lesson-ten"], 7);
      equal(json.days, 90);
    }
  });
});
