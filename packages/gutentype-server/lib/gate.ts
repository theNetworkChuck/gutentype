import { type Context, type Middleware, type Next } from "@fastr/core";
import { NotFoundError } from "@fastr/errors";
import { flaggedRoutes } from "@gutentype/content";
import { Logger } from "@keybr/logger";
import { ensureDatabase } from "./schema.ts";

/** Keybr's keybr.com privacy policy and terms of service: Gutentype's `/privacy` replaces them, always. */
export const alwaysOffRoutes: readonly RegExp[] = [
  /^(\/[a-z]{2}(-[a-z]+)?)?\/privacy-policy$/i,
  /^(\/[a-z]{2}(-[a-z]+)?)?\/terms-of-service$/i,
];

/** A flag is on when it is set to anything but empty, `0` or `false`. Read per request, so a restart is not needed. */
export function flagOn(
  name: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const value = (env[name] ?? "").trim().toLowerCase();
  return value !== "" && value !== "0" && value !== "false";
}

/** Whether a path is switched off right now (ISC-50). */
export function isSwitchedOff(
  path: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (alwaysOffRoutes.some((re) => re.test(path))) {
    return true;
  }
  for (const [flag, patterns] of Object.entries(flaggedRoutes)) {
    if (!flagOn(flag, env) && patterns.some((re) => re.test(path))) {
      return true;
    }
  }
  return false;
}

/**
 * Runs before Keybr's routes: switched-off routes answer 404 (multiplayer and highscores by env flag, default off;
 * Keybr's legal pages always), and the Gutentype tables and sqlite pragmas are in place before the first request.
 */
export function gutentypeGate(): Middleware<any> {
  return async (ctx: Context, next: Next): Promise<void> => {
    if (isSwitchedOff(ctx.request.path)) {
      throw new NotFoundError();
    }
    try {
      await ensureDatabase();
    } catch (err: any) {
      Logger.warn(
        "Gutentype tables not ready: %s",
        String(err?.message ?? err),
      );
    }
    await next();
  };
}
