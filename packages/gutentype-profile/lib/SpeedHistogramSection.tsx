import { SpeedComparison } from "@gutentype/profile/lib/Comparison.tsx";
import { useComparison } from "@gutentype/profile/lib/useComparison.ts";
import { type SummaryStats } from "@keybr/result";
import { type ReactNode } from "react";

/**
 * Replaces `@keybr/page-profile/lib/profile/SpeedHistogramSection.tsx` at bundle time (keybr-replacements.json,
 * ISC-74): the same export, compared against Gutentype's own lessons (ISC-75).
 */
export function SpeedHistogramSection({
  stats,
}: {
  stats: SummaryStats;
}): ReactNode {
  return <SpeedComparison stats={stats} comparison={useComparison()} />;
}

// ISC-74: the bundle check finds this marker in the build, proving the swap.
SpeedHistogramSection.displayName = "GutentypeSpeedHistogramSection";
