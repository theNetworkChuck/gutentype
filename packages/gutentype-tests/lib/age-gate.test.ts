/*
 * ISC-57: no account is created for anyone who says they are under 13. The emailed-link request needs a birth
 * year and the consent flag; an under-13 birth year, or no consent, is refused with 400 and no row is written and
 * no email is sent. Google sign-in carries the same two answers through the session, and its callback refuses to
 * create a user without them. `/privacy` says so.
 */
import { deepEqual, equal, match } from "node:assert/strict";
import { test } from "node:test";
import { Application } from "@fastr/core";
import { type Binder, inject, type Module, provides } from "@fastr/invert";
import { privacyCopy } from "@gutentype/content";
import { User, UserLoginRequest } from "@keybr/database";
/* eslint-disable n/no-extraneous-import -- dependency line listed for the integrator */
import {
  AbstractAdapter,
  AccessToken,
  type ClientConfig,
  type ResourceOwner,
} from "@keybr/oauth";
/* eslint-disable n/no-extraneous-import */
import { AdapterFactory } from "@keybr/server/lib/app/auth/module.ts";
/* eslint-enable n/no-extraneous-import */
import { Model } from "objection";
import {
  adultSignIn,
  bornYearsAgo,
  kMain,
  startApp,
  TestContext,
} from "./server-harness.ts";

const context = new TestContext();

const email = "young@example.com";

class FakeAdapter extends AbstractAdapter {
  constructor(clientConfig: ClientConfig) {
    super(clientConfig, {
      authorizationUri: "https://localhost/authorizationUri",
      tokenUri: "https://localhost/tokenUri",
      profileUri: "https://localhost/profileUri",
    });
  }

  override async getAccessToken(): Promise<AccessToken> {
    return new AccessToken({
      token_type: "Bearer",
      access_token: "xyz",
      expires_in: 3600,
    });
  }

  override async getProfile(): Promise<ResourceOwner> {
    return {
      raw: {},
      provider: "fake",
      id: "123",
      email,
      name: null,
      url: null,
      imageUrl: null,
    };
  }

  protected override parseProfileResponse(): ResourceOwner {
    throw new Error("Unreachable");
  }
}

test.beforeEach(() => {
  class FakeAuthModule implements Module {
    configure(binder: Binder) {}

    @provides({ id: AdapterFactory, name: "fake", singleton: true })
    fake(@inject("canonicalUrl") canonicalUrl: string): AdapterFactory {
      return new (class extends AdapterFactory {
        makeAdapter(redirectUri: string): AbstractAdapter {
          return new FakeAdapter({
            clientId: "clientId",
            clientSecret: "clientSecret",
            scope: "email",
            redirectUri: String(new URL(redirectUri, canonicalUrl)),
          });
        }
      })();
    }
  }
  context.load(new FakeAuthModule());
});

async function nothingWritten() {
  equal(await User.findByEmail(email), null);
  deepEqual(await UserLoginRequest.query(), []);
  deepEqual(await Model.knex()("gutentype_sign_in_attempt"), []);
  deepEqual(context.mailer.dump(), []);
}

for (const [label, body] of [
  ["a 12-year-old", { email, birthYear: bornYearsAgo(12), consent: true }],
  ["a 5-year-old", { email, birthYear: bornYearsAgo(5), consent: true }],
  [
    "a birth year in the future",
    { email, birthYear: bornYearsAgo(-1), consent: true },
  ],
  ["no birth year", { email, consent: true }],
  [
    "a birth year that is not a number",
    { email, birthYear: "2000", consent: true },
  ],
  ["no consent", { email, birthYear: bornYearsAgo(30) }],
  ["consent false", { email, birthYear: bornYearsAgo(30), consent: false }],
] as const) {
  test(`the emailed link is refused for ${label}, and nothing is written`, async () => {
    const request = startApp(context.get(Application, kMain));
    const response = await request
      .POST("/auth/login/register-email")
      .send(body);
    equal(response.status, 400);
    await nothingWritten();
  });
}

test("an adult who consented gets a link", async () => {
  const request = startApp(context.get(Application, kMain));
  const response = await request
    .POST("/auth/login/register-email")
    .send(adultSignIn(email));
  equal(response.status, 200);
  equal(context.mailer.dump().length, 1);
});

test("Google sign-in refuses an under-13 birth year before leaving the site", async () => {
  const request = startApp(context.get(Application, kMain));
  const response = await request
    .GET(`/auth/oauth-init/fake?birthYear=${bornYearsAgo(10)}&consent=true`)
    .send();
  equal(response.status, 400);
  equal(response.headers.get("Set-Cookie"), null);
});

async function oauthRoundTrip(query: string) {
  const request = startApp(context.get(Application, kMain));
  const init = await request.GET(`/auth/oauth-init/fake${query}`).send();
  equal(init.status, 302);
  const state = new URL(init.headers.get("Location")!).searchParams.get(
    "state",
  )!;
  const callback = await request
    .GET(`/auth/oauth-callback/fake?code=xyz&state=${state}`)
    .send();
  return { request, callback };
}

test("the Google callback refuses to create a user without the birth year and consent", async () => {
  const { request, callback } = await oauthRoundTrip("");
  equal(callback.status, 403);
  equal(await User.findByEmail(email), null);
  equal(await request.who(), null);
});

test("the Google callback creates the user when an adult consented", async () => {
  const { request, callback } = await oauthRoundTrip(
    `?birthYear=${bornYearsAgo(30)}&consent=true`,
  );
  equal(callback.status, 302);
  equal(callback.headers.get("Location"), "/account");
  equal(await request.who(), email);
});

test("an existing account can sign in with Google without answering again", async () => {
  await User.query().insert({ email, name: "young" });
  const { request, callback } = await oauthRoundTrip("");
  equal(callback.status, 302);
  equal(await request.who(), email);
});

test("/privacy says under-13s keep typing without an account", () => {
  const text = privacyCopy.sections.flatMap((s) => s.paragraphs).join(" ");
  match(text, /13/);
  match(text, /without an account/);
});
