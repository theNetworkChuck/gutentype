/*
 * Route list against GutentypePaths (CONTRACTS § 3) and the browser side of ISC-50: every Gutentype path has one
 * owner, and Keybr's switched-off pages are answered by Gutentype's not-found page in the browser.
 */
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { flaggedRoutes, GutentypePaths } from "@gutentype/content";
import {
  appOwnedPaths,
  gutentypeRouteTable,
  redirectPaths,
  serverOnlyPaths,
  switchedOffPaths,
} from "@gutentype/pages";
import { deepEqual, equal, isTrue } from "rich-assert";

test("every Gutentype path has exactly one owner", () => {
  const owned = [
    ...gutentypeRouteTable.map(({ path }) => path),
    ...appOwnedPaths,
    ...serverOnlyPaths,
    ...redirectPaths,
  ];
  equal(new Set(owned).size, owned.length, "no path is owned twice");
  deepEqual(
    [...owned].sort(),
    [...new Set(Object.values(GutentypePaths))].sort(),
  );
});

test("each route names a page with a title", () => {
  for (const { path, page } of gutentypeRouteTable) {
    equal(page.path, path);
    isTrue(typeof page.title.defaultMessage === "string");
  }
});

test("multiplayer and high scores are switched off in the browser, matching the server's flags", () => {
  isTrue(switchedOffPaths.includes("/multiplayer"));
  isTrue(switchedOffPaths.includes("/high-scores"));
  isTrue(flaggedRoutes.GUTENTYPE_MULTIPLAYER[0].test("/multiplayer"));
  isTrue(flaggedRoutes.GUTENTYPE_HIGHSCORES[0].test("/high-scores"));
  // Keybr's own legal pages describe keybr.com; the server answers them 404 too.
  isTrue(switchedOffPaths.includes("/privacy-policy"));
  isTrue(switchedOffPaths.includes("/terms-of-service"));
});

test("App.tsx renders the Gutentype routes first, and the account page no longer comes from Keybr", () => {
  const app = readFileSync(
    new URL("../../keybr-pages-browser/lib/App.tsx", import.meta.url),
    "utf-8",
  );
  isTrue(app.includes("{gutentypeRoutes(Template, Title)}"));
  isTrue(
    app.indexOf("{gutentypeRoutes(Template, Title)}") <
      app.indexOf("index={true}"),
    "first inside <Routes>, so equal-rank Keybr routes lose the tie",
  );
  isTrue(!app.includes("./pages/account.tsx"));
  isTrue(!app.includes("./pages/practice.tsx"));
});
