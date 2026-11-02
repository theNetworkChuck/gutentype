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

/** ISC-74: the bundle check finds this marker in the build; it is used below, so minification keeps it. */
const replacementMarker = "GutentypeComparisonDist";
/**
 * Every caller of this module is swapped too, so the build may drop it; replacements-check.sh then requires that
 * Keybr's shipped speed distribution (a run from `dist_speed.json`) is absent from the bundle instead.
 */
// replacementAbsent = "3,3,3,3,4,4,4,5,26,33,34,36,37,38"

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
    `${replacementMarker} ${name}: Gutentype has no speed and accuracy comparison loaded ` +
      `(${comparison?.kind ?? "not loaded"}); read it with useComparison() from @gutentype/profile`,
  );
}

export function makeSpeedDistribution(): Distribution {
  return ready("makeSpeedDistribution").speed;
}

export function makeAccuracyDistribution(): Distribution {
  return ready("makeAccuracyDistribution").accuracy;
}
