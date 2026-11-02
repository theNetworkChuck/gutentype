import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/*
 * Build-time constants for the browser and server bundles. GIT_SHA names the deployed commit: the footer's
 * Source link and the page's version meta both read it (ISC-1, ISC-3). A Docker build passes it as a build arg
 * because the image has no .git.
 */
function gitSha() {
  if (process.env.GIT_SHA) {
    return process.env.GIT_SHA;
  }
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: import.meta.dirname,
      encoding: "utf8",
    }).trim();
  } catch {
    return "dev";
  }
}

const ENV = {
  "process.env.GIT_SHA": JSON.stringify(gitSha()),
};

export { ENV };

/*
 * ISC-74: Gutentype swaps a few Keybr modules for its own at bundle time instead of editing them, so the fork's
 * list of modified Keybr files stays short. Each Gutentype package may declare swaps in a `keybr-replacements.json`
 * at its root: `{ "<repo-relative Keybr path>": "<repo-relative Gutentype path>" }`. `replacementPlugins(webpack)`
 * returns one NormalModuleReplacementPlugin per swap; a missing source or target path stops the build, so an
 * upstream rename can never silently drop a replacement.
 */
function replacements() {
  const root = resolve(import.meta.dirname, "../..");
  const packages = join(root, "packages");
  const swaps = [];
  for (const name of readdirSync(packages).sort()) {
    if (!name.startsWith("gutentype-")) continue;
    const file = join(packages, name, "keybr-replacements.json");
    if (!existsSync(file)) continue;
    for (const [from, to] of Object.entries(
      JSON.parse(readFileSync(file, "utf8")),
    )) {
      const source = join(root, from);
      const target = join(root, to);
      for (const path of [source, target]) {
        if (!existsSync(path)) {
          throw new Error(
            `keybr-replacements.json in ${name}: ${path} does not exist`,
          );
        }
      }
      swaps.push({ source, target });
    }
  }
  return swaps;
}

function replacementPlugins(webpack) {
  return replacements().map(
    ({ source, target }) =>
      new webpack.NormalModuleReplacementPlugin(
        new RegExp(`^${source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
        target,
      ),
  );
}

export { replacementPlugins, replacements };
