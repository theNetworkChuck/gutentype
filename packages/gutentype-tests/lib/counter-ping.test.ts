/*
 * ISC-65 (and the server half of ISC-6): a counter ping carries no id, cookie or body beyond the counter's name,
 * the server always answers 204 and never throws, and nothing it logs carries the address the ping came from.
 */
import { deepEqual, equal, ok } from "node:assert/strict";
import { test } from "node:test";
import { Application } from "@fastr/core";
import { counterPath, countOnce } from "@gutentype/content";
import { createGutentypeSchema } from "@gutentype/server";
// eslint-disable-next-line n/no-extraneous-import -- dependency line listed for the integrator
import { Level, Logger, type Message } from "@keybr/logger";
import { Model } from "objection";
import { kMain, startApp, TestContext } from "./server-harness.ts";

const context = new TestContext();

const address = "203.0.113.77";

function captureLogs(): Message[] {
  const messages: Message[] = [];
  Logger.configure({
    level: Level.DEBUG,
    transports: [{ append: (message) => messages.push(message) }],
  });
  return messages;
}

function mentionsAddress(messages: readonly Message[]): boolean {
  return messages.some((m) =>
    JSON.stringify([m.format, m.args, String(m.err?.stack ?? "")]).includes(
      address,
    ),
  );
}

async function counts(): Promise<Record<string, number>> {
  const knex = Model.knex();
  const rows = await knex("gutentype_counter").select("name", "count");
  return Object.fromEntries(rows.map((r: any) => [r.name, Number(r.count)]));
}

test("a ping is counted, answered 204, and sets no cookie", async () => {
  const request = startApp(context.get(Application, kMain));

  for (let i = 0; i < 3; i++) {
    const response = await request
      .POST(counterPath("book-finished"))
      .header("X-Forwarded-For", address)
      .send();
    equal(response.status, 204);
    equal(response.headers.get("Set-Cookie"), null);
    equal((await response.body.buffer()).length, 0);
  }
  await request.POST(counterPath("lesson-ten")).send();

  deepEqual(await counts(), { "book-finished": 3, "lesson-ten": 1 });
});

test("the counter table holds a name, a day and a count, and nothing else", async () => {
  const request = startApp(context.get(Application, kMain));
  await request.POST(counterPath("lesson-ten")).send();

  const knex = Model.knex();
  const columns = Object.keys(await knex("gutentype_counter").columnInfo());
  deepEqual(columns.sort(), ["count", "day", "name"]);
  const [row] = await knex("gutentype_counter").select("day");
  equal(row.day, new Date().toISOString().slice(0, 10));
});

test("an unknown name or a body is answered 204 and stores nothing extra", async () => {
  const request = startApp(context.get(Application, kMain));

  equal((await request.POST("/_/count/user-42").send()).status, 204);
  equal((await request.POST("/_/count/").send()).status, 204);
  equal(
    (
      await request
        .POST(counterPath("book-finished"))
        .send({ id: "someone", email: "a@b.c" })
    ).status,
    204,
  );

  deepEqual(await counts(), { "book-finished": 1 });
});

test("nothing logged for a ping names its address, even when the database fails", async () => {
  const messages = captureLogs();
  const request = startApp(context.get(Application, kMain));

  equal(
    (
      await request
        .POST(counterPath("lesson-ten"))
        .header("X-Forwarded-For", address)
        .send()
    ).status,
    204,
  );

  await Model.knex().schema.dropTable("gutentype_counter");
  try {
    const failed = await request
      .POST(counterPath("lesson-ten"))
      .header("X-Forwarded-For", address)
      .send();

    equal(failed.status, 204);
    ok(messages.length > 0, "the failure was not logged at all");
    ok(!mentionsAddress(messages), "a log line carries the address");
  } finally {
    await createGutentypeSchema(Model.knex());
  }
});

test("the browser's ping sends only the counter's name: no cookie, no body", async () => {
  const sent: { url: string; init: RequestInit }[] = [];
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
    countOnce("book-finished", "john");
    countOnce("book-finished", "john");
    countOnce("lesson-ten");
  } finally {
    g.fetch = saved.fetch;
    g.localStorage = saved.localStorage;
  }

  deepEqual(
    sent.map((s) => s.url),
    ["/_/count/book-finished", "/_/count/lesson-ten"],
  );
  for (const { init } of sent) {
    equal(init.method, "POST");
    equal(init.credentials, "omit");
    equal(init.body, undefined);
    equal(init.headers, undefined);
  }
});
