import { type Pack } from "./pack.ts";

/*
 * Interface copy shared by the server shell and the browser pages, so the first paint and the hydrated page say
 * the same thing. Product copy, never devotional (ISC-46): the Bible is named, never sold.
 */
export const siteName = "Gutentype";

export const tagline = "Learn to touch-type. Every word you type is from the Bible.";

/** The line above the fold on the homepage (ISC-30) and the label on every page (ISC-66). */
export const translationLabel = (pack: Pack) => `${pack.info.label} (${pack.info.short})`;

export const homeLine = (pack: Pack) =>
  `${tagline} You are typing the ${translationLabel(pack)}.`;
