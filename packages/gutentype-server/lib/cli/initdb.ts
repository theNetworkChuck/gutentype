/*
 * Gutentype's initdb (ISC-70): creates Keybr's and Gutentype's tables and turns on sqlite WAL with a busy timeout.
 * It writes no row: unlike Keybr's `devenv/initdb.ts`, it never seeds a login token. Safe to run on every start.
 *
 *   node --import @keybr/tsl packages/gutentype-server/lib/cli/initdb.ts
 *
 * Reads the database settings the server reads (DATABASE_CLIENT, DATABASE_FILENAME, ...), from the environment or
 * the dotenv files Keybr's config loads.
 */
import { Env, makeKnex } from "@keybr/config";
import { initDatabase } from "../schema.ts";

Env.probeFilesSync();
const knex = makeKnex();
try {
  await initDatabase(knex);
  console.log("Database schema is ready. No rows were written.");
} finally {
  await knex.destroy();
}
