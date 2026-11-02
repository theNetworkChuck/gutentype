import { allToRoutes } from "@fastr/controller";
import { compose, type Middleware } from "@fastr/core";
import { Router } from "@fastr/middleware-router";
// eslint-disable-next-line n/no-extraneous-import -- Gutentype: the dependency line is the integrator's.
import { gutentypeGate, gutentypeRoutes } from "@gutentype/server";
import { Controller as AuthController } from "./auth/index.ts";
import { Controller as GameController } from "./game/index.ts";
import { Controller as HighScoresController } from "./highscores/index.ts";
import { Controller as PageController } from "./page/index.ts";
import { Controller as ProfileController } from "./profile/index.ts";
import { Controller as SettingsController } from "./settings/index.ts";
import { Controller as SitemapController } from "./sitemap/index.ts";
import { Controller as SyncController } from "./sync/index.ts";

export function mainRoutes(): Middleware<any> {
  const router = new Router()
    .registerAll(
      allToRoutes(
        AuthController,
        HighScoresController,
        PageController,
        ProfileController,
        SettingsController,
        SitemapController,
        SyncController,
      ),
    )
    .registerAll(gutentypeRoutes()) // Gutentype: after Keybr's, so its "/" and "/account" win.
    .middleware();
  return compose([gutentypeGate(), router]); // Gutentype: the flag gate (ISC-50).
}

export function gameRoutes(): Middleware<any> {
  const router = new Router().registerAll(allToRoutes(GameController));
  return compose([gutentypeGate(), router.middleware()]); // Gutentype: the flag gate (ISC-50).
}
