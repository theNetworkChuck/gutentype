/*
 * ISC-64: the database schema holds only the fields `/privacy` names. The schema is dumped from a fresh database
 * made by Gutentype's own initdb; every column must be in `storedFields`, and every entry of `storedFields` names
 * the phrase on the privacy page that covers it. `packages/gutentype-tools/scripts/schema-vs-privacy.sh` runs the
 * same comparison as a diff.
 */
import "./server-env.ts";
import { deepEqual, ok } from "node:assert/strict";
import { test } from "node:test";
import { privacyCopy } from "@gutentype/content";
import { dumpSchema, initDatabase, storedFields } from "@gutentype/server";
import { makeKnex } from "@keybr/config";

const privacyText = privacyCopy.sections
  .flatMap((s) => [s.heading, ...s.paragraphs])
  .join(" ");

test("every stored field is named on /privacy", () => {
  for (const [column, phrase] of Object.entries(storedFields)) {
    ok(
      privacyText.includes(phrase),
      `${column}: "${phrase}" is not on /privacy`,
    );
  }
});

test("the schema holds exactly the fields /privacy names", async () => {
  const knex = makeKnex();
  try {
    await initDatabase(knex);
    deepEqual(await dumpSchema(knex), Object.keys(storedFields).sort());
  } finally {
    await knex.destroy();
  }
});
