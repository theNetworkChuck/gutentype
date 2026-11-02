import { type Context, type Middleware } from "@fastr/core";
import { ForbiddenError } from "@fastr/errors";
import { expectJson, type JsonBodyState } from "@fastr/middleware-body";
import { type RouteOptions, type RouterState } from "@fastr/middleware-router";
import { type User } from "@keybr/database";
import { bumpCounter } from "./counter.ts";
import {
  loadReadProgress,
  parsePackId,
  parseVerseRows,
  saveReadProgress,
} from "./read.ts";

type AuthState = { readonly user: User | null };

function requireUser(ctx: Context<AuthState>): User {
  const { user } = ctx.state;
  if (user == null) {
    throw new ForbiddenError();
  }
  return user;
}

/** `GET /_/gutentype/read?pack=<id>`: the person's rows for one pack (CONTRACTS § 2). 403 without a session. */
const getRead: Middleware<RouterState & AuthState> = async (ctx) => {
  const user = requireUser(ctx);
  const pack = parsePackId(ctx.request.query.get("pack"));
  ctx.response.body = { rows: await loadReadProgress(user.id!, pack) };
  ctx.response.headers.set("Cache-Control", "private, no-cache");
};

/** Refuses a signed-out PUT before its body is read. */
const signedIn: Middleware<RouterState & AuthState> = async (ctx, next) => {
  requireUser(ctx);
  await next();
};

/** `PUT /_/gutentype/read` with `{rows}`: merged, newest `ts` wins; 204. */
const putRead: Middleware<RouterState & AuthState & JsonBodyState> = async (
  ctx,
) => {
  const user = requireUser(ctx);
  await saveReadProgress(user.id!, parseVerseRows(ctx.state.body));
  ctx.response.status = 204;
};

/**
 * `POST /_/count/{name}`: always 204, whatever the name, the body or the database says. Nothing about the request
 * is read beyond the name in the path, and nothing about it is logged.
 */
const count: Middleware<RouterState> = async (ctx) => {
  try {
    await bumpCounter(String(ctx.state.params?.name ?? ""));
  } catch {
    // bumpCounter never throws; this is the second line of the same promise.
  }
  ctx.response.status = 204;
  ctx.response.headers.set("Cache-Control", "no-store");
};

const countEmpty: Middleware<RouterState> = async (ctx) => {
  ctx.response.status = 204;
  ctx.response.headers.set("Cache-Control", "no-store");
};

export function apiRoutes(): RouteOptions[] {
  return [
    { path: "/_/gutentype/read", method: "GET", middleware: getRead as any },
    {
      path: "/_/gutentype/read",
      method: "PUT",
      middleware: [
        signedIn as any,
        expectJson("application/json", { maxLength: 4 * 1024 * 1024 }) as any,
        putRead as any,
      ],
    },
    { path: "/_/count/{name}", method: "POST", middleware: count as any },
    { path: "/_/count", method: "POST", middleware: countEmpty as any },
    { path: "/_/count/", method: "POST", middleware: countEmpty as any },
  ];
}
