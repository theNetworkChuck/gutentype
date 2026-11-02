/*
 * ISC-67: a sign-in link is single-use and expires within 15 minutes. Opening the link shows a confirm button and
 * signs nobody in (so a mail scanner that prefetches it cannot burn it); the POST consumes it. The email names
 * Gutentype, not keybr.com, and the token is long and random.
 */
import { deepEqual, equal, match, notEqual, ok } from "node:assert/strict";
import { test } from "node:test";
import { Application } from "@fastr/core";
import { UserLoginRequest } from "@keybr/database";
import { Model } from "objection";
import {
  adultSignIn,
  kMain,
  startApp,
  TestContext,
  tokenFromText,
} from "./server-harness.ts";

const context = new TestContext();

async function requestLink(email: string): Promise<string> {
  const request = startApp(context.get(Application, kMain));
  const response = await request
    .POST("/auth/login/register-email")
    .send(adultSignIn(email));
  equal(response.status, 200);
  const [message] = context.mailer.dump();
  equal(message.to, email);
  return tokenFromText(message.text ?? "");
}

test("the email names Gutentype and carries a long random token", async () => {
  await requestLink("reader@example.com");
  const tokens = new Set<string>();
  for (const email of ["a@example.com", "b@example.com", "c@example.com"]) {
    const request = startApp(context.get(Application, kMain));
    await request.POST("/auth/login/register-email").send(adultSignIn(email));
  }
  const messages = context.mailer.dump();
  equal(messages.length, 3);
  for (const message of messages) {
    match(message.subject, /Gutentype/);
    const text = message.text ?? "";
    match(text, /Gutentype/);
    ok(!/keybr/i.test(message.subject + text), "email names keybr");
    match(text, /15 minutes/);
    const token = tokenFromText(text);
    ok(token.length >= 32, `token too short: ${token}`);
    tokens.add(token);
  }
  equal(tokens.size, 3);
});

test("opening the link shows a sign-in button and signs nobody in", async () => {
  const token = await requestLink("reader@example.com");
  const request = startApp(context.get(Application, kMain));

  const response = await request.GET(`/login/${token}`).send();

  equal(response.status, 200);
  match(response.headers.get("Content-Type")!, /text\/html/);
  const html = await response.body.text();
  match(html, /<form[^>]+method="post"/i);
  match(html, new RegExp(`action="/login/${token}"`));
  match(html, /<button[^>]*>Sign in<\/button>/);
  equal(await request.who(), null);
  notEqual(await UserLoginRequest.query().findOne({}), undefined);
});

test("the POST signs in once; the same link then returns an error", async () => {
  const token = await requestLink("reader@example.com");
  const request = startApp(context.get(Application, kMain));

  const first = await request
    .POST(`/login/${token}`)
    .header("Sec-Fetch-Site", "same-origin")
    .send();
  equal(first.status, 303);
  equal(first.headers.get("Location"), "/account");
  equal(await request.who(), "reader@example.com");

  const other = startApp(context.get(Application, kMain));
  const second = await other
    .POST(`/login/${token}`)
    .header("Sec-Fetch-Site", "same-origin")
    .send();
  equal(second.status, 403);
  equal(await other.who(), null);
  deepEqual(await UserLoginRequest.query(), []);
});

test("a 16-minute-old link returns an error, not a session", async () => {
  const token = await requestLink("reader@example.com");
  const knex = Model.knex();
  await knex("user_login_request").update({
    created_at: new Date(Date.now() - 16 * 60 * 1000),
  });
  const request = startApp(context.get(Application, kMain));

  const response = await request
    .POST(`/login/${token}`)
    .header("Sec-Fetch-Site", "same-origin")
    .send();

  equal(response.status, 403);
  equal(await request.who(), null);
});

test("a 14-minute-old link still works", async () => {
  const token = await requestLink("reader@example.com");
  const knex = Model.knex();
  await knex("user_login_request").update({
    created_at: new Date(Date.now() - 14 * 60 * 1000),
  });
  const request = startApp(context.get(Application, kMain));

  const response = await request
    .POST(`/login/${token}`)
    .header("Sec-Fetch-Site", "same-origin")
    .send();

  equal(response.status, 303);
  equal(await request.who(), "reader@example.com");
});

test("a made-up token returns an error", async () => {
  const request = startApp(context.get(Application, kMain));
  equal((await request.POST("/login/xyz").send()).status, 403);
  equal((await request.POST(`/login/${"a".repeat(32)}`).send()).status, 403);
  equal(await request.who(), null);
});

// Fable check (2026-11-02): a login CSRF. Another site auto-posting the attacker's own link would sign a visitor
// into the attacker's account, and the visitor's reading progress would then sync into it. The confirm POST is
// accepted only from this site, and a refused POST leaves the link unused.
for (const [name, headers] of [
  [
    "a cross-site POST",
    { "Sec-Fetch-Site": "cross-site", "Origin": "https://evil.example" },
  ],
  ["a POST whose Origin is another site", { Origin: "https://evil.example" }],
  ["a POST with neither Origin nor Sec-Fetch-Site", {}],
] as const) {
  test(`${name} is refused and the link still works`, async () => {
    const token = await requestLink("reader@example.com");
    const attacker = startApp(context.get(Application, kMain));
    let call = attacker.POST(`/login/${token}`);
    for (const [k, v] of Object.entries(headers)) call = call.header(k, v);
    const refused = await call.send();
    equal(refused.status, 403);
    equal(await attacker.who(), null);

    const reader = startApp(context.get(Application, kMain));
    const ok = await reader
      .POST(`/login/${token}`)
      .header("Origin", "https://gutentype.app")
      .send();
    equal(ok.status, 303);
    equal(await reader.who(), "reader@example.com");
  });
}
