/*
 * ISC-21 (server side) and ISC-23 (scope in code): the only OAuth door is Google, it asks for the email scope and
 * nothing else, and the facebook and microsoft adapters are not registered (their routes answer 404).
 * Run by `packages/gutentype-tools/scripts/oauth-scope-check.sh`.
 */
import { deepEqual, equal } from "node:assert/strict";
import { test } from "node:test";
import { Application } from "@fastr/core";
import {
  bornYearsAgo,
  kMain,
  startApp,
  TestContext,
} from "./server-harness.ts";

const context = new TestContext();

const answers = `birthYear=${bornYearsAgo(30)}&consent=true`;

test("Google asks for the email scope only", async () => {
  const request = startApp(context.get(Application, kMain));
  const response = await request
    .GET(`/auth/oauth-init/google?${answers}`)
    .send();
  equal(response.status, 302);
  const url = new URL(response.headers.get("Location")!);
  equal(url.origin, "https://accounts.google.com");
  deepEqual(url.searchParams.get("scope")!.split(/[\s,]+/), ["email"]);
  equal(
    url.searchParams.get("redirect_uri"),
    "https://gutentype.app/auth/oauth-callback/google",
  );
});

for (const provider of ["facebook", "microsoft"]) {
  test(`${provider} is not a sign-in door`, async () => {
    const request = startApp(context.get(Application, kMain));
    equal(
      (await request.GET(`/auth/oauth-init/${provider}?${answers}`).send())
        .status,
      404,
    );
    equal(
      (
        await request
          .GET(`/auth/oauth-callback/${provider}?code=x&state=y`)
          .send()
      ).status,
      404,
    );
  });
}
