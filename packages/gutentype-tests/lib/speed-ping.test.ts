/*
 * ISC-76 (and ISC-41's line for it): after each finished Learn lesson the browser sends one anonymous count whose
 * name is the lesson's speed bucket and accuracy bucket. The server answers 204 like the other counters, sets no
 * cookie, keeps a daily total per name, and ignores (still 204) any name the browser would never send.
 */
import { deepEqual, equal, ok } from "node:assert/strict";
import { test } from "node:test";
import { Application } from "@fastr/core";
import {
  counterPath,
  countLesson,
  lessonBucketName,
  markLessonsCounted,
  parseLessonBucket,
  privacyCopy,
} from "@gutentype/content";
import { bumpCounter } from "@gutentype/server";
import { Model } from "objection";
import { kMain, startApp, TestContext } from "./server-harness.ts";

const context = new TestContext();

async function rows(): Promise<{ name: string; day: string; count: number }[]> {
  const found = await Model.knex()("gutentype_counter")
    .select("name", "day", "count")
    .orderBy(["day", "name"]);
  return found.map((r: any) => ({
    name: r.name,
    day: r.day,
    count: Number(r.count),
  }));
}

const today = () => new Date().toISOString().slice(0, 10);

/** Keybr speeds are characters per minute; `wpm(42)` is 42 words per minute. */
const wpm = (n: number) => n * 5;

test("a lesson's name is its speed bucket (5 wpm wide) and accuracy bucket (1% wide)", () => {
  equal(lessonBucketName(wpm(42), 0.964), "lesson-s40-a96");
  equal(lessonBucketName(wpm(45), 0.99), "lesson-s45-a99");
  equal(lessonBucketName(wpm(4.9), 0.29), "lesson-s0-a29");
  equal(lessonBucketName(wpm(149.9), 1), "lesson-s145-a100");
  equal(lessonBucketName(wpm(150), 1), "lesson-s150-a100");
  equal(lessonBucketName(wpm(400), 0.5), "lesson-s150-a50");
  equal(lessonBucketName(Number.NaN, 0.5), null);
  equal(lessonBucketName(wpm(40), 1.2), null);
  equal(lessonBucketName(-1, 0.9), null);
  deepEqual(parseLessonBucket("lesson-s40-a96"), {
    speedWpm: 40,
    accuracyPercent: 96,
  });
});

test("a bucket ping is counted per name and day, answered 204 with no cookie and no body", async () => {
  const request = startApp(context.get(Application, kMain));

  for (const name of ["lesson-s40-a96", "lesson-s40-a96", "lesson-s45-a99"]) {
    const response = await request.POST(`/_/count/${name}`).send();
    equal(response.status, 204);
    equal(response.headers.get("Set-Cookie"), null);
    equal((await response.body.buffer()).length, 0);
  }

  deepEqual(await rows(), [
    { name: "lesson-s40-a96", day: today(), count: 2 },
    { name: "lesson-s45-a99", day: today(), count: 1 },
  ]);
});

test("a bucket is totalled per day", async () => {
  const knex = Model.knex();
  const day = 86_400_000;
  const now = Date.UTC(2026, 10, 2, 12);
  await bumpCounter("lesson-s60-a98", { now: now - day, knex });
  await bumpCounter("lesson-s60-a98", { now, knex });
  await bumpCounter("lesson-s60-a98", { now, knex });

  deepEqual(await rows(), [
    { name: "lesson-s60-a98", day: "2026-11-01", count: 1 },
    { name: "lesson-s60-a98", day: "2026-11-02", count: 2 },
  ]);
});

test("a name the browser would never send is answered 204 and stores nothing", async () => {
  const request = startApp(context.get(Application, kMain));
  const malformed = [
    "lesson-s41-a96", // not a multiple of 5
    "lesson-s155-a96", // above the top bucket
    "lesson-s40-a101", // above 100%
    "lesson-s040-a96", // leading zero
    "lesson-s40-a096",
    "lesson-s-5-a90",
    "lesson-s40-a96x",
    "LESSON-s40-a96",
    "lesson-s40",
    "lesson-a96-s40",
    "lesson-s40-a96-user42",
    "lesson-s" + "5".repeat(40) + "-a9",
    "lesson-s40-a9%2F",
  ];
  for (const name of malformed) {
    const response = await request.POST(`/_/count/${name}`).send();
    equal(response.status, 204, name);
    equal(response.headers.get("Set-Cookie"), null, name);
  }

  deepEqual(await rows(), []);
});

