/*
 * ISC-57 (form side), ISC-56, ISC-63: the sign-in form's age and consent logic. The Server lane enforces the same
 * rules on its side (400 with no row written); this file covers what the browser decides before anything is sent.
 */
import { test } from "node:test";
import { privacyCopy } from "@gutentype/content";
import {
  ageGate,
  consentSentence,
  googleSignInUrl,
  signInBody,
} from "@gutentype/pages";
import { deepEqual, equal, isTrue, throws } from "rich-assert";

test("a birth year that could mean under 13 continues without an account", () => {
  equal(ageGate("2020", 2026), "under13");
  // Born in 2013, a person is 12 until their birthday in 2026: a year alone cannot rule that out.
  equal(ageGate("2013", 2026), "under13");
  equal(ageGate("2014", 2026), "under13");
  equal(ageGate("2026", 2026), "under13");
});

test("a birth year 14 or more years back may make an account", () => {
  equal(ageGate("2012", 2026), "ok");
  equal(ageGate("1989", 2026), "ok");
  equal(ageGate(" 1950 ", 2026), "ok");
});

test("anything that is not a plausible four-digit year is refused", () => {
  for (const value of ["", "abc", "201", "20134", "2027", "1800", "19a0"]) {
    equal(ageGate(value, 2026), "invalid", value);
  }
});

test("the consent sentence is the CONTRACTS § 5 sentence, word for word, and /privacy says the same", () => {
  equal(
    consentSentence,
    "Signing in stores your email and your reading progress (which books and chapters you typed) so they follow you to other devices.",
  );
  isTrue(
    privacyCopy.sections.some((s) => s.paragraphs.includes(consentSentence)),
  );
});

test("the emailed-link request carries the birth year and the consent, nothing else", () => {
  deepEqual(signInBody(" person@example.com ", 1990, 2026), {
    email: "person@example.com",
    birthYear: 1990,
    consent: true,
  });
});

test("the Google door carries the birth year and the consent in its query", () => {
  equal(
    googleSignInUrl(1990, 2026),
    "/auth/oauth-init/google?birthYear=1990&consent=true",
  );
});

test("no sign-in request can be built for someone who may be under 13", () => {
  throws(() => signInBody("kid@example.com", 2015, 2026));
  throws(() => googleSignInUrl(2015, 2026));
  throws(() => signInBody("   ", 1990, 2026));
});
