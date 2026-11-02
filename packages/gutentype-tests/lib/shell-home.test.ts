/*
 * The homepage's pure helpers: phones go to Read (ISC-43), the tour never renders (ISC-69), and the lesson-ten
 * counter fires on the crossing only (CONTRACTS § 4).
 */
import { test } from "node:test";
import { crossesLessonTen, isPhoneWidth, withoutTour } from "@gutentype/pages";
import { Settings } from "@keybr/settings";
import { equal, isFalse, isTrue } from "rich-assert";

test("a 390 px phone is a phone; a 1440 px desktop is not", () => {
  isTrue(isPhoneWidth(390));
  isTrue(isPhoneWidth(639));
  isFalse(isPhoneWidth(640));
  isFalse(isPhoneWidth(1440));
});

test("the lesson-ten counter fires only when the count crosses ten", () => {
  isTrue(crossesLessonTen(9, 10));
  isTrue(crossesLessonTen(0, 12));
  isFalse(crossesLessonTen(0, 9));
  isFalse(crossesLessonTen(10, 11));
  // A second device loading an account's 40 results is not a new person passing lesson ten.
  isFalse(crossesLessonTen(40, 40));
});

test("a fresh profile's settings lose the new-profile mark that opens Keybr's tour", () => {
  const fresh = new Settings(undefined, true);
  isTrue(fresh.isNew);
  const cleared = withoutTour(fresh);
  isFalse(cleared.isNew);
  equal(JSON.stringify(cleared.toJSON()), JSON.stringify(fresh.toJSON()));
});

test("settings that are not new pass through untouched", () => {
  const settings = new Settings({ "gutentype.pack": "kjv" });
  equal(withoutTour(settings), settings);
});
