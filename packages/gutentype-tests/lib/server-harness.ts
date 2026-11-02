/*
 * Server lane test harness: Keybr's own app (the `@keybr/server` test context) with the Gutentype routes
 * registered in `packages/server/lib/app/routes.ts`. `server-env.ts` runs first and points it at sqlite.
 */
import "./server-env.ts";
import { Server } from "node:http";
import { beforeEach } from "node:test";
import { clearGutentypeTables } from "@gutentype/server";
import { Model } from "objection";

// Keybr's test database clears its own tables before each test; clear Gutentype's too.
beforeEach(async () => {
  await clearGutentypeTables(Model.knex());
});

// A test that reads only a response's status leaves its socket busy, and Keybr's test server waits for it on
// close. Close every connection first, so a red test fails instead of hanging the run.
const close = Server.prototype.close;
Server.prototype.close = function (
  this: Server,
  callback?: (err?: Error) => void,
) {
  this.closeAllConnections();
  return close.call(this, callback);
} as typeof close;

export { kGame, kMain } from "@keybr/server/lib/app/module.ts";
export { TestContext } from "@keybr/server/lib/app/test/context.ts";
export { startApp } from "@keybr/server/lib/app/test/request.ts";
export { findUser } from "@keybr/server/lib/app/test/sql.ts";

/** Headers a request carries behind Cloudflare, so Keybr's canonical-host redirect lets it through. */
export const viaProxy = {
  "X-Forwarded-Host": "gutentype.app",
  "X-Forwarded-Proto": "https",
} as const;

/** The token at the end of the sign-in link in an email's text. */
export function tokenFromText(text: string): string {
  const match = /\/login\/([A-Za-z0-9_-]+)/.exec(text);
  if (match == null) {
    throw new Error(`No sign-in link in: ${text}`);
  }
  return match[1];
}

/** A birth year that makes the person `age` this calendar year. */
export const bornYearsAgo = (age: number) => new Date().getUTCFullYear() - age;

/** A valid sign-in request body for an adult who accepted the consent sentence. */
export const adultSignIn = (email: string) => ({
  email,
  birthYear: bornYearsAgo(30),
  consent: true,
});
