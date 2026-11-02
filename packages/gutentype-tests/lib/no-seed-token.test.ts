/*
 * ISC-70: no fixed or seeded login token exists in a production database. Keybr's `devenv/initdb.ts` seeds token
 * `xyz` for `user@localhost` on every `start-docker`; Gutentype's own initdb creates the schema, turns on WAL with a
 * busy timeout, and writes no row. `packages/gutentype-tools/scripts/no-seed-token-check.sh` runs the CLI on a
 * fresh file and checks the deploy files never call Keybr's initdb.
 */
import "./server-env.ts";
import { equal } from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { initDatabase } from "@gutentype/server";
import { makeKnex } from "@keybr/config";

test("initdb writes no login token, and running it twice changes nothing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gutentype-initdb-"));
  process.env.DATABASE_FILENAME = join(dir, "database.sqlite");
  const knex = makeKnex();
  try {
    await initDatabase(knex);
    await initDatabase(knex);
    for (const table of [
      "user",
      "user_login_request",
      "user_external_id",
      "order",
    ]) {
      const [{ n }] = await knex(table).count({ n: "*" });
      equal(Number(n), 0, table);
    }
    const [{ journal_mode }] = await knex.raw("PRAGMA journal_mode");
    equal(journal_mode, "wal");
    const [{ timeout }] = await knex.raw("PRAGMA busy_timeout");
    equal(Number(timeout) >= 5000, true);
  } finally {
    await knex.destroy();
    process.env.DATABASE_FILENAME = ":memory:";
    await rm(dir, { recursive: true, force: true });
  }
});
