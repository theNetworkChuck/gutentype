/*
 * ISC-24: a signed-in person deletes their account, and afterward no row for them remains in the database (login
 * requests, Google ids, orders, reading progress and sign-in attempts included) and no per-user file remains under
 * the data directory (settings, stats, Keybr's renamed stats copies, their sessions, their high-score entries).
 * Another person's data is untouched.
 */
import { deepEqual, equal, ok } from "node:assert/strict";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { Application } from "@fastr/core";
import { DataDir } from "@keybr/config";
import { User } from "@keybr/database";
import { Model } from "objection";
import {
  adultSignIn,
  findUser,
  kMain,
  startApp,
  TestContext,
} from "./server-harness.ts";

const context = new TestContext();

async function put(path: string, content: string) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walk(path)));
    } else {
      out.push(path);
    }
  }
  return out;
}

const verse = (book: string, verse: number) => ({
  pack: "bsb",
  book,
  chapter: 1,
  verse,
  speed: 240,
  accuracy: 0.97,
  ts: Date.now(),
});

async function seedPerson(email: string) {
  const user = await findUser(email);
  const id = user.id!;
  const dataDir = context.get(DataDir);
  const knex = Model.knex();

  // This device, signed in; a second device, signed in too.
  const request = startApp(context.get(Application, kMain));
  await request.become(id);
  const other = startApp(context.get(Application, kMain));
  await other.become(id);

  equal(
    (await request.PUT("/_/sync/settings").send({ "gutentype.pack": "kjv" }))
      .status,
    204,
  );
  equal(
    (
      await request
        .PUT("/_/gutentype/read")
        .send({ rows: [verse("john", 1), verse("john", 2)] })
    ).status,
    204,
  );
  // A pending sign-in link and its rate-limit row.
  const anon = startApp(context.get(Application, kMain));
  equal(
    (await anon.POST("/auth/login/register-email").send(adultSignIn(email)))
      .status,
    200,
  );
  context.mailer.dump();
  // Lesson stats, plus the copies Keybr's "reset statistics" leaves behind.
  const stats = dataDir.userStatsFile(id);
  await put(stats, "stats");
  await put(stats + "~1", "older stats");
  await put(stats + "~2", "oldest stats");
  await knex("order").insert({
    id: `order-${id}`,
    provider: "test",
    user_id: id,
    created_at: Date.now(),
  });
  return { id, request, other };
}

test("deleting an account leaves no row and no file for that person", async () => {
  const dataDir = context.get(DataDir);
  const knex = Model.knex();
  const me = await seedPerson("user1@keybr.com");
  const them = await seedPerson("user2@keybr.com");
  const highScores = dataDir.dataPath("highscores.json");
  const row = (user: number) => ({
    user,
    layout: "en-us",
    timeStamp: new Date().toISOString(),
    time: 60000,
    length: 100,
    errors: 1,
    complexity: 20,
    speed: 300,
    score: 1000 + user,
  });
  await put(highScores, JSON.stringify([row(me.id), row(them.id), row(me.id)]));

  const response = await me.request.DELETE("/_/account").send();

  equal(response.status, 204);
  equal(await me.request.who(), null);
  equal(await me.other.who(), null);

  // No row.
  equal(await User.findById(me.id), null);
  deepEqual(await knex("user_external_id").where({ user_id: me.id }), []);
  deepEqual(await knex("order").where({ user_id: me.id }), []);
  deepEqual(
    await knex("user_login_request").where({ email: "user1@keybr.com" }),
    [],
  );
  deepEqual(
    await knex("gutentype_read_progress").where({ user_id: me.id }),
    [],
  );
  equal((await knex("gutentype_sign_in_attempt")).length, 1);

  // No file.
  const files = await walk(dataDir.dataPath());
  const mine = String(me.id).padStart(9, "0");
  deepEqual(
    files.filter((f) => f.includes(mine)),
    [],
  );
  for (const file of files) {
    const text = await readFile(file, "utf8");
    if (file.includes(`${dataDir.dataPath("sessions")}`)) {
      ok(
        !new RegExp(`"userId":\\s*${me.id}\\b`).test(text),
        `session still names user ${me.id}: ${file}`,
      );
    }
  }
  const scores = JSON.parse(await readFile(highScores, "utf8"));
  deepEqual(
    scores.map((r: any) => r.user),
    [them.id],
  );

  // Someone else's data stays.
  ok(await User.findById(them.id));
  equal(
    (await knex("gutentype_read_progress").where({ user_id: them.id })).length,
    2,
  );
  equal(
    (await knex("user_login_request").where({ email: "user2@keybr.com" }))
      .length,
    1,
  );
  const theirs = String(them.id).padStart(9, "0");
  equal(files.filter((f) => f.endsWith(theirs)).length, 2); // settings + stats
  equal(await them.request.who(), "user2@keybr.com");
});

test("a signed-out request cannot delete an account", async () => {
  const request = startApp(context.get(Application, kMain));
  equal((await request.DELETE("/_/account").send()).status, 403);
  ok(await User.findByEmail("user1@keybr.com"));
});
