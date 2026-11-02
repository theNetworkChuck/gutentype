/*
 * ISC-64: prints the two lists `gutentype-tools/scripts/schema-vs-privacy.sh` diffs, one `table.column` per line.
 *
 *   node --import @keybr/tsl packages/gutentype-server/lib/cli/schema.ts --schema    # a fresh database's columns
 *   node --import @keybr/tsl packages/gutentype-server/lib/cli/schema.ts --privacy   # the columns /privacy names
 *
 * `--privacy` lists a column only when its phrase in `storedFields` is really on the page (`privacyCopy`).
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { privacyCopy } from "@gutentype/content";
import { makeKnex } from "@keybr/config";
import { storedFields } from "../privacy.ts";
import { dumpSchema, initDatabase } from "../schema.ts";

const mode = process.argv[2];
if (mode === "--privacy") {
  const page = privacyCopy.sections
    .flatMap((s) => [s.heading, ...s.paragraphs])
    .join(" ");
  const named = Object.entries(storedFields)
    .filter(([, phrase]) => page.includes(phrase))
    .map(([column]) => column)
    .sort();
  console.log(named.join("\n"));
} else if (mode === "--schema") {
  const dir = await mkdtemp(join(tmpdir(), "gutentype-schema-"));
  process.env.DATABASE_CLIENT = "sqlite";
  process.env.DATABASE_FILENAME = join(dir, "database.sqlite");
  const knex = makeKnex();
  try {
    await initDatabase(knex);
    console.log((await dumpSchema(knex)).join("\n"));
  } finally {
    await knex.destroy();
    await rm(dir, { recursive: true, force: true });
  }
} else {
  console.error("usage: schema.ts --schema | --privacy");
  process.exitCode = 2;
}
