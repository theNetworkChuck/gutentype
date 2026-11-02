import { type RouteOptions } from "@fastr/middleware-router";
import { apiRoutes } from "./api.ts";
import { pageRoutes } from "./pages.tsx";

export * from "./confirm.tsx";
export * from "./counter.ts";
export * from "./gate.ts";
export * from "./privacy.ts";
export * from "./purge.ts";
export * from "./read.ts";
export * from "./schema.ts";
export * from "./share.ts";
export * from "./signin.ts";

/**
 * Every Gutentype route, registered in Keybr's `server/lib/app/routes.ts` after Keybr's own, so Gutentype's `/` and
 * `/account` (and their locale variants) replace Keybr's.
 */
export function gutentypeRoutes(): RouteOptions[] {
  return [...pageRoutes(), ...apiRoutes()];
}
