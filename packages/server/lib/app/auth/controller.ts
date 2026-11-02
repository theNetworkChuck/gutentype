import {
  body,
  controller,
  http,
  pathParam,
  queryParam,
} from "@fastr/controller";
import { Context } from "@fastr/core";
import {
  ApplicationError,
  BadRequestError,
  ForbiddenError,
} from "@fastr/errors";
import { inject, injectable } from "@fastr/invert";
import { type RouterState } from "@fastr/middleware-router";
import { randomString, type SessionState } from "@fastr/middleware-session";
import * as gt from "@gutentype/server";
import { DataDir } from "@keybr/config";
import { User } from "@keybr/database";
import { Logger } from "@keybr/logger";
import { type AbstractAdapter } from "@keybr/oauth";
import { z } from "zod";
import { Mailer } from "../mail/index.ts";
import { pAdapter } from "./pipe.ts";
import { type AuthState } from "./types.ts";
import { zod } from "./zod.ts";

const jsonOpts = { maxLength: 4096 };

const TPatchAccount = z.object({
  anonymized: z.boolean(),
});
type TPatchAccount = z.infer<typeof TPatchAccount>;
const PPatchAccount = zod(TPatchAccount, () => {
  throw new ApplicationError("Invalid request");
});

@injectable()
@controller()
export class Controller {
  constructor(
    @inject("canonicalUrl") readonly canonicalUrl: string,
    readonly mailer: Mailer,
    readonly dataDir: DataDir, // Gutentype
  ) {}

  @http.GET({ name: "oauth-init", path: "/auth/oauth-init/{adapter}" })
  async oAuthInit(
    ctx: Context<RouterState & SessionState & AuthState>,
    @pathParam("adapter", pAdapter) adapter: AbstractAdapter,
    @queryParam("birthYear") birthYear: string | null, // Gutentype (ISC-57)
    @queryParam("consent") consent: string | null, // Gutentype (ISC-57)
  ) {
    const answers = gt.parseOAuthAnswers(birthYear, consent); // Gutentype: 400 for under-13s, before any cookie.
    const state = randomString(20);
    ctx.state.session.start();
    ctx.state.session.set("authState", state);
    // Gutentype: the adult flag belongs to this attempt only; a bare start clears an abandoned one.
    if (answers != null) ctx.state.session.set("gutentypeAdult", true);
    else ctx.state.session.pull("gutentypeAdult");
    ctx.response.redirect(adapter.getAuthorizationUrl({ state }));
  }

  @http.GET({ name: "oauth-callback", path: "/auth/oauth-callback/{adapter}" })
  async oAuthCallback(
    ctx: Context<RouterState & SessionState & AuthState>,
    @pathParam("adapter", pAdapter) adapter: AbstractAdapter,
    @queryParam("code", zod(z.string().min(1))) code: string,
    @queryParam("state", zod(z.string().min(1))) state: string,
  ) {
    const authState = ctx.state.session.pull("authState");
    const adult = ctx.state.session.pull("gutentypeAdult") === true; // Gutentype
    ctx.state.session.destroy();
    if (state === authState) {
      const token = await adapter.getAccessToken({ code });
      const profile = await adapter.getProfile(token);
      // Gutentype: one address, one account, whatever casing the provider sends (the link lowercases too).
      const resourceOwner =
        profile.email != null
          ? { ...profile, email: gt.normalizeEmail(profile.email) }
          : profile;
      if (resourceOwner.email != null) {
        // Gutentype (ISC-57): no new account without the birth year and consent answered at oauth-init.
        if (!adult && (await User.findByEmail(resourceOwner.email)) == null) {
          throw new ForbiddenError("Sign-in needs your birth year and consent");
        }
        const user = await User.ensure(resourceOwner);
        ctx.state.session.start();
        ctx.state.session.set("userId", user.id!);
      }
      ctx.response.redirect("/account");
    } else {
      throw new BadRequestError();
    }
  }

  @http.POST({ name: "create-token", path: "/auth/login/register-email" })
  async createToken(
    ctx: Context<RouterState & SessionState & AuthState>,
    @body.json(null, jsonOpts) value: unknown,
  ) {
    // Gutentype: birth year and consent first (ISC-57), then the rate limits (ISC-58), then a fresh random token.
    const { email } = gt.parseSignIn(value);
    await gt.checkSignInRate(this.dataDir, email, gt.clientAddress(ctx));
    const token = await gt.createLoginToken(email);
    const link = String(
      new URL(ctx.state.router.makePath("login", { token }), this.canonicalUrl),
    );
    try {
      await this.mailer.sendMail(gt.signInMessage({ email, link }));
    } catch (err: any) {
      Logger.warn(err, "Error sending e-mail message to '%s'", email);
      throw new ApplicationError("Error sending e-mail message");
    }
    ctx.response.body = { email };
  }

  // Gutentype (ISC-67): GET only shows a button, so a mail scanner cannot use the link up; POST signs in, once.
  @http.GET({ name: "login", path: "/login/{token}" })
  async loginWithToken(
    ctx: Context<RouterState & SessionState & AuthState>,
    @pathParam("token", zod(z.string().min(1))) token: string,
  ) {
    ctx.response.type = "text/html";
    ctx.response.headers.set("Cache-Control", "no-store");
    ctx.response.body = gt.renderSignInConfirm(token);
  }

  @http.POST({ name: "login-confirm", path: "/login/{token}" })
  async confirmLogin(
    ctx: Context<RouterState & SessionState & AuthState>,
    @pathParam("token", zod(z.string().min(1))) token: string,
  ) {
    gt.assertSameOrigin(ctx, this.canonicalUrl); // Gutentype: login CSRF guard.
    ctx.state.session.destroy();
    const user = await gt.consumeLoginToken(token);
    if (user != null) {
      ctx.state.session.start();
      ctx.state.session.set("userId", user.id!);
      ctx.response.redirect("/account", 303);
    } else {
      throw new ForbiddenError("Invalid sign-in link", {
        description:
          "This sign-in link was already used or is more than 15 minutes old. " +
          "Enter your email again to get a new link.",
      });
    }
  }

  @http.GET({ name: "logout", path: "/auth/logout" })
  async logout(ctx: Context<RouterState & SessionState & AuthState>) {
    ctx.state.session.destroy();
    ctx.response.redirect("/account");
  }

  @http.PATCH({ name: "patch-account", path: "/_/account" })
  async patchAccount(
    ctx: Context<RouterState & SessionState & AuthState>,
    @body.json(PPatchAccount, jsonOpts) { anonymized }: TPatchAccount,
  ) {
    const user = ctx.state.requireUser();
    await user.$query().patch({ anonymized: Number(anonymized) });
    const result = await User.findById(user.id!);
    if (result == null) {
      throw new ForbiddenError();
    }
    ctx.response.body = {
      user: result.toDetails(),
      publicUser: User.toPublicUser(result, 0),
    };
  }

  @http.DELETE({ name: "delete-account", path: "/_/account" })
  async deleteAccount(ctx: Context<RouterState & SessionState & AuthState>) {
    const user = ctx.state.requireUser();
    await gt.purgeUser(this.dataDir, user); // Gutentype (ISC-24): every row and per-user file.
    ctx.state.session.destroy();
    ctx.response.status = 204;
  }
}
