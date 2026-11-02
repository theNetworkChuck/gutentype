import { Settings } from "@keybr/settings";

/** Phones (under 40rem at the default 16 px font) land on Read; Learn stays desktop-first (ISC-43). */
export function isPhoneWidth(width: number): boolean {
  return width < 640;
}

/** CONTRACTS § 4: `lesson-ten` is sent when the result count crosses ten, never for an account already past it. */
export function crossesLessonTen(before: number, after: number): boolean {
  return before < 10 && after >= 10;
}

/**
 * Keybr opens its practice tour for a profile whose settings are new, and the tour says most lesson words are not
 * real words (ISC-69). There is no tour preference: a copy of the same settings is simply not new.
 */
export function withoutTour(settings: Settings): Settings {
  return settings.isNew ? new Settings(settings.toJSON()) : settings;
}

/** Focuses Keybr's practice text input inside `root`, as clicking the text would. */
export function focusPracticeText(root: Element | null): boolean {
  const input = root?.querySelector("textarea");
  if (input == null) return false;
  input.focus();
  input.scrollIntoView?.({ block: "nearest" });
  return true;
}
