import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { type Context } from "@fastr/core";
import { BadRequestError, createError } from "@fastr/errors";
import { siteName } from "@gutentype/content";
import { type DataDir, Env } from "@keybr/config";
import { User, UserLoginRequest } from "@keybr/database";
import { type Knex } from "knex";
import { Model } from "objection";
import { z } from "zod";
import { ensureDatabase, signInAttemptTable } from "./schema.ts";

/*
 * Sign-in rules (CONTRACTS § 5): a birth year and the consent flag before any link is sent, single-use links that
 * live 15 minutes, made with crypto.randomBytes, and rate limits kept as salted hashes for one hour.
 */

export const TooManyRequestsError = createError(429);

/** Accounts are for people 13 and older (ISC-57). */
export const minimumAge = 13;

/**
 * A birth year alone cannot tell a 12-year-old from a 13-year-old, so the year a person turns 13 is still refused:
 * only someone who turns 14 or more this calendar year has certainly had their 13th birthday.
 */
export function isOldEnough(
  birthYear: unknown,
  now: Date = new Date(),
): boolean {
  const year = now.getUTCFullYear();
  return (
    typeof birthYear === "number" &&
    Number.isInteger(birthYear) &&
    birthYear >= 1900 &&
    birthYear <= year &&
    year - birthYear > minimumAge
  );
}

const TSignIn = z.object({
  email: z.string().trim().min(1).max(64).email(),
  birthYear: z.number().int(),
  consent: z.literal(true),
});

export type SignIn = { readonly email: string; readonly birthYear: number };

