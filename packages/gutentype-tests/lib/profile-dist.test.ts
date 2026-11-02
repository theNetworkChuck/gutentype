/*
 * ISC-75: Profile compares a person against Gutentype's own people. The server sums the speed-and-accuracy counts
 * of the last 90 days into one speed histogram and one accuracy histogram; Profile draws those and reads its
 * "beats N%" line from them. Under 100 lessons counted there is no histogram and no percentage, only a plain
 * "not enough data yet". Keybr's shipped distribution is never used.
 */
import { deepEqual, equal, ok } from "node:assert/strict";
import { test } from "node:test";
import { Application } from "@fastr/core";
import {
  accuracyBuckets,
  minComparisonLessons,
  speedBuckets,
} from "@gutentype/content";
import {
  AccuracyComparison,
  SpeedComparison,
} from "@gutentype/profile/lib/Comparison.tsx";
import {
  accuracyDistribution,
  comparisonOf,
  parsePopulation,
  populationPath,
  speedDistribution,
} from "@gutentype/profile/lib/population.ts";
import { lessonPopulation } from "@gutentype/server";
import { FakeIntlProvider } from "@keybr/intl";
import { type SummaryStats } from "@keybr/result";
import { FakeSettingsContext } from "@keybr/settings";
import { Model } from "objection";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { kMain, startApp, TestContext } from "./server-harness.ts";

const context = new TestContext();

const day = 86_400_000;
const dayOf = (time: number) => new Date(time).toISOString().slice(0, 10);

async function seed(
  rows: readonly { name: string; daysAgo: number; count: number }[],
  now = Date.now(),
): Promise<void> {
  await Model.knex()("gutentype_counter").insert(
    rows.map(({ name, daysAgo, count }) => ({
      name,
      day: dayOf(now - daysAgo * day),
      count,
    })),
  );
}

function zeros(length: number): number[] {
  return new Array<number>(length).fill(0);
}

test("the histograms are the 90-day bucket totals, and nothing older or unrelated", async () => {
  await seed([
    { name: "lesson-s40-a96", daysAgo: 0, count: 50 },
    { name: "lesson-s40-a96", daysAgo: 89, count: 20 }, // first day of the window
    { name: "lesson-s40-a98", daysAgo: 10, count: 10 },
    { name: "lesson-s60-a98", daysAgo: 30, count: 25 },
    { name: "lesson-s150-a100", daysAgo: 1, count: 5 },
    { name: "lesson-s40-a96", daysAgo: 90, count: 1_000 }, // outside the window
    { name: "lesson-ten", daysAgo: 0, count: 999 }, // another counter
    { name: "book-finished", daysAgo: 0, count: 999 },
  ]);

  const speed = zeros(speedBuckets);
  speed[8] = 50 + 20 + 10; // 40 wpm
  speed[12] = 25; // 60 wpm
  speed[30] = 5; // 150 wpm and up
  const accuracy = zeros(accuracyBuckets);
  accuracy[96] = 70;
  accuracy[98] = 35;
  accuracy[100] = 5;

  const population = await lessonPopulation(Model.knex());
  equal(population.days, 90);
  equal(population.lessons, 110);
  deepEqual(population.speed, speed);
  deepEqual(population.accuracy, accuracy);

  const request = startApp(context.get(Application, kMain));
  const response = await request.GET(populationPath).send();
  equal(response.status, 200);
  equal(response.headers.get("Set-Cookie"), null);
  const body = await response.body.json();
  deepEqual(body, population);
  deepEqual(parsePopulation(body), population);
});

test("under 100 lessons the server sends no histogram", async () => {
  await seed([
    { name: "lesson-s40-a96", daysAgo: 0, count: minComparisonLessons - 1 },
  ]);
  const under = await lessonPopulation(Model.knex());
  equal(under.lessons, 99);
  equal(under.speed, null);
  equal(under.accuracy, null);

  await seed([{ name: "lesson-s45-a97", daysAgo: 1, count: 1 }]);
  const enough = await lessonPopulation(Model.knex());
  equal(enough.lessons, 100);
  ok(enough.speed != null && enough.accuracy != null);
});

