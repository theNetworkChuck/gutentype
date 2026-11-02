/*
 * ISC-22 and ISC-42, server side: signed-in Read progress follows the person to another browser. The API is
 * `GET /_/gutentype/read?pack=<id>` and `PUT /_/gutentype/read` with `{rows}`; both answer 403 without a session.
 * Rows merge by (pack, book, chapter, verse) and the newest `ts` wins; bad rows are refused.
 */
import { deepEqual, equal } from "node:assert/strict";
import { test } from "node:test";
import { Application } from "@fastr/core";
import { findUser, kMain, startApp, TestContext } from "./server-harness.ts";

const context = new TestContext();

const row = (
  verse: number,
  ts: number,
  {
    pack = "bsb",
    book = "john",
    chapter = 1,
    speed = 200,
    accuracy = 0.95,
  } = {},
) => ({ pack, book, chapter, verse, speed, accuracy, ts });

async function signedIn(email: string) {
  const request = startApp(context.get(Application, kMain));
  await request.become((await findUser(email)).id!);
  return request;
}

async function rows(
  request: Awaited<ReturnType<typeof signedIn>>,
  pack = "bsb",
) {
  const response = await request.GET(`/_/gutentype/read?pack=${pack}`).send();
  equal(response.status, 200);
  const json = await response.body.json<{ rows: any[] }>();
  return json.rows.sort(
    (a, b) =>
      a.book.localeCompare(b.book) ||
      a.chapter - b.chapter ||
      a.verse - b.verse,
  );
}

test("without a session both calls answer 403", async () => {
  const request = startApp(context.get(Application, kMain));
  equal((await request.GET("/_/gutentype/read?pack=bsb").send()).status, 403);
  equal(
    (await request.PUT("/_/gutentype/read").send({ rows: [row(1, 1)] })).status,
    403,
  );
});

test("rows put from one browser appear in another browser of the same person", async () => {
  const a = await signedIn("user1@keybr.com");
  const b = await signedIn("user1@keybr.com");

  equal(
    (
      await a
        .PUT("/_/gutentype/read")
        .send({ rows: [row(1, 1000), row(2, 1001)] })
    ).status,
    204,
  );

  deepEqual(await rows(b), [row(1, 1000), row(2, 1001)]);
  deepEqual(await rows(b, "kjv"), []);
  deepEqual(await rows(await signedIn("user2@keybr.com")), []);
});

test("the newest ts wins, whichever browser sent it", async () => {
  const a = await signedIn("user1@keybr.com");
  const b = await signedIn("user1@keybr.com");

  await a
    .PUT("/_/gutentype/read")
    .send({ rows: [row(3, 2000, { speed: 100 })] });
  await b
    .PUT("/_/gutentype/read")
    .send({ rows: [row(3, 1500, { speed: 999 })] });
  deepEqual(await rows(a), [row(3, 2000, { speed: 100 })]);

  await b
    .PUT("/_/gutentype/read")
    .send({ rows: [row(3, 2500, { speed: 300 })] });
  deepEqual(await rows(a), [row(3, 2500, { speed: 300 })]);
});

test("the first-sign-in merge: local rows join the account's, furthest progress kept", async () => {
  const a = await signedIn("user1@keybr.com");
  await a.PUT("/_/gutentype/read").send({ rows: [row(1, 10), row(2, 11)] });

  // A second browser read further while signed out, then signs in: GET, merge, PUT its local-only rows.
  const b = await signedIn("user1@keybr.com");
  const server = await rows(b);
  const local = [row(1, 5), row(2, 6), row(3, 7), row(4, 8)];
  const localOnly = local.filter(
    (l) => !server.some((s) => s.verse === l.verse && s.chapter === l.chapter),
  );
  equal(
    (await b.PUT("/_/gutentype/read").send({ rows: localOnly })).status,
    204,
  );

  deepEqual(await rows(a), [row(1, 10), row(2, 11), row(3, 7), row(4, 8)]);
});

for (const [label, body] of [
  ["an unknown pack", { rows: [row(1, 1, { pack: "esv" })] }],
  ["an unknown book", { rows: [row(1, 1, { book: "hezekiah" })] }],
  ["a chapter past the end", { rows: [row(1, 1, { chapter: 22 })] }],
  ["a verse past the end", { rows: [row(52, 1)] }],
  ["accuracy above 1", { rows: [row(1, 1, { accuracy: 1.5 })] }],
  ["a negative speed", { rows: [row(1, 1, { speed: -1 })] }],
  ["a missing ts", { rows: [{ ...row(1, 1), ts: undefined }] }],
  ["no rows array", { verse: 1 }],
] as const) {
  test(`a PUT with ${label} is refused`, async () => {
    const a = await signedIn("user1@keybr.com");
    equal((await a.PUT("/_/gutentype/read").send(body)).status, 400);
    deepEqual(await rows(a), []);
  });
}

test("GET needs a known pack", async () => {
  const a = await signedIn("user1@keybr.com");
  equal((await a.GET("/_/gutentype/read").send()).status, 400);
  equal((await a.GET("/_/gutentype/read?pack=esv").send()).status, 400);
});