/** The register-email body, or 400 (nothing written) when the birth year says under 13 or consent is missing. */
export function parseSignIn(body: unknown): SignIn {
  const result = TSignIn.safeParse(body);
  if (!result.success || !isOldEnough(result.data.birthYear)) {
    throw new BadRequestError(
      "Sign-in needs a birth year of someone 13 or older and your consent",
    );
  }
  return {
    email: normalizeEmail(result.data.email),
    birthYear: result.data.birthYear,
  };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** The two answers Google sign-in carries through the session (`?birthYear=&consent=true` on oauth-init). */
export function parseOAuthAnswers(
  birthYear: string | null,
  consent: string | null,
): { birthYear: number } | null {
  if (birthYear == null && consent == null) {
    return null; // An existing account may sign in without answering again; the callback decides.
  }
  const year = Number(birthYear);
  if (
    consent !== "true" ||
    birthYear == null ||
    !/^\d{4}$/.test(birthYear) ||
    !isOldEnough(year)
  ) {
    throw new BadRequestError(
      "Sign-in needs a birth year of someone 13 or older and your consent",
    );
  }
  return { birthYear: year };
}

// Rate limits (ISC-58).

export const linksPerAddressPerHour = 3;
export const linksPerNetworkPerHour = 20;
const hour = 60 * 60 * 1000;

const salts = new Map<string, Promise<string>>();

/**
 * The salt for the rate-limit hashes: `GUTENTYPE_HASH_SALT`, or a random one kept in the data directory so every
 * worker process uses the same one.
 */
export function hashSalt(dataDir: DataDir): Promise<string> {
  const fromEnv = Env.getString("GUTENTYPE_HASH_SALT", "");
  if (fromEnv) {
    return Promise.resolve(fromEnv);
  }
  const path = dataDir.dataPath("gutentype", "hash-salt");
  let p = salts.get(path);
  if (p == null) {
    p = (async () => {
      try {
        return (await readFile(path, "utf8")).trim();
      } catch (err: any) {
        if (err.code !== "ENOENT") throw err;
      }
      await mkdir(dirname(path), { recursive: true });
      const salt = randomBytes(32).toString("hex");
      try {
        await writeFile(path, salt, { flag: "wx", mode: 0o600 });
        return salt;
      } catch (err: any) {
        if (err.code !== "EEXIST") throw err;
        return (await readFile(path, "utf8")).trim();
      }
    })();
    salts.set(path, p);
    p.catch(() => salts.delete(path));
  }
  return p;
}

export function saltedHash(salt: string, value: string): string {
  return createHash("sha256")
    .update(salt)
    .update("\0")
    .update(value)
    .digest("hex");
}

/**
 * The client's address, used only to rate-limit sign-in links (and stored only as a salted hash): Cloudflare's
 * `CF-Connecting-IP`, else the first `X-Forwarded-For` hop, else the socket. Both headers can be forged by anyone
 * who reaches the origin directly, so the deploy lets only Cloudflare reach it.
 */
export function clientAddress(ctx: Context): string {
  const cf = ctx.request.headers.get("CF-Connecting-IP");
  if (cf) return cf.trim();
  const xff = ctx.request.headers.get("X-Forwarded-For");
  if (xff) return xff.split(",")[0].trim();
  return ctx.request.req.socket.remoteAddress ?? "";
}

/**
 * Refuses (429) past 3 links per address or 20 per network address in an hour. The attempt is recorded first and
 * counted after, so four workers racing on one address can never all pass a count taken before any of them wrote:
 * a race can only refuse one too many, never let one too many through. Refused attempts stay counted for the hour.
 */
export async function checkSignInRate(
  dataDir: DataDir,
  email: string,
  ip: string,
  { now = Date.now(), knex = Model.knex() }: { now?: number; knex?: Knex } = {},
): Promise<void> {
  await ensureDatabase(knex);
  const salt = await hashSalt(dataDir);
  const emailHash = saltedHash(salt, `email:${normalizeEmail(email)}`);
  const ipHash = saltedHash(salt, `ip:${ip}`);
  await knex(signInAttemptTable)
    .where("created_at", "<", now - hour)
    .delete();
  const count = async (column: string, value: string) => {
    const [{ n }] = await knex(signInAttemptTable)
      .where(column, value)
      .count({ n: "*" });
    return Number(n);
  };
  await knex(signInAttemptTable).insert({
    email_hash: emailHash,
    ip_hash: ipHash,
    created_at: now,
  });
  if (
    (await count("email_hash", emailHash)) > linksPerAddressPerHour ||
    (await count("ip_hash", ipHash)) > linksPerNetworkPerHour
  ) {
    throw new TooManyRequestsError(
      "Too many sign-in links were asked for. Try again in an hour.",
    );
  }
}

/** The email hash a person's sign-in attempts are stored under, so deleting the account deletes them. */
export async function signInEmailHash(
  dataDir: DataDir,
  email: string,
): Promise<string> {
  return saltedHash(await hashSalt(dataDir), `email:${normalizeEmail(email)}`);
}

// Login links (ISC-67).

export const linkLifetimeMs = 15 * 60 * 1000;

/** A new single-use token for this address; any earlier link for it stops working. */
export async function createLoginToken(
  email: string,
  now = Date.now(),
): Promise<string> {
  await UserLoginRequest.query()
    .where("createdAt", "<", new Date(now - linkLifetimeMs))
    .delete();
  await UserLoginRequest.query().where({ email }).delete();
  const accessToken = randomBytes(32).toString("base64url");
  await UserLoginRequest.query().insert({
    email,
    accessToken,
    createdAt: new Date(now),
  });
  return accessToken;
}

/** Signs in with a token once: the row is deleted whatever happens next, and a link older than 15 minutes fails. */
export async function consumeLoginToken(
  token: string,
  now = Date.now(),
): Promise<User | null> {
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) {
    return null;
  }
  const request = await UserLoginRequest.findByAccessToken(token);
  if (request == null) {
    return null;
  }
  const deleted = await UserLoginRequest.query().deleteById(request.id!);
  if (deleted !== 1) {
    return null; // Someone else used it a moment ago.
  }
  const createdAt = new Date(request.createdAt!).getTime();
  if (!(now - createdAt < linkLifetimeMs)) {
    return null;
  }
  return await User.login(request.email!);
}

/** The sign-in email: it names Gutentype and says how long the link works. Plain product copy. */
export function signInMessage({
  email,
  link,
}: {
  readonly email: string;
  readonly link: string;
}) {
  return {
    to: email,
    subject: `Your ${siteName} sign-in link`,
    text: `Here is your link to sign in to ${siteName}:

${link}

It works once and expires in 15 minutes. If you did not ask for it, you can ignore this email.
`,
  };
}