test("a bucket ping that arrives with a body or a cookie stores only its name", async () => {
  const request = startApp(context.get(Application, kMain));

  const response = await request
    .POST(counterPath("lesson-s30-a90"))
    .header("Cookie", "session=someone")
    .send({ id: "someone", email: "a@b.c", speed: 33 });
  equal(response.status, 204);
  equal(response.headers.get("Set-Cookie"), null);

  deepEqual(await rows(), [{ name: "lesson-s30-a90", day: today(), count: 1 }]);
});

type Sent = { url: string; init: RequestInit };

function withFakeBrowser(run: (sent: Sent[]) => void): Sent[] {
  const sent: Sent[] = [];
  const store = new Map<string, string>();
  const g = globalThis as any;
  const saved = { fetch: g.fetch, localStorage: g.localStorage };
  g.fetch = async (url: string, init: RequestInit) => {
    sent.push({ url, init });
    return new Response(null, { status: 204 });
  };
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
  };
  try {
    run(sent);
  } finally {
    g.fetch = saved.fetch;
    g.localStorage = saved.localStorage;
  }
  return sent;
}

test("the browser sends one ping per finished lesson, and none for a lesson already counted", () => {
  const first = { timeStamp: 1_000, speed: wpm(42), accuracy: 0.964 };
  const second = { timeStamp: 2_000, speed: wpm(51), accuracy: 0.99 };

  const sent = withFakeBrowser(() => {
    ok(countLesson(first));
    ok(!countLesson(first), "the same lesson was counted twice");
    ok(countLesson(second));
    ok(!countLesson(second), "the same lesson was counted twice");
    ok(!countLesson(first), "an older lesson was counted after a newer one");
  });

  deepEqual(
    sent.map((s) => s.url),
    ["/_/count/lesson-s40-a96", "/_/count/lesson-s50-a99"],
  );
  for (const { init } of sent) {
    equal(init.method, "POST");
    equal(init.credentials, "omit");
    equal(init.keepalive, true);
    equal(init.body, undefined);
    equal(init.headers, undefined);
  }
});

test("lessons the page loaded with are never counted", () => {
  const sent = withFakeBrowser(() => {
    markLessonsCounted(5_000);
    ok(!countLesson({ timeStamp: 4_000, speed: wpm(40), accuracy: 0.9 }));
    ok(!countLesson({ timeStamp: 5_000, speed: wpm(40), accuracy: 0.9 }));
    ok(countLesson({ timeStamp: 6_000, speed: wpm(40), accuracy: 0.9 }));
    markLessonsCounted(3_000); // an older mark never lowers the flag
    ok(!countLesson({ timeStamp: 5_500, speed: wpm(40), accuracy: 0.9 }));
  });

  deepEqual(
    sent.map((s) => s.url),
    ["/_/count/lesson-s40-a90"],
  );
});

test("a lesson with a broken speed or accuracy sends nothing", () => {
  const sent = withFakeBrowser(() => {
    ok(!countLesson({ timeStamp: 1, speed: Number.NaN, accuracy: 0.9 }));
    ok(!countLesson({ timeStamp: 2, speed: 200, accuracy: Infinity }));
  });
  deepEqual(sent, []);
});

test("/privacy names the speed-and-accuracy count", () => {
  const text = privacyCopy.sections.flatMap((s) => s.paragraphs).join("\n");
  ok(
    /after each Learn lesson/i.test(text),
    "privacy does not mention the per-lesson count",
  );
  ok(/speed/i.test(text) && /accuracy/i.test(text));
  ok(
    !/two totals are the only thing/i.test(text),
    "privacy still says the two totals are all that leaves the browser",
  );
});
