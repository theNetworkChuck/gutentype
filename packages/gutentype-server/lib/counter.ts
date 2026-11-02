import { type CounterName, counterNames } from "@gutentype/content";
import { Logger } from "@keybr/logger";
import { type Knex } from "knex";
import { Model } from "objection";
import { counterTable, ensureDatabase } from "./schema.ts";

/*
 * The two anonymous counters (CONTRACTS § 4, ISC-6, ISC-65). A ping adds one to today's total for its name, and
 * that is all that is kept: no id, no address, no user. The handler never throws, because Keybr's error handler
 * logs every request header, the client address included.
 */

export const isCounterName = (name: unknown): name is CounterName =>
  typeof name === "string" &&
  (counterNames as readonly string[]).includes(name);

/** UTC day, `YYYY-MM-DD`. */
export const dayOf = (time: number) =>
  new Date(time).toISOString().slice(0, 10);

/** Adds one to today's total. Logs a failure by its message only, never the request. */
export async function bumpCounter(
  name: string,
  { now = Date.now(), knex = Model.knex() }: { now?: number; knex?: Knex } = {},
): Promise<void> {
  if (!isCounterName(name)) {
    return;
  }
  try {
    await ensureDatabase(knex);
    await knex(counterTable)
      .insert({ name, day: dayOf(now), count: 1 })
      .onConflict(["name", "day"])
      .merge({ count: knex.raw("?? + 1", [`${counterTable}.count`]) });
  } catch (err: any) {
    Logger.warn("Counter %s not saved: %s", name, String(err?.code ?? "error"));
  }
}

export const statsWindowDays = 90;

export type CounterTotals = {
  readonly days: number;
  /** The first day counted, `YYYY-MM-DD`. */
  readonly since: string;
} & Record<CounterName, number>;

/** The one query behind ISC-6 and ISC-40: each counter's total over the last 90 days, today included. */
export async function counterTotals(
  knex: Knex = Model.knex(),
  {
    now = Date.now(),
    days = statsWindowDays,
  }: { now?: number; days?: number } = {},
): Promise<CounterTotals> {
  const since = dayOf(now - (days - 1) * 86_400_000);
  const rows = await knex(counterTable)
    .where("day", ">=", since)
    .groupBy("name")
    .select("name")
    .sum({ total: "count" });
  const totals = Object.fromEntries(
    counterNames.map((name) => [name, 0]),
  ) as Record<CounterName, number>;
  for (const row of rows as { name: string; total: unknown }[]) {
    if (isCounterName(row.name)) {
      totals[row.name] = Number(row.total ?? 0);
    }
  }
  return { days, since, ...totals };
}

/** The same query as SQL, for a reader without knex (`gutentype-tools/stats.ts` under bun). */
export const counterTotalsSql = `SELECT name, SUM(count) AS total FROM ${counterTable} WHERE day >= ? GROUP BY name`;
