/*
 * ISC-58: the sign-in-link endpoint refuses more than 3 links per address per hour and more than 20 per network
 * address per hour (429), sends no email once refused, and keeps only salted hashes, pruned after an hour.
 * Run by `packages/gutentype-tools/scripts/code-flood-check.sh`.
 */
import { deepEqual, equal, ok } from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { Application } from "@fastr/core";
import { Model } from "objection";
import { adultSignIn, kMain, startApp, TestContext } from "./server-harness.ts";

const context = new TestContext();

async function ask(email: string, ip: string) {
  const request = startApp(context.get(Application, kMain));
  const response = await request
    .POST("/auth/login/register-email")
    .header("X-Forwarded-For", ip)
    .send(adultSignIn(email));
  return response.status;
}

test("the 4th link for one address in an hour is refused, from any network address", async () => {
  const statuses = [];
  for (let i = 0; i < 5; i++) {
    statuses.push(await ask("flood@example.com", `198.51.100.${i + 1}`));
  }
  deepEqual(statuses, [200, 200, 200, 429, 429]);
  equal(context.mailer.dump().length, 3);
  equal(await ask("Flood@Example.com", "198.51.100.99"), 429);
});

test("the 21st link from one network address in an hour is refused", async () => {
  const statuses = [];
  for (let i = 0; i < 22; i++) {
    statuses.push(await ask(`person${i}@example.com`, "192.0.2.50"));
  }
  deepEqual(statuses, [...Array(20).fill(200), 429, 429]);
  equal(context.mailer.dump().length, 20);
  equal(await ask("someone-else@example.com", "192.0.2.51"), 200);
});

test("Cloudflare's client address header counts as the network address", async () => {
  const statuses = [];
  for (let i = 0; i < 21; i++) {
    const request = startApp(context.get(Application, kMain));
    const response = await request
      .POST("/auth/login/register-email")
      .header("CF-Connecting-IP", "192.0.2.77")
      .header("X-Forwarded-For", `10.0.0.${i}`)
      .send(adultSignIn(`cf${i}@example.com`));
    statuses.push(response.status);
  }
  equal(statuses[19], 200);
  equal(statuses[20], 429);
});

test("attempts are stored only as salted hashes and pruned after an hour", async () => {
  await ask("hashme@example.com", "203.0.113.9");
  const knex = Model.knex();
  const rows = await knex("gutentype_sign_in_attempt");
  equal(rows.length, 1);
  const text = JSON.stringify(rows);
  ok(!text.includes("hashme"), "email stored in the clear");
  ok(!text.includes("203.0.113.9"), "address stored in the clear");
  const unsalted = createHash("sha256")
    .update("hashme@example.com")
    .digest("hex");
  ok(!text.includes(unsalted), "email hash is not salted");
  deepEqual(Object.keys(rows[0]).sort(), [
    "created_at",
    "email_hash",
    "ip_hash",
  ]);

  // An hour later the limit has reset and the old rows are gone.
  await knex("gutentype_sign_in_attempt").update({
    created_at: Date.now() - 61 * 60 * 1000,
  });
  for (let i = 0; i < 3; i++) {
    await ask("later@example.com", "203.0.113.10");
  }
  equal(await ask("hashme@example.com", "203.0.113.9"), 200);
  equal((await knex("gutentype_sign_in_attempt")).length, 4);
});
