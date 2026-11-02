import {
  accuracyBuckets,
  type CounterName,
  counterNames,
  lessonBucketPrefix,
  minComparisonLessons,
  parseLessonBucket,
  speedBuckets,
  speedStepWpm,
} from "@gutentype/content";
import { Logger } from "@keybr/logger";
import { type Knex } from "knex";
import { Model } from "objection";
import { counterTable, ensureDatabase } from "./schema.ts";

/*
 * The anonymous counters (CONTRACTS § 4, ISC-6, ISC-65, ISC-76): the two fixed names, and one speed-and-accuracy
 * bucket name per finished Learn lesson (`lesson-s40-a96`, checked by `parseLessonBucket`). A ping adds one to today's total for its name, and
 * that is all that is kept: no id, no address, no user. The handler never throws, because Keybr's error handler
 * logs every request header, the client address included.
 */

export const isCounterName = (name: unknown): name is CounterName =>
  typeof name === "string" &&
  (counterNames as readonly string[]).includes(name);

/** UTC day, `YYYY-MM-DD`. */
export const dayOf = (time: number) =>
  new Date(time).toISOString().slice(0, 10);

/** A name the server keeps a total for: a fixed counter, or a lesson bucket exactly as the browser sends it. */
export const isCountedName = (name: unknown): name is string =>
  isCounterName(name) || parseLessonBucket(name) != null;

/** Adds one to today's total. Logs a failure by its message only, never the request. */
export async function bumpCounter(
  name: string,
  { now = Date.now(), knex = Model.knex() }: { now?: number; knex?: Knex } = {},
): Promise<void> {
  if (!isCountedName(name)) {
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

/**
 * Everyone's Learn lessons over the last 90 days, today included (ISC-75), summed from the speed-and-accuracy
 * counts. `speed[i]` counts lessons from `i * speedStepWpm` wpm up to the next step (the last bucket is the top
 * speed and above); `accuracy[p]` counts lessons at p% accuracy, rounded down. Under `minComparisonLessons`
 * lessons both histograms are null: too few to compare against, and few enough that a bar could stand for one
 * person.
 */
export type LessonPopulation = {
  readonly days: number;
  /** The first day counted, `YYYY-MM-DD`. */
  readonly since: string;
  readonly lessons: number;
  readonly speed: readonly number[] | null;
  readonly accuracy: readonly number[] | null;
};

export async function lessonPopulation(
  knex: Knex = Model.knex(),
  {
    now = Date.now(),
    days = statsWindowDays,
  }: { now?: number; days?: number } = {},
): Promise<LessonPopulation> {
  const since = dayOf(now - (days - 1) * 86_400_000);
  await ensureDatabase(knex);
  const rows = await knex(counterTable)
    .where("day", ">=", since)
    .where("name", "like", `${lessonBucketPrefix}%`)
    .groupBy("name")
    .select("name")
    .sum({ total: "count" });
  const speed = new Array<number>(speedBuckets).fill(0);
  const accuracy = new Array<number>(accuracyBuckets).fill(0);
  let lessons = 0;
  for (const row of rows as { name: string; total: unknown }[]) {
    const bucket = parseLessonBucket(row.name);
    const total = Number(row.total ?? 0);
    // Only names bumpCounter accepted reach the table; a row that does not parse is skipped, not guessed at.
    if (bucket == null || !Number.isFinite(total) || total <= 0) {
      continue;
    }
    speed[bucket.speedWpm / speedStepWpm] += total;
    accuracy[bucket.accuracyPercent] += total;
    lessons += total;
  }
  const enough = lessons >= minComparisonLessons;
  return {
    days,
    since,
    lessons,
    speed: enough ? speed : null,
    accuracy: enough ? accuracy : null,
  };
}