test("Profile's distribution spreads each bucket over Keybr's chart range and keeps its totals", () => {
  const speed = zeros(speedBuckets);
  speed[8] = 80; // 40 to 44 wpm: 200 to 224 characters per minute
  speed[12] = 20;
  const d = speedDistribution(speed);
  equal(d.length, 751); // Keybr's speed histogram: 0 to 750 characters per minute

  const bucketMass = (from: number, to: number) => {
    let sum = 0;
    for (let i = from; i < to; i++) sum += d.pmf(i);
    return sum;
  };
  ok(Math.abs(bucketMass(200, 225) - 0.8) < 1e-9);
  ok(Math.abs(bucketMass(300, 325) - 0.2) < 1e-9);
  ok(Math.abs(d.cdf(199)) < 1e-9);
  ok(Math.abs(d.cdf(224) - 0.8) < 1e-9);
  ok(Math.abs(d.cdf(750) - 1) < 1e-9);

  const accuracy = zeros(accuracyBuckets);
  accuracy[96] = 3;
  accuracy[100] = 1;
  const a = accuracyDistribution(accuracy);
  equal(a.length, 1001); // Keybr's accuracy histogram: 0 to 1000 tenths of a percent
  ok(Math.abs(a.cdf(a.scale(0.959))) < 1e-9);
  ok(Math.abs(a.cdf(a.scale(0.969)) - 0.75) < 1e-9);
  ok(Math.abs(a.cdf(a.scale(1)) - 1) < 1e-9);
});

test("a response of the wrong shape is refused", () => {
  const good = {
    days: 90,
    since: "2026-08-05",
    lessons: 100,
    speed: zeros(speedBuckets),
    accuracy: zeros(accuracyBuckets),
  };
  ok(parsePopulation(good) != null);
  equal(parsePopulation(null), null);
  equal(parsePopulation("x"), null);
  equal(parsePopulation({ ...good, lessons: -1 }), null);
  equal(parsePopulation({ ...good, speed: zeros(3) }), null);
  equal(parsePopulation({ ...good, accuracy: [...zeros(100), "1"] }), null);
  equal(parsePopulation({ ...good, speed: null }), null); // one histogram without the other
  ok(parsePopulation({ ...good, lessons: 5, speed: null, accuracy: null }));
});

test("the comparison state: not enough data under 100 lessons, ready at 100", () => {
  equal(comparisonOf(null).kind, "unavailable");
  const under = comparisonOf({
    days: 90,
    since: "2026-08-05",
    lessons: 99,
    speed: null,
    accuracy: null,
  });
  deepEqual(under, { kind: "not-enough", lessons: 99 });

  const speed = zeros(speedBuckets);
  speed[8] = 100;
  const accuracy = zeros(accuracyBuckets);
  accuracy[96] = 100;
  const ready = comparisonOf({
    days: 90,
    since: "2026-08-05",
    lessons: 100,
    speed,
    accuracy,
  });
  equal(ready.kind, "ready");
  // A server that sent histograms for too few lessons is still shown as not enough data.
  equal(
    comparisonOf({ days: 90, since: "x", lessons: 50, speed, accuracy }).kind,
    "not-enough",
  );
});

function stats(speedCpm: number, accuracy: number): SummaryStats {
  const metric = (v: number) => ({ last: v, delta: 0, min: v, max: v, avg: v });
  return {
    count: 10,
    time: 60_000,
    speed: metric(speedCpm),
    accuracy: metric(accuracy),
    score: metric(1),
  };
}

function html(node: ReactNode): string {
  return renderToStaticMarkup(
    createElement(
      FakeIntlProvider,
      null,
      createElement(FakeSettingsContext, null, node),
    ),
  );
}

test("Profile says there is not enough data yet instead of a percentage", () => {
  const comparison = { kind: "not-enough", lessons: 12 } as const;
  for (const Section of [SpeedComparison, AccuracyComparison]) {
    const page = html(
      createElement(Section, { stats: stats(250, 0.97), comparison }),
    );
    ok(/not enough data yet/i.test(page), page);
    ok(!/\d%/.test(page), `a percentage is shown: ${page}`);
  }
});

test("with 100+ lessons the percentile comes from Gutentype's histogram", () => {
  const speed = zeros(speedBuckets);
  speed[8] = 40; // 40 to 44 wpm
  speed[12] = 60; // 60 to 64 wpm
  const accuracy = zeros(accuracyBuckets);
  accuracy[90] = 25;
  accuracy[99] = 75;
  const comparison = comparisonOf({
    days: 90,
    since: "2026-08-05",
    lessons: 100,
    speed,
    accuracy,
  });
  if (comparison.kind !== "ready") throw new Error(comparison.kind);

  // 50 wpm (250 cpm) is above every 40 wpm lesson and below every 60 wpm one: faster than 40%.
  ok(Math.abs(comparison.speed.cdf(250) - 0.4) < 1e-9);
  // 95% accuracy is above the 90% bucket and below the 99% bucket: more accurate than 25%.
  ok(
    Math.abs(comparison.accuracy.cdf(comparison.accuracy.scale(0.95)) - 0.25) <
      1e-9,
  );
  // The rendered line ("faster than 40% of the 100 Learn lessons") is checked in a browser environment by
  // packages/gutentype-profile/lib/Comparison.test.tsx, because Keybr's charts need a DOM canvas.
});
