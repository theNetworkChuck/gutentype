/*
 * Text for the pages both the server (first paint, crawlers, curl checks) and the browser render, kept in one
 * place so they never disagree. Plain product copy; no devotional language (ISC-46).
 */
import { Pack } from "./pack.ts";

export type CopySection = {
  readonly heading: string;
  readonly paragraphs: readonly string[];
};

/** `/privacy` (ISC-41, ISC-64, ISC-57, ISC-65): what is stored, where, and for how long. */
export const privacyCopy: { readonly title: string; readonly sections: readonly CopySection[] } = {
  title: "Privacy",
  sections: [
    {
      heading: "If you never sign in",
      paragraphs: [
        "Nothing about you is stored on our server. Your lesson results, your settings and the verses you have typed stay in this browser (local storage and IndexedDB) until you clear them.",
        "A cookie named prefs remembers your color theme. It holds no identifier.",
        "When you finish a book, and when you pass your tenth Learn lesson, the browser sends one anonymous count to our server. The request carries only the counter's name: no cookie, no id, nothing else. We keep a daily total per counter and do not record the address it came from. These two totals are the only thing that leaves a signed-out browser.",
      ],
    },
    {
      heading: "If you sign in",
      paragraphs: [
        "Signing in stores your email and your reading progress (which books and chapters you typed) so they follow you to other devices.",
        "On our server we keep: your account (email, a display name, the date you joined, and whether you chose to stay anonymous); if you use Google, the Google account id, name, profile link and picture link Google sends us; pending sign-in links (deleted after 15 minutes or on use); your settings and lesson statistics; your reading progress per verse (speed and accuracy); and a session file that keeps you signed in for 14 days.",
        "To stop abuse of sign-in emails we keep a salted hash of the email address and of the network address for one hour after each sign-in request. A table left from Keybr's paid tier (orders) exists but is always empty: there is nothing to buy.",
        "Sign-in emails are sent by our email provider, which sees your address to deliver the message.",
      ],
    },
    {
      heading: "Children",
      paragraphs: [
        "Accounts are for people 13 and older. The sign-in form asks for your birth year first; if you are under 13 you can keep typing without an account, and nothing is stored on our server.",
      ],
    },
    {
      heading: "Deleting your account",
      paragraphs: [
        "On your account page you can delete your account. That removes your account, your sign-in links, your settings, your lesson statistics and your reading progress from our server.",
      ],
    },
    {
      heading: "No trackers",
      paragraphs: [
        "There are no ads, no analytics and no third-party scripts on this site. Pages load only from this site and Cloudflare, which serves it.",
      ],
    },
  ],
};

/** `/translations` (ISC-28): every installed pack with its license and source. */
export const translationsCopy = () => ({
  title: "Translations",
  intro: "Pick the translation you type. Learn and Read both use it.",
  packs: Pack.ALL.size
    ? [...Pack.ALL].map((pack) => ({
        id: pack.id,
        label: pack.info.label,
        short: pack.info.short,
        license: pack.info.license,
        sourceUrl: pack.info.sourceUrl,
      }))
    : [],
});

/**
 * `/donate` (ISC-31, ISC-54, ISC-60, ISC-62). Until the receiving entity, the deductibility line and the processor
 * are confirmed in the ISA's Decisions, the page says only what is true now, and never mentions a surplus.
 */
export const donateCopy = {
  title: "Donate",
  paragraphs: [
    "Gutentype is free, with no ads and nothing to buy. Donations will pay for the server.",
    "Donations are not open yet.",
  ],
} as const;
