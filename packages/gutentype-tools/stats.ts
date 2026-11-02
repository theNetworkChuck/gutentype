#!/usr/bin/env bun
/*
 * ISC-6: books finished and lesson-ten passes over the last 90 days, from the two anonymous counters.
 *
 *   bun packages/gutentype-tools/stats.ts [--json] [--db <file>]
 *
 * Without --db it reads DATABASE_FILENAME (the production sqlite file on the data volume).
 */
import { main } from "./lib/server-stats.ts";

process.exitCode = await main(process.argv.slice(2));
