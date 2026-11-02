import {
  loadComparison,
  loadedComparison,
} from "@gutentype/profile/lib/population.ts";
import { type Distribution } from "@keybr/math";

/*
 * Replaces `@keybr/chart/lib/dist/dist.ts` at bundle time (keybr-replacements.json, ISC-74), so keybr.com's shipped
 * distribution (`dist_speed.json`, `dist_accuracy.json`) never enters the browser bundle (ISC-75). Gutentype's
 * own callers (Profile's histograms, the Typing Test report) read `loadComparison` and show "not enough data yet"
 * themselves; these two keep Keybr's synchronous signatures for any caller that remains, and hand it Gutentype's
 * numbers once they are loaded. Before that there is no honest distribution to return, so they throw and name
 * the caller's fix, rather than draw a made-up one.
 */

function ready(
  name: string,
): Extract<
  NonNullable<ReturnType<typeof loadedComparison>>,
  { kind: "ready" }
> {
  const comparison = loadedComparison();
  if (comparison?.kind === "ready") {
    return comparison;
  }
  void loadComparison();
  throw new Error(
    `${name}: Gutentype has no speed and accuracy comparison loaded ` +
      `(${comparison?.kind ?? "not loaded"}); read it with useComparison() from @gutentype/profile`,
  );
}

export function makeSpeedDistribution(): Distribution {
  return ready("makeSpeedDistribution").speed;
}

export function makeAccuracyDistribution(): Distribution {
  return ready("makeAccuracyDistribution").accuracy;
}
