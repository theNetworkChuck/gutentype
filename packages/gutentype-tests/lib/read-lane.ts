/*
 * Loads the Read track for the lane's tests with the environment it needs, whatever flags the runner was given:
 * the ISA's Test Strategy commands pass only `--import=@keybr/test-env-server`, and the package's test script adds
 * only the bundler. `@gutentype/read` needs a DOM, IndexedDB and localStorage (test-env-browser) and imports LESS
 * modules through its pages (test-env-bundler's loader hook). Static imports are all linked before any module runs,
 * so both environments are loaded first and the package after them. The environments are named through a variable,
 * as Keybr only ever loads them with `--import`, so tsc does not pull their untyped jsdom sources into this program.
 */
const environments = ["@keybr/test-env-browser", "@keybr/test-env-bundler"];
for (const name of environments) {
  await import(name);
}

export const read = await import("@gutentype/read");

export type { RemoteReadRows, ShareCard, VerseRow } from "@gutentype/read";
