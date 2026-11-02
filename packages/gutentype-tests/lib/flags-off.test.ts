/*
 * ISC-50, server gate: Keybr's multiplayer and highscores routes answer 404 unless GUTENTYPE_MULTIPLAYER or
 * GUTENTYPE_HIGHSCORES is set (switched off by flag, not deleted); Keybr's keybr.com privacy policy and terms of
 * service always answer 404, because Gutentype's own `/privacy` replaces them.
 */
import { equal } from "node:assert/strict";
import { test } from "node:test";
import { Application } from "@fastr/core";
import {
  kGame,
  kMain,
  startApp,
  TestContext,
  viaProxy,
} from "./server-harness.ts";

const context = new TestContext();

const multiplayerPages = [
  "/multiplayer",
  "/de/multiplayer",
  "/pt-br/multiplayer",
];
const highScoresPages = ["/high-scores", "/de/high-scores"];
const keybrLegalPages = [
  "/privacy-policy",
  "/terms-of-service",
  "/de/privacy-policy",
  "/de/terms-of-service",
];

async function status(app: symbol, path: string) {
  const request = startApp(context.get(Application, app));
  let call = request.GET(path);
  for (const [k, v] of Object.entries(viaProxy)) {
    call = call.header(k, v);
  }
  return (await call.send()).status;
}

function withFlags(
  flags: Record<string, string | undefined>,
  fn: () => Promise<void>,
) {
  return async () => {
    const saved = Object.fromEntries(
      Object.keys(flags).map((k) => [k, process.env[k]]),
    );
    Object.assign(process.env, flags);
    for (const [k, v] of Object.entries(flags)) {
      if (v === undefined) delete process.env[k];
    }
    try {
      await fn();
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  };
}

const off = {
  GUTENTYPE_MULTIPLAYER: undefined,
  GUTENTYPE_HIGHSCORES: undefined,
};
const on = { GUTENTYPE_MULTIPLAYER: "1", GUTENTYPE_HIGHSCORES: "1" };

test(
  "with no flag set, multiplayer, highscores and Keybr's legal pages answer 404",
  withFlags(off, async () => {
    for (const path of [
      ...multiplayerPages,
      ...highScoresPages,
      ...keybrLegalPages,
    ]) {
      equal(await status(kMain, path), 404, path);
    }
    equal(await status(kMain, "/_/high-scores"), 404, "/_/high-scores");
    equal(await status(kMain, "/_/game/server"), 404, "/_/game/server (main)");
    equal(await status(kGame, "/_/game/server"), 404, "/_/game/server (game)");
  }),
);

test(
  "a flag set to 0 or false is still off",
  withFlags(
    { GUTENTYPE_MULTIPLAYER: "0", GUTENTYPE_HIGHSCORES: "false" },
    async () => {
      equal(await status(kMain, "/multiplayer"), 404);
      equal(await status(kMain, "/_/high-scores"), 404);
    },
  ),
);

test(
  "with the flags set, the routes come back (not deleted), the legal pages stay off",
  withFlags(on, async () => {
    for (const path of [...multiplayerPages, ...highScoresPages]) {
      equal(await status(kMain, path), 200, path);
    }
    equal(await status(kMain, "/_/high-scores"), 200);
    equal(await status(kGame, "/_/game/server"), 426);
    for (const path of keybrLegalPages) {
      equal(await status(kMain, path), 404, path);
    }
  }),
);

test(
  "the rest of the site is not affected by the gate",
  withFlags(off, async () => {
    for (const path of ["/", "/help", "/layouts", "/typing-test", "/profile"]) {
      equal(await status(kMain, path), 200, path);
    }
  }),
);
