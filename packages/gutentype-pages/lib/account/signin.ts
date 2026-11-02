import { request } from "@keybr/request";

/** CONTRACTS § 5: shown before anything is sent (ISC-56); the doors stay shut until it is accepted (ISC-63). */
export const consentSentence =
  "Signing in stores your email and your reading progress (which books and chapters you typed) so they follow you to other devices.";

export type AgeGate = "invalid" | "under13" | "ok";

/**
 * ISC-57: the birth year decides before any door opens. A year alone cannot tell a 12-year-old from a 13-year-old
 * born the same year, so anyone who could still be 12 this year continues without an account.
 */
export function ageGate(value: string, thisYear: number): AgeGate {
  const text = value.trim();
  if (!/^\d{4}$/.test(text)) return "invalid";
  const year = Number(text);
  if (year > thisYear || year < thisYear - 120) return "invalid";
  return thisYear - year < 14 ? "under13" : "ok";
}

export type SignInBody = {
  readonly email: string;
  readonly birthYear: number;
  readonly consent: true;
};

/** The body of `POST /auth/login/register-email` (CONTRACTS § 5); never built for someone who may be under 13. */
export function signInBody(
  email: string,
  birthYear: number,
  thisYear: number,
): SignInBody {
  checkAge(birthYear, thisYear);
  const address = email.trim();
  if (address === "") throw new Error("An email address is required.");
  return { email: address, birthYear, consent: true };
}

/** The Google door (CONTRACTS § 5): the birth year and the consent travel with it into the session. */
export function googleSignInUrl(birthYear: number, thisYear: number): string {
  checkAge(birthYear, thisYear);
  return `/auth/oauth-init/google?birthYear=${birthYear}&consent=true`;
}

function checkAge(birthYear: number, thisYear: number): void {
  if (ageGate(String(birthYear), thisYear) !== "ok") {
    throw new Error("No account for anyone who may be under 13.");
  }
}

/** Everything the account page does that leaves the page, so tests can watch it. */
export type AccountService = {
  readonly registerEmail: (body: SignInBody) => Promise<void>;
  readonly goTo: (url: string) => void;
  readonly deleteAccount: () => Promise<void>;
  readonly confirm: (message: string) => boolean;
  readonly syncReadProgress: () => Promise<void>;
};

/** A sign-in request error, worded for the person (the server answers 429 past its rate limits, ISC-58). */
export function signInErrorText(error: unknown): string {
  const status = (error as { status?: number } | null)?.status;
  if (status === 429) {
    return "Too many sign-in links were asked for. Try again in an hour.";
  }
  return "The sign-in link could not be sent. Check the address and try again.";
}

export async function postSignInBody(body: SignInBody): Promise<void> {
  const response = await request.POST("/auth/login/register-email").send(body);
  await response.blob(); // Ignore.
}

export async function deleteAccountRequest(): Promise<void> {
  const response = await request.DELETE("/_/account").send();
  await response.blob(); // Ignore.
}

/** The once-per-sign-in mark for the first Read merge; cleared on sign-out so the next sign-in merges again. */
export const syncMarkKey = (userId: string) =>
  `gutentype.read-synced.${userId}`;
